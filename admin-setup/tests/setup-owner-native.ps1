param([switch]$Child,[long]$OwnerHandle=0,[int]$OwnerPid=0,[string]$Report,[switch]$Nested)
$ErrorActionPreference='Stop'
$runtime=Join-Path $PSScriptRoot '../../deployment/intune/Enterprise-Runtime.ps1'
. $runtime
if ($Child) {
    $result=@{nested=[bool]$Nested;passed=$false}
    try {
        Import-SetupWindowInterop
        $console=[DafTech.CaptionKeep.SetupWindowInterop]::GetConsoleWindow()
        $before=[DafTech.CaptionKeep.SetupWindowInterop]::GetWindowLongPtr($console,-8)
        $originalStyle=[DafTech.CaptionKeep.SetupWindowInterop]::GetWindowLongPtr($console,-16)
        Initialize-SetupRuntime -OwnerWindowHandle $OwnerHandle -OwnerProcessId $OwnerPid
        Assert-SetupSignInOwner
        $result.ownerVerified=[DafTech.CaptionKeep.SetupWindowInterop]::GetAncestor($console,3).ToInt64() -eq $OwnerHandle
        if (-not $Nested) {
            $pwsh=(Get-Command pwsh.exe -ErrorAction Stop).Source
            & $pwsh -NoProfile -File $PSCommandPath -Child -Nested -OwnerHandle $OwnerHandle -OwnerPid $OwnerPid -Report ($Report+'.nested')
            if ($LASTEXITCODE -ne 0) { throw 'Nested PowerShell ownership probe failed.' }
            $nestedResult=Get-Content -LiteralPath ($Report+'.nested') -Raw | ConvertFrom-Json
            if (-not $nestedResult.passed) { throw 'Nested PowerShell did not preserve ownership.' }
            Assert-SetupSignInOwner
        }
        Close-SetupRuntime
        $result.restored=[DafTech.CaptionKeep.SetupWindowInterop]::GetWindowLongPtr($console,-8) -eq $before
        $result.styleRestored=[DafTech.CaptionKeep.SetupWindowInterop]::GetWindowLongPtr($console,-16) -eq $originalStyle
        if (-not $result.ownerVerified -or -not $result.restored -or -not $result.styleRestored) { throw 'Native owner verification or restoration failed.' }
        $result.passed=$true
    } catch { $result.error=$_.Exception.Message } finally {
        Close-SetupRuntime
        if ($console -and $originalStyle) { [DafTech.CaptionKeep.SetupWindowInterop]::SetWindowLongPtr($console,-16,$originalStyle)|Out-Null }
        $result|ConvertTo-Json|Set-Content -LiteralPath $Report -Encoding UTF8
    }
    if (-not $result.passed) { exit 1 }
    exit 0
}
if (-not $env:AGENT_WORKING_DIR) { throw 'Run through the managed working-area launcher.' }
Add-Type -AssemblyName PresentationFramework
$window=New-Object Windows.Window
$window.Title='CaptionKeep synthetic ownership test — no sign-in'
$window.Width=480;$window.Height=180
$window.Content='Testing setup ownership. No Microsoft authentication or tenant changes.'
$window.WindowStartupLocation='CenterScreen'
$script:childProcess=$null;$script:probeFailure=$null
$reportPath=Join-Path $env:AGENT_WORKING_DIR 'reports/setup-owner-native.json'
New-Item -ItemType Directory -Path (Split-Path $reportPath) -Force|Out-Null
$window.Add_ContentRendered({
    try {
        $handle=(New-Object Windows.Interop.WindowInteropHelper($window)).Handle
        $start=New-Object Diagnostics.ProcessStartInfo
        $start.FileName=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
        $start.UseShellExecute=$true;$start.CreateNoWindow=$false;$start.WindowStyle='Hidden'
        $start.Arguments='-NoProfile -STA -File "'+$PSCommandPath+'" -Child -OwnerHandle '+$handle.ToInt64()+' -OwnerPid '+$PID+' -Report "'+$reportPath+'"'
        $script:childProcess=[Diagnostics.Process]::Start($start)
    } catch {$script:probeFailure=$_.Exception.Message;$window.Close()}
})
$script:deadline=[DateTime]::UtcNow.AddSeconds(45)
$timer=New-Object Windows.Threading.DispatcherTimer
$timer.Interval=[TimeSpan]::FromMilliseconds(150)
$timer.Add_Tick({
    if ($script:childProcess -and $script:childProcess.HasExited) { $timer.Stop();$window.Close() }
    elseif ([DateTime]::UtcNow -gt $script:deadline) { $script:probeFailure='Native ownership test timed out.';$timer.Stop();$window.Close() }
})
$timer.Start()
try {$window.ShowDialog()|Out-Null} finally {$timer.Stop()}
if ($script:probeFailure) {throw $script:probeFailure}
if (-not (Test-Path -LiteralPath $reportPath)) {throw 'Child did not produce its native ownership evidence.'}
$proof=Get-Content -LiteralPath $reportPath -Raw|ConvertFrom-Json
$proof|ConvertTo-Json
if (-not $proof.passed) {throw $proof.error}
