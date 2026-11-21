using System.Runtime.InteropServices;
using BetterCaptionKeep.AdminSetup.Services;

internal static class OwnedSignInWindowTests
{
    public static void Run(Action<string, Action> run, Action<bool, string> assert)
    {
        run("sign-in ownership rejects self, zero, foreign and cyclic chains", () =>
        {
            var owners = new Dictionary<IntPtr, IntPtr> { [2] = 1, [3] = 2, [4] = 5, [5] = 4 };
            IntPtr Owner(IntPtr window) => owners.TryGetValue(window, out var parent) ? parent : IntPtr.Zero;
            assert(OwnedSignInWindow.HasOwnerChain(3, 1, Owner), "transitive owned popup should resolve to setup");
            foreach (var candidate in new IntPtr[] { 0, 1, 4, 8 })
                assert(!OwnedSignInWindow.HasOwnerChain(candidate, 1, Owner), "unowned or cyclic windows must never become focus targets");
        });
        run("native window ownership distinguishes this process's popup from an unrelated root", () =>
        {
            using var owner = new NativeWindow();
            using var popup = new NativeWindow(owner.Handle);
            using var unrelated = new NativeWindow();
            assert(OwnedSignInWindow.IsCurrentProcessWindow(owner.Handle), "genuine current-process HWND expected");
            assert(OwnedSignInWindow.HasOwnerChain(popup.Handle, owner.Handle, window => GetWindow(window, 4)), "native popup should preserve its actual owner chain");
            assert(!OwnedSignInWindow.HasOwnerChain(popup.Handle, unrelated.Handle, window => GetWindow(window, 4)), "foreign root must not be adopted");
            assert(!OwnedSignInWindow.IsCurrentProcessWindow(GetDesktopWindow()), "the desktop is not this application's owner");
        });
        run("setup launcher binds the real owner, process and fixed status namespace as separate arguments", () =>
        {
            using var owner = new NativeWindow();
            WithPackage(root =>
            {
                var pipe = EnterpriseSetupProgress.PipePrefix + Guid.NewGuid().ToString("D");
                var launcher = new EnterpriseSetupLauncher(root);
                var arguments = launcher.CreateStartInfo(EnterpriseSetupMode.Setup, owner.Handle, pipe).ArgumentList.ToArray();
                assert(arguments.TakeLast(6).SequenceEqual(new[] { "-OwnerWindowHandle", owner.Handle.ToInt64().ToString(System.Globalization.CultureInfo.InvariantCulture),
                    "-OwnerProcessId", Environment.ProcessId.ToString(System.Globalization.CultureInfo.InvariantCulture), "-StatusPipeName", pipe }), "exact owner/status arguments expected");
                ExpectInvalid(() => launcher.CreateStartInfo(EnterpriseSetupMode.Setup, GetDesktopWindow(), pipe), assert);
                ExpectInvalid(() => launcher.CreateStartInfo(EnterpriseSetupMode.Setup, owner.Handle, "other-pipe"), assert);
                ExpectInvalid(() => launcher.CreateStartInfo(EnterpriseSetupMode.Setup, IntPtr.Zero, pipe), assert);
            });
        });
    }

    private static void ExpectInvalid(Action action, Action<bool, string> assert)
    {
        try { action(); } catch (InvalidOperationException) { return; }
        assert(false, "an invalid owner or status pipe must fail before process launch");
    }

    private static void WithPackage(Action<string> action)
    {
        var fixture = Path.Combine(Path.GetTempPath(), "bck-owner-contract-" + Guid.NewGuid().ToString("N"));
        var root = Path.Combine(fixture, "enterprise");
        Directory.CreateDirectory(root);
        try
        {
            var lines = new List<string>();
            foreach (var file in new[] { "Enterprise-Launcher.ps1", "Enterprise-Setup.ps1", "Enterprise-Endpoint.ps1", "Enterprise-Dialogs.ps1", "Enterprise-Runtime.ps1", "Enterprise-Signing.ps1", "Enterprise-SignerMigration.ps1",
                "managed-schema.json", "profile.json", "profile.chrome.json", "profile.local-only.json",
                "Enterprise-Win32.ps1", "EndpointWorker.exe", "endpoint-worker.intunewin", "endpoint-worker-package.json" })
            {
                var bytes = System.Text.Encoding.UTF8.GetBytes("synthetic fixture: " + file);
                File.WriteAllBytes(Path.Combine(root, file), bytes);
                lines.Add(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)) + "  " + file);
            }
            File.WriteAllText(Path.Combine(root, "SHA256SUMS.txt"), string.Join('\n', lines) + "\n");
            EnterpriseAzureRoutingTests.WriteSettings(fixture);
            action(root);
        }
        finally { Directory.Delete(fixture, true); }
    }

    private sealed class NativeWindow : IDisposable
    {
        public IntPtr Handle { get; }
        public NativeWindow(IntPtr owner = default)
        {
            Handle = CreateWindowEx(0, "STATIC", "", 0x80000000, 0, 0, 1, 1, owner, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
            if (Handle == IntPtr.Zero) throw new InvalidOperationException("Synthetic native owner window could not be created.");
        }
        public void Dispose() => DestroyWindow(Handle);
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr CreateWindowEx(uint exStyle, string className, string title, uint style, int x, int y, int width, int height, IntPtr parent, IntPtr menu, IntPtr instance, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool DestroyWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] private static extern IntPtr GetDesktopWindow();
}
