param(
    [Parameter(Mandatory)][string]$ConfigJson,
    [ValidateSet('Install', 'Remove', 'Verify')][string]$Action = 'Install'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$config = $ConfigJson | ConvertFrom-Json
$deploymentGuid = [guid]::Empty
if ($config.browser -notin @('edge', 'chrome') -or -not [guid]::TryParse([string]$config.deploymentId,[ref]$deploymentGuid) -or
    $deploymentGuid -eq [guid]::Empty) { throw 'Invalid deployment identity.' }
$expectedExtensionId = if ($config.browser -eq 'edge') { 'edefcbdhahfolgkoamkbknjppojpaffk' } else { 'nabjdlnkkaonnbnimnmnhjcbigceebml' }
if ($config.extensionId -cne $expectedExtensionId) { throw 'Extension identity does not match the approved browser Store package.' }
if ($null -eq $config.managedPolicy -or $config.managedPolicy -isnot [pscustomobject]) { throw 'Managed settings must be an object.' }
foreach ($property in $config.managedPolicy.PSObject.Properties) {
    if ($property.Name -cnotmatch '^[A-Za-z][A-Za-z0-9_]*$') { throw 'Managed setting name is not a registry-safe policy name.' }
    if ($property.Value -is [array]) {
        if (@($property.Value | Where-Object { $_ -isnot [string] }).Count) { throw 'Managed setting arrays must contain strings.' }
    } elseif ($property.Value -isnot [string] -and $property.Value -isnot [bool] -and $property.Value -isnot [int] -and $property.Value -isnot [long]) {
        throw 'Unsupported managed setting value.'
    } elseif (($property.Value -is [int] -or $property.Value -is [long]) -and ($property.Value -lt 0 -or $property.Value -gt [uint32]::MaxValue)) {
        throw 'Managed integer setting is outside the DWORD range.'
    }
}
$browserRoot = if ($config.browser -eq 'edge') { 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' } else { 'HKLM:\SOFTWARE\Policies\Google\Chrome' }
$updateUrl = if ($config.browser -eq 'edge') { 'https://edge.microsoft.com/extensionwebstorebase/v1/crx' } else { 'https://clients2.google.com/service/update2/crx' }
$policyPath = "$browserRoot\3rdparty\extensions\$($config.extensionId)\policy"
$forcePath = "$browserRoot\ExtensionInstallForcelist"
$statePath = "HKLM:\SOFTWARE\DAF-TECH\BetterCaptionKeep\Deployments\$($config.deploymentId)\$($config.browser)"
$forceValue = "$($config.extensionId);$updateUrl"

function Test-EndpointManagementAuthority {
    $settings = Get-ItemPropertyValue -LiteralPath $browserRoot -Name ExtensionSettings -ErrorAction SilentlyContinue
    if (-not $settings) { return $true }
    try {
        $parsed = $settings | ConvertFrom-Json
        if ($parsed -isnot [pscustomobject]) { return $false }
        return -not ($parsed.PSObject.Properties.Name -contains $config.extensionId -or $parsed.PSObject.Properties.Name -contains '*')
    } catch { return $false }
}

function Test-ExpectedEndpointPolicy {
    if (-not (Test-Path -LiteralPath $policyPath)) { return $false }
    foreach ($property in $config.managedPolicy.PSObject.Properties) {
        if ($property.Value -is [array]) {
            $arrayPath = "$policyPath\$($property.Name)"
            if (-not (Test-Path -LiteralPath $arrayPath)) { return $false }
            $key = Get-Item -LiteralPath $arrayPath
            if (@($key.GetValueNames() | Where-Object { $_ -notmatch '^[1-9][0-9]*$' }).Count) { return $false }
            $names = @($key.GetValueNames() | Sort-Object { [int]$_ })
            if ($names.Count -ne $property.Value.Count) { return $false }
            for ($i=0; $i -lt $names.Count; $i++) {
                if ($names[$i] -cne [string]($i+1) -or [string]$key.GetValue($names[$i]) -cne [string]$property.Value[$i]) { return $false }
            }
        } else {
            $actual = Get-ItemPropertyValue -LiteralPath $policyPath -Name $property.Name -ErrorAction SilentlyContinue
            $expected = if ($property.Value -is [bool]) { [int]$property.Value } else { $property.Value }
            if ($null -eq $actual -or [string]$actual -cne [string]$expected) { return $false }
        }
    }
    return $true
}

function Get-BrowserInstallationEvidence {
    # Read only extension manifests in registered users' standard browser profiles.
    # File presence is an observation, not proof a running browser enabled it.
    $versions = [Collections.Generic.List[string]]::new()
    $profiles = 0; $observed = 0; $unreadable = 0
    $profileList = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList'
    if (Test-Path -LiteralPath $profileList) {
        foreach ($key in @(Get-ChildItem -LiteralPath $profileList)) {
            try {
                $keyPath = if ($key.PSObject.Properties.Name -contains 'PSPath') { $key.PSPath } else { $key.Name }
                $homePath = Get-ItemPropertyValue -LiteralPath $keyPath -Name ProfileImagePath -ErrorAction Stop
                $homePath = [Environment]::ExpandEnvironmentVariables([string]$homePath)
                $suffix = if ($config.browser -eq 'edge') { 'AppData\Local\Microsoft\Edge\User Data' } else { 'AppData\Local\Google\Chrome\User Data' }
                $dataPath = [IO.Path]::Combine($homePath,$suffix)
                if (-not [IO.Directory]::Exists($dataPath)) { continue }
                if (([IO.File]::GetAttributes($homePath) -band [IO.FileAttributes]::ReparsePoint) -or ([IO.File]::GetAttributes($dataPath) -band [IO.FileAttributes]::ReparsePoint)) { continue }
                foreach ($profile in [IO.Directory]::EnumerateDirectories($dataPath)) {
                    if ([IO.Path]::GetFileName($profile) -notmatch '^(Default|Profile [0-9]+)$') { continue }
                    if ([IO.File]::GetAttributes($profile) -band [IO.FileAttributes]::ReparsePoint) { continue }
                    $profiles++
                    $extensionPath = [IO.Path]::Combine($profile,'Extensions',$config.extensionId)
                    if (-not [IO.Directory]::Exists($extensionPath)) { continue }
                    if ([IO.File]::GetAttributes($extensionPath) -band [IO.FileAttributes]::ReparsePoint) { continue }
                    $found = $false
                    foreach ($versionPath in [IO.Directory]::EnumerateDirectories($extensionPath)) {
                        if ([IO.File]::GetAttributes($versionPath) -band [IO.FileAttributes]::ReparsePoint) { continue }
                        $manifestPath = [IO.Path]::Combine($versionPath,'manifest.json')
                        if (-not [IO.File]::Exists($manifestPath) -or ([IO.File]::GetAttributes($manifestPath) -band [IO.FileAttributes]::ReparsePoint)) { continue }
                        $manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
                        if ([string]$manifest.version -match '^[0-9]+(\.[0-9]+){0,3}$') { $versions.Add([string]$manifest.version); $found = $true }
                    }
                    if ($found) { $observed++ }
                }
            } catch { $unreadable++ }
        }
    }
    return @{versions=@($versions.ToArray() | Sort-Object -Unique);profileCount=$profiles;profilesWithExtension=$observed;unreadableProfiles=$unreadable}
}

function Write-EndpointVerification {
    $policyVerified = $false
    $forceVerified = $false
    if (Test-Path -LiteralPath $statePath) {
        $saved = Get-ItemProperty -LiteralPath $statePath
        $fields = @($saved.PSObject.Properties.Name)
        $authorityVerified = Test-EndpointManagementAuthority
        $policyVerified = $authorityVerified -and ($fields -contains 'Status') -and $saved.Status -eq 'Complete' -and ($fields -contains 'AfterPolicy') -and (Test-ExpectedEndpointPolicy) -and ((Policy-Fingerprint (Read-PolicyTree $policyPath)) -ceq $saved.AfterPolicy)
        $forceVerified = $authorityVerified -and ($fields -contains 'ForceName') -and (Get-ItemPropertyValue -LiteralPath $forcePath -Name $saved.ForceName -ErrorAction SilentlyContinue) -ceq $forceValue
    }
    $evidence = Get-BrowserInstallationEvidence
    $status = if (-not ($policyVerified -and $forceVerified)) { 'ConfigurationNotVerified' } elseif ($evidence.profilesWithExtension -gt 0) { 'ConfigurationVerifiedInstallationObserved' } else { 'ConfigurationVerifiedBrowserPending' }
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($ConfigJson))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
    $result = [ordered]@{schemaVersion=1;deploymentId=$config.deploymentId;browser=$config.browser;configurationHash=$hash;action=$Action;policyVerified=[bool]$policyVerified;forceInstallVerified=[bool]$forceVerified;installationObserved=($evidence.profilesWithExtension -gt 0);observedVersions=@($evidence.versions);profileCount=$evidence.profileCount;profilesWithExtension=$evidence.profilesWithExtension;unreadableProfiles=$evidence.unreadableProfiles;status=$status;runtimeVerified=$false;microsoft365Verified=$false}
    Write-Output ('BCK_ENDPOINT_RESULT:' + ($result | ConvertTo-Json -Depth 8 -Compress))
}

# Preserve exact registry types and values before replacing this extension's policy.
function Read-PolicyTree {
    param([string]$Root)
    $result = @()
    if (Test-Path -LiteralPath $Root) {
        $keys = @((Get-Item -LiteralPath $Root)) + @(Get-ChildItem -LiteralPath $Root -Recurse)
        foreach ($key in $keys | Sort-Object Name) {
            $values = @()
            foreach ($name in $key.GetValueNames() | Sort-Object) {
                $values += [ordered]@{name=$name; kind=[string]$key.GetValueKind($name); value=$key.GetValue($name, $null, 'DoNotExpandEnvironmentNames')}
            }
            $result += [ordered]@{relative=$key.Name.Substring($keys[0].Name.Length); values=$values}
        }
    }
    return ,$result
}
function Policy-Fingerprint {
    param($Tree)
    # JSON round-trip normalizes deserialized registry scalar/array representations.
    $json = ConvertTo-Json -InputObject @($Tree) -Depth 20 -Compress
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
}
function Restore-PolicyTree {
    param($Tree)
    if (Test-Path -LiteralPath $policyPath) { Remove-Item -LiteralPath $policyPath -Recurse -Force }
    foreach ($key in $Tree) {
        $target = $policyPath + $key.relative
        New-Item -Path $target -Force | Out-Null
        foreach ($entry in $key.values) {
            New-ItemProperty -LiteralPath $target -Name $entry.name -PropertyType $entry.kind -Value $entry.value -Force | Out-Null
        }
    }
}

if ($Action -eq 'Verify') { Write-EndpointVerification; return }

if ($Action -eq 'Remove') {
    if (-not (Test-Path -LiteralPath $statePath)) { throw 'No deployment receipt on this device; nothing will be deleted.' }
    $saved = Get-ItemProperty -LiteralPath $statePath
    if ((Policy-Fingerprint (Read-PolicyTree $policyPath)) -cne $saved.AfterPolicy) { throw 'Managed policy changed after deployment. Resolve conflict before rollback.' }
    if ($saved.CreatedForceEntry -eq 1) {
        $entry = Get-ItemPropertyValue -LiteralPath $forcePath -Name $saved.ForceName -ErrorAction Stop
        if ($entry -cne $forceValue) { throw 'Force-install entry changed; rollback stopped before modifying policy.' }
    }
    Restore-PolicyTree ([Management.Automation.PSSerializer]::Deserialize($saved.BeforePolicy))
    if ($saved.CreatedForceEntry -eq 1) { Remove-ItemProperty -LiteralPath $forcePath -Name $saved.ForceName }
    Remove-Item -LiteralPath $statePath -Recurse -Force
    Write-Output 'Deployment policy restored. Verify browser removal and local-data behavior separately.'
    return
}

if (Test-Path -LiteralPath $statePath) {
    $saved = Get-ItemProperty -LiteralPath $statePath
    if ($saved.Status -ne 'Complete') { throw 'Previous endpoint operation was interrupted. Retain its backup and investigate before retry.' }
    if ((Policy-Fingerprint (Read-PolicyTree $policyPath)) -cne $saved.AfterPolicy) { throw 'Policy drift detected; existing backup retained.' }
    $entry = Get-ItemPropertyValue -LiteralPath $forcePath -Name $saved.ForceName -ErrorAction Stop
    if ($entry -cne $forceValue) { throw 'Force-install policy drift detected.' }
    if (-not (Test-ExpectedEndpointPolicy) -or -not (Test-EndpointManagementAuthority)) { throw 'Configuration or browser management authority changed. Reconcile before retry.' }
    Write-EndpointVerification
    return
}

# An ExtensionSettings entry can override a force-install list. Stop on a per-ID
# or wildcard rule rather than silently replacing another management authority.
if (-not (Test-EndpointManagementAuthority)) { throw 'Existing ExtensionSettings may override installation. Reconcile it in Intune before deployment.' }
$forceName = $null
if (Test-Path -LiteralPath $forcePath) {
    $key = Get-Item -LiteralPath $forcePath
    foreach ($name in $key.GetValueNames()) {
        $value = [string]$key.GetValue($name)
        if ($value.Split(';')[0] -eq $config.extensionId) {
            if ($value -cne $forceValue) { throw 'A different update source already manages this extension.' }
            $forceName = $name
        }
    }
}
$createdForceEntry = $null -eq $forceName
if ($createdForceEntry) {
    $number = 1
    while ((Test-Path -LiteralPath $forcePath) -and ((Get-Item -LiteralPath $forcePath).GetValueNames() -contains [string]$number)) { $number++ }
    $forceName = [string]$number
}
$before = Read-PolicyTree $policyPath
New-Item -Path $statePath -Force | Out-Null
New-ItemProperty -LiteralPath $statePath -Name BeforePolicy -PropertyType String -Value ([Management.Automation.PSSerializer]::Serialize($before)) -Force | Out-Null
New-ItemProperty -LiteralPath $statePath -Name Status -PropertyType String -Value Pending -Force | Out-Null
New-ItemProperty -LiteralPath $statePath -Name ForceName -PropertyType String -Value $forceName -Force | Out-Null
New-ItemProperty -LiteralPath $statePath -Name CreatedForceEntry -PropertyType DWord -Value ([int]$createdForceEntry) -Force | Out-Null
try {
    if (Test-Path -LiteralPath $policyPath) { Remove-Item -LiteralPath $policyPath -Recurse -Force }
    New-Item -Path $policyPath -Force | Out-Null
    foreach ($property in $config.managedPolicy.PSObject.Properties) {
        $value = $property.Value
        if ($value -is [array]) {
            $target = "$policyPath\$($property.Name)"
            New-Item -Path $target -Force | Out-Null
            for ($i=0; $i -lt $value.Count; $i++) { New-ItemProperty -LiteralPath $target -Name ([string]($i+1)) -PropertyType String -Value $value[$i] -Force | Out-Null }
        } else {
            $kind = if ($value -is [bool] -or $value -is [int] -or $value -is [long]) { 'DWord' } else { 'String' }
            if ($value -is [bool]) { $value = [int]$value }
            New-ItemProperty -LiteralPath $policyPath -Name $property.Name -PropertyType $kind -Value $value -Force | Out-Null
        }
    }
    # Registry New-Item -Force clears existing values, unlike a directory mkdir.
    # Never recreate this shared key when other extensions already use it.
    if (-not (Test-Path -LiteralPath $forcePath)) { New-Item -Path $forcePath -Force | Out-Null }
    New-ItemProperty -LiteralPath $forcePath -Name $forceName -PropertyType String -Value $forceValue -Force | Out-Null
    New-ItemProperty -LiteralPath $statePath -Name AfterPolicy -PropertyType String -Value (Policy-Fingerprint (Read-PolicyTree $policyPath)) -Force | Out-Null
    if (-not (Test-ExpectedEndpointPolicy) -or (Get-ItemPropertyValue -LiteralPath $forcePath -Name $forceName -ErrorAction Stop) -cne $forceValue) { throw 'Endpoint configuration readback failed; backup and pending receipt retained.' }
    New-ItemProperty -LiteralPath $statePath -Name Status -PropertyType String -Value Complete -Force | Out-Null
} catch {
    # Preserve the before-image and pending state. Do not hide partial failure.
    throw
}
Write-EndpointVerification
