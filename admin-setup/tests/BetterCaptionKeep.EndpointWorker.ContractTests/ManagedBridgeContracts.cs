using BetterCaptionKeep.EndpointWorker;
using System.Text.Json;

static class ManagedBridgeContracts
{
    public static int Run()
    {
        var checks=0;
        void Check(bool condition,string message){checks++;if(!condition)throw new Exception(message);}
        var initial = JsonSerializer.Serialize(new { browser="edge",extensionId="edefcbdhahfolgkoamkbknjppojpaffk",deploymentId="11111111-2222-4333-8444-555555555555",managedPolicy=new {forcePrivacyScrubber=true,enableGraphTranscriptImport=false} });
        var config=WorkerConfiguration.Parse(Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(initial)));
        var source=ManagedPolicyBridge.StagingRoot+"\\edge";
        MemoryRegistry Fresh()
        {
            var memory=new MemoryRegistry();
            memory.Write(config.PolicyPath,"forcePrivacyScrubber",RegistryData.From("DWord",0));
            memory.Write(config.PolicyPath,"Unrelated",RegistryData.From("String","preserve"));
            new EndpointEngine(memory,config,()=>new([],0,0,0)).Execute("Install");
            memory.Write(source,"forcePrivacyScrubber",RegistryData.From("DWord",1));
            return memory;
        }
        var store=Fresh();var bridge=new ManagedPolicyBridge(store,config);
        Check(bridge.Reconcile().Status=="WaitingForPolicy","Never-observed absent source must wait.");
        Check(store.Read(config.StatePath,"BeforePolicy") is not null,"Handoff must preserve original rollback data.");
        store.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",1));
        store.Write(source,"forcePrivacyScrubber",RegistryData.From("DWord",1));
        store.Write(source,"uiTheme",RegistryData.From("String","slate"));
        store.Write(source,"customScrubTerms",RegistryData.From("MultiString",new[]{"Private","Second"}));
        Check(bridge.Reconcile().Status=="Applied","Valid atomic settings must apply.");
        Check(store.Read(config.PolicyPath,"uiTheme")?.Data.GetString()=="slate","Managed string must reach browser policy.");
        Check(store.Read(config.PolicyPath+"\\customScrubTerms","1")?.Data.GetString()=="Private","Atomic source array must map to browser numbered values.");
        var unchanged=store.Describe(config.PolicyPath);Check(bridge.Reconcile().Status=="Applied"&&store.Describe(config.PolicyPath)==unchanged,"Repeated reconciliation must be idempotent.");
        store.DeleteValue(source,"uiTheme");
        Check(bridge.Reconcile().Status=="StaleSource"&&store.Read(config.PolicyPath,"uiTheme")?.Data.GetString()=="slate","Unexpected missing setting must retain known policy.");
        store.Write(source,"uiTheme",RegistryData.From("String",ManagedPolicyBridge.EmployeeChoice));
        Check(bridge.Reconcile().Status=="Applied"&&store.Read(config.PolicyPath,"uiTheme") is null,"Explicit employee choice must release only the bridge override.");
        store.Write(source,"forcePrivacyScrubber",RegistryData.From("DWord",0));
        Check(bridge.Reconcile().Status=="Applied"&&store.Read(config.PolicyPath,"forcePrivacyScrubber")?.Data.GetInt32()==0,"Release must restore original prior policy rather than deleting it.");
        store.Write(source,"uiTheme",RegistryData.From("String","not-a-theme"));
        var beforeInvalid=store.Describe(config.PolicyPath);Check(bridge.Reconcile().Status=="SourceInvalid"&&store.Describe(config.PolicyPath)==beforeInvalid,"Invalid staging must preserve last good browser policy.");
        store.Write(source,"uiTheme",RegistryData.From("String","light"));
        store.Write(source,"graphTenantId",RegistryData.From("String","aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"));
        Check(bridge.Reconcile().Status=="SourceInvalid"&&store.Describe(config.PolicyPath)==beforeInvalid,"Staging cannot override immutable connection identity.");
        store.DeleteValue(source,"graphTenantId");
        store.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",0));
        Check(bridge.Reconcile().Status=="Released","ManagementOff must explicitly release all bridge overrides.");
        Check(store.Read(config.PolicyPath,"forcePrivacyScrubber")?.Data.GetInt32()==0&&store.Read(config.PolicyPath,"enableGraphTranscriptImport") is null,"ManagementOff must restore originals including connection policy.");
        Check(store.Read(config.ForcePath,"1") is not null,"ManagementOff must leave extension force installation intact.");
        store.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",1));
        Check(bridge.Reconcile().Status=="Applied"&&store.Read(config.PolicyPath,"enableGraphTranscriptImport")?.Data.GetInt32()==0,"ManagementOn must restore fixed bootstrap connection settings.");
        store.Write(config.PolicyPath,"uiTheme",RegistryData.From("String","foreign"));
        var foreign=store.Describe(config.PolicyPath);Check(bridge.Reconcile().Status=="OwnershipConflict"&&store.Describe(config.PolicyPath)==foreign,"A foreign change must never be overwritten.");
        store.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",0));
        Check(bridge.Reconcile().Status=="OwnershipConflict"&&store.Describe(config.PolicyPath)==foreign,"ManagementOff must hold on foreign drift.");

