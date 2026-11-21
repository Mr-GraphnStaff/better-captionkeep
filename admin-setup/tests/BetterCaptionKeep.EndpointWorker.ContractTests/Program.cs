using BetterCaptionKeep.EndpointWorker;
using System.Text;
using System.Text.Json;

var checks = 0;
void Check(bool condition, string message) { checks++; if (!condition) throw new Exception(message); }
void Reject(Action action, string message) { var rejected = false; try { action(); } catch { rejected = true; } Check(rejected, message); }
var json = JsonSerializer.Serialize(new { browser = "edge", extensionId = "edefcbdhahfolgkoamkbknjppojpaffk", deploymentId = "11111111-2222-4333-8444-555555555555", managedPolicy = new { enableGraphTranscriptImport = true, graphTenantId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", maxStoredSessions = 25, customScrubTerms = new[] { "Example", "Second" } } });
WorkerConfiguration Parse(string value) => WorkerConfiguration.Parse(Convert.ToBase64String(Encoding.UTF8.GetBytes(value)));
var config = Parse(json);
var noEvidence = () => new InstallationEvidence([], 0, 0, 0);
var chrome = Parse(json.Replace("\"edge\"", "\"chrome\"").Replace("edefcbdhahfolgkoamkbknjppojpaffk", "nabjdlnkkaonnbnimnmnhjcbigceebml"));
Check(chrome.BrowserRoot == @"SOFTWARE\Policies\Google\Chrome" && chrome.ForceValue.EndsWith("https://clients2.google.com/service/update2/crx"), "Chrome must target only its fixed Store and policy path.");
Reject(() => Parse(json.Replace("\"browser\":\"edge\"", "\"browser\":\"edge\",\"browser\":\"edge\"")), "Duplicate configuration keys must fail.");
Reject(() => Parse(json.Replace("maxStoredSessions", "arbitraryRegistryPath")), "Unknown managed policy must fail.");
Reject(() => Parse(json.Replace(":25", ":10001")), "Managed policy range must be checked.");
Reject(() => Parse(json.Replace("edefcbdhahfolgkoamkbknjppojpaffk", "nabjdlnkkaonnbnimnmnhjcbigceebml")), "Browser and Store identity must agree.");
Reject(() => WorkerConfiguration.Parse(Convert.ToBase64String(new byte[] { 0xff, 0xfe })), "Invalid UTF8 must fail.");
Reject(() => WorkerConfiguration.Parse(new string('A', 5468)), "Oversized command configuration must fail.");
string WithPolicy(object policy) => JsonSerializer.Serialize(new {browser="edge",extensionId="edefcbdhahfolgkoamkbknjppojpaffk",deploymentId="11111111-2222-4333-8444-555555555555",managedPolicy=policy});
var preferences = Parse(WithPolicy(new {defaultSaveFormat="md",saveAsType="custom",saveLocation="BCK/Transcripts",timestampFormat="24hr",filenamePattern="{date}_{title}",uiTheme="slate",webmailDestination="outlook_work"}));
Check(preferences.Policy.Count == 7, "All seven managed preferences must remain typed registry data.");
Reject(() => Parse(WithPolicy(new {uiTheme="arbitrary"})), "Unknown managed theme must fail.");
Reject(() => Parse(WithPolicy(new {saveAsType="custom"})), "Custom save mode must require its managed subfolder.");
Reject(() => Parse(WithPolicy(new {filenamePattern="__BCK_EMPLOYEE_CHOICE__"})), "Reserved bridge marker must not become a managed filename.");
Reject(() => Parse(WithPolicy(new {saveLocation="__BCK_EMPLOYEE_CHOICE__"})), "Reserved bridge marker must not become a managed folder.");
foreach (var invalidFolder in new[] {"/absolute", "C:/absolute", "../parent", "ok/../parent", "ok//empty", "CON.txt", "folder.", "folder\\child"})
    Reject(() => Parse(WithPolicy(new {saveLocation=invalidFolder})), "Unsafe managed subfolder must fail.");
Reject(() => Parse(WithPolicy(new {chatgptWorkspaceUrl="https://attacker.invalid/"})), "Wrong workspace host must fail.");
Reject(() => Parse(WithPolicy(new {chatgptWorkspaceUrl="https://chatgpt.com/?token=secret"})), "Credential query policy must fail.");
Reject(() => Parse(WithPolicy(new {customScrubTerms=new[]{"x"}})), "Too-short managed scrub term must fail.");

var registry = new MemoryRegistry();
registry.Write(config.ForcePath, "1", RegistryData.From("String", "unrelated;https://example.invalid/update"));
registry.Write(config.PolicyPath, "PreviousString", RegistryData.From("ExpandString", "%TEMP%"));
registry.Write(config.PolicyPath, "PreviousArray", RegistryData.From("MultiString", new[] { "one", "two" }));
registry.Write(config.PolicyPath + @"\nested", "PreviousBinary", RegistryData.From("Binary", new byte[] { 0, 17, 255 }));
var beforePolicy = registry.Describe(config.PolicyPath);
var engine = new EndpointEngine(registry, config, noEvidence);
var installed = engine.Execute("Install");
Check(installed.policyVerified && installed.forceInstallVerified && !installed.installationObserved, "Installation must distinguish policy verification and browser installation.");
Check(installed.status == "ConfigurationVerifiedBrowserPending", "Browser pending must remain explicit.");
Check(registry.Read(config.ForcePath, "1")?.Data.GetString() == "unrelated;https://example.invalid/update", "Shared force-install values must survive.");
Check(registry.Read(config.StatePath, "ConfigurationHash")?.Data.GetString() == config.ConfigurationHash, "Configuration marker must bind exact approved bytes.");
var installedState = registry.Describe("");
engine.Execute("Install");
Check(registry.Describe("") == installedState, "Repeated same install must preserve original before-images.");
var driftedConfig = Parse(json.Replace(":25", ":26"));
Reject(() => new EndpointEngine(registry, driftedConfig, noEvidence).Execute("Install"), "Changed configuration cannot reuse a completed deployment marker.");
engine.Execute("Remove");
Check(registry.Describe(config.PolicyPath) == beforePolicy, "Rollback must restore exact types, values and nested keys.");
Check(!registry.Exists(config.StatePath) && registry.Read(config.ForcePath, "2") is null, "Rollback must remove only the worker's created force value and marker.");
Check(registry.Read(config.ForcePath, "1") is not null, "Rollback must leave unrelated force values.");

var driftStore = new MemoryRegistry();
var driftEngine = new EndpointEngine(driftStore, config, noEvidence);
driftEngine.Execute("Install");
driftStore.Write(config.PolicyPath, "maxStoredSessions", RegistryData.From("DWord", 26));
var driftBefore = driftStore.Describe("");
Reject(() => driftEngine.Execute("Remove"), "Policy drift must prevent destructive rollback.");
Check(driftStore.Describe("") == driftBefore, "Rejected rollback must not modify registry evidence.");
Check(!driftEngine.Execute("Verify").policyVerified, "Verification must detect policy drift.");

var blocked = new MemoryRegistry();
blocked.Write(config.BrowserRoot, "ExtensionSettings", RegistryData.From("String", "{\"*\":{\"installation_mode\":\"blocked\"}}"));
var blockedBefore = blocked.Describe("");
Reject(() => new EndpointEngine(blocked, config, noEvidence).Execute("Install"), "Wildcard authority conflict must prevent install.");
Check(blocked.Describe("") == blockedBefore, "Authority conflict must fail before any write.");

var interrupted = new MemoryRegistry { FailOnceKey = config.ForcePath };
var interruptedEngine = new EndpointEngine(interrupted, config, noEvidence);
Reject(() => interruptedEngine.Execute("Install"), "Write failure must stop installation.");
Check(interrupted.Read(config.StatePath, "Status")?.Data.GetString() == "Pending" && interrupted.Read(config.StatePath, "BeforePolicy") is not null, "Partial failure must preserve before-image and Pending state.");
var interruptedBefore = interrupted.Describe("");
Reject(() => interruptedEngine.Execute("Install"), "Interrupted deployment cannot be treated as a completed install.");
Check(interrupted.Describe("") == interruptedBefore, "Retry refusal must preserve partial evidence.");

var preexisting = new MemoryRegistry();
preexisting.Write(config.ForcePath, "7", RegistryData.From("String", config.ForceValue));
var preexistingEngine = new EndpointEngine(preexisting, config, noEvidence);
preexistingEngine.Execute("Install"); preexistingEngine.Execute("Remove");
Check(preexisting.Read(config.ForcePath, "7") is not null, "Rollback cannot remove a force entry owned by earlier management.");
var verifyStore = new MemoryRegistry();
var verify = new EndpointEngine(verifyStore, config, noEvidence).Execute("Verify");
Check(!verify.policyVerified && !verify.forceInstallVerified && verifyStore.Describe("") == "{}", "Verification must remain read-only and fail absent state.");
var legacy = new MemoryRegistry();
legacy.Write(config.StatePath, "Status", RegistryData.From("String", "Complete"));
legacy.Write(config.StatePath, "BeforePolicy", RegistryData.From("String", "legacy PowerShell serializer data"));
var legacyBefore = legacy.Describe("");
Reject(() => new EndpointEngine(legacy, config, noEvidence).Execute("Remove"), "A legacy receipt must not be interpreted as a worker rollback receipt.");
Check(legacy.Describe("") == legacyBefore, "Legacy receipt refusal must preserve all evidence.");
var unsafeBefore = new MemoryRegistry();
unsafeBefore.Write(config.PolicyPath + @"\..", "Example", RegistryData.From("String", "existing"));
var unsafeSnapshot = unsafeBefore.Describe("");
Reject(() => new EndpointEngine(unsafeBefore, config, noEvidence).Execute("Install"), "An unsupported before-image must be rejected before writes.");
Check(unsafeBefore.Describe("") == unsafeSnapshot, "Before-image validation must not damage unsupported prior content.");
checks += ManagedBridgeContracts.Run();
checks += BridgeHostContracts.Run();
Console.WriteLine($"EndpointWorker synthetic registry contracts: {checks} passed. No Windows registry or browser profiles were accessed.");

sealed class MemoryRegistry : IRegistryStore
{
    private readonly SortedDictionary<string, SortedDictionary<string, RegistryData>> data = new(StringComparer.OrdinalIgnoreCase);
    public string? FailOnceKey { get; set; }
    public bool Exists(string key) => data.ContainsKey(key);
    public string[] ValueNames(string key) => data.TryGetValue(key, out var values) ? values.Keys.ToArray() : [];
    public string[] SubKeys(string key) => data.Keys.Where(path => path.StartsWith(key + "\\", StringComparison.OrdinalIgnoreCase)).Select(path => path[(key.Length + 1)..].Split('\\')[0]).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
    public RegistryData? Read(string key, string name) => data.TryGetValue(key, out var values) && values.TryGetValue(name, out var value) ? value : null;
    public void Create(string key)
    {
        var parts = key.Split('\\');
        for (var index = 1; index <= parts.Length; index++) data.TryAdd(string.Join('\\', parts.Take(index)), new(StringComparer.OrdinalIgnoreCase));
    }
    public void Write(string key, string name, RegistryData value)
    {
        if (FailOnceKey == key) { FailOnceKey = null; throw new IOException("Synthetic disk/registry write failure."); }
        Create(key); data[key][name] = value;
    }
    public void DeleteValue(string key, string name) { if (data.TryGetValue(key, out var values)) values.Remove(name); }
    public void DeleteTree(string key) { foreach (var path in data.Keys.Where(path => path.Equals(key, StringComparison.OrdinalIgnoreCase) || path.StartsWith(key + "\\", StringComparison.OrdinalIgnoreCase)).ToArray()) data.Remove(path); }
    public string Describe(string root) => JsonSerializer.Serialize(data.Where(entry => root == "" || entry.Key.Equals(root, StringComparison.OrdinalIgnoreCase) || entry.Key.StartsWith(root + "\\", StringComparison.OrdinalIgnoreCase)).ToDictionary(entry => entry.Key, entry => entry.Value));
}
