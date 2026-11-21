using System.Security.Cryptography;
using System.Text.Json;
using BetterCaptionKeep.AdminSetup.Services;

internal static class BrowserIntegrationTests
{
    public static void Run(Action<string, Action> run, Action<bool, string> assert)
    {
        run("browser integration requires all three exact current-user registration keys", () =>
        {
            var fixture = CreateFixture();
            var manifest = WriteNativeManifest(fixture);
            var values = BrowserIntegrationService.RegistryKeys.ToDictionary(key => key, _ => (string?)manifest);
            assert(BrowserIntegrationService.RegistrationsMatch(values, fixture), "matching Chrome, Edge and Brave registrations expected");
            values.Remove(BrowserIntegrationService.RegistryKeys[2]);
            assert(!BrowserIntegrationService.RegistrationsMatch(values, fixture), "missing Brave registration must not count as complete");
            assert(BrowserIntegrationService.RegistryKeys.SequenceEqual(new[]
            {
                @"Software\Google\Chrome\NativeMessagingHosts\com.daftech.bettercaptionkeep.adminsetup",
                @"Software\Microsoft\Edge\NativeMessagingHosts\com.daftech.bettercaptionkeep.adminsetup",
                @"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.daftech.bettercaptionkeep.adminsetup"
            }), "only the three declared browser-relative HKCU keys are in scope");
        });
        run("browser integration does not adopt another package's native host", () =>
        {
            var fixture = CreateFixture();
            var other = CreateFixture();
            var manifest = WriteNativeManifest(fixture, Path.Combine(other, "BetterCaptionKeep.AdminSetup.NativeHost.exe"));
            assert(!BrowserIntegrationService.ManifestTargetsPackage(manifest, fixture), "foreign installation must not be treated as this package");
        });
        run("installed manifest resolves only the exact relative host beside the manifest", () =>
        {
            var fixture = CreateFixture();
            var manifest = WriteNativeManifest(fixture, "BetterCaptionKeep.AdminSetup.NativeHost.exe");
            assert(BrowserIntegrationService.ManifestTargetsPackage(manifest, fixture), "installed relative host must resolve beside the manifest");
            foreach (var invalid in new[] { "../BetterCaptionKeep.AdminSetup.NativeHost.exe", @"sub\BetterCaptionKeep.AdminSetup.NativeHost.exe", "Other.exe" })
            {
                manifest = WriteNativeManifest(fixture, invalid);
                assert(!BrowserIntegrationService.ManifestTargetsPackage(manifest, fixture), "relative paths must not escape the fixed host filename");
            }
            var other = CreateFixture();
            manifest = WriteNativeManifest(other, "BetterCaptionKeep.AdminSetup.NativeHost.exe");
            assert(!BrowserIntegrationService.ManifestTargetsPackage(manifest, fixture), "relative host in a foreign manifest directory must not match");
        });
        run("browser integration rejects widened native origins", () =>
        {
            var fixture = CreateFixture();
            var manifest = WriteNativeManifest(fixture, origins: ["chrome-extension://*/"]);
            assert(!BrowserIntegrationService.ManifestTargetsPackage(manifest, fixture), "wildcard extension origin must be rejected");
        });
        run("browser integration requires the same verified manifest for every browser", () =>
        {
            var fixture = CreateFixture();
            var manifest = WriteNativeManifest(fixture);
            var copy = Path.Combine(fixture, "different-manifest.json");
            File.Copy(manifest, copy);
            var values = BrowserIntegrationService.RegistryKeys.ToDictionary(key => key, _ => (string?)manifest);
            values[BrowserIntegrationService.RegistryKeys[1]] = copy;
            assert(!BrowserIntegrationService.RegistrationsMatch(values, fixture), "split registrations require reconciliation");
        });
        run("browser registration launch uses fixed PowerShell, safe argv and no bypass or elevation", () =>
        {
            var fixture = CreateFixture();
            var start = new BrowserIntegrationService(fixture).CreateStartInfo();
            assert(start.FileName == Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe"), "system PowerShell must be pinned");
            assert(!start.UseShellExecute && start.CreateNoWindow && start.RedirectStandardError && start.RedirectStandardOutput, "registration runs privately without shell elevation");
            assert(string.IsNullOrEmpty(start.Verb), "no runas/elevation verb");
            assert(start.ArgumentList.SequenceEqual(new[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-File", Path.Combine(fixture, "Register-NativeHost.ps1"), "-PackageDirectory", fixture }), "exact argv must preserve spaces and metacharacters as data");
            assert(!start.ArgumentList.Any(argument => argument.Contains("bypass", StringComparison.OrdinalIgnoreCase) || argument == "-Command" || argument == "-ExecutionPolicy"), "no policy override or command interpolation");
        });
        run("browser registration rejects a modified registration script", () =>
        {
            var fixture = CreateFixture();
            File.AppendAllText(Path.Combine(fixture, "Register-NativeHost.ps1"), "# changed");
            AssertThrows(() => new BrowserIntegrationService(fixture).CreateStartInfo(), assert);
        });
        run("browser registration rejects a modified native executable", () =>
        {
            var fixture = CreateFixture();
            File.AppendAllText(Path.Combine(fixture, "BetterCaptionKeep.AdminSetup.NativeHost.exe"), "changed");
            AssertThrows(() => new BrowserIntegrationService(fixture).CreateStartInfo(), assert);
        });
        run("browser integration treats malformed native manifests as unregistered", () =>
        {
            var fixture = CreateFixture();
            var manifest = Path.Combine(fixture, "broken.json");
            File.WriteAllText(manifest, "{bad-json");
            assert(!BrowserIntegrationService.ManifestTargetsPackage(manifest, fixture), "malformed registration must not pass");
        });
    }

    private static string CreateFixture()
    {
        var working = Environment.GetEnvironmentVariable("AGENT_WORKING_DIR")
            ?? throw new InvalidOperationException("Run browser integration contracts through the owner working-area launcher.");
        var root = Path.Combine(working, "browser integration & fixture-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var names = new[] { "Register-NativeHost.ps1", "BetterCaptionKeep.AdminSetup.NativeHost.exe", "BetterCaptionKeep.AdminSetup.NativeHost.dll", "BetterCaptionKeep.AdminSetup.NativeHost.runtimeconfig.json" };
        foreach (var name in names) File.WriteAllText(Path.Combine(root, name), "synthetic fixture; never execute");
        File.WriteAllText(Path.Combine(root, "package-manifest.json"), JsonSerializer.Serialize(new
        {
            schemaVersion = 1,
            files = names.Select(name => new { path = name, sha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(Path.Combine(root, name)))) })
        }));
        return root;
    }

    private static string WriteNativeManifest(string fixture, string? executable = null, string[]? origins = null)
    {
        var path = Path.Combine(fixture, "native-manifest.json");
        File.WriteAllText(path, JsonSerializer.Serialize(new
        {
            name = BrowserIntegrationService.HostName,
            type = "stdio",
            path = executable ?? Path.Combine(fixture, "BetterCaptionKeep.AdminSetup.NativeHost.exe"),
            allowed_origins = origins ?? ["chrome-extension://pjpibiimicedkckleehljlklmblkacph/", "chrome-extension://ecpjboeanaehianibdbgijldbikdgkhm/", "chrome-extension://edefcbdhahfolgkoamkbknjppojpaffk/", "chrome-extension://nabjdlnkkaonnbnimnmnhjcbigceebml/"]
        }));
        return path;
    }

    private static void AssertThrows(Action action, Action<bool, string> assert)
    {
        try { action(); }
        catch (InvalidOperationException) { return; }
        assert(false, "modified package must be rejected before starting registration");
    }
}