        var pairStore=Fresh();pairStore.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",1));
        pairStore.Write(source,"saveAsType",RegistryData.From("String","custom"));
        var pairBridge=new ManagedPolicyBridge(pairStore,config);
        Check(pairBridge.Reconcile().Status=="SourceInvalid","Partial save destination must wait for valid pair.");
        pairStore.Write(source,"saveLocation",RegistryData.From("String","Org/Transcripts"));
        Check(pairBridge.Reconcile().Status=="Applied","Valid save pair must apply.");
        pairStore.Write(source,"saveAsType",RegistryData.From("String",ManagedPolicyBridge.EmployeeChoice));
        Check(pairBridge.Reconcile().Status=="SourceInvalid"&&pairStore.Read(config.PolicyPath,"saveAsType")?.Data.GetString()=="custom","Mixed release and managed save pair must hold last good.");
        pairStore.Write(source,"saveLocation",RegistryData.From("String",ManagedPolicyBridge.EmployeeChoice));
        Check(pairBridge.Reconcile().Status=="Applied"&&pairStore.Read(config.PolicyPath,"saveAsType") is null,"Both explicit releases must clear only the bridge save overrides.");

        var interrupted=Fresh();interrupted.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",1));interrupted.Write(source,"uiTheme",RegistryData.From("String","midnight"));
        var failure=new BridgeFaultStore(interrupted,config.PolicyPath);failure.FailAfterPolicyWrite=true;
        Check(new ManagedPolicyBridge(failure,config).Reconcile().Status=="InterruptedOrConflicted","Post-write crash must retain finite journal.");
        var writes=failure.PolicyWrites;
        Check(new ManagedPolicyBridge(failure,config).Reconcile().Status=="Applied","A new bridge instance must recover an acknowledged or lost write by readback.");
        Check(failure.PolicyWrites==writes,"Recovery must not repeat a policy write already confirmed by current bytes.");
        failure.ThrowSourceRead=true;
        var beforeReadError=interrupted.Describe(config.PolicyPath);
        Check(new ManagedPolicyBridge(failure,config).Reconcile().Status=="SourceUnreadable"&&interrupted.Describe(config.PolicyPath)==beforeReadError,"Read failure must retain last good policy.");
        failure.ThrowSourceRead=false;
        interrupted.DeleteValue(ManagedPolicyBridge.StagingRoot,"Management");
        Check(new ManagedPolicyBridge(failure,config).Reconcile().Status=="StaleSource"&&interrupted.Describe(config.PolicyPath)==beforeReadError,"Unexpected whole-profile absence must retain last known management.");
        interrupted.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",0));
        interrupted.Write(source,"unknown",RegistryData.From("String","invalid leftover"));
        Check(new ManagedPolicyBridge(failure,config).Reconcile().Status=="Released","Atomic explicit management Off must release despite invalid inactive preference data.");
        var handoffStore=Fresh();var handoffFault=new BridgeFaultStore(handoffStore,config.PolicyPath){FailBeforeHandoff=true};
        Check(new ManagedPolicyBridge(handoffFault,config).Reconcile().Status=="InterruptedOrConflicted","Interrupted ownership handoff must preserve its intent.");
        Check(new ManagedPolicyBridge(handoffFault,config).Reconcile().Status=="WaitingForPolicy","Handoff retry must verify old ownership before completing its marker.");

