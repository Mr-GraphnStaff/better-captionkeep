using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BetterCaptionKeep.EndpointWorker;

public sealed record RegistryNode(string Relative, SortedDictionary<string, RegistryData> Values);
public sealed record EndpointResult(int schemaVersion, string deploymentId, string browser, string configurationHash,
    string action, bool policyVerified, bool forceInstallVerified, bool installationObserved, string[] observedVersions,
    int profileCount, int profilesWithExtension, int unreadableProfiles, string status, bool runtimeVerified = false, bool microsoft365Verified = false);

public sealed class EndpointEngine(IRegistryStore store, WorkerConfiguration configuration, Func<InstallationEvidence>? observe = null)
{
    internal bool ManagementAuthorityAvailable => HasManagementAuthority();
    private const string Format = "EndpointWorkerV1";
    private string Policy => configuration.PolicyPath;
    private string Force => configuration.ForcePath;
    private string State => configuration.StatePath;

    public EndpointResult Execute(string action)
    {
        if (action == "Install") Install();
        else if (action == "Remove") Remove();
        else if (action != "Verify") throw new InvalidOperationException();
        return Verify(action);
    }

    private void Install()
    {
        if (store.Exists(State)) { RequireOwnedCompleteState(); RequireExpectedState(); return; }
        if (!HasManagementAuthority()) throw new InvalidOperationException("Conflicting browser management policy.");
        string? forceName = null;
        foreach (var name in store.ValueNames(Force))
        {
            var value = store.Read(Force, name);
            if (value?.Kind == "String" && value.Data.GetString()!.Split(';')[0] == configuration.ExtensionId)
            {
                if (value.Data.GetString() != configuration.ForceValue) throw new InvalidOperationException("Conflicting extension update source.");
                if (forceName is not null) throw new InvalidOperationException("Duplicate extension management entries.");
                forceName = name;
            }
        }
        var createdForce = forceName is null;
        if (createdForce)
        {
            var occupied = store.ValueNames(Force).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var number = 1;
            while (occupied.Contains(number.ToString(CultureInfo.InvariantCulture)))
            {
                if (++number > 100000) throw new InvalidOperationException("Force-install list is too large.");
            }
            forceName = number.ToString(CultureInfo.InvariantCulture);
        }
        var before = Capture(Policy);
        ValidateSnapshot(before);
        var beforeJson = JsonSerializer.Serialize(before);
        if (Encoding.UTF8.GetByteCount(beforeJson) > 524288) throw new InvalidOperationException("Policy backup is too large.");
        store.Create(State);
        PutState("Format", Format);
        PutState("Status", "Pending");
        PutState("ConfigurationHash", configuration.ConfigurationHash);
        PutState("BeforePolicy", beforeJson);
        PutState("ForceName", forceName!);
        store.Write(State, "CreatedForceEntry", RegistryData.From("DWord", createdForce ? 1 : 0));
        // The before-image must survive readback before any browser policy changes.
        if (ReadText(State, "BeforePolicy") != beforeJson || ReadText(State, "Status") != "Pending") throw new InvalidOperationException("Before-image was not confirmed.");
        store.DeleteTree(Policy);
        store.Create(Policy);
        foreach (var (name, value) in configuration.Policy)
        {
            if (value.Kind == "StringArray")
            {
                var child = Policy + "\\" + name;
                store.Create(child);
                var index = 1;
                foreach (var item in value.Data.EnumerateArray()) store.Write(child, (index++).ToString(CultureInfo.InvariantCulture), RegistryData.From("String", item.GetString()!));
            }
            else store.Write(Policy, name, value);
        }
        store.Write(Force, forceName!, RegistryData.From("String", configuration.ForceValue));
        var fingerprint = Fingerprint(Capture(Policy));
        PutState("AfterPolicy", fingerprint);
        if (!ExpectedPolicyMatches() || !RegistryData.From("String", configuration.ForceValue).Matches(store.Read(Force, forceName!)) || ReadText(State, "AfterPolicy") != fingerprint)
            throw new InvalidOperationException("Endpoint readback was not confirmed.");
        PutState("Status", "Complete");
        RequireOwnedCompleteState();
        RequireExpectedState();
    }

    private void Remove()
    {
        RequireOwnedCompleteState();
        if (Fingerprint(Capture(Policy)) != ReadText(State, "AfterPolicy")) throw new InvalidOperationException("Managed policy drift prevents rollback.");
        var forceName = ReadText(State, "ForceName");
        var created = store.Read(State, "CreatedForceEntry")?.Data.GetInt32() == 1;
        if (created && !RegistryData.From("String", configuration.ForceValue).Matches(store.Read(Force, forceName))) throw new InvalidOperationException("Force-install drift prevents rollback.");
        var serialized = ReadText(State, "BeforePolicy");
        if (Encoding.UTF8.GetByteCount(serialized) > 524288) throw new InvalidOperationException();
        var before = JsonSerializer.Deserialize<List<RegistryNode>>(serialized) ?? throw new InvalidOperationException();
        ValidateSnapshot(before);
        store.DeleteTree(Policy);
        foreach (var node in before)
        {
            var key = Policy + node.Relative;
            store.Create(key);
            foreach (var (name, value) in node.Values) store.Write(key, name, value);
        }
        if (Fingerprint(Capture(Policy)) != Fingerprint(before)) throw new InvalidOperationException("Policy rollback readback failed; evidence retained.");
        if (created)
        {
            store.DeleteValue(Force, forceName);
            if (store.Read(Force, forceName) is not null) throw new InvalidOperationException("Force-install rollback readback failed; evidence retained.");
        }
        store.DeleteTree(State);
        if (store.Exists(State)) throw new InvalidOperationException("Deployment marker removal was not confirmed.");
    }

