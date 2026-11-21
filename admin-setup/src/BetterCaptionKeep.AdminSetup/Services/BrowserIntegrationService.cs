using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Win32;

namespace BetterCaptionKeep.AdminSetup.Services;

public enum BrowserIntegrationResult { AlreadyRegistered, Registered }

/// <summary>Registers only this package's native launcher for the current Windows user.</summary>
public sealed class BrowserIntegrationService(string? packageDirectory = null)
{
    public const string HostName = "com.daftech.bettercaptionkeep.adminsetup";
    private readonly string packageDirectory = Path.GetFullPath(packageDirectory ?? AppContext.BaseDirectory);
    private static readonly string[] BrowserKeys =
    [
        $@"Software\Google\Chrome\NativeMessagingHosts\{HostName}",
        $@"Software\Microsoft\Edge\NativeMessagingHosts\{HostName}",
        $@"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\{HostName}"
    ];
    private static readonly string[] Origins =
    [
        "chrome-extension://pjpibiimicedkckleehljlklmblkacph/",
        "chrome-extension://ecpjboeanaehianibdbgijldbikdgkhm/",
        "chrome-extension://edefcbdhahfolgkoamkbknjppojpaffk/",
        "chrome-extension://nabjdlnkkaonnbnimnmnhjcbigceebml/"
    ];
    public static IReadOnlyList<string> RegistryKeys => Array.AsReadOnly(BrowserKeys);

    public bool IsRegistered()
    {
        var registrations = new Dictionary<string, string?>(StringComparer.Ordinal);
        foreach (var path in BrowserKeys)
        {
            using var key = Registry.CurrentUser.OpenSubKey(path, writable: false);
            registrations[path] = key is not null && key.GetValueNames().Contains(string.Empty)
                && key.GetValueKind(string.Empty) == RegistryValueKind.String
                ? key.GetValue(string.Empty, null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string
                : null;
        }
        return RegistrationsMatch(registrations, packageDirectory);
    }

    public static bool RegistrationsMatch(IReadOnlyDictionary<string, string?> registrations, string packageDirectory)
    {
        string? manifest = null;
        foreach (var key in BrowserKeys)
        {
            if (!registrations.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value)
                || !Path.IsPathFullyQualified(value)) return false;
            var full = Path.GetFullPath(value);
            if (manifest is not null && !string.Equals(manifest, full, StringComparison.OrdinalIgnoreCase)) return false;
            manifest = full;
        }
        return manifest is not null && ManifestTargetsPackage(manifest, packageDirectory);
    }