        var driftRecovery=Fresh();driftRecovery.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",1));driftRecovery.Write(source,"uiTheme",RegistryData.From("String","slate"));
        var driftFault=new BridgeFaultStore(driftRecovery,config.PolicyPath){FailAfterPolicyWrite=true};
        _=new ManagedPolicyBridge(driftFault,config).Reconcile();
        driftRecovery.Write(config.PolicyPath,"uiTheme",RegistryData.From("String","foreign-after-crash"));
        var crashForeign=driftRecovery.Describe(config.PolicyPath);
        Check(new ManagedPolicyBridge(driftFault,config).Reconcile().Status=="InterruptedOrConflicted"&&driftRecovery.Describe(config.PolicyPath)==crashForeign,"Recovery must refuse foreign modification rather than replaying the journal over it.");
        var concurrent=Fresh();concurrent.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",1));concurrent.Write(source,"uiTheme",RegistryData.From("String","slate"));
        var concurrentStore=new BridgeFaultStore(concurrent,config.PolicyPath);string? nested=null;
        concurrentStore.DuringPolicyWrite=()=>nested=new ManagedPolicyBridge(concurrentStore,config).Reconcile().Status;
        Check(new ManagedPolicyBridge(concurrentStore,config).Reconcile().Status=="Applied"&&nested=="Busy","Even reentrant same-process calls must not overlap a policy transaction.");

        var tampered=Fresh();tampered.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",1));tampered.Write(source,"uiTheme",RegistryData.From("String","slate"));
        var tamperFault=new BridgeFaultStore(tampered,config.PolicyPath){FailAfterPolicyWrite=true};_ = new ManagedPolicyBridge(tamperFault,config).Reconcile();
        var journalPath=config.StatePath+"\\ManagedBridge";
        var altered=System.Text.Json.Nodes.JsonNode.Parse(tampered.Read(journalPath,"Journal")!.Data.GetString()!)!;
        altered["Pending"]!["Steps"]![0]!["Relative"]="\\..\\outside";
        tampered.Write(journalPath,"Journal",RegistryData.From("String",altered.ToJsonString()));
        var beforeTamper= tampered.Describe(config.PolicyPath);
        Check(new ManagedPolicyBridge(tamperFault,config).Reconcile().Status=="InterruptedOrConflicted"&&tampered.Describe(config.PolicyPath)==beforeTamper,"A tampered journal cannot escape fixed browser policy paths.");

