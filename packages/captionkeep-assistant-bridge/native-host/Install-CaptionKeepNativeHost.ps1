[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Chrome', 'Edge')]
    [string[]]$Browser,

    [Parameter(Mandatory)]
    [ValidateSet('CurrentUser', 'LocalMachine')]
    [string]$Scope,

    [Parameter(Mandatory)]
    [string]$ManifestPath
)

$resolvedManifest = (Resolve-Path -LiteralPath $ManifestPath -ErrorAction Stop).Path
$manifest = Get-Content -LiteralPath $resolvedManifest -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop

if ($manifest.name -notmatch '^[a-z0-9_]+(?:\.[a-z0-9_]+)+$') {
    throw 'The native host manifest name is invalid.'
}
if ($manifest.type -ne 'stdio') {
    throw 'The native host manifest type must be stdio.'
}
if (-not $manifest.allowed_origins -or @($manifest.allowed_origins).Count -lt 1) {
    throw 'The native host manifest must allow at least one exact extension origin.'
}
foreach ($origin in @($manifest.allowed_origins)) {
    if ($origin -notmatch '^chrome-extension://[a-p]{32}/$') {
        throw "Invalid extension origin in native host manifest: $origin"
    }
}

$manifestDirectory = Split-Path -Parent $resolvedManifest
$hostPath = if ([System.IO.Path]::IsPathRooted([string]$manifest.path)) {
    [string]$manifest.path
} else {
    Join-Path $manifestDirectory ([string]$manifest.path)
}
if (-not (Test-Path -LiteralPath $hostPath -PathType Leaf)) {
    throw "The native host executable or launcher does not exist: $hostPath"
}

$hive = if ($Scope -eq 'LocalMachine') { 'HKLM:' } else { 'HKCU:' }
$vendorRoots = @{
    Chrome = 'Software\Google\Chrome\NativeMessagingHosts'
    Edge = 'Software\Microsoft\Edge\NativeMessagingHosts'
}

foreach ($browserName in $Browser) {
    $registryRoot = Join-Path $hive $vendorRoots[$browserName]
    $registryKey = Join-Path $registryRoot ([string]$manifest.name)
    if ($PSCmdlet.ShouldProcess($registryKey, "Register native host manifest $resolvedManifest")) {
        New-Item -Path $registryKey -Force -ErrorAction Stop | Out-Null
        Set-Item -LiteralPath $registryKey -Value $resolvedManifest -ErrorAction Stop
    }
}
