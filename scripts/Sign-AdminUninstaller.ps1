[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$TemporaryFilePath,
    [Parameter(Mandatory)][string]$ExpectedPublisher,
    [Parameter(Mandatory)][string]$MetadataPath,
    [Parameter(Mandatory)][string]$SignToolPath,
    [Parameter(Mandatory)][string]$DlibPath,
    [Parameter(Mandatory)][string]$ProfileResourceId,
    [switch]$CaptureOnly
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if (-not $env:AGENT_WORKING_DIR) { throw 'A managed compiler/signing run is required.' }
$working=[IO.Path]::GetFullPath($env:AGENT_WORKING_DIR).TrimEnd('\')+'\'
$source=[IO.Path]::GetFullPath($TemporaryFilePath)
if (-not $source.StartsWith($working,[StringComparison]::OrdinalIgnoreCase) -or -not [IO.File]::Exists($source) -or [IO.Path]::GetExtension($source) -notin @('.tmp','.exe')) { throw 'The uninstaller must be an ordinary managed compiler intermediate.' }
for($ancestor=$source;$ancestor;$ancestor=[IO.Path]::GetDirectoryName($ancestor)) {
    if (([IO.File]::GetAttributes($ancestor) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked uninstaller inputs are not supported.' }
}
$bytes=[IO.File]::ReadAllBytes($source)
if ($bytes.Length -lt 128 -or $bytes[0] -ne 0x4d -or $bytes[1] -ne 0x5a) { throw 'The compiler intermediate is not a PE executable.' }
$offset=[BitConverter]::ToInt32($bytes,60)
if ($offset -lt 64 -or $offset -gt ($bytes.Length-4) -or [BitConverter]::ToUInt32($bytes,$offset) -ne 0x00004550) { throw 'The compiler intermediate has no valid PE header.' }
$before=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes))
if ($CaptureOnly) {
    @{captured=$true;path=$source;sha256=$before;signingRequested=$false} | ConvertTo-Json -Compress
    exit 0
}
$operation=Join-Path $working ('uninstaller-signing-'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($operation) | Out-Null
$target=Join-Path $operation 'Uninstall.exe'
$stream=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try { $stream.Write($bytes);$stream.Flush($true) } finally { $stream.Dispose() }
$signer=Join-Path $PSScriptRoot 'Sign-AdminRelease.ps1'
# Exactly one invocation. A failure preserves the copy for inspection and stops compilation.
& $signer -FilePath $target -ExpectedPublisher $ExpectedPublisher -MetadataPath $MetadataPath -SignToolPath $SignToolPath -DlibPath $DlibPath -ProfileResourceId $ProfileResourceId
if ($LASTEXITCODE -ne 0) { throw 'Uninstaller signing failed. Inspect the preserved managed copy before an explicit retry.' }
& $signer -FilePath $target -ExpectedPublisher $ExpectedPublisher -VerifyOnly
if ($LASTEXITCODE -ne 0) { throw 'The signed uninstaller did not verify. No compiler bytes were replaced.' }
if ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([IO.File]::ReadAllBytes($source))) -cne $before) { throw 'The compiler intermediate changed during signing. No bytes were replaced.' }
$signed=[IO.File]::ReadAllBytes($target)
[IO.File]::WriteAllBytes($source,$signed)
if ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([IO.File]::ReadAllBytes($source))) -cne [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($signed))) { throw 'The compiler uninstaller copy did not verify.' }
