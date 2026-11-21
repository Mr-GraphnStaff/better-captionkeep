using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;

const int MaximumMessageBytes = 16 * 1024;
const string SetupExecutable = "BetterCaptionKeep.AdminSetup.exe";
var callerOrigin = Environment.GetCommandLineArgs().Skip(1).FirstOrDefault(argument => argument.StartsWith("chrome-extension://", StringComparison.Ordinal));

try
{
    using var input = Console.OpenStandardInput();
    using var output = Console.OpenStandardOutput();
    var request = await ReadMessageAsync(input);
    var response = Launch(request, callerOrigin);
    await WriteMessageAsync(output, response);
    return response.Ok ? 0 : 1;
}
catch
{
    // Native hosts must not leak paths, arguments, tokens, or exception details to the browser.
    return 2;
}

static LaunchResponse Launch(LaunchRequest request, string? callerOrigin)
{
    if (request.ProtocolVersion != 1 || !string.Equals(request.Operation, "launch", StringComparison.Ordinal))
        return new(1, "launch", false, false, "unsupported-request");
    if (!string.Equals(request.Source, "extension-settings", StringComparison.Ordinal))
        return new(1, "launch", false, false, "invalid-source");
    if (request.Mode is not ("real" or "preview"))
        return new(1, "launch", false, false, "invalid-mode");
    if (!IsExtensionId(request.ExtensionId) || !IsVersion(request.ExtensionVersion))
        return new(1, "launch", false, false, "invalid-extension-identity");
    var expectedOrigin = $"chrome-extension://{request.ExtensionId}/";
    if (!string.Equals(callerOrigin, expectedOrigin, StringComparison.Ordinal) || !IsAllowedOrigin(expectedOrigin))
        return new(1, "launch", false, false, "untrusted-extension-origin");

    var installDirectory = AppContext.BaseDirectory;
    var executable = Path.GetFullPath(Path.Combine(installDirectory, SetupExecutable));
    if (!string.Equals(Path.GetDirectoryName(executable), Path.TrimEndingDirectorySeparator(installDirectory), StringComparison.OrdinalIgnoreCase)
        || !File.Exists(executable))
        return new(1, "launch", false, false, "setup-not-installed");

    // A process name cannot prove which launch mode is active. Fail closed
    // instead of claiming that a preview process satisfies a real-mode request.
    if (Process.GetProcessesByName(Path.GetFileNameWithoutExtension(SetupExecutable)).Length > 0)
        return new(1, "launch", false, false, "setup-instance-conflict");

    var startInfo = new ProcessStartInfo
    {
        FileName = executable,
        // Detach the desktop UI from the native-messaging stdio handles.
        // Otherwise the child keeps the browser pipe open after this host
        // writes its one response, leaving sendNativeMessage unresolved.
        UseShellExecute = true,
        WorkingDirectory = installDirectory
    };
    startInfo.ArgumentList.Add("--source-extension");
    startInfo.ArgumentList.Add(request.ExtensionId);
    startInfo.ArgumentList.Add("--extension-version");
    startInfo.ArgumentList.Add(request.ExtensionVersion);
    startInfo.ArgumentList.Add("--mode");
    startInfo.ArgumentList.Add(request.Mode);
    Process.Start(startInfo);
    return new(1, "launch", true, false, null);
}

static async Task<LaunchRequest> ReadMessageAsync(Stream input)
{
    var lengthBytes = new byte[4];
    await ReadExactlyAsync(input, lengthBytes);
    var length = BitConverter.ToInt32(lengthBytes, 0);
    if (length is <= 0 or > MaximumMessageBytes) throw new InvalidDataException();
    var payload = new byte[length];
    await ReadExactlyAsync(input, payload);
    return JsonSerializer.Deserialize<LaunchRequest>(payload, JsonSerializerOptions.Web) ?? throw new InvalidDataException();
}

static async Task WriteMessageAsync(Stream output, LaunchResponse response)
{
    var payload = JsonSerializer.SerializeToUtf8Bytes(response, JsonSerializerOptions.Web);
    await output.WriteAsync(BitConverter.GetBytes(payload.Length));
    await output.WriteAsync(payload);
    await output.FlushAsync();
}

static async Task ReadExactlyAsync(Stream input, byte[] buffer)
{
    var offset = 0;
    while (offset < buffer.Length)
    {
        var read = await input.ReadAsync(buffer.AsMemory(offset));
        if (read == 0) throw new EndOfStreamException();
        offset += read;
    }
}

static bool IsExtensionId(string value) => value.Length == 32 && value.All(character => character is >= 'a' and <= 'p');
static bool IsVersion(string value) => Version.TryParse(value, out _);
static bool IsAllowedOrigin(string origin) => origin is
    "chrome-extension://pjpibiimicedkckleehljlklmblkacph/" or // unpacked Development identity
    "chrome-extension://ecpjboeanaehianibdbgijldbikdgkhm/" or // stable unpacked QA identity
    "chrome-extension://edefcbdhahfolgkoamkbknjppojpaffk/" or // Microsoft Edge Store
    "chrome-extension://nabjdlnkkaonnbnimnmnhjcbigceebml/";   // Chrome Web Store

internal sealed record LaunchRequest(int ProtocolVersion, string Operation, string Source, string ExtensionId, string ExtensionVersion, string Mode);
internal sealed record LaunchResponse(int ProtocolVersion, string Operation, bool Ok, bool AlreadyRunning, string? Error);
