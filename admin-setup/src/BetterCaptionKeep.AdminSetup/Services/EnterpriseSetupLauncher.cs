using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;

namespace BetterCaptionKeep.AdminSetup.Services;

public enum EnterpriseSetupMode { Setup, Status, Continue }

/// <summary>
/// Opens the complete deployment engine; starting its window never means deployment succeeded.
/// Package hashes detect incomplete/corrupt extraction. Publisher trust comes from distribution
/// signing and the operating system, not from an editable checksum manifest.
/// </summary>
public sealed class EnterpriseSetupLauncher(string? packageDirectory = null, string? signingSettingsPath = null)
{
    private readonly string packageDirectory = Path.GetFullPath(packageDirectory
        ?? Path.Combine(AppContext.BaseDirectory, "enterprise"));
    private static readonly string[] RequiredFiles =
    [
        "Enterprise-Launcher.ps1", "Enterprise-Setup.ps1", "Enterprise-Endpoint.ps1", "Enterprise-Dialogs.ps1", "Enterprise-Runtime.ps1", "Enterprise-Signing.ps1", "Enterprise-SignerMigration.ps1",
        "managed-schema.json", "profile.json", "profile.chrome.json", "profile.local-only.json",
        "Enterprise-Win32.ps1", "EndpointWorker.exe", "endpoint-worker.intunewin", "endpoint-worker-package.json"
    ];

    public bool TryLocate(out string packagePath, out string reason)
    {
        packagePath = packageDirectory;
        try
        {
            ValidatePackage(packageDirectory);
            reason = string.Empty;
            return true;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException
            or InvalidOperationException or ArgumentException or NotSupportedException)
        {
            reason = "The administrator setup files are missing or damaged. Extract the complete "
                + "Better CaptionKeep administrator package into one folder and open it again. "
                + "No Microsoft 365 settings have changed.";
            return false;
        }
    }

    public Process Launch(EnterpriseSetupMode mode, IntPtr ownerWindowHandle, string? progressPipeName = null)
    {
        if (!OwnedSignInWindow.IsCurrentProcessWindow(ownerWindowHandle))
            throw new InvalidOperationException("The visible administrator setup window must own Microsoft sign-in.");
        // Revalidate at the launch boundary, rather than trusting an earlier UI availability check.
        var startInfo = CreateStartInfo(mode, ownerWindowHandle, progressPipeName);
        return Process.Start(startInfo)
            ?? throw new InvalidOperationException("Windows could not open the setup wizard. Nothing was deployed.");
    }

