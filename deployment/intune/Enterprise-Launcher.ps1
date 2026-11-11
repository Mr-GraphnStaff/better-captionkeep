#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Setup','Status','Continue')][string]$Mode = 'Setup',
    [string]$ReceiptPath,
    [Parameter(ValueFromRemainingArguments=$true)][string[]]$SetupArguments
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Find-SetupPowerShell {
    param([switch]$IncludeUnsupported)
    $candidates = @()
    $command = Get-Command pwsh.exe -CommandType Application -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
    $programDirectory = [Environment]::GetEnvironmentVariable('ProgramFiles')
    if ($programDirectory) { $candidates += (Join-Path $programDirectory 'PowerShell\7\pwsh.exe') }
    foreach ($candidate in @($candidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        try {
            $versionText = & $candidate -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion.ToString()' 2>$null
            $version = [version]([string]$versionText)
            if ($LASTEXITCODE -eq 0 -and ($version -ge [version]'7.6' -or ($IncludeUnsupported -and $version.Major -ge 7))) { return $candidate }
        } catch { continue }
    }
    return $null
}

function Request-SetupPowerShell {
    $engine = Find-SetupPowerShell
    if ($engine) { return $engine }
    $existing = Find-SetupPowerShell -IncludeUnsupported
    $action = if ($existing) { 'upgrade' } else { 'install' }
    $guide = 'https://learn.microsoft.com/powershell/scripting/install/install-powershell-on-windows'
    Write-Host 'Supported stable PowerShell 7.6 or newer is needed for Microsoft administrator setup. Windows PowerShell 5.1 remains installed.'
    Write-Host "1. $action the current Microsoft PowerShell package with Windows Package Manager (WinGet)."
    Write-Host '2. Open the official Microsoft installation guide.'
    Write-Host 'Press Enter to stop. No tenant settings have changed.'
    $choice = Read-Host 'Choose 1 or 2'
    if ($choice -eq '1') {
        $winget = Get-Command winget.exe -CommandType Application -ErrorAction SilentlyContinue
        if (-not $winget) {
            Write-Host 'WinGet is unavailable. Use option 2 on the next launch, or open:'
            Write-Host $guide
            return $null
        }
        Write-Host "Running: winget $action --id Microsoft.PowerShell --exact --source winget"
        Write-Host 'Review Microsoft installation and Windows elevation prompts before accepting.'
        & $winget.Source $action --id Microsoft.PowerShell --exact --source winget | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Host "PowerShell installation did not finish successfully. Open $guide for recovery."
            return $null
        }
        $engine = Find-SetupPowerShell
        if (-not $engine) { Write-Host 'Installation finished. Close this window and launch setup again to refresh your application paths.' }
        return $engine
    }
    if ($choice -eq '2') { Start-Process -FilePath $guide | Out-Null }
    return $null
}

function Select-SetupReceipt {
    param([string]$Path, [string]$PackageRoot, [string]$Purpose)
    if (-not $Path) {
        Write-Host "Choose the receipt.json saved by the setup you want to $Purpose."
        try {
            Add-Type -AssemblyName System.Windows.Forms
            $picker = New-Object System.Windows.Forms.OpenFileDialog
            $picker.Title = 'Choose Better CaptionKeep setup receipt'
            $picker.Filter = 'Setup receipts (receipt.json)|receipt.json|JSON files (*.json)|*.json'
            $picker.InitialDirectory = $PackageRoot
            if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $Path = $picker.FileName }
            $picker.Dispose()
        } catch { $Path = Read-Host 'Receipt path (or Enter to cancel)' }
    }
    if (-not $Path) { return $null }
    $resolved = [IO.Path]::GetFullPath($Path)
    if ([IO.Path]::GetFileName($resolved) -ine 'receipt.json' -or -not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        throw 'Choose an existing receipt.json file. Nothing was resumed or deployed.'
    }
    return $resolved
}

function Invoke-SetupChild {
    param([string]$Engine, [string[]]$Arguments)
    & $Engine @Arguments | Out-Host
    return $LASTEXITCODE
}

function Invoke-EnterpriseLauncher {
    param([string]$Mode = 'Setup', [string]$ReceiptPath, [string[]]$SetupArguments, [string]$PackageRoot = $PSScriptRoot)
    Write-Host 'Better CaptionKeep administrator setup - development pilot'
    $scriptPath = Join-Path $PackageRoot 'Enterprise-Setup.ps1'
    if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) { throw 'Setup files are missing. Extract the complete ZIP into one folder, then launch again.' }
    $arguments = @('-NoLogo','-NoProfile','-File',$scriptPath)
    if ($Mode -ne 'Setup') {
        $receipt = Select-SetupReceipt $ReceiptPath $PackageRoot $Mode.ToLowerInvariant()
        if (-not $receipt) { Write-Host 'No receipt selected. Nothing changed.'; return 2 }
        $arguments += $(if ($Mode -eq 'Status') { '-StatusReceipt' } else { '-ResumeReceipt' })
        $arguments += $receipt
    } elseif ($SetupArguments) { $arguments += $SetupArguments }
    $engine = Request-SetupPowerShell
    if (-not $engine) { return 2 }
    return Invoke-SetupChild $engine $arguments
}

if ($MyInvocation.InvocationName -ne '.') {
    try { exit (Invoke-EnterpriseLauncher -Mode $Mode -ReceiptPath $ReceiptPath -SetupArguments $SetupArguments) }
    catch { Write-Host "Setup could not continue: $($_.Exception.Message)"; exit 1 }
}
