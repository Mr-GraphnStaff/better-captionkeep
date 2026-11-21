using BetterCaptionKeep.EndpointWorker;
using System.Text;
using System.Text.Json;

static class BridgeHostContracts
{
    public static int Run()
    {
        var count=0;void Check(bool value,string message){count++;if(!value)throw new Exception(message);}
        var encoded=Convert.ToBase64String(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new{browser="edge",extensionId="edefcbdhahfolgkoamkbknjppojpaffk",deploymentId="11111111-2222-4333-8444-555555555555",managedPolicy=new{forcePrivacyScrubber=true,enableGraphTranscriptImport=false}})));
        var config=WorkerConfiguration.Parse(encoded);var hash=new string('a',64);var source=ManagedPolicyBridge.StagingRoot+"\\edge";
        var store=new MemoryRegistry();store.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",1));store.Write(source,"forcePrivacyScrubber",RegistryData.From("DWord",1));
        var platform=new FakeBridgePlatform();var host=new EndpointBridgeHost(store,platform,config);
        platform.FailTaskRegistration=true;var failed=false;try{host.Install(encoded,hash);}catch{failed=true;}
        Check(failed&&platform.Installation?.Phase=="Prepared"&&!platform.Enabled,"Task registration failure must retain durable Prepared installation evidence.");
        Check(host.Verify().Status=="InstallationPending","Status must expose incomplete task installation rather than claim deployment applied.");
        var original=store.Read(config.StatePath,"BeforePolicy")!.Data.GetString();
        Check(host.Install(encoded,hash).TaskConfigured&&platform.Installation?.Phase=="Installed","Retry must complete the same handoff and task without creating another deployment.");
        Check(store.Read(config.StatePath,"BeforePolicy")!.Data.GetString()==original,"Install retry must preserve original before-image.");
        var before=store.Describe("");var effects=platform.Effects;var verified=host.Verify();
        Check(verified.PolicyApplied&&verified.HeartbeatFresh&&!verified.BrowserLoaded,"Readback may prove policy application, never browser-loaded status.");
        Check(before==store.Describe("")&&platform.Effects==effects,"VerifyBridge must be read-only across registry, task and filesystem interfaces.");
        platform.Heartbeat=DateTimeOffset.UtcNow.AddHours(-1);
        Check(host.Verify().Status=="HeartbeatStale"&&!host.Verify().HeartbeatFresh,"Installed task and matching policy are not proof of a live scheduled bridge.");
        store.Write(config.PolicyPath,"forcePrivacyScrubber",RegistryData.From("DWord",0));
        Check(host.Remove().Status=="OwnershipConflict"&&platform.Installation is not null&&platform.TaskPresent&&!platform.Enabled,"Failed policy restore must retain disabled task, files, configuration and evidence.");
        store.Write(config.PolicyPath,"forcePrivacyScrubber",RegistryData.From("DWord",1));
        platform.FailFileRemoval=true;failed=false;try{host.Remove();}catch{failed=true;}
        Check(failed&&platform.Installation?.Phase=="PolicyRestored"&&!platform.TaskPresent&&!store.Exists(config.StatePath),"Interrupted physical removal must retain a durable completed-policy checkpoint.");
        Check(host.Remove().Status=="BridgeRemoved"&&platform.Installation is null,"Physical cleanup retry must not repeat registry restoration after state deletion.");
        var rejected=new FakeBridgePlatform{Trusted=false};var rejectedStore=new MemoryRegistry();failed=false;
        try{new EndpointBridgeHost(rejectedStore,rejected,config).Install(encoded,hash);}catch{failed=true;}
        Check(failed&&rejected.Effects==0&&rejectedStore.Describe("")=="{}","Untrusted staging/file/task authority must fail before mutation.");
        var busy=new FakeBridgePlatform{Locked=true};failed=false;try{new EndpointBridgeHost(new MemoryRegistry(),busy,config).Verify();}catch{failed=true;}
        Check(failed&&busy.Effects==0,"Extension-scoped lock denial must prevent overlapping host effects.");
        var blockedStore=new MemoryRegistry();blockedStore.Write(config.BrowserRoot,"ExtensionSettings",RegistryData.From("String","{\"*\":{\"installation_mode\":\"blocked\"}}"));
        var blockedPlatform=new FakeBridgePlatform();var blockedHost=new EndpointBridgeHost(blockedStore,blockedPlatform,config);failed=false;
        try{blockedHost.Install(encoded,hash);}catch{failed=true;}
        var blockedPolicy=blockedStore.Describe(config.BrowserRoot);
        Check(failed&&blockedPlatform.Installation?.Phase=="Prepared"&&!blockedStore.Exists(config.StatePath),"A rejected initial policy install must leave only owned Prepared host files.");
        Check(blockedHost.Remove().Status=="BridgeRemoved"&&blockedStore.Describe(config.BrowserRoot)==blockedPolicy,"Prepared-with-no-state cleanup must remove owned files only, without touching browser policy.");
        var secondEncoded=Convert.ToBase64String(Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(Convert.FromBase64String(encoded)).Replace(config.DeploymentId,"99999999-2222-4333-8444-555555555555")));
        var secondConfig=WorkerConfiguration.Parse(secondEncoded);
        var singleStore=new MemoryRegistry();var firstPlatform=new FakeBridgePlatform();new EndpointBridgeHost(singleStore,firstPlatform,config).Install(encoded,hash);
        var singleBefore=singleStore.Describe("");var secondPlatform=new FakeBridgePlatform();failed=false;
        try{new EndpointBridgeHost(singleStore,secondPlatform,secondConfig).Install(secondEncoded,hash);}catch{failed=true;}
        Check(failed&&secondPlatform.Effects==0&&singleStore.Describe("")==singleBefore,"A second deployment for the same browser must fail before creating another host or replacing policy.");
        return count;
    }
}

