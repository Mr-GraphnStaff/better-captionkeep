using System.IO;
using System.Text.Json;

namespace BetterCaptionKeep.AdminSetup.Services;

/// <summary>Nonsecret per-user routing only; the deployment engine verifies Azure identity and tools.</summary>
public static class EnterpriseSigningConfiguration
{
    public const string FileName = "administrator-settings.json";

    public static string ReadAzurePath(string settingsPath, string packageDirectory)
    {
        try
        {
            var settings = ValidateFile(settingsPath, packageDirectory);
            if (new FileInfo(settings).Length > 8192) throw new InvalidOperationException();
            using var document = JsonDocument.Parse(File.ReadAllBytes(settings));
            var value = document.RootElement;
            if (value.ValueKind != JsonValueKind.Object) throw new InvalidOperationException();
            var properties = value.EnumerateObject().ToArray();
            var required = new[] { "schemaVersion", "signingProvider", "azureSigningConfigPath" };
            if (properties.Length != required.Length || properties.Select(p => p.Name).Distinct(StringComparer.Ordinal).Count() != required.Length
                || properties.Any(p => !required.Contains(p.Name, StringComparer.Ordinal))
                || value.GetProperty("schemaVersion").GetRawText() != "1"
                || value.GetProperty("signingProvider").GetString() != "azure") throw new InvalidOperationException();
            return ValidateFile(value.GetProperty("azureSigningConfigPath").GetString(), packageDirectory);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or ArgumentException
            or InvalidOperationException or JsonException or NotSupportedException)
        {
            throw new InvalidOperationException("Azure Artifact Signing configuration is missing or invalid. Restore this administrator's signing settings and existing Azure configuration before setup or continuation. No local-certificate fallback was selected.", exception);
        }
    }

    private static string ValidateFile(string? path, string packageDirectory)
    {
        if (string.IsNullOrWhiteSpace(path) || !Path.IsPathFullyQualified(path) || path.StartsWith("\\\\", StringComparison.Ordinal)
            || path.Length < 4 || path[1] != ':' || path[2] is not ('\\' or '/') || path[2..].Contains(':')
            || path.Split('\\', '/').Any(segment => segment is "." or "..") || !path.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException();
        var full = Path.GetFullPath(path);
        var package = Path.GetFullPath(packageDirectory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (full.StartsWith(package, StringComparison.OrdinalIgnoreCase) || !File.Exists(full)) throw new InvalidOperationException();
        var current = full;
        while (!string.IsNullOrEmpty(current))
        {
            if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException();
            current = Path.GetDirectoryName(current);
        }
        return full;
    }
}
