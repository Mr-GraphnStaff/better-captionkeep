param([Parameter(Mandatory)][string]$EndpointPath, [switch]$VerifyEndpoint, [switch]$FunctionsOnly)
# Synthetic registry provider. This harness never writes the Windows registry.
$ErrorActionPreference='Stop'
$global:registry=@{}
function Test-Path { param($LiteralPath) return $global:registry.ContainsKey($LiteralPath) }
function New-Item {
    param($Path,[switch]$Force)
    # Match Registry provider behavior: -Force on an existing key replaces it.
    if ($global:registry.ContainsKey($Path) -and -not $Force) { throw 'Registry key already exists.' }
    $global:registry[$Path]=@{}
}
function New-ItemProperty {
    param($LiteralPath,$Name,$PropertyType,$Value,[switch]$Force)
    if (-not $global:registry.ContainsKey($LiteralPath)) { throw "Missing mock key: $LiteralPath" }
    $global:registry[$LiteralPath][$Name]=@{kind=$PropertyType;value=$Value}
}
function Get-Item {
    param($LiteralPath)
    if (-not $global:registry.ContainsKey($LiteralPath)) { throw [Management.Automation.ItemNotFoundException]::new("Missing mock key: $LiteralPath") }
    $key=[pscustomobject]@{Name=$LiteralPath}
    $key | Add-Member ScriptMethod GetValueNames { return ,@($global:registry[$this.Name].Keys) }
    $key | Add-Member ScriptMethod GetValueKind { param($Name) return $global:registry[$this.Name][$Name].kind }
    $key | Add-Member ScriptMethod GetValue { param($Name,$Default,$Options) return $global:registry[$this.Name][$Name].value }
    return $key
}
function Get-ChildItem {
    param($LiteralPath,[switch]$Recurse)
    foreach ($key in @($global:registry.Keys)) { if ($key.StartsWith("$LiteralPath\")) { Get-Item $key } }
}
function Get-ItemProperty {
    param($LiteralPath)
    $result=@{}
    foreach ($name in $global:registry[$LiteralPath].Keys) { $result[$name]=$global:registry[$LiteralPath][$name].value }
    return [pscustomobject]$result
}
function Get-ItemPropertyValue {
    param($LiteralPath,$Name,$ErrorAction)
    if ($global:registry.ContainsKey($LiteralPath) -and $global:registry[$LiteralPath].ContainsKey($Name)) { return $global:registry[$LiteralPath][$Name].value }
    throw [Management.Automation.PSArgumentException]::new('Mock registry value missing (terminating even with SilentlyContinue).')
}
function Remove-Item {
    param($LiteralPath,[switch]$Recurse,[switch]$Force)
    foreach ($key in @($global:registry.Keys)) { if ($key -eq $LiteralPath -or ($Recurse -and $key.StartsWith("$LiteralPath\"))) { $global:registry.Remove($key) } }
}
function Remove-ItemProperty { param($LiteralPath,$Name) $global:registry[$LiteralPath].Remove($Name) }

if ($FunctionsOnly) { return }

$browserRoot='HKLM:\SOFTWARE\Policies\Microsoft\Edge'
$policy="$browserRoot\3rdparty\extensions\edefcbdhahfolgkoamkbknjppojpaffk\policy"
$force="$browserRoot\ExtensionInstallForcelist"
$global:registry[$policy]=@{forcePrivacyScrubber=@{kind='DWord';value=0};legacy=@{kind='String';value='restore this'}}
$global:registry["$policy\allowedAiProviders"]=@{'1'=@{kind='String';value='copilot'}}
$global:registry[$force]=@{'1'=@{kind='String';value='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa;https://example.invalid/update'}}
$config=@{browser='edge';extensionId='edefcbdhahfolgkoamkbknjppojpaffk';deploymentId='11111111-1111-4111-8111-111111111111';managedPolicy=@{forcePrivacyScrubber=$true;allowedAiProviders=@('copilot','claude')}} | ConvertTo-Json -Depth 10 -Compress
& $EndpointPath -ConfigJson $config -Action Install | Out-Null
if ($VerifyEndpoint) {
    $report = @(& $EndpointPath -ConfigJson $config -Action Verify | Where-Object { $_ -is [string] -and $_.StartsWith('BCK_ENDPOINT_RESULT:') })
    if ($report.Count -ne 1) { throw 'Missing structured verification report.' }
    $verified = $report[0].Substring('BCK_ENDPOINT_RESULT:'.Length) | ConvertFrom-Json
    if (-not $verified.policyVerified -or -not $verified.forceInstallVerified -or $verified.installationObserved -or $verified.runtimeVerified -or $verified.microsoft365Verified) { throw 'Verification overstated endpoint evidence.' }
    if ($verified.status -ne 'ConfigurationVerifiedBrowserPending' -or $verified.configurationHash -notmatch '^[a-f0-9]{64}$') { throw 'Invalid configuration verification result.' }
    $global:registry[$policy].forcePrivacyScrubber.value=0
    $drift = @(& $EndpointPath -ConfigJson $config -Action Verify | Where-Object { $_ -is [string] -and $_.StartsWith('BCK_ENDPOINT_RESULT:') })[0].Substring('BCK_ENDPOINT_RESULT:'.Length) | ConvertFrom-Json
    if ($drift.policyVerified -or $drift.status -ne 'ConfigurationNotVerified') { throw 'Read-only verification missed policy drift.' }
    $global:registry[$policy].forcePrivacyScrubber.value=1
    $global:registry[$browserRoot]=@{ExtensionSettings=@{kind='String';value='{"*":{"installation_mode":"blocked"}}'}}
    $overridden = @(& $EndpointPath -ConfigJson $config -Action Verify | Where-Object { $_ -is [string] -and $_.StartsWith('BCK_ENDPOINT_RESULT:') })[0].Substring('BCK_ENDPOINT_RESULT:'.Length) | ConvertFrom-Json
    if ($overridden.policyVerified -or $overridden.forceInstallVerified -or $overridden.status -ne 'ConfigurationNotVerified') { throw 'Verification ignored overriding browser policy.' }
    $retryBlocked=$false
    try { & $EndpointPath -ConfigJson $config -Action Install | Out-Null } catch { $retryBlocked=$true }
    if (-not $retryBlocked -or $global:registry[$browserRoot].ExtensionSettings.value -notlike '*blocked*') { throw 'Retry ignored or replaced management authority.' }
    $global:registry.Remove($browserRoot)
}
if ($global:registry[$force]['1'].value -notlike 'aaaaaaaa*') { throw 'Unrelated extension changed.' }
if ($global:registry[$policy].ContainsKey('legacy')) { throw 'Stale managed setting retained.' }
if ($global:registry[$policy].forcePrivacyScrubber.value -ne 1) { throw 'Boolean not deployed as DWORD.' }
if ($global:registry["$policy\allowedAiProviders"]['2'].value -ne 'claude') { throw 'Array policy not written.' }
# A second execution must be idempotent and retain the original backup.
& $EndpointPath -ConfigJson $config -Action Install | Out-Null
$global:registry[$policy].forcePrivacyScrubber.value=0
$conflict=$false
try { & $EndpointPath -ConfigJson $config -Action Remove | Out-Null } catch { $conflict=$true }
if (-not $conflict -or $global:registry[$force].Count -ne 2) { throw 'Rollback did not stop before changing drifted policy.' }
$global:registry[$policy].forcePrivacyScrubber.value=1
& $EndpointPath -ConfigJson $config -Action Remove | Out-Null
if ($global:registry[$policy].legacy.value -ne 'restore this' -or $global:registry[$policy].forcePrivacyScrubber.value -ne 0) { throw 'Original policy not restored.' }
if ($global:registry["$policy\allowedAiProviders"]['1'].value -ne 'copilot' -or $global:registry["$policy\allowedAiProviders"].Count -ne 1) { throw 'Original array policy not restored.' }
if ($global:registry[$force].Count -ne 1) { throw 'Own force-install entry not removed.' }
if ($VerifyEndpoint) {
    Write-Output 'RESULT:{"configurationVerified":true,"browserPending":true,"driftObserved":true,"rollbackPreserved":true}'
} else {
    Write-Output 'RESULT:{"idempotent":true,"rollback":true,"driftBlocked":true,"unrelatedPreserved":true}'
}
