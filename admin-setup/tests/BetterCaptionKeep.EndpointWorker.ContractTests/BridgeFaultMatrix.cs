using BetterCaptionKeep.EndpointWorker;
using System.Text;
using System.Text.Json;

static class BridgeFaultMatrix
{
    public static int Run()
    {
        var checks=0;void Check(bool value,string label){checks++;if(!value)throw new Exception(label);}
        var config=WorkerConfiguration.Parse(Convert.ToBase64String(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new{browser="edge",extensionId="edefcbdhahfolgkoamkbknjppojpaffk",deploymentId="11111111-2222-4333-8444-555555555555",managedPolicy=new{forcePrivacyScrubber=true}}))));
        var source=ManagedPolicyBridge.StagingRoot+"\\edge";
        MemoryRegistry Initial(){var memory=new MemoryRegistry();memory.Write(config.PolicyPath,"Prior",RegistryData.From("String","Original"));memory.Write(ManagedPolicyBridge.StagingRoot,"Management",RegistryData.From("DWord",1));memory.Write(source,"forcePrivacyScrubber",RegistryData.From("DWord",1));return memory;}
        foreach(var release in new[]{false,true})foreach(var after in new[]{false,true})for(var index=1;index<=(release?4:3);index++)
        {
            var memory=Initial();new EndpointEngine(memory,config,()=>new([],0,0,0)).Execute("Install");
            memory.Write(source,"customScrubTerms",RegistryData.From("MultiString",new[]{"First","Second","Third"}));
            var store=new MatrixRegistry(memory,config.PolicyPath);_ = new ManagedPolicyBridge(store,config).Reconcile();
            memory.Write(source,"customScrubTerms",release?RegistryData.From("String",ManagedPolicyBridge.EmployeeChoice):RegistryData.From("MultiString",new[]{"Remaining"}));
            store.Arm(index,after);var interrupted=new ManagedPolicyBridge(store,config).Reconcile();
            Check(interrupted.Status=="InterruptedOrConflicted","Each bounded delete/write crash point must retain its journal.");
            Check(new ManagedPolicyBridge(store,config).Reconcile().Status=="Applied","A new process must recover array shrink/release from a finite before/after checkpoint.");
            Check(release?!memory.Exists(config.PolicyPath+"\\customScrubTerms"):memory.Read(config.PolicyPath+"\\customScrubTerms","1")?.Data.GetString()=="Remaining","Recovered array output must match the approved update.");
        }
        foreach(var after in new[]{false,true})
        {
            var memory=Initial();new EndpointEngine(memory,config,()=>new([],0,0,0)).Execute("Install");var store=new MatrixRegistry(memory,config.PolicyPath);_ = new ManagedPolicyBridge(store,config).Reconcile();
            memory.Write(source,"uiTheme",RegistryData.From("String","slate"));store.FailFinalJournal=true;store.AfterFailure=after;
            Check(new ManagedPolicyBridge(store,config).Reconcile().Status=="InterruptedOrConflicted","Final checkpoint fault must not be reported complete.");
            var mutations=store.Mutations;Check(new ManagedPolicyBridge(store,config).Reconcile().Status=="Applied"&&store.Mutations==mutations,"Lost final checkpoint must recover without repeating policy mutations.");
        }
        {
            var memory=Initial();new EndpointEngine(memory,config,()=>new([],0,0,0)).Execute("Install");var store=new MatrixRegistry(memory,config.PolicyPath);_ = new ManagedPolicyBridge(store,config).Reconcile();
            memory.Write(source,"uiTheme",RegistryData.From("String","slate"));store.FailReadback=true;
            Check(new ManagedPolicyBridge(store,config).Reconcile().Status=="InterruptedOrConflicted","A registry readback failure must retain pending evidence rather than announce success.");
            var mutations=store.Mutations;Check(new ManagedPolicyBridge(store,config).Reconcile().Status=="Applied"&&store.Mutations==mutations,"Readback retry must recognize already-applied bytes without repeating the write.");
        }
        foreach(var after in new[]{false,true})foreach(var rollback in new[]{false,true})
        {
            var memory=Initial();var before=memory.Describe(config.PolicyPath);var store=new MatrixRegistry(memory,config.PolicyPath);store.Arm(1,after);
            var failed=false;try{new ManagedPolicyBridge(store,config).EnsureBootstrap();}catch{failed=true;}
            Check(failed&&memory.Read(config.StatePath,"BridgeBootstrapIntent")is not null,"Bootstrap must preserve complete owned intent before its first policy mutation.");
            if(rollback)Check(new ManagedPolicyBridge(store,config).Remove().Status=="PolicyRemoved"&&memory.Describe(config.PolicyPath)==before,"Owned interrupted bootstrap rollback must restore its original snapshot.");
            else Check(new ManagedPolicyBridge(store,config).EnsureBootstrap().Status=="BootstrapReady","Owned interrupted bootstrap must resume from finite readback checkpoints.");
        }
        var old=Initial();old.Write(config.StatePath,"Status",RegistryData.From("String","Pending"));var prior=old.Describe(config.PolicyPath);
        Check(new ManagedPolicyBridge(old,config).EnsureBootstrap().Status=="UnknownLegacyPending"&&old.Describe(config.PolicyPath)==prior,"A legacy Pending state without the new owned intent must not be adopted.");
        var occupied=Initial();var race=new MatrixRegistry(occupied,config.PolicyPath);race.DuringPolicyMutation=()=>occupied.Write(config.ForcePath,"1",RegistryData.From("String","foreign;https://example.invalid/update"));
        var refused=false;try{new ManagedPolicyBridge(race,config).EnsureBootstrap();}catch{refused=true;}
        Check(refused&&occupied.Read(config.ForcePath,"1")?.Data.GetString()?.StartsWith("foreign;")==true,"A newly occupied force-list slot must never be overwritten.");
        return checks;
    }
}

