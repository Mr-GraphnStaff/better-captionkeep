using System.Collections.Concurrent;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BetterCaptionKeep.EndpointWorker;

// Unreleased bridge candidate. The explicit endpoint-host routes supply the
// protected store and extension-scoped cross-process lock; tests use fakes only.
public sealed class ManagedPolicyBridge(IRegistryStore store, WorkerConfiguration bootstrap)
{
    public const string StagingRoot = @"SOFTWARE\Policies\DAF-TECH\BetterCaptionKeep\Managed";
    public const string EmployeeChoice = "__BCK_EMPLOYEE_CHOICE__";
    private const string BridgeFormat = "ManagedPolicyBridgePrototype1";
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Gates = new(StringComparer.OrdinalIgnoreCase);
    private static readonly HashSet<string> GraphKeys = ["enableGraphTranscriptImport", "graphTenantId", "graphClientId"];
    private string State => bootstrap.StatePath + @"\ManagedBridge";
    private string Source => StagingRoot + "\\" + bootstrap.Browser;
    public void ValidateOwnership()
    {
        const string deployments=@"SOFTWARE\DAF-TECH\BetterCaptionKeep\Deployments";
        foreach(var deployment in store.SubKeys(deployments))
        {
            if(deployment.Equals(bootstrap.DeploymentId,StringComparison.OrdinalIgnoreCase))continue;
            var other=deployments+"\\"+deployment+"\\"+bootstrap.Browser;
            if(store.Exists(other)&&(store.ValueNames(other).Length!=0||store.SubKeys(other).Length!=0))throw new InvalidDataException("Another deployment retains ownership evidence for this browser.");
        }
    }
    private static readonly JsonDocument Schema = LoadSchema();
    private static JsonDocument LoadSchema()
    {
        var assembly = typeof(WorkerConfiguration).Assembly;
        using var stream = assembly.GetManifestResourceStream(assembly.GetManifestResourceNames().Single(name => name.EndsWith("managed-schema.json", StringComparison.Ordinal)))!;
        return JsonDocument.Parse(stream);
    }
    private static string[] Keys => Schema.RootElement.GetProperty("properties").EnumerateObject().Select(item => item.Name).ToArray();

    public sealed record Result(string Status, bool ManagementObserved, bool? Active, string? AppliedFingerprint = null);
    public sealed record Step(string Action, string Relative, string? Name, RegistryData? Data, string Before, string After);
    public sealed class Transaction
    {
        public List<Step> Steps { get; set; } = [];
        public int Next { get; set; }
        public Dictionary<string, List<RegistryNode>> Units { get; set; } = [];
        public HashSet<string> Observed { get; set; } = [];
        public bool Active { get; set; }
        public string Status { get; set; } = "Applied";
        public bool Uninstall { get; set; }
        public string? TargetPolicyHash { get; set; }
    }
    public sealed class Journal
    {
        public string Format { get; set; } = BridgeFormat;
        public string BootstrapHash { get; set; } = "";
        public string OriginalBeforePolicy { get; set; } = "";
        public string ForceName { get; set; } = "";
        public int CreatedForceEntry { get; set; }
        public Dictionary<string, List<RegistryNode>> Units { get; set; } = [];
        public HashSet<string> Observed { get; set; } = [];
        public bool ManagementObserved { get; set; }
        public bool Active { get; set; }
        public Transaction? Pending { get; set; }
        public bool Retired { get; set; }
        public string LastStatus { get; set; } = "WaitingForPolicy";
        public string SourceFingerprint { get; set; } = "";
    }
    public sealed class BootstrapIntent
    {
        public string Format {get;set;}="BCKFiniteBootstrap1";
        public string ConfigurationHash {get;set;}="";
        public string BeforePolicy {get;set;}="";
        public string ForceName {get;set;}="";
        public bool CreatedForce {get;set;}
        public Transaction Plan {get;set;}=new();
        public bool RollingBack {get;set;}
        public bool Completed {get;set;}
    }

