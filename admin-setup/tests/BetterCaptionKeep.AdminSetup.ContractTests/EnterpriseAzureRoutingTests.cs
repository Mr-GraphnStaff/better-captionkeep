using System.Text.Json;
using BetterCaptionKeep.AdminSetup.Services;

internal static class EnterpriseAzureRoutingTests
{
    public static void WriteSettings(string fixture)
    {
        var operations = Path.Combine(fixture, "operations");
        Directory.CreateDirectory(operations);
        var config = Path.Combine(operations, "azure profile.json");
        File.WriteAllText(config, "{}"); // Routing fixture; backend provider validation is a separate contract.
        File.WriteAllText(Path.Combine(operations, EnterpriseSigningConfiguration.FileName), JsonSerializer.Serialize(new
        { schemaVersion = 1, signingProvider = "azure", azureSigningConfigPath = config }));
    }

    public static void Run(Action<string, Action> run, Action<bool, string> assert)
    {
        run("primary setup uses the published Win32 payload without customer signing credentials", () => WithFixture((fixture, root) =>
        {
            var launcher = new EnterpriseSetupLauncher(root);
            foreach (var mode in new[] { EnterpriseSetupMode.Setup, EnterpriseSetupMode.Continue })
            {
                var arguments = launcher.CreateStartInfo(mode).ArgumentList.ToArray();
                var position = Array.IndexOf(arguments, "-DeploymentTransport");
                assert(position >= 0 && arguments[position + 1] == "Win32", "primary setup must select the fixed signed worker transport");
                assert(!arguments.Any(a => a is "-AzureSigningConfigPath" or "-SigningCertificateThumbprint" or "-AllowUnsignedEndpointScripts"), "primary setup must not request customer signing or unsigned fallback");
            }
        }));
        run("all primary operations launch without developer signing settings", () => WithFixture((fixture, root) =>
        {
            File.Delete(Path.Combine(fixture, "operations", EnterpriseSigningConfiguration.FileName));
            var launcher = new EnterpriseSetupLauncher(root);
            foreach (var mode in Enum.GetValues<EnterpriseSetupMode>())
                assert(!launcher.CreateStartInfo(mode).ArgumentList.Contains("-AzureSigningConfigPath"), "primary operations must not require a signing profile");
        }));
        run("Azure routing rejects ambiguous schema and credential or unknown fields", () => WithFixture((fixture, root) =>
        {
            var settings = Path.Combine(fixture, "operations", EnterpriseSigningConfiguration.FileName);
            var config = JsonSerializer.Serialize(Path.Combine(fixture, "operations", "azure profile.json"));
            foreach (var json in new[] { "{}", "[]", "{", "{\"schemaVersion\":1,\"signingProvider\":\"local\",\"azureSigningConfigPath\":" + config + "}",
                "{\"schemaVersion\":1,\"signingProvider\":\"azure\",\"azureSigningConfigPath\":" + config + ",\"token\":\"synthetic\"}",
                "{\"schemaVersion\":1,\"signingProvider\":\"azure\",\"azureSigningConfigPath\":" + config + ",\"schemaVersion\":1}" })
            {
                File.WriteAllText(settings, json);
                Reject(() => new EnterpriseSetupLauncher(root).GetAzureSigningConfigPath(), assert);
            }
        }));
        run("Azure configuration references reject unsafe missing and package-local paths", () => WithFixture((fixture, root) =>
        {
            var settings = Path.Combine(fixture, "operations", EnterpriseSigningConfiguration.FileName);
            var embedded = Path.Combine(root, "embedded.json"); File.WriteAllText(embedded, "{}");
            foreach (var config in new[] { "relative.json", @"\\server\share\profile.json", "P:\\safe.json:stream.json", Path.Combine(fixture, "missing.json"), embedded,
                Path.Combine(fixture, "operations", "..", "operations", "azure profile.json") })
            {
                File.WriteAllText(settings, JsonSerializer.Serialize(new { schemaVersion = 1, signingProvider = "azure", azureSigningConfigPath = config }));
                Reject(() => new EnterpriseSetupLauncher(root).GetAzureSigningConfigPath(), assert);
            }
        }));
        run("Azure operational settings themselves cannot be embedded in the engine package", () => WithFixture((fixture, root) =>
        {
            var embedded = Path.Combine(root, EnterpriseSigningConfiguration.FileName);
            File.Copy(Path.Combine(fixture, "operations", EnterpriseSigningConfiguration.FileName), embedded);
            Reject(() => new EnterpriseSetupLauncher(root, embedded).GetAzureSigningConfigPath(), assert);
        }));
    }

    private static void Reject(Action action, Action<bool, string> assert)
    {
        try { action(); }
        catch (InvalidOperationException exception)
        {
            assert(exception.Message.Contains("Azure Artifact Signing") && exception.Message.Contains("No local-certificate fallback"), "configuration failure must explain Azure remediation and lack of fallback");
            return;
        }
        assert(false, "invalid routing must block before process launch");
    }

    private static void WithFixture(Action<string, string> action)
    {
        var fixture = Path.Combine(Path.GetTempPath(), "bck-azure-routing-" + Guid.NewGuid().ToString("N"));
        var root = Path.Combine(fixture, "enterprise"); Directory.CreateDirectory(root);
        try
        {
            var lines = new List<string>();
            foreach (var name in new[] { "Enterprise-Launcher.ps1", "Enterprise-Setup.ps1", "Enterprise-Endpoint.ps1", "Enterprise-Dialogs.ps1", "Enterprise-Runtime.ps1", "Enterprise-Signing.ps1", "Enterprise-SignerMigration.ps1",
                "managed-schema.json", "profile.json", "profile.chrome.json", "profile.local-only.json",
                "Enterprise-Win32.ps1", "EndpointWorker.exe", "endpoint-worker.intunewin", "endpoint-worker-package.json" })
            {
                var bytes = System.Text.Encoding.UTF8.GetBytes("synthetic " + name); File.WriteAllBytes(Path.Combine(root, name), bytes);
                lines.Add(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)) + "  " + name);
            }
            File.WriteAllText(Path.Combine(root, "SHA256SUMS.txt"), string.Join('\n', lines) + "\n");
            WriteSettings(fixture); action(fixture, root);
        }
        finally { Directory.Delete(fixture, true); }
    }
}
