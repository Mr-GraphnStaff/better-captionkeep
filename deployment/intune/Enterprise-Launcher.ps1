#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Setup','Status','Continue')][string]$Mode = 'Setup',
    [string]$ReceiptPath,
    [switch]$GuidedUi,
    [string]$OutputRoot,
    [string]$AzureSigningConfigPath,
    [ValidateSet('PlatformScripts','Win32')][string]$DeploymentTransport='PlatformScripts',
    [long]$OwnerWindowHandle=0,
    [int]$OwnerProcessId=0,
    [string]$StatusPipeName,
    [Parameter(ValueFromRemainingArguments=$true)][string[]]$SetupArguments
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Enterprise-Runtime.ps1')
. (Join-Path $PSScriptRoot 'Enterprise-Dialogs.ps1')
$script:SetupGuidedUi = [bool]$GuidedUi

function Test-SetupMicrosoftExecutable {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    # A desktop launched from PowerShell 7 can inherit its module search path.
    # Load the security module belonging to this exact Windows PowerShell host.
    Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
    $signature = Microsoft.PowerShell.Security\Get-AuthenticodeSignature -LiteralPath $Path
    return $signature.Status -eq 'Valid' -and $signature.SignerCertificate -and
        $signature.SignerCertificate.Subject -match '(^|,\s*)O=Microsoft Corporation(,|$)'
}

