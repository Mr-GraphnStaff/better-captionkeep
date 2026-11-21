using BetterCaptionKeep.EndpointWorker;
using System.Text.Json;

try
{
    if(args.Length==6&&args[4]=="--action"&&args[5] is "InstallBridge" or "VerifyBridge" or "RemoveBridge" or "ReconcileBridge")
    {
        WorkerConfiguration bridgeConfiguration;
        string? encoded=null;string? releaseHash=null;
        if(args[0]=="--configuration"&&args[2]=="--worker-sha256"&&args[5]!="ReconcileBridge")
        {
            encoded=args[1];releaseHash=args[3].ToLowerInvariant();
            if(releaseHash.Length!=64||!releaseHash.All(Uri.IsHexDigit))throw new InvalidOperationException();
            bridgeConfiguration=WorkerConfiguration.Parse(encoded);
        }
        else if(args[0]=="--installed-bridge"&&args[2]=="--browser"&&args[5]=="ReconcileBridge")
        {
            var installed=WindowsBridgePlatform.ReadFixedConfiguration(args[1],args[3]);
            bridgeConfiguration=installed.Configuration;
        }
        else throw new InvalidOperationException();
        var platform=new WindowsBridgePlatform();
        using var registry=new WindowsRegistryStore();
        if(releaseHash is not null&&args[5]!="InstallBridge")
        {
            var installed=platform.ReadInstallation(bridgeConfiguration);
            if(installed is not null&&installed.WorkerSha256!=releaseHash)throw new InvalidOperationException();
        }
        var host=new EndpointBridgeHost(registry,platform,bridgeConfiguration);
        var bridgeResult=args[5] switch{
            "InstallBridge"=>host.Install(encoded!,releaseHash!),"VerifyBridge"=>host.Verify(),
            "RemoveBridge"=>host.Remove(),"ReconcileBridge"=>host.Reconcile(),_=>throw new InvalidOperationException()};
        Console.WriteLine("BCK_BRIDGE_RESULT:"+JsonSerializer.Serialize(bridgeResult));
        return args[5] switch{
            "InstallBridge"=>bridgeResult.BridgeInstalled&&bridgeResult.TaskConfigured?0:1,
            "VerifyBridge"=>bridgeResult.BridgeInstalled&&bridgeResult.TaskConfigured?0:1,
            "RemoveBridge"=>bridgeResult.Status is "BridgeRemoved" or "BridgeNotInstalled"?0:1,
            _=>bridgeResult.BridgeInstalled&&bridgeResult.TaskConfigured&&bridgeResult.HeartbeatFresh
                &&(bridgeResult.PolicyApplied||bridgeResult.Status=="Released")?0:1};
    }
    if (args.Length != 4 || args[0] != "--configuration" || args[2] != "--action"
        || args[3] is not ("Install" or "Remove" or "Verify")) throw new InvalidOperationException();
    var configuration = WorkerConfiguration.Parse(args[1]);
    using var store = new WindowsRegistryStore();
    using var gate = new Mutex(false, @"Global\DAFTECH-BCK-Endpoint-" + configuration.ExtensionId);
    var acquired = false;
    try
    {
        try { acquired = gate.WaitOne(TimeSpan.FromSeconds(30)); }
        catch (AbandonedMutexException) { acquired = true; }
        if (!acquired) throw new InvalidOperationException();
        var result = new EndpointEngine(store, configuration).Execute(args[3]);
        Console.WriteLine("BCK_ENDPOINT_RESULT:" + JsonSerializer.Serialize(result));
        return args[3] == "Verify" && (!result.policyVerified || !result.forceInstallVerified) ? 1 : 0;
    }
    finally { if (acquired) gate.ReleaseMutex(); }
}
catch
{
    // Never echo configuration, account identifiers, paths or raw registry errors.
    Console.Error.WriteLine("Better CaptionKeep endpoint operation was not verified. Existing deployment evidence was preserved.");
    return 1;
}