    private EndpointResult Verify(string action)
    {
        var policy = false;
        var force = false;
        if (IsOwnedCompleteState() && HasManagementAuthority())
        {
            policy = ExpectedPolicyMatches() && Fingerprint(Capture(Policy)) == ReadText(State, "AfterPolicy");
            force = RegistryData.From("String", configuration.ForceValue).Matches(store.Read(Force, ReadText(State, "ForceName")));
        }
        var evidence = (observe ?? (() => InstallationEvidence.Read(configuration)))();
        var status = action == "Remove" ? "DeploymentPolicyRemoved" : !policy || !force ? "ConfigurationNotVerified" : evidence.ProfilesWithExtension > 0 ? "ConfigurationVerifiedInstallationObserved" : "ConfigurationVerifiedBrowserPending";
        return new(1, configuration.DeploymentId, configuration.Browser, configuration.ConfigurationHash, action, policy, force,
            evidence.ProfilesWithExtension > 0, evidence.Versions, evidence.ProfileCount, evidence.ProfilesWithExtension, evidence.UnreadableProfiles, status);
    }

    private bool HasManagementAuthority()
    {
        var settings = store.Read(configuration.BrowserRoot, "ExtensionSettings");
        if (settings is null) return true;
        if (settings.Kind != "String") return false;
        try
        {
            using var parsed = JsonDocument.Parse(settings.Data.GetString()!);
            return parsed.RootElement.ValueKind == JsonValueKind.Object && !parsed.RootElement.EnumerateObject().Any(property => property.Name == "*" || property.Name == configuration.ExtensionId);
        }
        catch (JsonException) { return false; }
    }
    private bool ExpectedPolicyMatches()
    {
        if (!store.Exists(Policy)) return false;
        foreach (var (name, desired) in configuration.Policy)
        {
            if (desired.Kind != "StringArray") { if (!desired.Matches(store.Read(Policy, name))) return false; continue; }
            var key = Policy + "\\" + name;
            var expected = desired.Data.EnumerateArray().Select(item => item.GetString()!).ToArray();
            if (!store.Exists(key) || store.SubKeys(key).Length != 0 || store.ValueNames(key).Length != expected.Length) return false;
            for (var index = 0; index < expected.Length; index++) if (!RegistryData.From("String", expected[index]).Matches(store.Read(key, (index + 1).ToString(CultureInfo.InvariantCulture)))) return false;
        }
        return true;
    }
    private bool IsOwnedCompleteState() => ReadText(State, "Format", false) == Format && ReadText(State, "Status", false) == "Complete" && ReadText(State, "ConfigurationHash", false) == configuration.ConfigurationHash;
    private void RequireOwnedCompleteState() { if (!IsOwnedCompleteState()) throw new InvalidOperationException("Missing, interrupted, changed or legacy deployment evidence."); }
    private void RequireExpectedState()
    {
        if (!HasManagementAuthority() || !ExpectedPolicyMatches() || Fingerprint(Capture(Policy)) != ReadText(State, "AfterPolicy")
            || !RegistryData.From("String", configuration.ForceValue).Matches(store.Read(Force, ReadText(State, "ForceName")))) throw new InvalidOperationException("Managed configuration drift.");
    }
    private void PutState(string name, string value) => store.Write(State, name, RegistryData.From("String", value));
    private string ReadText(string key, string name, bool required = true)
    {
        var result = store.Read(key, name);
        if (result?.Kind == "String") return result.Data.GetString()!;
        if (required) throw new InvalidOperationException("Required deployment evidence is missing.");
        return "";
    }
    private List<RegistryNode> Capture(string root)
    {
        var nodes = new List<RegistryNode>();
        if (!store.Exists(root)) return nodes;
        void Visit(string key)
        {
            if (nodes.Count >= 1000) throw new InvalidOperationException("Policy tree is too large.");
            var values = new SortedDictionary<string, RegistryData>(StringComparer.Ordinal);
            foreach (var name in store.ValueNames(key).Order(StringComparer.Ordinal)) values.Add(name, store.Read(key, name) ?? throw new InvalidOperationException());
            nodes.Add(new(key[root.Length..], values));
            foreach (var child in store.SubKeys(key).Order(StringComparer.Ordinal)) Visit(key + "\\" + child);
        }
        Visit(root);
        return nodes;
    }
    private static string Fingerprint(IEnumerable<RegistryNode> nodes)
    {
        var normalized = nodes.OrderBy(node => node.Relative, StringComparer.Ordinal)
            .Select(node => new RegistryNode(node.Relative, new SortedDictionary<string, RegistryData>(node.Values, StringComparer.Ordinal)));
        return Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(normalized)));
    }
    private static void ValidateSnapshot(List<RegistryNode> nodes)
    {
        if (nodes.Count > 1000 || nodes.Select(node => node.Relative).Distinct(StringComparer.OrdinalIgnoreCase).Count() != nodes.Count) throw new InvalidOperationException();
        foreach (var node in nodes)
        {
            if (node.Relative != "" && (!node.Relative.StartsWith('\\') || node.Relative.Split('\\').Skip(1).Any(part => string.IsNullOrWhiteSpace(part) || part is "." or ".."))) throw new InvalidOperationException();
            foreach (var value in node.Values.Values) _ = value.ToRegistryValue();
        }
    }
}