function Find-SetupPowerShell {
    param([switch]$IncludeUnsupported)
    $candidates = @()
    $command = Get-Command pwsh.exe -CommandType Application -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
    $programDirectory = [Environment]::GetEnvironmentVariable('ProgramFiles')
    if ($programDirectory) { $candidates += (Join-Path $programDirectory 'PowerShell\7\pwsh.exe') }
    foreach ($candidate in @($candidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        if (-not (Test-SetupMicrosoftExecutable $candidate)) { continue }
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
    Write-SetupMessage 'Supported stable PowerShell 7.6 or newer is needed for Microsoft administrator setup. Windows PowerShell 5.1 remains installed.'
    Write-SetupMessage "1. $action the current Microsoft PowerShell package with Windows Package Manager (WinGet)."
    Write-SetupMessage '2. Open the official Microsoft installation guide.'
    Write-SetupMessage 'Press Enter to stop. No tenant settings have changed.'
    $choice = Read-SetupAnswer 'Choose 1 or 2'
    if ($choice -eq '1') {
        $winget = Get-Command winget.exe -CommandType Application -ErrorAction SilentlyContinue
        if (-not $winget -or -not (Test-SetupMicrosoftExecutable $winget.Source)) {
            Write-SetupMessage 'WinGet is unavailable. Use option 2 on the next launch, or open:'
            Write-SetupMessage $guide
            return $null
        }
        Write-SetupMessage "Running: winget $action --id Microsoft.PowerShell --exact --source winget"
        Write-SetupMessage 'Review Microsoft installation and Windows elevation prompts before accepting.'
        & $winget.Source $action --id Microsoft.PowerShell --exact --source winget | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-SetupMessage "PowerShell installation did not finish successfully. Open $guide for recovery."
            return $null
        }
        $engine = Find-SetupPowerShell
        if (-not $engine) { Write-SetupMessage 'Installation finished. Close this window and launch setup again to refresh your application paths.' }
        return $engine
    }
    if ($choice -eq '2') { Start-Process -FilePath $guide | Out-Null }
    return $null
}

function Select-SetupReceipt {
    param([string]$Path, [string]$PackageRoot, [string]$Purpose)
    if (-not $Path) {
        Write-SetupMessage "Choose the receipt.json saved by the setup you want to $Purpose."
        try {
            Add-Type -AssemblyName System.Windows.Forms
            $picker = New-Object System.Windows.Forms.OpenFileDialog
            $picker.Title = 'Choose Better CaptionKeep setup receipt'
            $picker.Filter = 'Setup receipts (receipt.json)|receipt.json|JSON files (*.json)|*.json'
            $picker.InitialDirectory = $PackageRoot
            if ($picker.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $Path = $picker.FileName }
            $picker.Dispose()
        } catch { $Path = Read-SetupAnswer 'Receipt path (or Enter to cancel)' }
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
    param([string]$Mode = 'Setup', [string]$ReceiptPath, [string[]]$SetupArguments, [string]$PackageRoot = $PSScriptRoot, [switch]$GuidedUi, [string]$OutputRoot,
        [long]$OwnerWindowHandle=0,[int]$OwnerProcessId=0,[string]$StatusPipeName,[string]$AzureSigningConfigPath,[ValidateSet('PlatformScripts','Win32')][string]$DeploymentTransport='PlatformScripts')
    Write-SetupMessage 'Better CaptionKeep administrator setup - development pilot'
    $scriptPath = Join-Path $PackageRoot 'Enterprise-Setup.ps1'
    if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) { throw 'Setup files are missing. Extract the complete ZIP into one folder, then launch again.' }
    $arguments = @('-NoLogo','-NoProfile','-STA','-File',$scriptPath)
    $arguments += @('-DeploymentTransport',$DeploymentTransport)
    if ($GuidedUi) { $arguments += '-GuidedUi' }
    if ($OwnerWindowHandle -ne 0) { $arguments += @('-OwnerWindowHandle',[string]$OwnerWindowHandle,'-OwnerProcessId',[string]$OwnerProcessId) }
    if ($StatusPipeName) { $arguments += @('-StatusPipeName',$StatusPipeName) }
    if ($AzureSigningConfigPath -and $Mode -ne 'Status') {
        if (-not [IO.Path]::IsPathRooted($AzureSigningConfigPath) -or -not (Test-Path -LiteralPath $AzureSigningConfigPath -PathType Leaf)) {
            throw 'Configured Azure Artifact Signing file is missing or invalid. Local certificate fallback is disabled.'
        }
        $arguments += @('-AzureSigningConfigPath',[IO.Path]::GetFullPath($AzureSigningConfigPath))
        Write-SetupMessage 'Signing provider: Azure Artifact Signing. The existing Azure account and profile will be verified; local certificate fallback is disabled.'
    }
    if ($Mode -ne 'Setup') {
        $receipt = Select-SetupReceipt $ReceiptPath $PackageRoot $Mode.ToLowerInvariant()
        if (-not $receipt) { Write-SetupMessage 'No receipt selected. Nothing changed.'; return 2 }
        $arguments += $(if ($Mode -eq 'Status') { '-StatusReceipt' } else { '-ResumeReceipt' })
        $arguments += $receipt
    } else {
        if ($OutputRoot) {
            if (-not [IO.Path]::IsPathRooted($OutputRoot)) { throw 'Recovery records require an absolute folder path.' }
            $operationDirectory = Join-Path ([IO.Path]::GetFullPath($OutputRoot)) ([guid]::NewGuid().ToString('D'))
            $arguments += @('-OutputDirectory',$operationDirectory)
        }
        if ($SetupArguments) { $arguments += $SetupArguments }
    }
    $engine = Request-SetupPowerShell
    if (-not $engine) { return 2 }
    return Invoke-SetupChild $engine $arguments
}

if ($MyInvocation.InvocationName -ne '.') {
    try {
        Initialize-SetupRuntime -OwnerWindowHandle $OwnerWindowHandle -OwnerProcessId $OwnerProcessId -StatusPipeName $StatusPipeName
        Write-SetupStage 'preparing'
        $code = Invoke-EnterpriseLauncher -Mode $Mode -ReceiptPath $ReceiptPath -SetupArguments $SetupArguments -GuidedUi:$GuidedUi -OutputRoot $OutputRoot -OwnerWindowHandle $OwnerWindowHandle -OwnerProcessId $OwnerProcessId -StatusPipeName $StatusPipeName -AzureSigningConfigPath $AzureSigningConfigPath -DeploymentTransport $DeploymentTransport
        if ($code -eq 2) { Write-SetupStage 'canceled'; Show-SetupOutcome 'Setup was cancelled or prerequisites remain unavailable. No new deployment was started.' }
        exit $code
    }
    catch { Write-SetupStage 'failed'; Show-SetupOutcome "Setup could not continue: $($_.Exception.Message)" -Failure; exit 1 }
    finally { Close-SetupRuntime }
}
