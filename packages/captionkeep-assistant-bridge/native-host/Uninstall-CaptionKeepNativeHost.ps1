[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Chrome', 'Edge')]
    [string[]]$Browser,

    [Parameter(Mandatory)]
    [ValidateSet('CurrentUser', 'LocalMachine')]
    [string]$Scope,

    [Parameter(Mandatory)]
    [ValidatePattern('^[a-z0-9_]+(?:\.[a-z0-9_]+)+$')]
    [string]$HostName
)

$hive = if ($Scope -eq 'LocalMachine') { 'HKLM:' } else { 'HKCU:' }
$vendorRoots = @{
    Chrome = 'Software\Google\Chrome\NativeMessagingHosts'
    Edge = 'Software\Microsoft\Edge\NativeMessagingHosts'
}

foreach ($browserName in $Browser) {
    $registryRoot = Join-Path $hive $vendorRoots[$browserName]
    $registryKey = Join-Path $registryRoot $HostName
    if ((Split-Path -Parent $registryKey) -ne $registryRoot) {
        throw 'The requested native host registry target is outside the expected browser key.'
    }
    if ((Test-Path -LiteralPath $registryKey) -and $PSCmdlet.ShouldProcess($registryKey, 'Remove native host registration')) {
        Remove-Item -LiteralPath $registryKey -Recurse -Force -ErrorAction Stop
    }
}
