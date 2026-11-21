using System.Collections.Concurrent;
using System.IO.Pipes;
using System.Text;
using BetterCaptionKeep.AdminSetup.Services;

internal static class EnterpriseSetupProgressTests
{
    public static void Run(Action<string, Action> run, Action<bool, string> assert)
    {
        run("setup status accepts only versioned known stages without freeform payloads", () =>
        {
            foreach (var code in new[] { "preparing", "prerequisites", "signin", "signin-teams", "signin-ready", "group", "review", "deploying", "verifying", "complete", "failed", "canceled" })
                assert(EnterpriseSetupProgress.TryParseMessage($"{{\"version\":1,\"stage\":\"{code}\"}}\n", out _), "known stage expected: " + code);
            foreach (var invalid in new[] { "{}\n", "{\"version\":2,\"stage\":\"signin\"}\n", "{\"version\":1,\"stage\":\"unreviewed\"}\n",
                "{\"version\":1,\"stage\":\"signin\",\"message\":\"synthetic text\"}\n", "{\"version\":1,\"stage\":\"signin\",\"stage\":\"review\"}\n",
                "{\"version\":1,\"stage\":\"signin\"}", "{\"version\":1,\"stage\":\"signin\"}\n{}\n", new string('x', EnterpriseSetupProgress.MaximumMessageBytes + 1) + "\n" })
                assert(!EnterpriseSetupProgress.TryParseMessage(invalid, out _), "malformed, widened or oversized status must be ignored");
        });
        run("setup status process binding rejects unknown, unrelated and cyclic ancestry", () =>
        {
            var parents = new Dictionary<int, int> { [30] = 20, [20] = 10, [10] = 1, [40] = 50, [50] = 40 };
            int? Parent(int pid) => parents.TryGetValue(pid, out var parent) ? parent : null;
            assert(EnterpriseSetupProgress.IsAllowedClient(10, 10, Parent), "the launched process may report status");
            assert(EnterpriseSetupProgress.IsAllowedClient(30, 10, Parent), "its PowerShell descendant may report status");
            assert(!EnterpriseSetupProgress.IsAllowedClient(30, 0, Parent), "unbound channels must reject messages");
            assert(!EnterpriseSetupProgress.IsAllowedClient(40, 10, Parent), "cycles must not establish ownership");
            assert(!EnterpriseSetupProgress.IsAllowedClient(60, 10, Parent), "unrelated clients must be ignored");
        });
        run("setup pipe names are per-launch GUIDs rather than arbitrary IPC destinations", () =>
        {
            assert(EnterpriseSetupProgress.IsValidPipeName(EnterpriseSetupProgress.PipePrefix + Guid.NewGuid().ToString("D")), "bounded pipe namespace expected");
            foreach (var invalid in new[] { "arbitrary", EnterpriseSetupProgress.PipePrefix + "../other", "\\\\remote\\pipe\\name", EnterpriseSetupProgress.PipePrefix + Guid.NewGuid().ToString("B"), EnterpriseSetupProgress.PipePrefix + Guid.Empty.ToString("D") })
                assert(!EnterpriseSetupProgress.IsValidPipeName(invalid), "arbitrary or malformed status destination must fail");
        });
        run("native status pipe handles sequential bounded messages and ignores malformed payloads", () => RoundTripAsync(assert).GetAwaiter().GetResult());
        run("native status pipe rejects a client outside the bound setup lineage", () => RejectedClientAsync(assert).GetAwaiter().GetResult());
        run("a real PowerShell descendant can report status through the launch-bound native pipe", () => DescendantClientAsync(assert).GetAwaiter().GetResult());
    }

    private static async Task SendAsync(string name, string message, bool rejectionExpected = false)
    {
        using var client = new NamedPipeClientStream(".", name, PipeDirection.Out, PipeOptions.Asynchronous);
        await client.ConnectAsync(2000);
        try { await client.WriteAsync(Encoding.UTF8.GetBytes(message)); await client.FlushAsync(); }
        catch (IOException) when (rejectionExpected) { }
    }

    private static async Task RoundTripAsync(Action<bool, string> assert)
    {
        var received = new ConcurrentQueue<EnterpriseSetupStage>();
        using var arrived = new SemaphoreSlim(0);
        await using var server = new EnterpriseSetupProgress(stage => { received.Enqueue(stage); arrived.Release(); });
        server.BindToProcess(Environment.ProcessId);
        foreach (var stage in new[] { "preparing", "signin" })
        {
            await SendAsync(server.PipeName, $"{{\"version\":1,\"stage\":\"{stage}\"}}\n");
            assert(await arrived.WaitAsync(3000), "the allowed native pipe client must deliver the stage");
        }
        await SendAsync(server.PipeName, "{\"version\":1,\"stage\":\"review\",\"unexpected\":true}\n");
        await SendAsync(server.PipeName, "{\"version\":1,\"stage\":\"review\"}\n");
        assert(await arrived.WaitAsync(3000), "malformed status must not prevent a later valid connection");
        assert(received.SequenceEqual(new[] { EnterpriseSetupStage.Preparing, EnterpriseSetupStage.SignIn, EnterpriseSetupStage.Review }), "only the three approved status records may be surfaced");
    }

    private static async Task RejectedClientAsync(Action<bool, string> assert)
    {
        var calls = 0;
        await using var server = new EnterpriseSetupProgress(_ => Interlocked.Increment(ref calls));
        server.BindToProcess(int.MaxValue);
        await SendAsync(server.PipeName, "{\"version\":1,\"stage\":\"signin\"}\n", true);
        await Task.Delay(150);
        assert(calls == 0, "same-user access alone does not authorize a process to report launch status");
    }

    private static async Task DescendantClientAsync(Action<bool, string> assert)
    {
        var received = new TaskCompletionSource<EnterpriseSetupStage>(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var server = new EnterpriseSetupProgress(stage => received.TrySetResult(stage));
        server.BindToProcess(Environment.ProcessId);
        var script = Path.Combine(Path.GetTempPath(), "bck-pipe-descendant-" + Guid.NewGuid().ToString("N") + ".ps1");
        try
        {
            File.WriteAllText(script, """
                param([string]$PipeName)
                $ErrorActionPreference='Stop'
                $client=New-Object IO.Pipes.NamedPipeClientStream('.', $PipeName, [IO.Pipes.PipeDirection]::Out)
                try {
                 $client.Connect(2000)
                 $bytes=[Text.Encoding]::UTF8.GetBytes('{"version":1,"stage":"signin-teams"}'+[char]10)
                 $client.Write($bytes,0,$bytes.Length)
                 $client.Flush()
                } finally { $client.Dispose() }
                """);
            var start = new System.Diagnostics.ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),
                "WindowsPowerShell", "v1.0", "powershell.exe")) { UseShellExecute = false, CreateNoWindow = true };
            foreach (var argument in new[] { "-NoProfile", "-NonInteractive", "-File", script, "-PipeName", server.PipeName }) start.ArgumentList.Add(argument);
            using var process = System.Diagnostics.Process.Start(start) ?? throw new InvalidOperationException("Synthetic status writer did not start.");
            if (!process.WaitForExit(5000)) { process.Kill(true); throw new InvalidOperationException("Synthetic status writer exceeded its bounded wait."); }
            assert(process.ExitCode == 0, "the real descendant writer must complete normally");
            var result = await received.Task.WaitAsync(TimeSpan.FromSeconds(3));
            assert(result == EnterpriseSetupStage.SignInTeams, "native process ancestry and client-PID validation must permit the real PowerShell descendant");
        }
        finally { File.Delete(script); }
    }
}