    public static bool ManifestTargetsPackage(string manifestPath, string packageDirectory)
    {
        try
        {
            AssertNoLinks(manifestPath);
            var expectedHost = Path.GetFullPath(Path.Combine(packageDirectory, "BetterCaptionKeep.AdminSetup.NativeHost.exe"));
            AssertNoLinks(expectedHost);
            using var stream = File.OpenRead(manifestPath);
            using var document = JsonDocument.Parse(stream);
            var root = document.RootElement;
            if (root.GetProperty("name").GetString() != HostName || root.GetProperty("type").GetString() != "stdio"
                || root.GetProperty("path").GetString() is not { } host) return false;
            // Chromium on Windows resolves a relative host path beside its manifest.
            // Permit only our exact filename, never relative traversal or subdirectories.
            if (!Path.IsPathFullyQualified(host))
            {
                if (!string.Equals(host, "BetterCaptionKeep.AdminSetup.NativeHost.exe", StringComparison.Ordinal)) return false;
                host = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(manifestPath))!, host);
            }
            if (!string.Equals(Path.GetFullPath(host), expectedHost, StringComparison.OrdinalIgnoreCase)) return false;
            var allowed = root.GetProperty("allowed_origins").EnumerateArray().Select(item => item.GetString()).ToArray();
            return allowed.Length == Origins.Length && allowed.ToHashSet(StringComparer.Ordinal).SetEquals(Origins);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException
            or JsonException or KeyNotFoundException or InvalidOperationException or ArgumentException or NotSupportedException)
        {
            return false;
        }
    }

    public ProcessStartInfo CreateStartInfo()
    {
        var script = Path.Combine(packageDirectory, "Register-NativeHost.ps1");
        ValidateRegistrationPackage(script);
        var systemPowerShell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),
            "WindowsPowerShell", "v1.0", "powershell.exe");
        if (!File.Exists(systemPowerShell)) throw new InvalidOperationException("Windows PowerShell is unavailable. Browser integration has not started.");
        var startInfo = new ProcessStartInfo(systemPowerShell)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            WorkingDirectory = packageDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        foreach (var argument in new[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-File", script,
            "-PackageDirectory", packageDirectory }) startInfo.ArgumentList.Add(argument);
        return startInfo;
    }

    public async Task<BrowserIntegrationResult> EnsureRegisteredAsync(CancellationToken cancellationToken)
    {
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            var startInfo = CreateStartInfo();
            if (IsRegistered()) return BrowserIntegrationResult.AlreadyRegistered;
            cancellationToken.ThrowIfCancellationRequested();
            using var process = Process.Start(startInfo)
                ?? throw new InvalidOperationException("Browser integration could not start.");
            // Once the local registration starts, let it finish its preserved before-images and
            // readback. Do not kill a process between registry writes or expose script output.
            var stdout = process.StandardOutput.BaseStream.CopyToAsync(Stream.Null);
            var stderr = process.StandardError.BaseStream.CopyToAsync(Stream.Null);
            await process.WaitForExitAsync();
            await Task.WhenAll(stdout, stderr);
            if (process.ExitCode != 0 || !IsRegistered()) throw new InvalidOperationException("Browser registration was not confirmed.");
            return BrowserIntegrationResult.Registered;
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException
            or InvalidOperationException or ArgumentException or NotSupportedException or System.ComponentModel.Win32Exception
            or JsonException or KeyNotFoundException or System.Security.SecurityException)
        {
            throw new InvalidOperationException("Browser integration could not be confirmed, so Microsoft 365 setup has not started. "
                + "Reopen the complete administrator package and try again. If Windows or your organization blocks the script, "
                + "ask your endpoint administrator to approve the package; do not bypass execution policy. "
                + "If registration started, preserve its recovery records; prior registrations are not automatically rolled back. "
                + "Recovery records are stored under operations/native-host-registration for P: packages, otherwise under "
                + "your local application data in DAF-TECH/Better CaptionKeep/NativeHostRegistration.");
        }
    }

    private void ValidateRegistrationPackage(string script)
    {
        AssertNoLinks(packageDirectory);
        AssertNoLinks(script);
        var manifestPath = Path.Combine(packageDirectory, "package-manifest.json");
        AssertNoLinks(manifestPath);
        using var document = JsonDocument.Parse(File.ReadAllBytes(manifestPath));
        if (document.RootElement.GetProperty("schemaVersion").GetInt32() != 1)
            throw new InvalidOperationException("Unsupported administrator package.");
        var files = document.RootElement.GetProperty("files").EnumerateArray().ToArray();
        foreach (var name in new[] { "Register-NativeHost.ps1", "BetterCaptionKeep.AdminSetup.NativeHost.exe",
            "BetterCaptionKeep.AdminSetup.NativeHost.dll", "BetterCaptionKeep.AdminSetup.NativeHost.runtimeconfig.json" })
        {
            var matches = files.Where(file => string.Equals(file.GetProperty("path").GetString(), name, StringComparison.OrdinalIgnoreCase)).ToArray();
            if (matches.Length != 1) throw new InvalidOperationException("Browser integration package inventory is incomplete.");
            var hash = matches[0].GetProperty("sha256").GetString();
            if (hash is null || hash.Length != 64 || !hash.All(Uri.IsHexDigit)) throw new InvalidOperationException("Invalid package checksum.");
            var path = Path.Combine(packageDirectory, name);
            AssertNoLinks(path);
            using var stream = File.OpenRead(path);
            if (!CryptographicOperations.FixedTimeEquals(SHA256.HashData(stream), Convert.FromHexString(hash)))
                throw new InvalidOperationException("Browser integration package integrity check failed.");
        }
    }

    private static void AssertNoLinks(string path)
    {
        var current = Path.GetFullPath(path);
        while (!string.IsNullOrEmpty(current))
        {
            if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("Linked browser integration paths are not supported.");
            current = Path.GetDirectoryName(current);
        }
    }
}
