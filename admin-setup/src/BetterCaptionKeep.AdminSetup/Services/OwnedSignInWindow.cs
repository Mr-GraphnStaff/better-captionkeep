using System.Runtime.InteropServices;
using System.Windows.Threading;

namespace BetterCaptionKeep.AdminSetup.Services;

/// <summary>Focuses only the setup window or a popup with a verified owner chain back to it.</summary>
public sealed class OwnedSignInWindow : IDisposable
{
    private readonly IntPtr owner;
    private readonly DispatcherTimer timer;
    private DateTimeOffset activationDeadline;

    public OwnedSignInWindow(IntPtr owner)
    {
        if (!IsCurrentProcessWindow(owner)) throw new InvalidOperationException("The visible setup owner window is unavailable.");
        this.owner = owner;
        timer = new DispatcherTimer(DispatcherPriority.Background) { Interval = TimeSpan.FromMilliseconds(250) };
        timer.Tick += (_, _) =>
        {
            if (DateTimeOffset.UtcNow >= activationDeadline || !IsCurrentProcessWindow(owner)) { timer.Stop(); return; }
            var popup = FindOwnedPopup();
            if (popup == IntPtr.Zero) return;
            timer.Stop(); // One standard activation attempt; never keep stealing focus.
            SetForegroundWindow(popup);
        };
    }

    public static bool IsCurrentProcessWindow(IntPtr window)
    {
        if (window == IntPtr.Zero || !IsWindow(window)) return false;
        GetWindowThreadProcessId(window, out var process);
        return process == Environment.ProcessId;
    }

    public static bool HasOwnerChain(IntPtr window, IntPtr root, Func<IntPtr, IntPtr> ownerOf)
    {
        if (window == IntPtr.Zero || root == IntPtr.Zero || window == root) return false;
        var visited = new HashSet<IntPtr>();
        for (var depth = 0; depth < 32 && window != IntPtr.Zero && visited.Add(window); depth++)
        {
            window = ownerOf(window);
            if (window == root) return true;
        }
        return false;
    }

    public void BeginOneShotActivation()
    {
        timer.Stop();
        activationDeadline = DateTimeOffset.UtcNow.AddSeconds(30);
        timer.Start();
    }

    public void StopAutomaticActivation() => timer.Stop();

    public bool ShowOwnedSignIn()
    {
        if (!IsCurrentProcessWindow(owner)) return false;
        var popup = FindOwnedPopup();
        if (popup == IntPtr.Zero) { SetForegroundWindow(owner); return false; }
        return SetForegroundWindow(popup);
    }

    private IntPtr FindOwnedPopup()
    {
        if (!IsCurrentProcessWindow(owner)) return IntPtr.Zero;
        var current = owner;
        var visited = new HashSet<IntPtr>();
        IntPtr candidate = IntPtr.Zero;
        for (var depth = 0; depth < 32 && visited.Add(current); depth++)
        {
            var next = GetLastActivePopup(current);
            if (next == IntPtr.Zero || next == current || !IsWindow(next)
                || !HasOwnerChain(next, owner, handle => GetWindow(handle, 4))) break;
            if (IsWindowVisible(next)) candidate = next;
            current = next;
        }
        return candidate;
    }

    public void Dispose() => timer.Stop();
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll")] private static extern IntPtr GetLastActivePopup(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
}