    public ProcessStartInfo CreateStartInfo(EnterpriseSetupMode mode, IntPtr ownerWindowHandle = default, string? progressPipeName = null)
    {
        if (!Enum.IsDefined(mode)) throw new ArgumentOutOfRangeException(nameof(mode));
        if (ownerWindowHandle != IntPtr.Zero && !OwnedSignInWindow.IsCurrentProcessWindow(ownerWindowHandle))
            throw new InvalidOperationException("The setup owner must be a current-process window.");
        if (progressPipeName is not null && (!EnterpriseSetupProgress.IsValidPipeName(progressPipeName) || ownerWindowHandle == IntPtr.Zero))
            throw new InvalidOperationException("The setup status channel requires a valid owner and per-launch pipe name.");
        ValidatePackage(packageDirectory);
        var systemPowerShell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),
            "WindowsPowerShell", "v1.0", "powershell.exe");
        if (!File.Exists(systemPowerShell))
            throw new InvalidOperationException("Windows PowerShell is unavailable. Open the supplied Start-Setup.cmd for recovery.");
        var startInfo = new ProcessStartInfo(systemPowerShell)
        {
            // Windows shell launch allocates an independent console even when this caller is
            // hosted by a detached console-subsystem process. The executable is the fixed
            // system PowerShell path; arguments stay separate, with no elevation or policy bypass.
            UseShellExecute = true,
            // Graph PowerShell's Windows broker resolves its parent using GetConsoleWindow.
            // Keep an allocated console for authentication while hiding its terminal window.
            CreateNoWindow = false,
            WindowStyle = ProcessWindowStyle.Hidden,
            WorkingDirectory = packageDirectory
        };
        // GuidedUi owns administrator dialogs: no terminal or command entry is needed. Never bypass
        // execution policy. Do not use NoExit, which would leave an invisible process after completion.
        foreach (var argument in new[] { "-NoLogo", "-NoProfile", "-STA", "-File",
            Path.Combine(packageDirectory, "Enterprise-Launcher.ps1"), "-Mode", mode.ToString(), "-GuidedUi",
            "-OutputRoot", GetOutputRoot(), "-DeploymentTransport", "Win32" })
            startInfo.ArgumentList.Add(argument);
        if (ownerWindowHandle != IntPtr.Zero)
        {
            startInfo.ArgumentList.Add("-OwnerWindowHandle");
            startInfo.ArgumentList.Add(ownerWindowHandle.ToInt64().ToString(System.Globalization.CultureInfo.InvariantCulture));
            startInfo.ArgumentList.Add("-OwnerProcessId");
            startInfo.ArgumentList.Add(Environment.ProcessId.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }
        if (progressPipeName is not null)
        {
            startInfo.ArgumentList.Add("-StatusPipeName");
            startInfo.ArgumentList.Add(progressPipeName);
        }
        return startInfo;
    }

    public string GetAzureSigningConfigPath() => EnterpriseSigningConfiguration.ReadAzurePath(
        signingSettingsPath ?? Path.Combine(GetOutputRoot(), EnterpriseSigningConfiguration.FileName), packageDirectory);

    public string GetOutputRoot()
    {
        // Development runs on the owner's P: workspace keep their durable receipts on P:.
        // Customer Program Files installs run asInvoker and must never write into their package.
        // This only computes the destination; the approved engine operation creates its own folder.
        if (string.Equals(Path.GetPathRoot(packageDirectory), "P:\\", StringComparison.OrdinalIgnoreCase))
            return Path.Combine(Path.GetDirectoryName(packageDirectory)
                ?? throw new InvalidOperationException("The setup package must be inside an application folder."), "operations");
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "DAF-TECH", "Better CaptionKeep", "Deployments");
    }

    public static void ValidatePackage(string directory)
    {
        var root = Path.GetFullPath(directory);
        AssertNoLinks(root);
        var manifest = Path.Combine(root, "SHA256SUMS.txt");
        AssertNoLinks(manifest);
        var expected = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in File.ReadLines(manifest))
        {
            if (line.Length < 67 || line[64..66] != "  " || !line[..64].All(Uri.IsHexDigit))
                throw new InvalidOperationException("The setup package checksum manifest is malformed.");
            var name = line[66..];
            // Reject ambiguous paths, ADS, traversal, links and duplicate case-insensitive entries.
            if (string.IsNullOrWhiteSpace(name) || name.Contains('\\') || name.Contains(':')
                || name.StartsWith('/') || name.Split('/').Any(segment => segment is "" or "." or "..")
                || !expected.TryAdd(name, line[..64]))
                throw new InvalidOperationException("The setup package contains an unsafe or duplicate path.");
            var path = Path.GetFullPath(Path.Combine(root, name.Replace('/', Path.DirectorySeparatorChar)));
            if (!path.StartsWith(root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar,
                    StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("The setup package path is outside its folder.");
            AssertNoLinks(path);
            using var stream = File.OpenRead(path);
            var actual = Convert.ToHexString(SHA256.HashData(stream));
            if (!CryptographicOperations.FixedTimeEquals(Convert.FromHexString(actual), Convert.FromHexString(line[..64])))
                throw new InvalidOperationException("The setup package is incomplete or has changed.");
        }
        if (RequiredFiles.Any(name => !expected.ContainsKey(name)))
            throw new InvalidOperationException("The setup package omits a required deployment file.");
    }

    private static void AssertNoLinks(string path)
    {
        var current = Path.GetFullPath(path);
        while (!string.IsNullOrEmpty(current))
        {
            var attributes = File.GetAttributes(current);
            if ((attributes & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("Linked administrator package files are not supported.");
            var parent = Path.GetDirectoryName(current);
            if (string.Equals(parent, current, StringComparison.OrdinalIgnoreCase)) break;
            current = parent;
        }
    }
}
