using System.Text.Json;

namespace BetterCaptionKeep.EndpointWorker;

public sealed record BridgeInstallation(int Version,string EncodedConfiguration,string WorkerSha256,string Phase="Installed",string? RestoredFingerprint=null);
public sealed record BridgeHostResult(string Status,bool BridgeInstalled,bool TaskConfigured,bool InputSeen,bool? ManagementActive,
    bool PolicyApplied,string? AppliedFingerprint,bool BrowserLoaded=false,bool HeartbeatFresh=false);

public interface IEndpointBridgePlatform
{
    IDisposable AcquireExtensionLock(string extensionId);
    void ValidateRegistryTrust(WorkerConfiguration configuration);
    BridgeInstallation? ReadInstallation(WorkerConfiguration configuration);
    void PrepareInstallation(WorkerConfiguration configuration,BridgeInstallation installation);
    void WriteInstallation(WorkerConfiguration configuration,BridgeInstallation installation);
    bool TaskMatches(WorkerConfiguration configuration,bool requireEnabled=true);
    void RegisterTask(WorkerConfiguration configuration);
    void DisableAndStopTask(WorkerConfiguration configuration);
    void DeleteTask(WorkerConfiguration configuration);
    void DeleteInstallation(WorkerConfiguration configuration);
    void RecordHealth(WorkerConfiguration configuration,BridgeHostResult result);
    DateTimeOffset? ReadHealth(WorkerConfiguration configuration);
}

// All effects are behind two fixed-scope adapters. Contract tests supply only
// in-memory stores; construction does not install a task or modify Windows.
public sealed class EndpointBridgeHost(IRegistryStore store,IEndpointBridgePlatform platform,WorkerConfiguration configuration)
{
    public BridgeHostResult Install(string encoded,string workerHash)
    {
        using var gate=platform.AcquireExtensionLock(configuration.ExtensionId);
        platform.ValidateRegistryTrust(configuration);
        var bridge=new ManagedPolicyBridge(store,configuration);bridge.ValidateOwnership();
        var request=new BridgeInstallation(1,encoded,workerHash,"Prepared");
        platform.PrepareInstallation(configuration,request);
        if(store.Read(configuration.StatePath+@"\ManagedBridge","Journal")is null)
        {
            var initialized=bridge.EnsureBootstrap();
            if(initialized.Status!="BootstrapReady")return Report(initialized,false);
        }
        var policy=bridge.Reconcile();
        if(policy.Status is "InterruptedOrConflicted" or "OwnershipConflict" or "Busy" or "PolicyRemoved")return Report(policy,false);
        platform.RegisterTask(configuration);
        if(!platform.TaskMatches(configuration))throw new InvalidOperationException("Task readback failed.");
        platform.WriteInstallation(configuration,request with{Phase="Installed"});
        var result=Report(policy,true) with{HeartbeatFresh=true};platform.RecordHealth(configuration,result);return result;
    }

    public BridgeHostResult Reconcile()
    {
        using var gate=platform.AcquireExtensionLock(configuration.ExtensionId);
        platform.ValidateRegistryTrust(configuration);
        var installed=platform.ReadInstallation(configuration)??throw new InvalidOperationException();
        if(installed.Phase!="Installed"||!platform.TaskMatches(configuration))throw new InvalidOperationException();
        var result=Report(new ManagedPolicyBridge(store,configuration).Reconcile(),true) with{HeartbeatFresh=true};
        platform.RecordHealth(configuration,result);return result;
    }

    public BridgeHostResult Verify()
    {
        using var gate=platform.AcquireExtensionLock(configuration.ExtensionId);
        platform.ValidateRegistryTrust(configuration);
        var installed=platform.ReadInstallation(configuration);
        if(installed is null)return new("BridgeNotInstalled",false,false,false,null,false,null);
        if(installed.Phase!="Installed")return new(installed.Phase=="Prepared"?"InstallationPending":"RemovalPending",true,false,false,null,false,installed.RestoredFingerprint);
        var result=Report(new ManagedPolicyBridge(store,configuration).Inspect(),platform.TaskMatches(configuration));
        var health=platform.ReadHealth(configuration);var age=health is null?TimeSpan.MaxValue:DateTimeOffset.UtcNow-health.Value;
        var fresh=age>=TimeSpan.FromMinutes(-1)&&age<=TimeSpan.FromMinutes(15);
        return result with{HeartbeatFresh=fresh,Status=!fresh&&result.Status is "Applied" or "Released"?"HeartbeatStale":result.Status};
    }

    public BridgeHostResult Remove()
    {
        using var gate=platform.AcquireExtensionLock(configuration.ExtensionId);
        platform.ValidateRegistryTrust(configuration);
        var installed=platform.ReadInstallation(configuration);
        if(installed is null)return new("BridgeNotInstalled",false,false,false,null,false,null);
        platform.DisableAndStopTask(configuration);
        if(installed.Phase=="Prepared"&&!store.Exists(configuration.StatePath))
        {
            // No endpoint state exists, so this package never reached the
            // before-image checkpoint that precedes all browser policy writes.
            platform.WriteInstallation(configuration,installed with{Phase="PolicyRestored"});
            platform.DeleteTask(configuration);platform.DeleteInstallation(configuration);
            return new("BridgeRemoved",false,false,false,false,false,null);
        }
        if(installed.Phase!="PolicyRestored")
        {
            platform.WriteInstallation(configuration,installed with{Phase="Removing"});
            var policy=new ManagedPolicyBridge(store,configuration).Remove();
            if(policy.Status!="PolicyRemoved"){var held=Report(policy,false);platform.RecordHealth(configuration,held);return held;}
            installed=installed with{Phase="PolicyRestored",RestoredFingerprint=policy.AppliedFingerprint};
            platform.WriteInstallation(configuration,installed);
        }
        // A failed restore returns above: task, binary, configuration and registry
        // evidence remain. Completed restore is durable before deleting the task.
        platform.DeleteTask(configuration);
        if(store.Exists(configuration.StatePath))store.DeleteTree(configuration.StatePath);
        platform.DeleteInstallation(configuration);
        return new("BridgeRemoved",false,false,true,false,false,installed.RestoredFingerprint);
    }

    private BridgeHostResult Report(ManagedPolicyBridge.Result policy,bool task)
        =>new(policy.Status,true,task,policy.ManagementObserved,policy.Active,policy.Status=="Applied",policy.AppliedFingerprint);
}
