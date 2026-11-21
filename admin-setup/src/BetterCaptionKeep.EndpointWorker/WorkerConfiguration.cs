using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace BetterCaptionKeep.EndpointWorker;

public sealed record WorkerConfiguration(string Browser, string ExtensionId, string DeploymentId,
    IReadOnlyDictionary<string, RegistryData> Policy, string ConfigurationHash)
{
    public string BrowserRoot => Browser == "edge" ? @"SOFTWARE\Policies\Microsoft\Edge" : @"SOFTWARE\Policies\Google\Chrome";
    public string PolicyPath => BrowserRoot + @"\3rdparty\extensions\" + ExtensionId + @"\policy";
    public string ForcePath => BrowserRoot + @"\ExtensionInstallForcelist";
    public string StatePath => @"SOFTWARE\DAF-TECH\BetterCaptionKeep\Deployments\" + DeploymentId + @"\" + Browser;
    public string ForceValue => ExtensionId + ";" + (Browser == "edge" ? "https://edge.microsoft.com/extensionwebstorebase/v1/crx" : "https://clients2.google.com/service/update2/crx");

    public static WorkerConfiguration Parse(string encoded)
    {
        if (encoded.Length is < 4 or > 5464) throw new InvalidOperationException("Invalid configuration size.");
        var bytes = Convert.FromBase64String(encoded);
        if (bytes.Length > 4096) throw new InvalidOperationException("Invalid configuration size.");
        var json = new UTF8Encoding(false, true).GetString(bytes);
        using var document = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 8 });
        var root = document.RootElement;
        AssertProperties(root, ["browser", "extensionId", "deploymentId", "managedPolicy"]);
        var browser = root.GetProperty("browser").GetString();
        if (browser is not ("edge" or "chrome")) throw new InvalidOperationException();
        var extension = browser == "edge" ? "edefcbdhahfolgkoamkbknjppojpaffk" : "nabjdlnkkaonnbnimnmnhjcbigceebml";
        if (root.GetProperty("extensionId").GetString() != extension) throw new InvalidOperationException();
        var deployment = root.GetProperty("deploymentId").GetString();
        if (!Guid.TryParseExact(deployment, "D", out var deploymentGuid) || deploymentGuid == Guid.Empty) throw new InvalidOperationException();
        var policy = root.GetProperty("managedPolicy");
        if (policy.ValueKind != JsonValueKind.Object) throw new InvalidOperationException();
        var assembly = typeof(WorkerConfiguration).Assembly;
        var name = assembly.GetManifestResourceNames().Single(value => value.EndsWith("managed-schema.json", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var schema = JsonDocument.Parse(stream);
        var properties = schema.RootElement.GetProperty("properties");
        var values = new SortedDictionary<string, RegistryData>(StringComparer.Ordinal);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in policy.EnumerateObject())
        {
            if (!seen.Add(entry.Name) || !properties.TryGetProperty(entry.Name, out var definition)) throw new InvalidOperationException();
            var value = entry.Value;
            var kind = definition.GetProperty("type").GetString();
            switch (kind)
            {
                case "boolean" when value.ValueKind is JsonValueKind.True or JsonValueKind.False:
                    values.Add(entry.Name, RegistryData.From("DWord", value.GetBoolean() ? 1 : 0)); break;
                case "integer" when value.TryGetInt64(out var number):
                    if (number < definition.GetProperty("minimum").GetInt64() || number > definition.GetProperty("maximum").GetInt64()) throw new InvalidOperationException();
                    values.Add(entry.Name, RegistryData.From("DWord", checked((int)number))); break;
                case "string" when value.ValueKind == JsonValueKind.String:
                    var text = value.GetString()!;
                    if (entry.Name is "filenamePattern" or "saveLocation" && text == "__BCK_EMPLOYEE_CHOICE__") throw new InvalidOperationException("Reserved managed value.");
                    AssertText(text, definition);
                    if (entry.Name is "graphTenantId" or "graphClientId" && (!Guid.TryParseExact(text, "D", out var id) || id == Guid.Empty)) throw new InvalidOperationException();
                    values.Add(entry.Name, RegistryData.From("String", text)); break;
                case "array" when value.ValueKind == JsonValueKind.Array:
                    var items = value.EnumerateArray().Select(item => item.ValueKind == JsonValueKind.String && !item.GetString()!.Contains('\0') ? item.GetString()! : throw new InvalidOperationException()).ToArray();
                    if (definition.TryGetProperty("maxItems", out var limit) && items.Length > limit.GetInt32()) throw new InvalidOperationException();
                    foreach (var item in items) AssertText(item, definition.GetProperty("items"));
                    values.Add(entry.Name, RegistryData.From("StringArray", items)); break;
                default: throw new InvalidOperationException();
            }
        }
        if (policy.TryGetProperty("saveLocation", out var location))
        {
            var folder = location.GetString()!;
            if (folder.StartsWith('/') || folder.Split('/').Any(part => part.Length == 0 || part is "." or ".." || part.EndsWith('.') || part.EndsWith(' ')
                || Regex.IsMatch(part, @"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))) throw new InvalidOperationException("Invalid Downloads subfolder.");
        }
        if (policy.TryGetProperty("saveAsType", out var behavior) && behavior.GetString() == "custom" && !policy.TryGetProperty("saveLocation", out _)) throw new InvalidOperationException("Managed custom save behavior requires a Downloads subfolder.");
        return new(browser, extension, deploymentGuid.ToString("D"), values, Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant());
    }

    private static void AssertText(string text, JsonElement definition)
    {
        if (text.Contains('\0') || (definition.TryGetProperty("minLength", out var min) && text.Length < min.GetInt32())
            || (definition.TryGetProperty("maxLength", out var max) && text.Length > max.GetInt32())
            || (definition.TryGetProperty("enum", out var choices) && !choices.EnumerateArray().Any(item => item.GetString() == text))
            || (definition.TryGetProperty("pattern", out var pattern) && !Regex.IsMatch(text, pattern.GetString()!, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100)))) throw new InvalidOperationException("Invalid managed setting value.");
    }

    private static void AssertProperties(JsonElement value, string[] expected)
    {
        if (value.ValueKind != JsonValueKind.Object) throw new InvalidOperationException();
        var actual = value.EnumerateObject().Select(property => property.Name).ToArray();
        if (actual.Length != expected.Length || !actual.ToHashSet(StringComparer.Ordinal).SetEquals(expected)) throw new InvalidOperationException();
    }
}