        var mixedConfig=WorkerConfiguration.Parse(Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new{browser="edge",extensionId=config.ExtensionId,deploymentId=config.DeploymentId,managedPolicy=new{forcePrivacyScrubber=true}}))));
        var mixed=new MemoryRegistry();mixed.Write(config.PolicyPath,"UITheme",RegistryData.From("String","midnight"));mixed.Write(config.PolicyPath+"\\CustomScrubTerms","1",RegistryData.From("String","Original"));
        new EndpointEngine(mixed,mixedConfig,()=>new([],0,0,0)).Execute("Install");
        mixed.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",1));mixed.Write(source,"forcePrivacyScrubber",RegistryData.From("DWord",1));mixed.Write(source,"UITheme",RegistryData.From("String","slate"));mixed.Write(source,"customScrubTerms",RegistryData.From("MultiString",new[]{"Changed"}));
        var mixedBridge=new ManagedPolicyBridge(mixed,mixedConfig);Check(mixedBridge.Reconcile().Status=="Applied","A dynamically managed setting absent from bootstrap must use its verified handoff baseline.");
        mixed.Write(source,"uiTheme",RegistryData.From("String",ManagedPolicyBridge.EmployeeChoice));mixed.Write(source,"customScrubTerms",RegistryData.From("String",ManagedPolicyBridge.EmployeeChoice));
        Check(mixedBridge.Reconcile().Status=="Applied","Mixed-case original units must be restorable.");
        Check(mixed.ValueNames(config.PolicyPath).Contains("UITheme",StringComparer.Ordinal)&&mixed.Read(config.PolicyPath,"uiTheme")?.Data.GetString()=="midnight","Scalar release must preserve original spelling and value.");
        Check(mixed.SubKeys(config.PolicyPath).Contains("CustomScrubTerms",StringComparer.Ordinal)&&mixed.Read(config.PolicyPath+"\\customScrubTerms","1")?.Data.GetString()=="Original","Array release must restore original key spelling and values.");
        mixed.Write(config.PolicyPath,"UITHEME",RegistryData.From("String","foreign"));Check(mixedBridge.Reconcile().Status=="OwnershipConflict","Case-insensitive foreign value changes must be detected.");

        var retire=Fresh();retire.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",1));retire.Write(source,"uiTheme",RegistryData.From("String","slate"));
        var retireBridge=new ManagedPolicyBridge(retire,config);_ = retireBridge.Reconcile();
        var beforeInspect=retire.Describe("");_ = retireBridge.Inspect();Check(beforeInspect==retire.Describe(""),"Inspect must not mutate journal, policy or state.");
        Check(retireBridge.Remove().Status=="PolicyRemoved","Bridge removal must restore original policy before host cleanup.");
        Check(retire.Read(config.PolicyPath,"Unrelated")?.Data.GetString()=="preserve"&&retire.Read(config.PolicyPath,"forcePrivacyScrubber")?.Data.GetInt32()==0,"Removal must restore complete original data including non-schema values.");
        Check(retire.Read(config.ForcePath,"1") is null,"Removal may delete only its created force entry.");
        var retireAfter=retire.Describe(config.PolicyPath);Check(retireBridge.Remove().Status=="PolicyRemoved"&&retire.Describe(config.PolicyPath)==retireAfter,"Retired removal must be idempotent.");

        var unstaged=Fresh();
        // A prior schema policy was backed up by the worker but never staged or
        // present in bootstrap: deprovision must still restore it.
        var original=System.Text.Json.Nodes.JsonNode.Parse(unstaged.Read(config.StatePath,"BeforePolicy")!.Data.GetString()!)!;
        original[0]!["Values"]!["UITheme"]=System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(RegistryData.From("String","midnight")));
        unstaged.Write(config.StatePath,"BeforePolicy",RegistryData.From("String",original.ToJsonString()));
        var unstagedBridge=new ManagedPolicyBridge(unstaged,config);_ = unstagedBridge.Reconcile();
        Check(unstagedBridge.Remove().Status=="PolicyRemoved"&&unstaged.Read(config.PolicyPath,"uiTheme")?.Data.GetString()=="midnight","Original schema values outside bootstrap and staging must also be restored.");
        checks+=BridgeFaultMatrix.Run();
        return checks;
    }
}

sealed class BridgeFaultStore(MemoryRegistry inner,string policyRoot):IRegistryStore
{
    public bool FailAfterPolicyWrite {get;set;}
    public bool ThrowSourceRead {get;set;}
    public bool FailBeforeHandoff {get;set;}
    public int PolicyWrites {get;private set;}
    public Action? DuringPolicyWrite {get;set;}
    public bool Exists(string key)=>inner.Exists(key);
    public string[] ValueNames(string key)=>inner.ValueNames(key);
    public string[] SubKeys(string key)=>inner.SubKeys(key);
    public RegistryData? Read(string key,string name){if(ThrowSourceRead&&key.StartsWith(ManagedPolicyBridge.StagingRoot))throw new IOException("Synthetic source read failure");return inner.Read(key,name);}
    public void Create(string key)=>inner.Create(key);
    public void Write(string key,string name,RegistryData value){if(FailBeforeHandoff&&name=="Format"&&value.Data.GetString()=="ManagedPolicyBridgePrototype1"){FailBeforeHandoff=false;throw new IOException("Synthetic handoff crash");}inner.Write(key,name,value);if(key==policyRoot||key.StartsWith(policyRoot+"\\")){PolicyWrites++;var callback=DuringPolicyWrite;DuringPolicyWrite=null;callback?.Invoke();if(FailAfterPolicyWrite){FailAfterPolicyWrite=false;throw new IOException("Synthetic post-write crash");}}}
    public void DeleteValue(string key,string name)=>inner.DeleteValue(key,name);
    public void DeleteTree(string key)=>inner.DeleteTree(key);
}