    // New bridge deployments write a complete, bound intent BEFORE the first
    // browser-policy change. Older Pending worker states have no such proof and
    // are deliberately not adopted by this feature.
    public Result EnsureBootstrap(bool rollback=false)
    {
        ValidateOwnership();
        var raw=store.Read(bootstrap.StatePath,"BridgeBootstrapIntent");
        BootstrapIntent intent;
        if(raw is null)
        {
            if(store.Exists(bootstrap.StatePath)&&(store.ValueNames(bootstrap.StatePath).Length!=0||store.SubKeys(bootstrap.StatePath).Length!=0))
            {
                var verified=new EndpointEngine(store,bootstrap,()=>new([],0,0,0)).Execute("Verify");
                return new(verified.policyVerified&&verified.forceInstallVerified?"BootstrapReady":"UnknownLegacyPending",false,null);
            }
            if(rollback)return new("PolicyRemoved",false,false,Hash(Capture()));
            if(!new EndpointEngine(store,bootstrap,()=>new([],0,0,0)).ManagementAuthorityAvailable)throw new InvalidDataException();
            var before=Capture();var forceName="";
            foreach(var name in store.ValueNames(bootstrap.ForcePath))
            {
                var value=store.Read(bootstrap.ForcePath,name);
                if(value?.Kind=="String"&&value.Data.GetString()!.Split(';')[0]==bootstrap.ExtensionId)
                {
                    if(forceName!=""||value.Data.GetString()!=bootstrap.ForceValue)throw new InvalidDataException();
                    forceName=name;
                }
            }
            var created=forceName=="";
            if(created){var index=1;var names=store.ValueNames(bootstrap.ForcePath).ToHashSet(StringComparer.OrdinalIgnoreCase);while(names.Contains(index.ToString()))if(++index>100000)throw new InvalidDataException();forceName=index.ToString();}
            intent=new(){ConfigurationHash=bootstrap.ConfigurationHash,BeforePolicy=JsonSerializer.Serialize(before),ForceName=forceName,CreatedForce=created};
            var after=new List<RegistryNode>{new("",new(StringComparer.Ordinal))};
            foreach(var(key,value)in bootstrap.Policy)ReplaceUnit(after,key,DesiredUnit(key,value));
            intent.Plan=new(){Steps=BuildSteps(before,after,BootstrapKeys(intent)),TargetPolicyHash=Hash(after)};
            SaveBootstrap(intent);
        }
        else
        {
            if(raw.Kind!="String"||raw.Data.GetString()!.Length>2_000_000)throw new InvalidDataException();
            intent=JsonSerializer.Deserialize<BootstrapIntent>(raw.Data.GetString()!)??throw new InvalidDataException();
            if(intent.Format!="BCKFiniteBootstrap1"||intent.ConfigurationHash!=bootstrap.ConfigurationHash)throw new InvalidDataException();
            _=ParseSnapshot(intent.BeforePolicy);
        }
        var force=store.Read(bootstrap.ForcePath,intent.ForceName);
        if((!intent.CreatedForce&&force is null)||(force is not null&&!RegistryData.From("String",bootstrap.ForceValue).Matches(force)))throw new InvalidDataException();
        if(!new EndpointEngine(store,bootstrap,()=>new([],0,0,0)).ManagementAuthorityAvailable)throw new InvalidDataException();
        if(intent.Completed&&intent.RollingBack)return new("PolicyRemoved",false,false,Hash(Capture()));
        if(intent.Completed&&!rollback)return new("BootstrapReady",false,null);
        var allowed=BootstrapKeys(intent);
        if(intent.Plan.Steps.Count>5000||intent.Plan.Next<0||intent.Plan.Next>intent.Plan.Steps.Count)throw new InvalidDataException();
        foreach(var step in intent.Plan.Steps)AssertStep(step,allowed);
        if(rollback&&!intent.RollingBack)
        {
            var current=Capture();var currentHash=Hash(current);
            var next=intent.Plan.Next<intent.Plan.Steps.Count?intent.Plan.Steps[intent.Plan.Next]:null;
            if(currentHash!=intent.Plan.TargetPolicyHash&&(next is null||(currentHash!=next.Before&&currentHash!=next.After)))throw new InvalidDataException();
            var original=ParseSnapshot(intent.BeforePolicy);
            intent.Plan=new(){Steps=BuildSteps(current,original,allowed),TargetPolicyHash=Hash(original)};
            intent.RollingBack=true;intent.Completed=false;SaveBootstrap(intent);
        }
        while(intent.Plan.Next<intent.Plan.Steps.Count)
        {
            ApplyStep(intent.Plan.Steps[intent.Plan.Next],allowed);
            intent.Plan.Next++;SaveBootstrap(intent);
        }
        if(Hash(Capture())!=intent.Plan.TargetPolicyHash)throw new InvalidDataException();
        if(intent.RollingBack)
        {
            force=store.Read(bootstrap.ForcePath,intent.ForceName);
            if(force is not null&&!RegistryData.From("String",bootstrap.ForceValue).Matches(force))throw new InvalidDataException();
            if(intent.CreatedForce&&force is not null)store.DeleteValue(bootstrap.ForcePath,intent.ForceName);
            if(intent.CreatedForce&&store.Read(bootstrap.ForcePath,intent.ForceName)is not null)throw new IOException();
            intent.Completed=true;SaveBootstrap(intent);return new("PolicyRemoved",false,false,Hash(Capture()));
        }
        force=store.Read(bootstrap.ForcePath,intent.ForceName);
        if(force is not null&&!RegistryData.From("String",bootstrap.ForceValue).Matches(force))throw new InvalidDataException();
        if(force is null)store.Write(bootstrap.ForcePath,intent.ForceName,RegistryData.From("String",bootstrap.ForceValue));
        if(!RegistryData.From("String",bootstrap.ForceValue).Matches(store.Read(bootstrap.ForcePath,intent.ForceName)))throw new IOException();
        store.Write(bootstrap.StatePath,"Format",RegistryData.From("String","EndpointWorkerV1"));
        store.Write(bootstrap.StatePath,"ConfigurationHash",RegistryData.From("String",bootstrap.ConfigurationHash));
        store.Write(bootstrap.StatePath,"BeforePolicy",RegistryData.From("String",intent.BeforePolicy));
        store.Write(bootstrap.StatePath,"ForceName",RegistryData.From("String",intent.ForceName));
        store.Write(bootstrap.StatePath,"CreatedForceEntry",RegistryData.From("DWord",intent.CreatedForce?1:0));
        var legacyHash=Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(Capture().OrderBy(node=>node.Relative,StringComparer.Ordinal).Select(node=>new RegistryNode(node.Relative,new(node.Values,StringComparer.Ordinal))))));
        store.Write(bootstrap.StatePath,"AfterPolicy",RegistryData.From("String",legacyHash));
        store.Write(bootstrap.StatePath,"Status",RegistryData.From("String","Complete"));
        if(!new EndpointEngine(store,bootstrap,()=>new([],0,0,0)).Execute("Verify").policyVerified)throw new IOException();
        intent.Completed=true;SaveBootstrap(intent);return new("BootstrapReady",false,null);
    }
    private static HashSet<string> BootstrapKeys(BootstrapIntent intent)=>ParseSnapshot(intent.BeforePolicy).SelectMany(node=>node.Relative==""?node.Values.Keys:Enumerable.Empty<string>()).Concat(ParseSnapshot(intent.BeforePolicy).Where(node=>node.Relative!="").Select(node=>node.Relative.Split('\\')[1])).Concat(Keys).ToHashSet(StringComparer.OrdinalIgnoreCase);
    private void SaveBootstrap(BootstrapIntent intent){var json=JsonSerializer.Serialize(intent);if(json.Length>2_000_000)throw new InvalidDataException();store.Write(bootstrap.StatePath,"BridgeBootstrapIntent",RegistryData.From("String",json));if(store.Read(bootstrap.StatePath,"BridgeBootstrapIntent")?.Data.GetString()!=json)throw new IOException();}

    public Result Reconcile()
    {
        var gate = Gates.GetOrAdd(bootstrap.StatePath, _ => new(1, 1));
        if (!gate.Wait(0)) return new("Busy", false, null);
        try
        {
            var journal = LoadOrHandoff();
            if (journal.Pending is not null) Recover(journal);
            if(journal.Retired)return new("PolicyRemoved",journal.ManagementObserved,false);
            RegistryData? management;
            Dictionary<string, RegistryData?> source;
            try
            {
                management = store.Read(StagingRoot, "Management");
                source = management?.Kind == "DWord" && management.Data.GetInt32() == 1 ? ReadSource() : [];
            }
            catch (InvalidDataException) { return new("SourceInvalid", journal.ManagementObserved, journal.Active); }
            catch { return new("SourceUnreadable", journal.ManagementObserved, journal.Active); }
            if (management is null) return new(journal.ManagementObserved ? "StaleSource" : "WaitingForPolicy", journal.ManagementObserved, journal.Active);
            if (management.Kind != "DWord" || management.Data.GetInt32() is not (0 or 1)) return new("SourceInvalid", journal.ManagementObserved, journal.Active);
            var active = management.Data.GetInt32() == 1;
            var desired = journal.Units.ToDictionary(pair => pair.Key, pair => Clone(pair.Value), StringComparer.Ordinal);
            var observed = new HashSet<string>(journal.Observed, StringComparer.Ordinal);
            // A migrated bootstrap value is already managed, even before the
            // first Intune source value arrives. Missing input must report held.
            foreach(var key in bootstrap.Policy.Keys.Where(key=>!GraphKeys.Contains(key)))observed.Add(key is "saveAsType" or "saveLocation"?"saveDestination":key);
            var stale = false;
            try
            {
                var original = ParseSnapshot(journal.OriginalBeforePolicy);
                if (!active)
                {
                    foreach (var key in desired.Keys.ToArray()) desired[key] = Unit(original, key);
                }
                else
                {
                    foreach (var key in GraphKeys)
                        desired[key] = bootstrap.Policy.TryGetValue(key, out var value)?DesiredUnit(key,value):Unit([],key);
                    foreach (var key in Keys.Where(key => !GraphKeys.Contains(key) && key is not ("saveAsType" or "saveLocation")))
                    {
                        var value = source.GetValueOrDefault(key);
                        if (value is null) { stale |= observed.Contains(key); continue; }
                        observed.Add(key);
                        desired[key] = IsChoice(key, value) ? Unit(original, key) : DesiredUnit(key, Validate(key, value));
                    }
                    var mode = source.GetValueOrDefault("saveAsType");
                    var folder = source.GetValueOrDefault("saveLocation");
                    if (mode is null && folder is null) stale |= observed.Contains("saveDestination");
                    else if (mode is null || folder is null) throw new InvalidDataException();
                    else
                    {
                        observed.Add("saveDestination");
                        var release = IsChoice("saveAsType", mode);
                        if (release != IsChoice("saveLocation", folder)) throw new InvalidDataException();
                        if (release)
                        {
                            desired["saveAsType"] = Unit(original, "saveAsType");
                            desired["saveLocation"] = Unit(original, "saveLocation");
                        }
                        else
                        {
                            var pair = ParsePolicy(new Dictionary<string, object?> { ["saveAsType"] = Scalar(mode), ["saveLocation"] = Scalar(folder) });
                            desired["saveAsType"] = DesiredUnit("saveAsType", pair.Policy["saveAsType"]);
                            desired["saveLocation"] = DesiredUnit("saveLocation", pair.Policy["saveLocation"]);
                        }
                    }
                }
            }
            catch { return new("SourceInvalid", journal.ManagementObserved, journal.Active); }
            var before = Capture();
            foreach (var (key, expected) in journal.Units)
                if (Hash(Unit(before, key)) != Hash(expected)) return new("OwnershipConflict", journal.ManagementObserved, journal.Active);
            // A newly controlled setting may only replace its preserved original
            // before-image, never another administrator's subsequently changed value.
            var originalTree = ParseSnapshot(journal.OriginalBeforePolicy);
            foreach (var key in desired.Keys.Except(journal.Units.Keys))
                if (Hash(Unit(before, key)) != Hash(Unit(originalTree, key))) return new("OwnershipConflict", journal.ManagementObserved, journal.Active);
            var after = Clone(before);
            foreach (var (key, unit) in desired) ReplaceUnit(after, key, unit);
            journal.Pending = new() { Steps = BuildSteps(before, after), Units = desired, Observed = observed, Active = active,
                Status = !active ? "Released" : stale ? "StaleSource" : "Applied" };
            journal.SourceFingerprint=SourceHash(management,source);
            Save(journal);
            return Recover(journal);
        }
        catch { return new("InterruptedOrConflicted", true, null); }
        finally { gate.Release(); }
    }

    public Result Inspect()
    {
        ValidateOwnership();
        // Status must not manufacture a handoff, mutate a pending journal, or
        // imply that a browser has loaded its extension.
        var saved=store.Read(State,"Journal");
        if(saved?.Kind!="String")return new("NotInstalled",false,null);
        var journal=JsonSerializer.Deserialize<Journal>(saved.Data.GetString()!)??throw new InvalidDataException();
        ValidateJournal(journal);
        if(journal.Pending is not null)return new("RecoveryPending",journal.ManagementObserved,null);
        if(journal.Retired)return new("PolicyRemoved",journal.ManagementObserved,false,Hash(Capture()));
        foreach(var (key,unit) in journal.Units)if(Hash(Unit(Capture(),key))!=Hash(unit))return new("OwnershipConflict",journal.ManagementObserved,null);
        try{
            var management=store.Read(StagingRoot,"Management");
            if(management is null)return new(journal.ManagementObserved?"StaleSource":"WaitingForPolicy",journal.ManagementObserved,journal.Active);
            if(management.Kind!="DWord"||management.Data.GetInt32() is not(0 or 1))return new("SourceInvalid",journal.ManagementObserved,journal.Active);
            var source=management.Data.GetInt32()==1?ReadSource():[];
            if(SourceHash(management,source)!=journal.SourceFingerprint)return new("InputPending",journal.ManagementObserved,journal.Active);
            return new(journal.LastStatus,journal.ManagementObserved,journal.Active,Hash(Capture()));
        }catch{return new("SourceUnreadable",journal.ManagementObserved,journal.Active);}
    }

    public Result Remove()
    {
        var gate=Gates.GetOrAdd(bootstrap.StatePath,_=>new(1,1));if(!gate.Wait(0))return new("Busy",false,null);
        try{
            if(store.Read(State,"Journal")is null&&store.Read(bootstrap.StatePath,"BridgeBootstrapIntent")is not null)return EnsureBootstrap(rollback:true);
            var journal=LoadOrHandoff();
            if(journal.Pending is not null){var recovered=Recover(journal);if(journal.Retired)return recovered;}
            if(journal.Retired)return new("PolicyRemoved",journal.ManagementObserved,false,Hash(Capture()));
            var before=Capture();
            foreach(var (key,unit) in journal.Units)if(Hash(Unit(before,key))!=Hash(unit))return new("OwnershipConflict",journal.ManagementObserved,null);
            var original=ParseSnapshot(journal.OriginalBeforePolicy);
            var after=Clone(before);
            foreach(var key in journal.Units.Keys)ReplaceUnit(after,key,Unit(original,key));
            // The old worker captured and replaced the whole original tree.
            // Restore original non-schema values only when their locations are
            // still absent or already identical; never overwrite later owners.
            var originalNames=original.SelectMany(node=>node.Relative==""?node.Values.Keys:Enumerable.Empty<string>()).Concat(original.Where(node=>node.Relative!="").Select(node=>node.Relative.Split('\\')[1])).Distinct(StringComparer.OrdinalIgnoreCase);
            foreach(var key in originalNames.Where(key=>!journal.Units.Keys.Contains(key,StringComparer.OrdinalIgnoreCase))){
                var currentUnit=RawUnit(before,key);var oldUnit=RawUnit(original,key);
                if(currentUnit.Any(node=>node.Relative!=""||node.Values.Count>0)&&Hash(currentUnit)!=Hash(oldUnit))return new("OwnershipConflict",journal.ManagementObserved,null);
                ReplaceRawUnit(after,key,oldUnit);
            }
            if(original.Count==0&&after.Count==1&&after[0].Values.Count==0)after.Clear();
            var allowed=RestoreKeys(journal);
            journal.Pending=new(){Steps=BuildSteps(before,after,allowed),Units=journal.Units.ToDictionary(pair=>pair.Key,pair=>Unit(original,pair.Key)),Observed=journal.Observed,Active=false,Status="PolicyRemoved",Uninstall=true,TargetPolicyHash=Hash(after)};
            Save(journal);return Recover(journal);
        }catch{return new("InterruptedOrConflicted",true,null);}finally{gate.Release();}
    }

    private static string SourceHash(RegistryData? management,Dictionary<string,RegistryData?> source)=>Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new{management,source=source.OrderBy(pair=>pair.Key,StringComparer.Ordinal).ToDictionary(pair=>pair.Key,pair=>pair.Value)})));
    private void ValidateJournal(Journal journal){if(journal.Format!=BridgeFormat||journal.BootstrapHash!=bootstrap.ConfigurationHash)throw new InvalidDataException();_=ParseSnapshot(journal.OriginalBeforePolicy);ValidateUnits(journal.Units);}
    private static HashSet<string> RestoreKeys(Journal journal)=>ParseSnapshot(journal.OriginalBeforePolicy).SelectMany(node=>node.Relative==""?node.Values.Keys:Enumerable.Empty<string>()).Concat(ParseSnapshot(journal.OriginalBeforePolicy).Where(node=>node.Relative!="").Select(node=>node.Relative.Split('\\')[1])).Concat(Keys).ToHashSet(StringComparer.OrdinalIgnoreCase);

    private Journal LoadOrHandoff()
    {
        ValidateOwnership();
        var saved = store.Read(State, "Journal");
        if (saved is not null)
        {
            if (saved.Kind != "String" || saved.Data.GetString()!.Length > 2_000_000) throw new InvalidDataException();
            var journal = JsonSerializer.Deserialize<Journal>(saved.Data.GetString()!) ?? throw new InvalidDataException();
            if (journal.Format != BridgeFormat || journal.BootstrapHash != bootstrap.ConfigurationHash) throw new InvalidDataException();
            _ = ParseSnapshot(journal.OriginalBeforePolicy);
            ValidateUnits(journal.Units);
            if (journal.Observed.Count > 24 || journal.Observed.Any(key => key != "saveDestination" && (!Keys.Contains(key, StringComparer.Ordinal) || GraphKeys.Contains(key)))) throw new InvalidDataException();
            if (store.Read(bootstrap.StatePath, "ConfigurationHash")?.Data.GetString() != bootstrap.ConfigurationHash
                || store.Read(bootstrap.StatePath, "BeforePolicy")?.Data.GetString() != journal.OriginalBeforePolicy
                || store.Read(bootstrap.StatePath, "ForceName")?.Data.GetString() != journal.ForceName
                || store.Read(bootstrap.StatePath, "CreatedForceEntry")?.Data.GetInt32() != journal.CreatedForceEntry) throw new InvalidDataException();
            var force=store.Read(bootstrap.ForcePath,journal.ForceName);
            if (!(journal.CreatedForceEntry==1&&(journal.Retired||journal.Pending?.Uninstall==true)&&force is null)
                &&!RegistryData.From("String", bootstrap.ForceValue).Matches(force)) throw new InvalidDataException();
            var format = store.Read(bootstrap.StatePath, "Format")?.Data.GetString();
            if (format == "EndpointWorkerV1")
            {
                var handoffVerified = new EndpointEngine(store, bootstrap, () => new([], 0, 0, 0)).Execute("Verify");
                if (!handoffVerified.policyVerified || !handoffVerified.forceInstallVerified || journal.Pending is not null) throw new InvalidDataException();
                store.Write(bootstrap.StatePath, "Format", RegistryData.From("String", BridgeFormat));
            }
            else if (format != BridgeFormat) throw new InvalidDataException();
            return journal;
        }
        var verified = new EndpointEngine(store, bootstrap, () => new([], 0, 0, 0)).Execute("Verify");
        if (!verified.policyVerified || !verified.forceInstallVerified) throw new InvalidDataException("Only a verified complete worker can hand off ownership.");
        string Text(string name) => store.Read(bootstrap.StatePath, name)?.Data.GetString() ?? throw new InvalidDataException();
        var original = Text("BeforePolicy"); _ = ParseSnapshot(original);
        var current = Capture();
        var next = new Journal { BootstrapHash = bootstrap.ConfigurationHash, OriginalBeforePolicy = original, ForceName = Text("ForceName"),
            CreatedForceEntry = store.Read(bootstrap.StatePath, "CreatedForceEntry")!.Data.GetInt32() };
        // The legacy worker replaced the entire policy tree. Record every
        // supported unit's handoff image, including values absent in bootstrap.
        foreach (var key in Keys) next.Units[key] = Unit(current, key);
        Save(next);
        // Preserve all original rollback data; stop the old whole-tree installer
        // from treating the handed-off state as its own completed deployment.
        store.Write(bootstrap.StatePath, "Format", RegistryData.From("String", BridgeFormat));
        return next;
    }

    private Dictionary<string, RegistryData?> ReadSource()
    {
        if (store.SubKeys(Source).Length != 0) throw new InvalidDataException();
        var allowed = Keys.Where(key => !GraphKeys.Contains(key)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (store.ValueNames(Source).Any(key => !allowed.Contains(key))) throw new InvalidDataException();
        return allowed.ToDictionary(key => key, key => store.Read(Source, key), StringComparer.Ordinal);
    }
    private static bool IsChoice(string key, RegistryData value) => (value.Kind == "String" && value.Data.GetString() == EmployeeChoice)
        || (Schema.RootElement.GetProperty("properties").GetProperty(key).GetProperty("type").GetString() == "boolean" && value.Kind == "DWord" && value.Data.GetInt32() == 0);
    private static object? Scalar(RegistryData value) => value.Kind switch
    {
        "String" => value.Data.GetString(), "MultiString" => value.Data.EnumerateArray().Select(item => item.GetString()).ToArray(),
        "DWord" => value.Data.GetInt32(), _ => throw new InvalidDataException()
    };
    private RegistryData Validate(string key, RegistryData value)
    {
        var type = Schema.RootElement.GetProperty("properties").GetProperty(key).GetProperty("type").GetString();
        object? data = type switch
        {
            "boolean" when value.Kind == "DWord" && value.Data.GetInt32() is 0 or 1 => value.Data.GetInt32() == 1,
            "integer" when value.Kind == "DWord" => value.Data.GetInt32(),
            "string" when value.Kind == "String" => value.Data.GetString(),
            "array" when value.Kind == "MultiString" => Scalar(value), _ => throw new InvalidDataException()
        };
        return ParsePolicy(new Dictionary<string, object?> { [key] = data }).Policy[key];
    }
    private WorkerConfiguration ParsePolicy(Dictionary<string, object?> policy) => WorkerConfiguration.Parse(Convert.ToBase64String(JsonSerializer.SerializeToUtf8Bytes(
        new { browser = bootstrap.Browser, extensionId = bootstrap.ExtensionId, deploymentId = bootstrap.DeploymentId, managedPolicy = policy })));

    private Result Recover(Journal journal)
    {
        var transaction = journal.Pending ?? throw new InvalidDataException();
        ValidateUnits(transaction.Units);
        var allowed=transaction.Uninstall?RestoreKeys(journal):null;
        if (transaction.Steps.Count > 5000 || transaction.Next < 0 || transaction.Next > transaction.Steps.Count) throw new InvalidDataException();
        for (var index = 0; index < transaction.Steps.Count; index++)
        {
            var item = transaction.Steps[index]; AssertStep(item,allowed);
            if (item.Before.Length != 64 || item.After.Length != 64 || (index > 0 && transaction.Steps[index - 1].After != item.Before)) throw new InvalidDataException();
        }
        while (transaction.Next < transaction.Steps.Count)
        {
            var step = transaction.Steps[transaction.Next]; AssertStep(step,allowed);
            ApplyStep(step,allowed);
            transaction.Next++; Save(journal);
        }
        foreach (var (key, unit) in transaction.Units)
            if (Hash(Unit(Capture(), key)) != Hash(unit)) throw new InvalidDataException();
        if(transaction.Uninstall){
            if(Hash(Capture())!=transaction.TargetPolicyHash)throw new InvalidDataException();
            if(journal.CreatedForceEntry==1){var force=store.Read(bootstrap.ForcePath,journal.ForceName);if(force is not null){if(!RegistryData.From("String",bootstrap.ForceValue).Matches(force))throw new InvalidDataException();store.DeleteValue(bootstrap.ForcePath,journal.ForceName);}if(store.Read(bootstrap.ForcePath,journal.ForceName)is not null)throw new IOException();}
            journal.Retired=true;
        }
        journal.Units = transaction.Units; journal.Observed = transaction.Observed;
        journal.ManagementObserved = true; journal.Active = transaction.Active; journal.LastStatus=transaction.Status;journal.Pending = null; Save(journal);
        return new(transaction.Status, true, journal.Active, Hash(Capture()));
    }
    private void ApplyStep(Step step,HashSet<string>? allowed=null)
    {
        AssertStep(step,allowed);var current=Hash(Capture());
        if(current!=step.Before&&current!=step.After)throw new InvalidDataException("Registry drift during an interrupted update.");
        if(current==step.After)return;
        var key=bootstrap.PolicyPath+step.Relative;
        switch(step.Action){
            case "Create":store.Create(key);break;
            case "Write":store.Write(key,step.Name!,step.Data!);break;
            case "DeleteValue":store.DeleteValue(key,step.Name!);break;
            case "DeleteEmpty":if(store.ValueNames(key).Length!=0||store.SubKeys(key).Length!=0)throw new InvalidDataException();store.DeleteTree(key);break;
            default:throw new InvalidDataException();
        }
        if(Hash(Capture())!=step.After)throw new IOException("Registry readback failed.");
    }

    private void Save(Journal journal)
    {
        var serialized = JsonSerializer.Serialize(journal);
        if (Encoding.UTF8.GetByteCount(serialized) > 2_000_000) throw new InvalidDataException();
        store.Write(State, "Journal", RegistryData.From("String", serialized));
        if (store.Read(State, "Journal")?.Data.GetString() != serialized) throw new IOException();
    }
    private static void AssertKey(string key) { if (!Keys.Contains(key, StringComparer.OrdinalIgnoreCase)) throw new InvalidDataException(); }
    private static void ValidateUnits(Dictionary<string, List<RegistryNode>> units)
    {
        if (units.Count > Keys.Length) throw new InvalidDataException();
        foreach (var (key, unit) in units)
        {
            AssertKey(key); _ = ParseSnapshot(JsonSerializer.Serialize(unit));
            if (Hash(Unit(unit, key)) != Hash(unit)) throw new InvalidDataException();
        }
    }
    private static void AssertStep(Step step,HashSet<string>? restoreKeys=null)
    {
        void Allowed(string name){if(restoreKeys is null)AssertKey(name);else if(!restoreKeys.Contains(name))throw new InvalidDataException();}
        if (step.Action is not ("Create" or "Write" or "DeleteValue" or "DeleteEmpty")) throw new InvalidDataException();
        if (step.Action == "Write") { if (step.Data is null || step.Name is null) throw new InvalidDataException(); _ = step.Data.ToRegistryValue(); }
        if (step.Action == "DeleteValue" && step.Name is null) throw new InvalidDataException();
        if (step.Relative.Length == 0) { if (step.Name is not null) Allowed(step.Name); }
        else
        {
            var parts = step.Relative.Split('\\');
            if (parts[0] != "" || parts.Skip(1).Any(part => part.Length == 0 || part is "." or "..")) throw new InvalidDataException();
            Allowed(parts[1]);
        }
    }
    private List<RegistryNode> Capture()
    {
        var result = new List<RegistryNode>();
        void Visit(string relative)
        {
            if (result.Count > 1000) throw new InvalidDataException();
            var path = bootstrap.PolicyPath + relative;
            var values = new SortedDictionary<string, RegistryData>(StringComparer.Ordinal);
            foreach (var name in store.ValueNames(path).Order(StringComparer.Ordinal)) values[name] = store.Read(path, name) ?? throw new IOException();
            result.Add(new(relative, values));
            foreach (var name in store.SubKeys(path).Order(StringComparer.Ordinal)) Visit(relative + "\\" + name);
        }
        if (store.Exists(bootstrap.PolicyPath)) Visit("");
        _ = ParseSnapshot(JsonSerializer.Serialize(result));
        return result;
    }
    private static List<RegistryNode> ParseSnapshot(string text)
    {
        if (Encoding.UTF8.GetByteCount(text) > 524288) throw new InvalidDataException();
        var nodes = JsonSerializer.Deserialize<List<RegistryNode>>(text) ?? throw new InvalidDataException();
        if (nodes.Count > 1000 || nodes.Select(node => node.Relative).Distinct(StringComparer.OrdinalIgnoreCase).Count() != nodes.Count) throw new InvalidDataException();
        foreach (var node in nodes)
        {
            if (node.Relative != "" && (!node.Relative.StartsWith('\\') || node.Relative.Split('\\').Skip(1).Any(part => part.Length == 0 || part is "." or ".."))) throw new InvalidDataException();
            foreach (var value in node.Values.Values) _ = value.ToRegistryValue();
        }
        return nodes;
    }
    private static List<RegistryNode> Clone(List<RegistryNode> nodes) => nodes.Select(node => new RegistryNode(node.Relative, new(node.Values, StringComparer.Ordinal))).ToList();
    private static string Hash(List<RegistryNode> nodes) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(nodes.OrderBy(node => node.Relative, StringComparer.OrdinalIgnoreCase)
        .Select(node => new { Relative=node.Relative.ToUpperInvariant(), Values=node.Values.OrderBy(value=>value.Key,StringComparer.OrdinalIgnoreCase).ToDictionary(value=>value.Key.ToUpperInvariant(),value=>value.Value) }))));
    private static List<RegistryNode> Unit(List<RegistryNode> nodes, string key)
    {
        AssertKey(key);
        return RawUnit(nodes,key);
    }
    private static List<RegistryNode> RawUnit(List<RegistryNode> nodes,string key)
    {
        var root = new SortedDictionary<string, RegistryData>(StringComparer.Ordinal);
        var existing = nodes.FirstOrDefault(node => node.Relative == "");
        if (existing is not null) foreach(var entry in existing.Values.Where(entry=>entry.Key.Equals(key,StringComparison.OrdinalIgnoreCase))) root[entry.Key]=entry.Value;
        return new[] { new RegistryNode("", root) }.Concat(Clone(nodes.Where(node => node.Relative.Equals("\\" + key,StringComparison.OrdinalIgnoreCase) || node.Relative.StartsWith("\\" + key + "\\", StringComparison.OrdinalIgnoreCase)).ToList())).ToList();
    }
    private static List<RegistryNode> DesiredUnit(string key, RegistryData value)
    {
        if (value.Kind != "StringArray") return [new("", new(StringComparer.Ordinal) { [key] = value })];
        var items = new SortedDictionary<string, RegistryData>(StringComparer.Ordinal); var index = 1;
        foreach (var item in value.Data.EnumerateArray()) items[(index++).ToString()] = RegistryData.From("String", item.GetString());
        return [new("", new(StringComparer.Ordinal)), new("\\" + key, items)];
    }
    private static void ReplaceUnit(List<RegistryNode> target, string key, List<RegistryNode> unit)
    {
        AssertKey(key);
        ReplaceRawUnit(target,key,unit);
    }
    private static void ReplaceRawUnit(List<RegistryNode> target,string key,List<RegistryNode> unit)
    {
        target.RemoveAll(node => node.Relative.Equals("\\" + key,StringComparison.OrdinalIgnoreCase) || node.Relative.StartsWith("\\" + key + "\\", StringComparison.OrdinalIgnoreCase));
        var root = target.FirstOrDefault(node => node.Relative == "");
        if (root is null) { root = new("", new(StringComparer.Ordinal)); target.Add(root); }
        foreach(var name in root.Values.Keys.Where(name=>name.Equals(key,StringComparison.OrdinalIgnoreCase)).ToArray())root.Values.Remove(name);
        foreach (var node in unit)
            if (node.Relative == "") { foreach(var entry in node.Values.Where(entry=>entry.Key.Equals(key,StringComparison.OrdinalIgnoreCase)))root.Values[entry.Key]=entry.Value; }
            else target.Add(new(node.Relative, new(node.Values, StringComparer.Ordinal)));
    }
    private static List<Step> BuildSteps(List<RegistryNode> before, List<RegistryNode> after,HashSet<string>? restoreKeys=null)
    {
        var model = Clone(before); var steps = new List<Step>();
        void Add(string action, string relative, string? name, RegistryData? value, Action mutate)
        { var previous = Hash(model); mutate(); var step = new Step(action, relative, name, value, previous, Hash(model)); AssertStep(step,restoreKeys); steps.Add(step); }
        // Remove obsolete (including case-renamed) nodes before creating their
        // replacements. Windows treats case variants as the same registry key.
        foreach(var node in model.Where(node=>!after.Any(item=>item.Relative==node.Relative)).OrderByDescending(node=>node.Relative.Length).ToArray())
        {
            foreach(var name in node.Values.Keys.ToArray())Add("DeleteValue",node.Relative,name,null,()=>node.Values.Remove(name));
            Add("DeleteEmpty",node.Relative,null,null,()=>model.Remove(node));
        }
        foreach (var node in model.ToArray())
            foreach (var name in node.Values.Keys.ToArray())
                if (!after.Any(item => item.Relative == node.Relative && item.Values.ContainsKey(name))) Add("DeleteValue", node.Relative, name, null, () => node.Values.Remove(name));
        foreach (var node in after.OrderBy(node => node.Relative.Length))
            if (!model.Any(item => item.Relative == node.Relative)) Add("Create", node.Relative, null, null, () => model.Add(new(node.Relative, new(StringComparer.Ordinal))));
        foreach (var node in after)
            foreach (var (name, value) in node.Values)
            {
                var item = model.Single(item => item.Relative == node.Relative);
                if (!value.Matches(item.Values.GetValueOrDefault(name))) Add("Write", node.Relative, name, value, () => item.Values[name] = value);
            }
        foreach (var node in model.OrderByDescending(node => node.Relative.Length).ToArray())
            if (!after.Any(item => item.Relative == node.Relative)) Add("DeleteEmpty", node.Relative, null, null, () => model.Remove(node));
        return steps;
    }
}
