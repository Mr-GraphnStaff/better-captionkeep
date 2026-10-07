using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;

internal sealed record LauncherConfiguration(
    string NodePath,
    string HostScriptPath,
    string AdapterPath,
    string AssistantId);

internal static class Program
{
    private static readonly Regex AssistantIdPattern = new("^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$", RegexOptions.CultureInvariant);

    private static string RequireFile(string value, string name)
    {
        if (string.IsNullOrWhiteSpace(value) || !Path.IsPathFullyQualified(value))
            throw new InvalidOperationException($"{name} must be an absolute path.");
        var fullPath = Path.GetFullPath(value);
        var info = new FileInfo(fullPath);
        if (!info.Exists || info.Attributes.HasFlag(FileAttributes.ReparsePoint))
            throw new InvalidOperationException($"{name} must identify an existing regular file and may not be a reparse point.");
        return fullPath;
    }

    public static async Task<int> Main()
    {
        try
        {
            var launcherPath = Environment.ProcessPath
                ?? throw new InvalidOperationException("The launcher path is unavailable.");
            var launcherDirectory = Path.GetDirectoryName(launcherPath)
                ?? throw new InvalidOperationException("The launcher directory is unavailable.");
            var configPath = Path.Combine(launcherDirectory, "captionkeep-assistant-host.json");
            var configInfo = new FileInfo(configPath);
            if (!configInfo.Exists || configInfo.Attributes.HasFlag(FileAttributes.ReparsePoint))
                throw new InvalidOperationException("captionkeep-assistant-host.json is missing or is a reparse point.");
            var config = JsonSerializer.Deserialize<LauncherConfiguration>(
                await File.ReadAllTextAsync(configPath),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? throw new InvalidOperationException("The launcher configuration is invalid.");
            var nodePath = RequireFile(config.NodePath, "nodePath");
            var hostScriptPath = RequireFile(config.HostScriptPath, "hostScriptPath");
            var adapterPath = RequireFile(config.AdapterPath, "adapterPath");
            if (!AssistantIdPattern.IsMatch(config.AssistantId ?? string.Empty))
                throw new InvalidOperationException("assistantId is invalid.");

            var startInfo = new ProcessStartInfo
            {
                FileName = nodePath,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                WorkingDirectory = Path.GetDirectoryName(hostScriptPath)!
            };
            startInfo.ArgumentList.Add(hostScriptPath);
            startInfo.Environment["CAPTIONKEEP_ASSISTANT_ADAPTER"] = adapterPath;
            startInfo.Environment["CAPTIONKEEP_ASSISTANT_ID"] = config.AssistantId;

            using var child = Process.Start(startInfo)
                ?? throw new InvalidOperationException("The Node.js assistant bridge could not be started.");
            AppDomain.CurrentDomain.ProcessExit += (_, _) =>
            {
                try { if (!child.HasExited) child.Kill(entireProcessTree: true); } catch { }
            };

            var input = Task.Run(async () =>
            {
                await Console.OpenStandardInput().CopyToAsync(child.StandardInput.BaseStream);
                await child.StandardInput.BaseStream.FlushAsync();
                child.StandardInput.Close();
            });
            var output = child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
            var errors = child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
            await Task.WhenAll(input, child.WaitForExitAsync(), output, errors);
            return child.ExitCode;
        }
        catch (Exception error)
        {
            await Console.Error.WriteLineAsync(error.Message);
            return 1;
        }
    }
}