sealed class MatrixRegistry(MemoryRegistry inner,string policy):IRegistryStore
{
    private int? failure;private bool readFailure;public bool AfterFailure;public bool FailFinalJournal;public bool FailReadback;public int Mutations;public Action? DuringPolicyMutation;
    public void Arm(int at,bool after){failure=Mutations+at;AfterFailure=after;}
    private void Change(string key,Action action){var relevant=key.Equals(policy,StringComparison.OrdinalIgnoreCase)||key.StartsWith(policy+"\\",StringComparison.OrdinalIgnoreCase);if(relevant){Mutations++;var callback=DuringPolicyMutation;DuringPolicyMutation=null;callback?.Invoke();if(failure==Mutations){failure=null;if(!AfterFailure)throw new IOException("Synthetic before mutation");action();throw new IOException("Synthetic lost mutation response");}}action();if(relevant&&FailReadback){FailReadback=false;readFailure=true;}}
    public bool Exists(string key)=>inner.Exists(key);public string[] ValueNames(string key)=>inner.ValueNames(key);public string[] SubKeys(string key)=>inner.SubKeys(key);public RegistryData? Read(string key,string name){if(readFailure&&(key.Equals(policy,StringComparison.OrdinalIgnoreCase)||key.StartsWith(policy+"\\",StringComparison.OrdinalIgnoreCase))){readFailure=false;throw new IOException("Synthetic readback failure");}return inner.Read(key,name);}
    public void Create(string key)=>Change(key,()=>inner.Create(key));
    public void Write(string key,string name,RegistryData value){if(FailFinalJournal&&name=="Journal"&&key.EndsWith("\\ManagedBridge")&&JsonDocument.Parse(value.Data.GetString()!).RootElement.GetProperty("Pending").ValueKind==JsonValueKind.Null){FailFinalJournal=false;if(AfterFailure)inner.Write(key,name,value);throw new IOException("Synthetic final journal checkpoint failure");}Change(key,()=>inner.Write(key,name,value));}
    public void DeleteValue(string key,string name)=>Change(key,()=>inner.DeleteValue(key,name));public void DeleteTree(string key)=>Change(key,()=>inner.DeleteTree(key));
}
