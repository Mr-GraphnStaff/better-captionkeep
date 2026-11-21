using Microsoft.Win32;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace BetterCaptionKeep.EndpointWorker;

public sealed record InstallationEvidence(string[] Versions, int ProfileCount, int ProfilesWithExtension, int UnreadableProfiles)
{
    public static InstallationEvidence Read(WorkerConfiguration configuration)
    {
        var versions = new SortedSet<string>(StringComparer.Ordinal);
        var count = 0; var observed = 0; var unreadable = 0;
        using var machine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
        using var users = machine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList");
        foreach (var name in users?.GetSubKeyNames() ?? [])
        {
            try
            {
                using var user = users!.OpenSubKey(name);
                if (user?.GetValue("ProfileImagePath", null, RegistryValueOptions.DoNotExpandEnvironmentNames) is not string home) continue;
                home = Environment.ExpandEnvironmentVariables(home);
                if (!Regex.IsMatch(home, @"^[A-Za-z]:\\") || !Path.IsPathFullyQualified(home)) continue;
                var data = Path.Combine(home, configuration.Browser == "edge" ? @"AppData\Local\Microsoft\Edge\User Data" : @"AppData\Local\Google\Chrome\User Data");
                if (!Directory.Exists(data) || HasLinkedAncestor(data)) continue;
                foreach (var profile in Directory.EnumerateDirectories(data))
                {
                    if (!Regex.IsMatch(Path.GetFileName(profile), @"^(Default|Profile [0-9]+)$") || HasLinkedAncestor(profile)) continue;
                    count++;
                    var extension = Path.Combine(profile, "Extensions", configuration.ExtensionId);
                    if (!Directory.Exists(extension) || HasLinkedAncestor(extension)) continue;
                    var found = false;
                    foreach (var directory in Directory.EnumerateDirectories(extension))
                    {
                        var file = Path.Combine(directory, "manifest.json");
                        if (!File.Exists(file) || HasLinkedAncestor(file) || new FileInfo(file).Length > 1048576) continue;
                        using var manifest = JsonDocument.Parse(File.ReadAllBytes(file));
                        if (manifest.RootElement.TryGetProperty("version", out var value) && value.GetString() is { } version && Regex.IsMatch(version, @"^[0-9]+(\.[0-9]+){0,3}$")) { versions.Add(version); found = true; }
                    }
                    if (found) observed++;
                }
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException or System.Security.SecurityException or InvalidOperationException) { unreadable++; }
        }
        return new(versions.ToArray(), count, observed, unreadable);
    }
    private static bool HasLinkedAncestor(string path)
    {
        for (var current = Path.GetFullPath(path); current is not null; current = Path.GetDirectoryName(current))
            if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) return true;
        return false;
    }
}