sealed class FakeBridgePlatform:IEndpointBridgePlatform
{
    public BridgeInstallation? Installation;public bool Enabled;public bool TaskPresent;public int Effects;
    public bool FailTaskRegistration;public bool FailFileRemoval;public bool Trusted=true;public bool Locked;
    public DateTimeOffset? Heartbeat;
    public IDisposable AcquireExtensionLock(string extension){if(Locked)throw new IOException("Synthetic busy lock");Locked=true;return new Lease(()=>Locked=false);}
    sealed class Lease(Action release):IDisposable{public void Dispose()=>release();}
    public void ValidateRegistryTrust(WorkerConfiguration config){if(!Trusted)throw new IOException("Synthetic untrusted authority");}
    public BridgeInstallation? ReadInstallation(WorkerConfiguration config)=>Installation;
    public void PrepareInstallation(WorkerConfiguration config,BridgeInstallation record){Effects++;if(Installation?.EncodedConfiguration is string value&&value!=record.EncodedConfiguration)throw new IOException();Installation=record;}
    public void WriteInstallation(WorkerConfiguration config,BridgeInstallation record){Effects++;Installation=record;}
    public bool TaskMatches(WorkerConfiguration config,bool requireEnabled=true)=>TaskPresent&&(!requireEnabled||Enabled);
    public void RegisterTask(WorkerConfiguration config){Effects++;if(FailTaskRegistration){FailTaskRegistration=false;throw new IOException("Synthetic task registration failure");}TaskPresent=true;Enabled=true;}
    public void DisableAndStopTask(WorkerConfiguration config){Effects++;Enabled=false;}
    public void DeleteTask(WorkerConfiguration config){Effects++;if(Enabled)throw new IOException();TaskPresent=false;}
    public void DeleteInstallation(WorkerConfiguration config){Effects++;if(FailFileRemoval){FailFileRemoval=false;throw new IOException("Synthetic file deletion failure");}Installation=null;}
    public void RecordHealth(WorkerConfiguration config,BridgeHostResult result){Effects++;Heartbeat=DateTimeOffset.UtcNow;}
    public DateTimeOffset? ReadHealth(WorkerConfiguration config)=>Heartbeat;
}
