#Requires -Version 5.1
# Per-launch presentation context only. No credentials or tenant authority are
# carried on this channel; all writes still require the engine's reviewed plan.
$script:SetupOwnerWindowHandle = [long]0
$script:SetupOwnerProcessId = 0
$script:SetupStatusPipeName = ''
$script:SetupConsoleWindow = [IntPtr]::Zero
$script:SetupPreviousConsoleOwner = [IntPtr]::Zero
$script:SetupPreviousConsoleStyle = [IntPtr]::Zero
$script:SetupAssignedConsoleStyle = [IntPtr]::Zero

function Import-SetupWindowInterop {
    if ('DafTech.CaptionKeep.SetupWindowInterop' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
namespace DafTech.CaptionKeep {
 public static class SetupWindowInterop {
  [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
  [DllImport("kernel32.dll")] static extern uint GetConsoleProcessList([Out] uint[] processes, uint count);
  [DllImport("kernel32.dll")] public static extern void SetLastError(uint error);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW", SetLastError=true)]
  public static extern IntPtr GetWindowLongPtr(IntPtr window, int index);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)]
  public static extern IntPtr SetWindowLongPtr(IntPtr window, int index, IntPtr value);
  [DllImport("user32.dll",SetLastError=true)] static extern bool SetWindowPos(IntPtr window,IntPtr after,int x,int y,int width,int height,uint flags);
  public static bool SetConsoleStyle(IntPtr window,IntPtr style) {
   SetWindowLongPtr(window,-16,style);
   return SetWindowPos(window,IntPtr.Zero,0,0,0,0,0x37) && GetWindowLongPtr(window,-16)==style;
  }
  public static bool MatchesProcess(IntPtr window, uint expected) {
   uint actual; GetWindowThreadProcessId(window, out actual);
   return expected != 0 && actual == expected && IsWindow(window);
  }
  public static int AssignOwner(IntPtr window, IntPtr owner) {
   SetLastError(0); SetWindowLongPtr(window, -8, owner);
   return Marshal.GetLastWin32Error();
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct ProcessEntry {
   public uint Size, Usage, ProcessId; public UIntPtr Heap;
   public uint Module, Threads, ParentProcessId; public int Priority; public uint Flags;
   [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string Executable;
  }
  [DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);
  [DllImport("kernel32.dll",EntryPoint="Process32FirstW",CharSet=CharSet.Unicode)] static extern bool Process32First(IntPtr snapshot,ref ProcessEntry entry);
  [DllImport("kernel32.dll",EntryPoint="Process32NextW",CharSet=CharSet.Unicode)] static extern bool Process32Next(IntPtr snapshot,ref ProcessEntry entry);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static bool ConsoleBelongsToLaunch(uint ownerProcess) {
   var clients=new uint[64]; uint count=GetConsoleProcessList(clients,(uint)clients.Length);
   if(count==0 || count>clients.Length) return false;
   var parents=new Dictionary<uint,uint>(); var snapshot=CreateToolhelp32Snapshot(2,0);
   if(snapshot==new IntPtr(-1)) return false;
   try {
    var entry=new ProcessEntry {Size=(uint)Marshal.SizeOf(typeof(ProcessEntry))};
    if(Process32First(snapshot,ref entry)) do {parents[entry.ProcessId]=entry.ParentProcessId;} while(Process32Next(snapshot,ref entry));
   } finally {CloseHandle(snapshot);}
   for(int index=0;index<count;index++) {
    uint current=clients[index]; var visited=new HashSet<uint>(); bool found=false;
    for(int depth=0;depth<32 && current!=0 && visited.Add(current);depth++) {
     if(current==ownerProcess) {found=true;break;}
     uint parent; if(!parents.TryGetValue(current,out parent)) break; current=parent;
    }
    if(!found) return false;
   }
   return true;
  }
 }
}
'@
}

function Initialize-SetupRuntime {
    param([long]$OwnerWindowHandle=0,[int]$OwnerProcessId=0,[string]$StatusPipeName)
    if ($StatusPipeName) {
        $prefix='DAFTECH.BCK.Setup.'
        $identifier=[guid]::Empty
        if (-not $StatusPipeName.StartsWith($prefix,[StringComparison]::Ordinal) -or
            -not [guid]::TryParse($StatusPipeName.Substring($prefix.Length),[ref]$identifier) -or $identifier -eq [guid]::Empty) {
            throw 'Invalid setup progress connection. No Microsoft sign-in was started.'
        }
        $script:SetupStatusPipeName=$StatusPipeName
    }
    if ($OwnerWindowHandle -eq 0 -and $OwnerProcessId -eq 0) { return }
    Import-SetupWindowInterop
    $owner=[IntPtr]$OwnerWindowHandle
    if (-not [DafTech.CaptionKeep.SetupWindowInterop]::MatchesProcess($owner,[uint32]$OwnerProcessId) -or
        -not [DafTech.CaptionKeep.SetupWindowInterop]::IsWindowVisible($owner)) {
        throw 'The administrator setup window is no longer available. Reopen setup before signing in.'
    }
    $console=[DafTech.CaptionKeep.SetupWindowInterop]::GetConsoleWindow()
    # Never reassign a visible terminal or another tab's top-level window. The
    # launcher creates this hidden console specifically for this operation.
    if ($console -eq [IntPtr]::Zero -or
        [DafTech.CaptionKeep.SetupWindowInterop]::GetAncestor($console,2) -ne $console -or
        [DafTech.CaptionKeep.SetupWindowInterop]::IsWindowVisible($console) -or
        ([DafTech.CaptionKeep.SetupWindowInterop]::GetWindowLongPtr($console,-16).ToInt64() -band 0x40000000) -ne 0) {
        throw 'Microsoft sign-in could not be attached safely to the setup window. No sign-in was started.'
    }
    if (-not [DafTech.CaptionKeep.SetupWindowInterop]::MatchesProcess($owner,[uint32]$OwnerProcessId)) {
        throw 'The administrator setup window closed before sign-in could start.'
    }
    $previous=[DafTech.CaptionKeep.SetupWindowInterop]::GetWindowLongPtr($console,-8)
    if (($previous -ne [IntPtr]::Zero -and $previous -ne $owner) -or
        -not [DafTech.CaptionKeep.SetupWindowInterop]::ConsoleBelongsToLaunch([uint32]$OwnerProcessId)) {
        throw 'Microsoft sign-in requires a console dedicated to this setup. No sign-in was started.'
    }
    # GetAncestor(GA_ROOTOWNER), used by the Microsoft SDK, follows GetParent;
    # GetParent returns an owner only for WS_POPUP windows. Change only this
    # verified hidden launch console, preserving its original style for cleanup.
    $previousStyle=[DafTech.CaptionKeep.SetupWindowInterop]::GetWindowLongPtr($console,-16)
    $assignedStyle=[IntPtr]($previousStyle.ToInt64() -bor 0x80000000L)
    if (-not [DafTech.CaptionKeep.SetupWindowInterop]::SetConsoleStyle($console,$assignedStyle)) {
        [DafTech.CaptionKeep.SetupWindowInterop]::SetConsoleStyle($console,$previousStyle)|Out-Null
        throw 'Microsoft sign-in window ownership could not be prepared. No sign-in was started.'
    }
    $nativeError=[DafTech.CaptionKeep.SetupWindowInterop]::AssignOwner($console,$owner)
    $observed=[DafTech.CaptionKeep.SetupWindowInterop]::GetAncestor($console,3)
    if ($observed -ne $owner) {
        if ([DafTech.CaptionKeep.SetupWindowInterop]::GetWindowLongPtr($console,-8) -eq $owner) {
            [DafTech.CaptionKeep.SetupWindowInterop]::SetWindowLongPtr($console,-8,$previous) | Out-Null
        }
        [DafTech.CaptionKeep.SetupWindowInterop]::SetConsoleStyle($console,$previousStyle)|Out-Null
        throw "Microsoft sign-in could not be owned by the setup window (Windows error $nativeError). No sign-in was started."
    }
    $script:SetupConsoleWindow=$console
    $script:SetupPreviousConsoleOwner=$previous
    $script:SetupPreviousConsoleStyle=$previousStyle
    $script:SetupAssignedConsoleStyle=$assignedStyle
    $script:SetupOwnerWindowHandle=$OwnerWindowHandle
    $script:SetupOwnerProcessId=$OwnerProcessId
}

function Close-SetupRuntime {
    if ($script:SetupConsoleWindow -eq [IntPtr]::Zero) { return }
    $console=$script:SetupConsoleWindow
    $owner=[IntPtr]$script:SetupOwnerWindowHandle
    if ([DafTech.CaptionKeep.SetupWindowInterop]::IsWindow($console)) {
        if ([DafTech.CaptionKeep.SetupWindowInterop]::GetWindowLongPtr($console,-8) -ne $owner -or
            [DafTech.CaptionKeep.SetupWindowInterop]::GetWindowLongPtr($console,-16) -ne $script:SetupAssignedConsoleStyle) {
            Write-Warning 'The temporary setup window context changed unexpectedly. Close this setup operation before retrying.'
            return
        }
        $previous=$script:SetupPreviousConsoleOwner
        if ($previous -ne [IntPtr]::Zero -and -not [DafTech.CaptionKeep.SetupWindowInterop]::IsWindow($previous)) { $previous=[IntPtr]::Zero }
        [DafTech.CaptionKeep.SetupWindowInterop]::SetWindowLongPtr($console,-8,$previous) | Out-Null
        [DafTech.CaptionKeep.SetupWindowInterop]::SetConsoleStyle($console,$script:SetupPreviousConsoleStyle) | Out-Null
        if ([DafTech.CaptionKeep.SetupWindowInterop]::GetWindowLongPtr($console,-8) -ne $previous -or
            [DafTech.CaptionKeep.SetupWindowInterop]::GetWindowLongPtr($console,-16) -ne $script:SetupPreviousConsoleStyle) {
            Write-Warning 'The temporary setup window context could not be fully restored. Close this setup operation before retrying.'
            return
        }
    }
    $script:SetupConsoleWindow=[IntPtr]::Zero
}

function Assert-SetupSignInOwner {
    if ($script:SetupOwnerWindowHandle -eq 0) { return }
    $owner=[IntPtr]$script:SetupOwnerWindowHandle
    if (-not [DafTech.CaptionKeep.SetupWindowInterop]::MatchesProcess($owner,[uint32]$script:SetupOwnerProcessId) -or
        -not [DafTech.CaptionKeep.SetupWindowInterop]::IsWindowVisible($owner) -or
        [DafTech.CaptionKeep.SetupWindowInterop]::GetAncestor([DafTech.CaptionKeep.SetupWindowInterop]::GetConsoleWindow(),3) -ne $owner) {
        throw 'The setup window is no longer available to show Microsoft sign-in. Reopen setup before continuing.'
    }
}

function Set-SetupDialogOwner {
    param($Window)
    if ($script:SetupOwnerWindowHandle -ne 0 -and
        [DafTech.CaptionKeep.SetupWindowInterop]::MatchesProcess([IntPtr]$script:SetupOwnerWindowHandle,[uint32]$script:SetupOwnerProcessId)) {
        $helper=New-Object System.Windows.Interop.WindowInteropHelper($Window)
        $helper.Owner=[IntPtr]$script:SetupOwnerWindowHandle
        $Window.WindowStartupLocation='CenterOwner'
    } else { $Window.WindowStartupLocation='CenterScreen' }
}

function Write-SetupStage {
    param([ValidateSet('preparing','prerequisites','signin','signin-teams','signin-ready','group','review','deploying','signing','verifying','complete','failed','canceled')][string]$Stage)
    $script:SetupCurrentStage=$Stage
    if (-not $script:SetupStatusPipeName) { return }
    $client=$null;$writer=$null
    try {
        $client=New-Object IO.Pipes.NamedPipeClientStream('.', $script:SetupStatusPipeName, [IO.Pipes.PipeDirection]::Out)
        $client.Connect(750)
        $writer=New-Object IO.StreamWriter($client,[Text.UTF8Encoding]::new($false),256,$true)
        $writer.WriteLine((@{version=1;stage=$Stage}|ConvertTo-Json -Compress))
        $writer.Flush()
    } catch [IO.IOException] {
        # Progress never grants authority or changes recovery semantics.
    } catch [TimeoutException] {
    } catch [UnauthorizedAccessException] {
    } finally {
        if ($writer) { try { $writer.Dispose() } catch [IO.IOException] {} catch [ObjectDisposedException] {} }
        if ($client) { try { $client.Dispose() } catch [IO.IOException] {} catch [ObjectDisposedException] {} }
    }
}
