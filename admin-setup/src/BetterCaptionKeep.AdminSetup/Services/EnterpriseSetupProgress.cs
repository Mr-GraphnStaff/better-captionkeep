using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace BetterCaptionKeep.AdminSetup.Services;

public enum EnterpriseSetupStage { Preparing, Prerequisites, SignIn, SignInTeams, SignInReady, Group, Review, Signing, Deploying, Verifying, Complete, Failed, Canceled }

/// <summary>Untrusted presentation hints only. This channel cannot approve a plan or authenticate an account.</summary>
public sealed class EnterpriseSetupProgress : IAsyncDisposable
{
    public const string PipePrefix = "DAFTECH.BCK.Setup.";
    public const int MaximumMessageBytes = 384;
    private static readonly IReadOnlyDictionary<string, EnterpriseSetupStage> Stages = new Dictionary<string, EnterpriseSetupStage>(StringComparer.Ordinal)
    {
        ["preparing"] = EnterpriseSetupStage.Preparing, ["prerequisites"] = EnterpriseSetupStage.Prerequisites,
        ["signin"] = EnterpriseSetupStage.SignIn, ["signin-teams"] = EnterpriseSetupStage.SignInTeams, ["signin-ready"] = EnterpriseSetupStage.SignInReady,
        ["group"] = EnterpriseSetupStage.Group, ["review"] = EnterpriseSetupStage.Review,
        ["signing"] = EnterpriseSetupStage.Signing,
        ["deploying"] = EnterpriseSetupStage.Deploying, ["verifying"] = EnterpriseSetupStage.Verifying,
        ["complete"] = EnterpriseSetupStage.Complete, ["failed"] = EnterpriseSetupStage.Failed, ["canceled"] = EnterpriseSetupStage.Canceled
    };
    private readonly Action<EnterpriseSetupStage> received;
    private readonly CancellationTokenSource stopping = new();
    private readonly Task listener;
    private int launchedProcessId;
    public string PipeName { get; } = PipePrefix + Guid.NewGuid().ToString("D");

    public EnterpriseSetupProgress(Action<EnterpriseSetupStage> received)
    {
        this.received = received ?? throw new ArgumentNullException(nameof(received));
        listener = ListenAsync();
    }

    public void BindToProcess(int processId)
    {
        if (processId <= 0 || Interlocked.CompareExchange(ref launchedProcessId, processId, 0) != 0)
            throw new InvalidOperationException("The status channel must bind once to its launched setup process.");
    }

    public static bool IsValidPipeName(string? value) => value is not null && value.StartsWith(PipePrefix, StringComparison.Ordinal)
        && value.Length == PipePrefix.Length + 36 && Guid.TryParseExact(value[PipePrefix.Length..], "D", out var identifier)
        && identifier != Guid.Empty;

    public static bool TryParseMessage(string line, out EnterpriseSetupStage stage)
    {
        stage = default;
        if (string.IsNullOrEmpty(line) || Encoding.UTF8.GetByteCount(line) > MaximumMessageBytes
            || !line.EndsWith('\n') || line[..^1].Contains('\n')) return false;
        try
        {
            using var document = JsonDocument.Parse(line);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || root.EnumerateObject().Count() != 2
                || !root.TryGetProperty("version", out var version) || version.GetRawText() != "1"
                || !root.TryGetProperty("stage", out var code) || code.ValueKind != JsonValueKind.String) return false;
            return Stages.TryGetValue(code.GetString()!, out stage);
        }
        catch (JsonException) { return false; }
    }

    public static bool IsAllowedClient(int clientProcessId, int ancestorProcessId, Func<int, int?> parentOf)
    {
        if (clientProcessId <= 0 || ancestorProcessId <= 0) return false;
        var visited = new HashSet<int>();
        var current = clientProcessId;
        for (var depth = 0; depth < 32 && current > 0 && visited.Add(current); depth++)
        {
            if (current == ancestorProcessId) return true;
            current = parentOf(current) ?? 0;
        }
        return false;
    }

    private async Task ListenAsync()
    {
        while (!stopping.IsCancellationRequested)
        {
            try
            {
                using var server = new NamedPipeServerStream(PipeName, PipeDirection.In, 1, PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly, MaximumMessageBytes, MaximumMessageBytes);
                await server.WaitForConnectionAsync(stopping.Token).ConfigureAwait(false);
                if (!GetNamedPipeClientProcessId(server.SafePipeHandle.DangerousGetHandle(), out var clientId)) continue;
                var ancestor = Volatile.Read(ref launchedProcessId);
                var parents = ReadProcessParents();
                if (clientId > int.MaxValue || !IsAllowedClient((int)clientId, ancestor, pid => parents.TryGetValue(pid, out var parent) ? parent : null)) continue;
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(stopping.Token);
                deadline.CancelAfter(TimeSpan.FromSeconds(2));
                var bytes = new byte[MaximumMessageBytes + 1];
                var count = 0;
                while (count < bytes.Length)
                {
                    var read = await server.ReadAsync(bytes.AsMemory(count), deadline.Token).ConfigureAwait(false);
                    if (read == 0) break;
                    count += read;
                }
                if (count > MaximumMessageBytes) continue;
                var line = new UTF8Encoding(false, true).GetString(bytes, 0, count);
                if (TryParseMessage(line, out var stage))
                {
                    try { received(stage); } catch (Exception) { /* A presentation observer cannot alter authentication. */ }
                }
            }
            catch (OperationCanceledException) { if (stopping.IsCancellationRequested) break; }
            catch (IOException) { /* A disconnected or invalid status writer never changes setup authority. */ }
            catch (DecoderFallbackException) { }
            catch (UnauthorizedAccessException) { break; } // Status is optional; never alter the deployment decision.
        }
    }

    private static Dictionary<int, int> ReadProcessParents()
    {
        var result = new Dictionary<int, int>();
        using var snapshot = new Microsoft.Win32.SafeHandles.SafeFileHandle(CreateToolhelp32Snapshot(2, 0), true);
        if (snapshot.IsInvalid) return result;
        var entry = new ProcessEntry { Size = (uint)Marshal.SizeOf<ProcessEntry>() };
        if (Process32First(snapshot, ref entry)) do { result[(int)entry.ProcessId] = (int)entry.ParentProcessId; }
            while (Process32Next(snapshot, ref entry));
        return result;
    }

    public async ValueTask DisposeAsync()
    {
        stopping.Cancel();
        await listener.ConfigureAwait(false);
        stopping.Dispose();
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ProcessEntry
    {
        public uint Size, Usage, ProcessId;
        public UIntPtr DefaultHeapId;
        public uint ModuleId, Threads, ParentProcessId;
        public int Priority;
        public uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Executable;
    }
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetNamedPipeClientProcessId(IntPtr pipe, out uint processId);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);
    [DllImport("kernel32.dll", EntryPoint = "Process32FirstW", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool Process32First(Microsoft.Win32.SafeHandles.SafeFileHandle snapshot, ref ProcessEntry entry);
    [DllImport("kernel32.dll", EntryPoint = "Process32NextW", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool Process32Next(Microsoft.Win32.SafeHandles.SafeFileHandle snapshot, ref ProcessEntry entry);
}
