#Requires -Version 7.6
[CmdletBinding()]
param(
    [string]$TenantId,
    [string]$GroupId,
    [ValidateSet('edge','chrome','both')][string]$Browser,
    [switch]$WithMicrosoft365,
    [switch]$WithoutMicrosoft365,
    [switch]$Hardened,
    [switch]$EnableSpeakerAttribution,
    [string]$SigningCertificateThumbprint,
    [string]$AzureSigningConfigPath,
    [switch]$AllowUnsignedEndpointScripts,
    [string]$OutputDirectory,
    [switch]$PlanOnly,
    [string]$ResumeReceipt,
    [string]$StatusReceipt
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-SetupScopes {
    param([bool]$Microsoft365)
    $scopes = @('GroupMember.Read.All', 'DeviceManagementScripts.ReadWrite.All')
    if ($Microsoft365) { $scopes += @('Application.ReadWrite.All', 'DelegatedPermissionGrant.ReadWrite.All') }
    return $scopes
}

function Assert-SetupGuid {
    param([string]$Value)
    $parsed = [guid]::Empty
    if (-not [guid]::TryParse($Value, [ref]$parsed) -or $parsed -eq [guid]::Empty) { throw 'A nonempty GUID is required.' }
    return $parsed.ToString()
}

function Invoke-SetupGraph {
    param([ValidateSet('GET','POST','PATCH','DELETE')][string]$Method, [string]$Path, $Body, [switch]$Beta)
    if ($Path -notmatch '^/(applications|servicePrincipals|oauth2PermissionGrants|groups|deviceManagement)(/|\?|$)') { throw 'Graph path outside setup operations.' }
    $version = if ($Beta) { 'beta' } else { 'v1.0' }
    $arguments = @{Method=$Method; Uri="https://graph.microsoft.com/$version$Path"; OutputType='Hashtable'}
    if ($null -ne $Body) { $arguments.Body = ConvertTo-Json -InputObject $Body -Depth 30 -Compress; $arguments.ContentType = 'application/json' }
    Invoke-MgGraphRequest @arguments
}

function Save-SetupReceipt {
    param($Receipt, [string]$Directory)
    # This is an operational recovery record; never serialize auth contexts/tokens.
    $destination = Join-Path $Directory 'receipt.json'
    $next = Join-Path $Directory 'receipt.next.json'
    [IO.File]::WriteAllText($next, ($Receipt | ConvertTo-Json -Depth 40), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $next -Destination $destination -Force
}

function Write-SetupStep {
    param([string]$Message)
    Write-Host "`n>> $Message" -ForegroundColor Cyan
}

function Select-SetupBrowser {
    Write-Host 'Which browsers should receive Better CaptionKeep?'
    Write-Host '1. Microsoft Edge and Google Chrome (recommended)'
    Write-Host '2. Microsoft Edge only'
    Write-Host '3. Google Chrome only'
    switch (Read-Host 'Choose 1, 2, or 3') {
        '1' { return 'both' }
        '2' { return 'edge' }
        '3' { return 'chrome' }
        default { throw 'Choose a browser option from 1 to 3. Nothing was deployed.' }
    }
}

function Require-SetupModules {
    param([string[]]$Names)
    $allowed = @('Microsoft.Graph.Authentication', 'MicrosoftTeams')
    if (@($Names | Where-Object { $_ -notin $allowed }).Count) { throw 'Unsupported setup dependency.' }
    $missing = @($Names | Where-Object { -not (Get-Module -ListAvailable -Name $_) })
    foreach ($name in @($Names | Where-Object { $_ -notin $missing })) { Import-Module $name -ErrorAction Stop }
    $updateTeams=$false
    if ('MicrosoftTeams' -in $Names -and 'MicrosoftTeams' -notin $missing) {
        $command=Get-Command Set-CsTeamsMeetingConfiguration -ErrorAction SilentlyContinue
        $updateTeams=$null -eq $command -or -not $command.Parameters.ContainsKey('EnableGraphTranscriptAccess') -or -not $command.Parameters.ContainsKey('EnableAttributedTranscripts')
    }
    $changes=@($missing)
    if ($updateTeams) { $changes+='MicrosoftTeams' }
    if ($changes.Count) {
        Write-Host "Setup needs to install/update these Microsoft PowerShell modules: $($changes -join ', ')."
        Write-Host 'They will be downloaded from the official PowerShell Gallery for your Windows user.'
        if ((Read-Host 'Type INSTALL to approve these dependencies, or Enter to stop') -cne 'INSTALL') { throw 'Dependency installation declined. No tenant resources changed.' }
        if ((Get-PSRepository -Name PSGallery).SourceLocation.TrimEnd('/') -cne 'https://www.powershellgallery.com/api/v2') { throw 'PSGallery is not the official repository. Restore it before continuing.' }
        if ($updateTeams) { Remove-Module MicrosoftTeams -Force -ErrorAction Stop }
        foreach ($name in $changes) { Install-Module -Name $name -Repository PSGallery -Scope CurrentUser -Force -ErrorAction Stop }
    }
    foreach ($name in $Names) { Import-Module $name -Force -ErrorAction Stop }
    if ('MicrosoftTeams' -in $Names) {
        $command=Get-Command Set-CsTeamsMeetingConfiguration -ErrorAction Stop
        if (-not $command.Parameters.ContainsKey('EnableGraphTranscriptAccess') -or -not $command.Parameters.ContainsKey('EnableAttributedTranscripts')) { throw 'The installed MicrosoftTeams module still lacks the required transcript settings. No tenant resources were created; use the supported module described in the setup guide.' }
    }
}

function Get-SetupCertificateProperty {
    param($Value, [string]$Name)
    if ($null -eq $Value) { return $null }
    if ($Value -is [Collections.IDictionary]) {
        if ($Value.Contains($Name)) { return $Value[$Name] }
    } else {
        $property=$Value.PSObject.Properties[$Name]
        if ($null -ne $property) { return $property.Value }
    }
    return $null
}

function Test-SetupCodeSigningCertificate {
    param($Certificate)
    $privateKey=Get-SetupCertificateProperty $Certificate 'HasPrivateKey'
    $expires=Get-SetupCertificateProperty $Certificate 'NotAfter'
    if ($privateKey -isnot [bool] -or -not $privateKey -or $expires -isnot [datetime] -or $expires -le (Get-Date)) { return $false }
    foreach ($usage in @(Get-SetupCertificateProperty $Certificate 'EnhancedKeyUsageList')) {
        $identity=$usage
        if ($identity -isnot [string] -and $identity -isnot [Security.Cryptography.Oid]) {
            $identity=Get-SetupCertificateProperty $usage 'ObjectId'
            if ($null -eq $identity) { $identity=Get-SetupCertificateProperty $usage 'Value' }
        }
        if ($identity -is [Security.Cryptography.Oid]) { $identity=$identity.Value }
        elseif ($identity -isnot [string]) { $identity=Get-SetupCertificateProperty $identity 'Value' }
        if ($identity -is [string] -and $identity -ceq '1.3.6.1.5.5.7.3.3') { return $true }
    }
    return $false
}

function Select-SetupCertificate {
    param([string]$Thumbprint, [bool]$AllowUnsigned)
    if ($AllowUnsigned) { return $null }
    if ($Thumbprint) {
        if ($Thumbprint -notmatch '^[a-fA-F0-9]{40}$') { throw 'Invalid signing certificate.' }
        $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$Thumbprint"
        if (-not (Test-SetupCodeSigningCertificate $certificate)) { throw 'Choose an unexpired code-signing certificate with its private key.' }
        return $certificate
    }
    $certificates = @(Get-ChildItem -Path Cert:\CurrentUser\My -ErrorAction SilentlyContinue | Where-Object {
        Test-SetupCodeSigningCertificate $_
    })
    Write-Host 'Choose a certificate to sign the device scripts. No thumbprint typing is needed.'
    for ($i=0; $i -lt $certificates.Count; $i++) { Write-Host "$($i+1). $($certificates[$i].Subject) (expires $($certificates[$i].NotAfter.ToString('yyyy-MM-dd')))" }
    Write-Host 'Unsigned scripts are available only as an explicitly approved pilot option.'
    $choice = Read-Host 'Certificate number, UNSIGNED for a pilot, or Enter to stop'
    if ($choice -ceq 'UNSIGNED') { return $null }
    $number = 0
    if (-not [int]::TryParse($choice, [ref]$number) -or $number -lt 1 -or $number -gt $certificates.Count) { throw 'No signing option selected. Nothing was deployed.' }
    return $certificates[$number-1]
}

function Get-SetupCollection {
    param([string]$Path, [switch]$Beta)
    $items = @()
    $next = $Path
    $version = if ($Beta) { 'beta' } else { 'v1.0' }
    $collection = ($Path -split '\?',2)[0]
    $seen = [Collections.Generic.HashSet[string]]::new()
    while ($next) {
        if (-not $seen.Add($next)) { throw 'Microsoft returned a repeated page. No uniqueness decision can be made.' }
        $page = Invoke-SetupGraph GET $next $null -Beta:$Beta
        if ($null -eq $page -or -not $page.ContainsKey('value')) { throw 'Microsoft returned an incomplete collection response.' }
        $items += @($page.value)
        if ($items.Count -gt 10000) { throw 'Too many matching resources. Narrow the deployment before continuing.' }
        $next = $null
        if ($page.ContainsKey('@odata.nextLink') -and $page['@odata.nextLink']) {
            $uri = [uri]$page['@odata.nextLink']
            if ($uri.Scheme -cne 'https' -or $uri.Host -cne 'graph.microsoft.com' -or -not $uri.IsDefaultPort -or $uri.UserInfo -or $uri.AbsolutePath -cne "/$version$collection") { throw 'Microsoft pagination left the approved collection.' }
            $next = $uri.PathAndQuery.Substring($version.Length+1)
        }
    }
    return $items
}

function Get-SetupFingerprint {
    param($Value)
    function Normalize-SetupValue($Item) {
        if ($Item -is [Collections.IDictionary]) {
            $normalized = [ordered]@{}
            foreach ($key in @($Item.Keys | Sort-Object)) { $normalized[$key] = Normalize-SetupValue $Item[$key] }
            return $normalized
        }
        if ($Item -is [array]) { return ,@($Item | ForEach-Object { Normalize-SetupValue $_ }) }
        return $Item
    }
    $json = ConvertTo-Json -InputObject (Normalize-SetupValue $Value) -Depth 35 -Compress
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($json)))
}

function Assert-SetupMicrosoftSigningTools {
    param($Config)
    $hashes=@{}
    foreach ($key in @('SignToolPath','DlibPath')) {
        $path=[string]$Config[$key]
        $expectedName=if ($key -ceq 'SignToolPath') { 'signtool.exe' } else { 'Azure.CodeSigning.Dlib.dll' }
        if (-not [IO.Path]::IsPathFullyQualified($path) -or $path.StartsWith('\\') -or
            [IO.Path]::GetFileName($path) -ine $expectedName -or -not [IO.File]::Exists($path)) { throw 'Choose an existing local official SignTool/dlib file.' }
        $signature=Get-AuthenticodeSignature -LiteralPath $path
        if ([string]$signature.Status -cne 'Valid' -or $null -eq $signature.SignerCertificate -or
            $signature.SignerCertificate.Subject -notmatch '(^|,\s*)O=Microsoft Corporation(,|$)') { throw 'Azure signing tools must have a valid Microsoft Authenticode signature.' }
        $hashes[$key]=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    }
    return $hashes
}

function Get-SetupPrivateIdentityEku {
    param([string]$Identity)
    $hex=([guid](Assert-SetupGuid $Identity)).ToString('N')
    $parts=for($index=0;$index -lt 8;$index++) { [Convert]::ToUInt16($hex.Substring($index*4,4),16).ToString() }
    return '1.3.6.1.4.1.311.97.1.3.1.'+($parts -join '.')
}

function Test-SetupPrivateIdentityEku {
    param([string]$Value)
    $prefix='1.3.6.1.4.1.311.97.1.3.1.'
    if (-not $Value.StartsWith($prefix,[StringComparison]::Ordinal)) { return $false }
    $parts=@($Value.Substring($prefix.Length) -split '\.')
    if ($parts.Count -ne 8) { return $false }
    foreach($part in $parts) { if($part -cnotmatch '^(0|[1-9][0-9]{0,4})$' -or [int]$part -gt 65535) { return $false } }
    return @($parts | Where-Object { [int]$_ -ne 0 }).Count -gt 0
}

function Read-SetupAzureSigningConfig {
    param([string]$Path)
    if (-not [IO.Path]::IsPathFullyQualified($Path) -or -not [IO.File]::Exists($Path)) { throw 'Choose an existing absolute Azure signing configuration path.' }
    $config=Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
    $keys=@('Endpoint','CodeSigningAccountName','CertificateProfileName','ExpectedTenantId','ExpectedEnhancedKeyUsages','SignToolPath','DlibPath')
    if ($config -isnot [Collections.IDictionary] -or $config.Count -ne $keys.Count -or @($config.Keys | Where-Object { $_ -cnotin $keys }).Count) { throw 'Azure signing configuration has missing or unsupported fields; credentials are not accepted.' }
    foreach ($key in @('Endpoint','CodeSigningAccountName','CertificateProfileName','ExpectedTenantId','SignToolPath','DlibPath')) {
        if ($config[$key] -isnot [string] -or [string]::IsNullOrWhiteSpace($config[$key])) { throw 'Azure signing configuration identities and paths must be nonempty strings.' }
    }
    $uri=[uri]$config.Endpoint
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -cne 'https' -or $uri.Host -cnotmatch '^[a-z][a-z0-9-]{1,15}\.codesigning\.azure\.net$' -or
        $uri.Port -ne 443 -or $uri.AbsolutePath -cne '/' -or $uri.Query -or $uri.Fragment -or $uri.UserInfo) { throw 'Azure signing requires a regional HTTPS codesigning.azure.net endpoint with no credentials, path, query, or fragment.' }
    foreach ($key in @('CodeSigningAccountName','CertificateProfileName')) {
        if ($config[$key] -isnot [string] -or $config[$key] -cnotmatch '^[a-zA-Z0-9][a-zA-Z0-9-]{1,62}$') { throw 'Invalid Azure signing account/profile name.' }
    }
    $config.ExpectedTenantId=Assert-SetupGuid $config.ExpectedTenantId
    $tenantEku=Get-SetupPrivateIdentityEku $config.ExpectedTenantId
    if ($config.ExpectedEnhancedKeyUsages -isnot [array] -or $config.ExpectedEnhancedKeyUsages.Count -lt 2 -or $config.ExpectedEnhancedKeyUsages.Count -gt 8 -or
        @($config.ExpectedEnhancedKeyUsages | Where-Object { $_ -isnot [string] -or -not (Test-SetupPrivateIdentityEku $_) }).Count -or
        @($config.ExpectedEnhancedKeyUsages | Sort-Object -Unique).Count -ne $config.ExpectedEnhancedKeyUsages.Count -or
        $tenantEku -cnotin $config.ExpectedEnhancedKeyUsages) { throw 'Private Trust signing requires the exact tenant identity EKU plus a distinct private profile GUID EKU; generic or unrelated EKUs are not accepted.' }
    $config.Endpoint=$uri.GetLeftPart([UriPartial]::Authority)
    foreach ($key in @('SignToolPath','DlibPath')) { $config[$key]=[IO.Path]::GetFullPath([string]$config[$key]) }
    $hashes=Assert-SetupMicrosoftSigningTools $config
    $identity=@{name='AzureArtifactSigning';configurationFingerprint=(Get-SetupFingerprint $config);endpoint=$config.Endpoint;
        account=$config.CodeSigningAccountName;profile=$config.CertificateProfileName;expectedTenantId=$config.ExpectedTenantId;
        expectedEnhancedKeyUsages=@($config.ExpectedEnhancedKeyUsages);toolHashes=$hashes}
    return @{config=$config;identity=$identity;configurationPath=[IO.Path]::GetFullPath($Path)}
}

function Invoke-SetupAzureCli {
    param([string[]]$Arguments)
    $command=Get-Command az -CommandType Application -ErrorAction Stop
    $output=@(& $command.Source @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'Azure CLI identity lookup failed. Sign in to the approved tenant/account before continuing.' }
    return ($output -join "`n") | ConvertFrom-Json -AsHashtable
}

function Assert-SetupAzureSigningIdentity {
    param($Provider, $GraphContext)
    $account=Invoke-SetupAzureCli @('account','show','--output','json','--only-show-errors')
    if ($account.tenantId -ine $Provider.config.ExpectedTenantId -or $GraphContext.TenantId -ine $Provider.config.ExpectedTenantId -or
        $account.environmentName -cne 'AzureCloud' -or $account.user.type -cne 'user' -or
        -not $GraphContext.Account -or $account.user.name -ine $GraphContext.Account) { throw 'Azure CLI tenant/account must match the Microsoft Graph administrator approving this deployment.' }
}

function Assert-SetupAzureSignedFile {
    param([string]$Path, $Provider)
    $signature=Get-AuthenticodeSignature -LiteralPath $Path
    if ([string]$signature.Status -cne 'Valid' -or $null -eq $signature.SignerCertificate -or $null -eq $signature.TimeStamperCertificate) { throw 'Azure signed file must have a valid trusted Authenticode signature and timestamp. No unsigned fallback is allowed.' }
    $usages=@()
    foreach ($usage in @(Get-SetupCertificateProperty $signature.SignerCertificate 'EnhancedKeyUsageList')) {
        $oid=$usage
        if ($oid -isnot [string] -and $oid -isnot [Security.Cryptography.Oid]) { $oid=Get-SetupCertificateProperty $usage 'ObjectId'; if ($null -eq $oid) { $oid=Get-SetupCertificateProperty $usage 'Value' } }
        if ($oid -is [Security.Cryptography.Oid]) { $oid=$oid.Value }
        elseif ($oid -isnot [string]) { $oid=Get-SetupCertificateProperty $oid 'Value' }
        if ($oid -is [string]) { $usages+=$oid }
    }
    foreach ($expected in @('1.3.6.1.5.5.7.3.3')+@($Provider.config.ExpectedEnhancedKeyUsages)) {
        if ($expected -cnotin $usages) { throw 'Azure signed file does not match the expected service/profile EKUs.' }
    }
    return $signature
}

function Invoke-SetupSignTool {
    param([string]$Path, [string[]]$Arguments)
    $output=@(& $Path @Arguments 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'Azure Artifact Signing failed. Preserve the receipt and signed/partial file; no automatic signing retry or fallback was performed.' }
}

function Invoke-SetupAzureSign {
    param([string]$Path, $Provider, $GraphContext, $Receipt, [string]$Directory)
    $operation='AzureSign-'+[IO.Path]::GetFileName($Path)
    $prior=if ($Receipt.operations.ContainsKey($operation)) { $Receipt.operations[$operation] } else { $null }
    if ($prior) {
        if ($prior.providerFingerprint -cne $Provider.identity.configurationFingerprint) { throw 'The original Azure signing provider changed. No signing request was repeated.' }
        if ($prior.state -cnotin @('Confirmed','Reconciled') -or -not $prior.signedHash -or -not [IO.File]::Exists($Path) -or
            (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -cne $prior.signedHash) { throw 'The prior Azure signing operation is ambiguous or its reviewed file changed. Preserve the receipt and reconcile the original operation; no signing request was repeated.' }
        Assert-SetupAzureSignedFile $Path $Provider | Out-Null
        $prior.state='Reconciled';$prior.signedHash=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
        $Receipt.pendingOperation=$null;Save-SetupReceipt $Receipt $Directory
        return
    }
    Assert-SetupAzureSigningIdentity $Provider $GraphContext
    $hashes=Assert-SetupMicrosoftSigningTools $Provider.config
    if ((Get-SetupFingerprint $hashes) -cne (Get-SetupFingerprint $Provider.identity.toolHashes)) { throw 'Azure signing tools changed after plan approval.' }
    $metadata=@{Endpoint=$Provider.config.Endpoint;CodeSigningAccountName=$Provider.config.CodeSigningAccountName;
        CertificateProfileName=$Provider.config.CertificateProfileName;CorrelationId=$Receipt.plan.deploymentId;
        ExcludeCredentials=@('EnvironmentCredential','WorkloadIdentityCredential','ManagedIdentityCredential','SharedTokenCacheCredential',
            'VisualStudioCredential','VisualStudioCodeCredential','AzurePowerShellCredential','AzureDeveloperCliCredential','InteractiveBrowserCredential','BrokerCredential')}
    $metadataPath=Join-Path $Directory 'azure-signing-metadata.json'
    [IO.File]::WriteAllText($metadataPath,($metadata | ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
    $Receipt.operations[$operation]=@{state='Pending';providerFingerprint=$Provider.identity.configurationFingerprint;unsignedHash=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash;signedHash=$null}
    $Receipt.pendingOperation=$operation;Save-SetupReceipt $Receipt $Directory
    try {
        Invoke-SetupSignTool $Provider.config.SignToolPath @('sign','/fd','SHA256','/tr','http://timestamp.acs.microsoft.com','/td','SHA256','/dlib',$Provider.config.DlibPath,'/dmdf',$metadataPath,$Path)
        Assert-SetupAzureSignedFile $Path $Provider | Out-Null
        $Receipt.operations[$operation].state='Confirmed';$Receipt.operations[$operation].signedHash=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
        $Receipt.pendingOperation=$null;Save-SetupReceipt $Receipt $Directory
    } catch {
        $Receipt.operations[$operation].state='Ambiguous';Save-SetupReceipt $Receipt $Directory
        throw
    }
}

function Get-SetupApplicationFingerprint {
    param($Application)
    $resources=@($Application.requiredResourceAccess | ForEach-Object {
        @{resourceAppId=$_.resourceAppId;resourceAccess=@($_.resourceAccess | ForEach-Object { @{id=$_.id;type=$_.type} } | Sort-Object { $_.id })}
    } | Sort-Object { $_.resourceAppId })
    return Get-SetupFingerprint @{displayName=$Application.displayName;notes=$Application.notes;signInAudience=$Application.signInAudience;
        spa=@{redirectUris=@($Application.spa.redirectUris | Sort-Object)};requiredResourceAccess=$resources}
}

function Invoke-RecordedSetupCreate {
    param($Receipt, [string]$Directory, [string]$Name, $Body, [scriptblock]$Find, [scriptblock]$Matches, [scriptblock]$Create)
    $fingerprint = Get-SetupFingerprint $Body
    $prior = if ($Receipt.operations.ContainsKey($Name)) { $Receipt.operations[$Name] } else { $null }
    if ($prior -and $prior.requestFingerprint -cne $fingerprint) { throw "The approved request for $Name changed. Reconcile the receipt before continuing." }
    $found = @(& $Find)
    if ($prior) {
        $matching = @($found | Where-Object { & $Matches $_ })
        if ($found.Count -ne 1 -or $matching.Count -ne 1) { throw "Cannot safely reconcile $Name. A lost response may be eventually consistent; no POST was repeated. Keep the receipt and check again later." }
        if ($prior.ContainsKey('resourceId') -and $prior.resourceId -and $prior.resourceId -cne [string]$matching[0].id) { throw "The recorded resource for $Name differs from Microsoft. No changes made." }
        $prior.state='Reconciled'; $prior.resourceId=[string]$matching[0].id
        $Receipt.pendingOperation=$null; Save-SetupReceipt $Receipt $Directory
        return $matching[0]
    }
    if ($found.Count) { throw "Unexpected existing resource for $Name. No resource was adopted or overwritten." }
    $Receipt.operations[$Name]=@{state='Pending'; requestFingerprint=$fingerprint; operationId=[guid]::NewGuid().ToString(); resourceId=$null}
    $Receipt.pendingOperation=$Name; Save-SetupReceipt $Receipt $Directory
    try {
        $created = & $Create $Body
        if ($null -eq $created -or -not $created.id) { throw 'Microsoft did not return a resource identity.' }
        $Receipt.operations[$Name].resourceId=[string]$created.id
        $Receipt.operations[$Name].state='Confirmed'; $Receipt.pendingOperation=$null
        Save-SetupReceipt $Receipt $Directory
        return $created
    } catch {
        $Receipt.operations[$Name].state='Ambiguous'; Save-SetupReceipt $Receipt $Directory
        throw
    }
}

function Read-EnterpriseReceipt {
    param([string]$Path)
    if ([IO.Path]::GetFileName($Path) -ine 'receipt.json') { throw 'Choose the original receipt.json, not a renamed backup. No receipt was overwritten.' }
    if (-not [IO.File]::Exists($Path)) { throw 'Choose the receipt.json saved by this setup.' }
    $receipt = Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
    if (-not $receipt.ContainsKey('version') -or $receipt.version -ne 2) { throw 'This older receipt can be reviewed manually; automatic continuation requires a version 2 receipt.' }
    Assert-SetupGuid $receipt.plan.deploymentId | Out-Null
    Assert-SetupGuid $receipt.plan.tenantId | Out-Null
    Assert-SetupGuid $receipt.plan.groupId | Out-Null
    if (-not @($receipt.plan.browsers).Count -or @($receipt.plan.browsers | Where-Object { $_ -cnotin @('edge','chrome') }).Count) { throw 'Receipt has an unsupported browser.' }
    return $receipt
}

function Get-EnterpriseDeliveryStatus {
    param($Receipt)
    $devices = @()
    foreach ($script in $Receipt.scripts) {
        if (-not $script.id) { continue }
        $id = Assert-SetupGuid $script.id
        $source = Invoke-SetupGraph GET "/deviceManagement/deviceManagementScripts/$id" $null -Beta
        $sourceVerified=$false
        if ($source -and $source.ContainsKey('scriptContent') -and $source.scriptContent) {
            try {
                $sourceHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Convert]::FromBase64String([string]$source.scriptContent)))
                $sourceVerified=$sourceHash -ceq $script.installHash
            } catch { $sourceVerified=$false }
        }
        $states = @(Get-SetupCollection "/deviceManagement/deviceManagementScripts/$id/deviceRunStates?`$expand=managedDevice" -Beta)
        foreach ($state in $states) {
            $runState = [string]$state.runState
            $status = switch ($runState) { 'success' { 'ScriptSucceeded' } 'fail' { 'Failed' } 'scriptError' { 'Failed' } default { 'Pending' } }
            $device = if ($state.ContainsKey('managedDevice') -and $state.managedDevice -and $state.managedDevice.ContainsKey('deviceName')) { [string]$state.managedDevice.deviceName } else { 'Device name not reported' }
            $deviceId=if ($state.ContainsKey('managedDevice') -and $state.managedDevice -and $state.managedDevice.ContainsKey('id')) { [string]$state.managedDevice.id } else { $null }
            $endpoint=$null
            if ($status -ceq 'ScriptSucceeded' -and $sourceVerified -and $state.ContainsKey('resultMessage')) {
                $lines=@(([string]$state.resultMessage -split '\r?\n') | Where-Object { $_.StartsWith('BCK_ENDPOINT_RESULT:') })
                if ($lines.Count -eq 1) {
                    try {
                        $parsed=$lines[0].Substring('BCK_ENDPOINT_RESULT:'.Length) | ConvertFrom-Json -AsHashtable
                        if ($parsed.schemaVersion -eq 1 -and $parsed.deploymentId -ceq $Receipt.plan.deploymentId -and $parsed.browser -ceq $script.browser -and
                            [string]$parsed.configurationHash -cmatch '^[a-fA-F0-9]{64}$' -and [string]$script.configurationHash -cmatch '^[a-fA-F0-9]{64}$' -and
                            ([string]$parsed.configurationHash).ToLowerInvariant() -ceq ([string]$script.configurationHash).ToLowerInvariant() -and $parsed.action -ceq 'Install' -and
                            $parsed.policyVerified -is [bool] -and $parsed.forceInstallVerified -is [bool] -and $parsed.installationObserved -is [bool]) {
                            $endpoint=@{policyVerified=$parsed.policyVerified;forceInstallVerified=$parsed.forceInstallVerified;installationObserved=$parsed.installationObserved}
                            if ($parsed.policyVerified -and $parsed.forceInstallVerified) {
                                $status=if ($parsed.installationObserved) { 'ConfigurationVerifiedInstallationObserved' } else { 'ConfigurationVerifiedBrowserPending' }
                            } else {
                                $status='ConfigurationNotVerified'
                            }
                        }
                    } catch { $endpoint=$null }
                }
            }
            $devices += @{browser=$script.browser; device=$device;deviceId=$deviceId;stateId=[string]$state.id; status=$status; runState=$runState;
                sourceVerified=$sourceVerified;endpoint=$endpoint;
                lastUpdate=$(if ($state.ContainsKey('lastStateUpdateDateTime')) { [string]$state.lastStateUpdateDateTime } else { '' });
                errorCode=$(if ($state.ContainsKey('errorCode')) { $state.errorCode } else { $null });
                errorDescription=$(if ($status -eq 'Failed') { 'The device reported a script error. Review its Intune execution log with administrator permissions.' } else { '' }); browserVerified=$false}
        }
    }
    return @{checkedAt=[DateTimeOffset]::UtcNow.ToString('o'); devices=$devices; reports=$devices.Count;reportingDevices=@($devices | ForEach-Object { $_.deviceId } | Where-Object { $_ } | Sort-Object -Unique).Count;
        succeeded=@($devices | Where-Object runState -eq 'success').Count; failed=@($devices | Where-Object status -eq 'Failed').Count;
        configurationVerified=@($devices | Where-Object { $_.endpoint -and $_.endpoint.policyVerified -and $_.endpoint.forceInstallVerified }).Count;
        configurationNotVerified=@($devices | Where-Object status -eq 'ConfigurationNotVerified').Count;
        installationObserved=@($devices | Where-Object { $_.endpoint -and $_.endpoint.installationObserved }).Count;
        pending=@($devices | Where-Object status -eq 'Pending').Count; browserVerification='NotEstablished'; microsoft365Verification='NotEstablished';
        note='Script success is not browser installation or Microsoft 365 acceptance. Devices without a report may still be waiting for Intune check-in.'}
}

function Show-EnterpriseDeliveryStatus {
    param($Report, [string]$Directory)
    Write-SetupStep 'Delivery status'
    Write-Host "Device/browser reports: $($Report.reports); identified devices: $($Report.reportingDevices); script success: $($Report.succeeded); failed: $($Report.failed); pending: $($Report.pending); configuration not verified: $($Report.configurationNotVerified)."
    foreach ($device in $Report.devices) {
        $last=if ($device.lastUpdate) { $device.lastUpdate } else { 'time not reported' }
        Write-Host "  $($device.device) / $($device.browser): $($device.status) (last report: $last)"
    }
    if (-not $Report.reports) { Write-Host 'Waiting for the first Intune device check-in. Check Status later; do not deploy a second copy.' }
    Write-Host $Report.note
    Write-Host "Recovery receipt and results: $Directory"
}

function New-EndpointPayload {
    param($Config, [string]$Template, [ValidateSet('Install','Remove')][string]$Action, [string]$ConfigJson)
    $json = if ($ConfigJson) { $ConfigJson } else { ConvertTo-Json -InputObject $Config -Depth 20 -Compress }
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
    return "& {`n$Template`n} -ConfigJson ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$encoded'))) -Action '$Action'`n"
}

function New-IntuneScriptBody {
    param([string]$Name, [string]$Script, [bool]$Signed, [byte[]]$ScriptBytes)
    if ($null -eq $ScriptBytes) { $ScriptBytes=[Text.Encoding]::UTF8.GetBytes($Script) }
    return @{
        '@odata.type'='#microsoft.graph.deviceManagementScript'
        displayName=$Name; description='Better CaptionKeep Store installation and managed settings; verify endpoint results.'
        fileName='Better-CaptionKeep.ps1'; scriptContent=[Convert]::ToBase64String($ScriptBytes)
        runAsAccount='system'; runAs32Bit=$false; enforceSignatureCheck=$Signed
    }
}

function Assert-ManagedSetupPolicy {
    param($Policy, $Schema)
    foreach ($key in $Policy.Keys) {
        if (-not $Schema.properties.Contains($key)) { throw "Unknown managed policy: $key" }
        $definition = $Schema.properties[$key]
        $value = $Policy[$key]
        switch ($definition.type) {
            'boolean' { if ($value -isnot [bool]) { throw "Invalid boolean: $key" } }
            'string' { if ($value -isnot [string]) { throw "Invalid string: $key" } }
            'integer' { if (($value -isnot [int] -and $value -isnot [long]) -or $value -lt $definition.minimum -or $value -gt $definition.maximum) { throw "Invalid integer: $key" } }
            'array' { if ($value -isnot [array] -or @($value | Where-Object { $_ -isnot [string] }).Count) { throw "Invalid array: $key" } }
            default { throw "Unsupported policy type: $key" }
        }
    }
}

function New-GroupAssignment {
    param([string]$Id)
    $validated = Assert-SetupGuid $Id
    return @{deviceManagementScriptGroupAssignments=@(@{'@odata.type'='#microsoft.graph.deviceManagementScriptGroupAssignment'; targetGroupId=$validated})}
}

function Select-DeploymentGroup {
    param([string]$Id)
    if ($Id) {
        $validated = Assert-SetupGuid $Id
        return Invoke-SetupGraph GET "/groups/${validated}?`$select=id,displayName,securityEnabled" $null
    }
    $prefix = (Read-Host 'Deployment group name begins with').Trim()
    if (-not $prefix) { throw 'A group name is required. There is no All Users or All Devices default.' }
    $filter = [Uri]::EscapeDataString("startswith(displayName,'$($prefix.Replace("'","''"))')")
    $response = Invoke-SetupGraph GET "/groups?`$filter=$filter&`$select=id,displayName,securityEnabled&`$top=100" $null
    $groups = @($response.value)
    if (-not $groups.Count) { throw 'No matching group. No group was created or modified.' }
    if ($response.ContainsKey('@odata.nextLink')) { throw 'Too many groups match. Use a more specific name or an exact GroupId.' }
    for ($i=0; $i -lt $groups.Count; $i++) { Write-Host "$($i+1). $($groups[$i].displayName) [$($groups[$i].id)]" }
    $selection = 0
    if (-not [int]::TryParse((Read-Host 'Group number'), [ref]$selection) -or $selection -lt 1 -or $selection -gt $groups.Count) { throw 'Invalid group selection.' }
    return $groups[$selection-1]
}

function Invoke-EnterpriseSetup {
    param($Options, [string]$PackageRoot)
    $defaults = @{TenantId='';GroupId='';Browser='';WithMicrosoft365=$false;WithoutMicrosoft365=$false;Hardened=$false;EnableSpeakerAttribution=$false;SigningCertificateThumbprint='';AzureSigningConfigPath='';AllowUnsignedEndpointScripts=$false;OutputDirectory='';PlanOnly=$false;ResumeReceipt='';StatusReceipt=''}
    foreach ($key in $defaults.Keys) { if (-not $Options.ContainsKey($key)) { $Options[$key]=$defaults[$key] } }
    if ($Options.ResumeReceipt -and $Options.StatusReceipt) { throw 'Choose Continue or Check Status, not both.' }
    $existing = $null
    $statusOnly = [bool]$Options.StatusReceipt
    $receiptPath = if ($statusOnly) { $Options.StatusReceipt } else { $Options.ResumeReceipt }
    if ($receiptPath) {
        $receiptPath = [IO.Path]::GetFullPath($receiptPath)
        $existing = Read-EnterpriseReceipt $receiptPath
        $Options.TenantId=$existing.plan.tenantId; $Options.GroupId=$existing.plan.groupId
        $Options.Browser=if (@($existing.plan.browsers).Count -eq 2) { 'both' } else { $existing.plan.browsers[0] }
        $Options.WithMicrosoft365=[bool]$existing.plan.microsoft365; $Options.WithoutMicrosoft365=-not $Options.WithMicrosoft365
        $Options.EnableSpeakerAttribution=[bool]$existing.plan.enableGlobalSpeakerAttribution
        $Options.AllowUnsignedEndpointScripts=-not [bool]$existing.plan.signedEndpointScripts
        $Options.SigningCertificateThumbprint=[string]$existing.plan.signingCertificateThumbprint
        $savedAzure=$existing.plan.ContainsKey('signingProvider') -and $existing.plan.signingProvider.name -ceq 'AzureArtifactSigning'
        if ($savedAzure -and -not $Options.AzureSigningConfigPath) { $Options.AzureSigningConfigPath=[string]$existing.plan.azureSigningConfigPath }
        if (-not $statusOnly -and -not $savedAzure -and $Options.AzureSigningConfigPath) { throw 'Continuation must retain the originally approved signing provider.' }
        $Options.OutputDirectory=Split-Path -Parent $receiptPath
        Write-SetupStep $(if ($statusOnly) { 'Check an existing deployment' } else { 'Continue an existing deployment safely' })
        Write-Host "Using saved deployment $($existing.plan.deploymentId). Existing resource identities will be reconciled before any write."
    }
    if (-not $Options.Browser) { $Options.Browser=Select-SetupBrowser }
    if ($Options.WithMicrosoft365 -and $Options.WithoutMicrosoft365) { throw 'Choose with or without Microsoft 365, not both.' }
    if (-not $Options.WithMicrosoft365 -and -not $Options.WithoutMicrosoft365) {
        Write-Host '1. Install the extension and set up Microsoft 365 transcript access'
        Write-Host '2. Install the extension only'
        $choice = Read-Host 'Microsoft 365 option: choose 1 or 2'
        if ($choice -cnotin @('1','2')) { throw 'Choose Microsoft 365 option 1 or 2.' }
        $Options.WithMicrosoft365 = $choice -eq '1'
    }
    $m365 = [bool]$Options.WithMicrosoft365
    if ($Options.EnableSpeakerAttribution -and -not $m365) { throw 'Speaker attribution requires Microsoft 365 setup.' }
    $scopes = if ($statusOnly) { @('DeviceManagementScripts.Read.All') } else { @(Get-SetupScopes $m365) }
    $browsers = if ($Options.Browser -eq 'both') { @('edge','chrome') } else { @($Options.Browser) }
    if ($Options.PlanOnly) {
        return @{mode='OfflinePlan'; browsers=$browsers; microsoft365=$m365; scopes=$scopes; tenant=$Options.TenantId; group=$Options.GroupId; cloudWrites=$false; betaApis=@('Intune deviceManagementScripts'); endpointContext='SYSTEM'}
    }
    $schema = Get-Content -LiteralPath (Join-Path $PackageRoot 'managed-schema.json') -Raw | ConvertFrom-Json -AsHashtable
    if (-not $statusOnly -and $Options.AzureSigningConfigPath -and ($Options.SigningCertificateThumbprint -or $Options.AllowUnsignedEndpointScripts)) { throw 'Choose Azure signing or a local certificate/unsigned pilot, not multiple providers.' }
    $approvedPolicies = @{}
    foreach ($browserName in $browsers) {
        $profileFile = if ($Options.Hardened) { 'profile.local-only.json' } elseif ($browserName -eq 'edge') { 'profile.json' } else { 'profile.chrome.json' }
        $profile = Get-Content -LiteralPath (Join-Path $PackageRoot $profileFile) -Raw | ConvertFrom-Json -AsHashtable
        Assert-ManagedSetupPolicy $profile.managedPolicy $schema
        $approvedPolicies[$browserName]=if ($existing) { $existing.plan.baseManagedPolicies[$browserName] } else { $profile.managedPolicy }
        Assert-ManagedSetupPolicy $approvedPolicies[$browserName] $schema
    }
    $templatePath = Join-Path $PackageRoot 'Enterprise-Endpoint.ps1'
    $template = Get-Content -LiteralPath $templatePath -Raw
    $templateHash = (Get-FileHash -LiteralPath $templatePath -Algorithm SHA256).Hash
    if ($existing -and -not $statusOnly -and $existing.plan.endpointTemplateHash -cne $templateHash) { throw 'The device template differs from the approved receipt. Continue using the original setup package; no scripts were changed.' }
    if (-not $Options.TenantId) { $Options.TenantId = Read-Host 'Organization tenant ID or verified Microsoft tenant domain' }
    if ($Options.TenantId -notmatch '^([a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}|[0-9a-fA-F-]{36})$') { throw 'Invalid tenant ID or domain.' }
    Write-SetupStep 'Prepare Microsoft sign-in'
    Write-Host 'Read SECURITY-AND-PERMISSIONS.md before approving. This setup requires an Intune-licensed tenant and administrator permissions.'
    Write-Host 'Provisioning uses Microsoft Graph PowerShell, separate from the employee transcript app.'
    Write-Host "Requested administrative scopes: $($scopes -join ', ')"
    Write-Host 'These permissions have broader reach than this deployment. Intune scripts run as SYSTEM.'
    $modules=@('Microsoft.Graph.Authentication')
    if ($m365 -and -not $statusOnly) { $modules+='MicrosoftTeams' }
    Require-SetupModules $modules
    $teamsConnected = $false
    $graphConnected = $false
    $receipt = $existing
    $directory = if ($existing) { [IO.Path]::GetFullPath($Options.OutputDirectory) } else { $null }
    try {
        Connect-MgGraph -TenantId $Options.TenantId -Scopes $scopes -ContextScope Process -NoWelcome
        $graphConnected = $true
        $context = Get-MgContext
        if ($context.Environment -ne 'Global' -or $context.AuthType -ne 'Delegated') { throw 'This pilot supports delegated sign-in to the commercial Microsoft cloud only.' }
        $tenant = Assert-SetupGuid $context.TenantId
        $expectedGuid = [guid]::Empty
        if ([guid]::TryParse($Options.TenantId, [ref]$expectedGuid) -and $tenant -ne $expectedGuid.ToString()) { throw 'Signed-in tenant does not match requested tenant.' }
        if ($statusOnly) {
            $report = Get-EnterpriseDeliveryStatus $receipt
            $receipt.delivery=$report; Save-SetupReceipt $receipt $Options.OutputDirectory
            Show-EnterpriseDeliveryStatus $report $Options.OutputDirectory
            return $receipt
        }
        $group = Select-DeploymentGroup $Options.GroupId
        $groupId = Assert-SetupGuid $group.id
        if (-not $group.securityEnabled) { throw 'Choose an existing security group for this deployment.' }
        $graphService = $null
        $delegatedScopes = @('Calendars.ReadBasic','OnlineMeetings.Read','OnlineMeetingTranscript.Read.All','openid','profile','offline_access')
        $resourceAccess = @()
        $teamsBefore = $null
        if ($m365) {
            $response = Invoke-SetupGraph GET '/servicePrincipals?$filter=appId%20eq%20%2700000003-0000-0000-c000-000000000000%27' $null
            if (@($response.value).Count -ne 1) { throw 'Unable to identify the Microsoft Graph service principal.' }
            $graphService = $response.value[0]
            foreach ($scope in $delegatedScopes) {
                $permission = @($graphService.oauth2PermissionScopes | Where-Object { $_.value -eq $scope -and $_.isEnabled })
                if ($permission.Count -ne 1) { throw "Graph permission not resolved: $scope" }
                $resourceAccess += @{id=$permission[0].id; type='Scope'}
            }
            Connect-MicrosoftTeams -TenantId $tenant | Out-Null
            $teamsConnected = $true
            $current = Get-CsTeamsMeetingConfiguration -Identity Global
            if ($null -eq $current) { throw 'Teams did not return meeting configuration.' }
            if ($current -is [Collections.IDictionary]) {
                if (-not $current.Contains('EnableGraphTranscriptAccess') -or -not $current.Contains('EnableAttributedTranscripts')) { throw 'Update the MicrosoftTeams module: transcript access settings are unavailable.' }
            } elseif (-not $current.PSObject.Properties['EnableGraphTranscriptAccess'] -or -not $current.PSObject.Properties['EnableAttributedTranscripts']) { throw 'Update the MicrosoftTeams module: transcript access settings are unavailable.' }
            $setTeams=Get-Command Set-CsTeamsMeetingConfiguration -ErrorAction Stop
            if (-not $setTeams.Parameters.ContainsKey('EnableGraphTranscriptAccess') -or ($Options.EnableSpeakerAttribution -and -not $setTeams.Parameters.ContainsKey('EnableAttributedTranscripts'))) { throw 'Update the MicrosoftTeams module: required transcript settings cannot be configured.' }
            $teamsBefore = if ($existing) { $existing.plan.teamsBefore } else { @{EnableGraphTranscriptAccess=[bool]$current.EnableGraphTranscriptAccess; EnableAttributedTranscripts=[bool]$current.EnableAttributedTranscripts} }
        }
        $needsScriptGeneration = -not $existing
        if ($existing) {
            $needsScriptGeneration = @($browsers | Where-Object {
                $browserName=$_
                @($existing.scripts | Where-Object browser -eq $browserName).Count -eq 0
            }).Count -gt 0
        }
        $certificate = $null
        $azureProvider = $null
        if ($needsScriptGeneration) {
            if ($Options.AzureSigningConfigPath) {
                $azureProvider=Read-SetupAzureSigningConfig $Options.AzureSigningConfigPath
                Assert-SetupAzureSigningIdentity $azureProvider $context
                if ($existing -and (Get-SetupFingerprint $existing.plan.signingProvider) -cne (Get-SetupFingerprint $azureProvider.identity)) { throw 'Azure signing configuration/provider differs from the immutable approved plan.' }
            } else {
                $certificate = Select-SetupCertificate $Options.SigningCertificateThumbprint ([bool]$Options.AllowUnsignedEndpointScripts)
            }
            if ($existing -and $existing.plan.signedEndpointScripts -and $null -eq $certificate -and $null -eq $azureProvider) { throw 'This signed deployment needs its original signing provider only to generate missing scripts. Its signing policy cannot be downgraded.' }
        }
        $deploymentId = if ($existing) { $existing.plan.deploymentId } else { [guid]::NewGuid().ToString() }
        $directory = if ($Options.OutputDirectory) { [IO.Path]::GetFullPath($Options.OutputDirectory) } else { Join-Path $PackageRoot "receipts/$deploymentId" }
        $Options.OutputDirectory=$directory
        if (-not $existing -and (Test-Path -LiteralPath $directory)) { throw 'Output directory already exists. Choose Continue Setup and its receipt instead of deploying another copy.' }
        $plan = if ($existing) { $existing.plan } else { [ordered]@{deploymentId=$deploymentId; tenantId=$tenant; account=$context.Account; groupName=$group.displayName; groupId=$groupId; browsers=$browsers; microsoft365=$m365; signedEndpointScripts=($null -ne $certificate -or $null -ne $azureProvider); signingCertificateThumbprint=$(if ($certificate) { $certificate.Thumbprint } else { '' }); outputDirectory=$directory; teamsBefore=$teamsBefore; enableGlobalTranscriptApi=$m365; enableGlobalSpeakerAttribution=[bool]$Options.EnableSpeakerAttribution; administrativeScopes=$scopes; baseManagedPolicies=$approvedPolicies; endpointTemplateHash=$templateHash; employeeScopes=$(if ($m365) { $delegatedScopes } else { @() })} }
        if (-not $existing -and $azureProvider) { $plan.signingProvider=$azureProvider.identity; $plan.azureSigningConfigPath=$azureProvider.configurationPath }
        Write-SetupStep 'Review the deployment plan'
        Write-Host "Tenant: $tenant"
        Write-Host "Signed in as: $($context.Account)"
        Write-Host "Deployment group: $($group.displayName) [$groupId]"
        Write-Host "Browsers: $($browsers -join ', '); Microsoft 365 transcript setup: $m365; signed device scripts: $($plan.signedEndpointScripts)."
        if ($azureProvider) {
            Write-Host "Azure Artifact Signing: account $($azureProvider.identity.account), profile $($azureProvider.identity.profile), endpoint $($azureProvider.identity.endpoint)."
            Write-Host 'Approval includes signing each generated install/removal script through this Azure service. Signing requests may be billable; failures are not automatically retried.'
        }
        Write-Host "Recovery receipt will be saved in: $directory"
        if ($m365) {
            $attributionAfter=if ($Options.EnableSpeakerAttribution) { $true } else { [bool]$teamsBefore.EnableAttributedTranscripts }
            Write-Host "Global Teams Graph transcript access: $($teamsBefore.EnableGraphTranscriptAccess) -> True."
            Write-Host "Global Teams speaker attribution: $($teamsBefore.EnableAttributedTranscripts) -> $attributionAfter."
            Write-Host 'These are organization-wide Teams settings: Graph transcript access can affect every already-consented transcript app, beyond this deployment group and customer app.'
            Write-Host "Employee app permissions: $($delegatedScopes -join ', '). Consent is tenant-wide; the Intune group does not restrict it."
        }
        Write-Host 'Existing extension managed settings on assigned devices will be backed up and replaced. Other extension policies are preserved.'
        Write-Host 'No Store package is re-signed. No meeting transcription is automatically started.'
        if ((Read-Host 'Type APPROVE to create these resources, or Enter to cancel') -cne 'APPROVE') { throw 'Setup cancelled before resource creation.' }
        if (-not $existing) {
            New-Item -ItemType Directory -Path $directory -ErrorAction Stop | Out-Null
            $receipt = [ordered]@{version=2;plan=$plan;status='Provisioning';appId=$null;applicationObjectId=$null;servicePrincipalId=$null;consentGrantId=$null;scripts=@();operations=@{};pendingOperation=$null;cleanupVerified=$false;provisioningGrantCleanup=@{state='RetainedNotOwned';reason='A reliable before-consent grant inventory was unavailable. Preexisting and employee-app permissions must be preserved.';sessionDisconnected=$false};delivery=$null}
        }
        Save-SetupReceipt $receipt $directory
        Write-SetupStep $(if ($existing) { 'Reconcile saved resources with Microsoft' } else { 'Create the approved Microsoft configuration' })
        $appId = $receipt.appId
        if ($m365) {
            $redirects = @($browsers | ForEach-Object { if ($_ -eq 'edge') { 'https://edefcbdhahfolgkoamkbknjppojpaffk.chromiumapp.org/microsoft' } else { 'https://nabjdlnkkaonnbnimnmnhjcbigceebml.chromiumapp.org/microsoft' } })
            $appBody = @{
                displayName="Better CaptionKeep $deploymentId"; notes="Customer-owned transcript app. Deployment $deploymentId"
                signInAudience='AzureADMyOrg'; spa=@{redirectUris=$redirects}
                requiredResourceAccess=@(@{resourceAppId='00000003-0000-0000-c000-000000000000'; resourceAccess=$resourceAccess})
            }
            $appFilter = [uri]::EscapeDataString("displayName eq '$($appBody.displayName)'")
            $app = Invoke-RecordedSetupCreate $receipt $directory 'CreateApplication' $appBody {
                Get-SetupCollection "/applications?`$filter=$appFilter"
            } {
                param($candidate)
                (Get-SetupApplicationFingerprint $candidate) -ceq (Get-SetupApplicationFingerprint $appBody)
            } { param($body) Invoke-SetupGraph POST '/applications' $body }
            $appId = Assert-SetupGuid $app.appId
            $receipt.appId=$appId; $receipt.applicationObjectId=Assert-SetupGuid $app.id
            Save-SetupReceipt $receipt $directory
            $principalBody=@{appId=$appId}
            $principalFilter=[uri]::EscapeDataString("appId eq '$appId'")
            $principal = Invoke-RecordedSetupCreate $receipt $directory 'CreateServicePrincipal' $principalBody {
                Get-SetupCollection "/servicePrincipals?`$filter=$principalFilter"
            } { param($candidate) $candidate.appId -ceq $appId } { param($body) Invoke-SetupGraph POST '/servicePrincipals' $body }
            $receipt.servicePrincipalId=Assert-SetupGuid $principal.id
            Save-SetupReceipt $receipt $directory
            $grantBody=@{clientId=$principal.id;consentType='AllPrincipals';resourceId=$graphService.id;scope=($delegatedScopes -join ' ')}
            $grantFilter=[uri]::EscapeDataString("clientId eq '$($principal.id)' and resourceId eq '$($graphService.id)'")
            $grant=Invoke-RecordedSetupCreate $receipt $directory 'GrantTranscriptConsent' $grantBody {
                Get-SetupCollection "/oauth2PermissionGrants?`$filter=$grantFilter"
            } {
                param($candidate)
                $candidate.clientId -ceq $principal.id -and $candidate.resourceId -ceq $graphService.id -and $candidate.consentType -ceq 'AllPrincipals' -and
                    (@(([string]$candidate.scope -split ' ') | Sort-Object) -join ' ') -ceq (@($delegatedScopes | Sort-Object) -join ' ')
            } { param($body) Invoke-SetupGraph POST '/oauth2PermissionGrants' $body }
            $receipt.consentGrantId=$grant.id
            $receipt.pendingOperation='ConfigureTeams'; Save-SetupReceipt $receipt $directory
            $teamsArguments = @{Identity='Global'; EnableGraphTranscriptAccess=$true}
            if ($Options.EnableSpeakerAttribution) { $teamsArguments.EnableAttributedTranscripts=$true }
            $desiredAttribution = if ($Options.EnableSpeakerAttribution) { $true } else { [bool]$teamsBefore.EnableAttributedTranscripts }
            $current = Get-CsTeamsMeetingConfiguration -Identity Global
            if ([bool]$current.EnableGraphTranscriptAccess -ne $true -or [bool]$current.EnableAttributedTranscripts -ne $desiredAttribution) {
                if ([bool]$current.EnableGraphTranscriptAccess -ne [bool]$teamsBefore.EnableGraphTranscriptAccess -or [bool]$current.EnableAttributedTranscripts -ne [bool]$teamsBefore.EnableAttributedTranscripts) { throw 'Teams settings changed since approval. Review the saved before-image before continuing.' }
                Set-CsTeamsMeetingConfiguration @teamsArguments
            }
            $after = Get-CsTeamsMeetingConfiguration -Identity Global
            if (-not [bool]$after.EnableGraphTranscriptAccess -or [bool]$after.EnableAttributedTranscripts -ne $desiredAttribution) { throw 'Teams has not confirmed the approved settings. Keep the receipt and check again before deploying.' }
            $receipt.teamsAfter=@{EnableGraphTranscriptAccess=[bool]$after.EnableGraphTranscriptAccess;EnableAttributedTranscripts=[bool]$after.EnableAttributedTranscripts}
        }
        $receipt.pendingOperation=$null; Save-SetupReceipt $receipt $directory
        if ((Get-FileHash -LiteralPath $templatePath -Algorithm SHA256).Hash -cne $templateHash) { throw 'Endpoint template changed after approval.' }
        foreach ($browserName in $browsers) {
            $savedScript = @($receipt.scripts | Where-Object browser -eq $browserName)
            if ($savedScript.Count -gt 1) { throw 'Receipt contains duplicate browser scripts.' }
            if ($savedScript.Count -eq 1) {
                foreach ($action in @('Install','Remove')) {
                    $savedPath=Join-Path $directory "$browserName-$action.ps1"
                    $expectedHash=if ($action -eq 'Install') { $savedScript[0].installHash } else { $savedScript[0].removeHash }
                    if (-not (Test-Path -LiteralPath $savedPath) -or (Get-FileHash -LiteralPath $savedPath -Algorithm SHA256).Hash -cne $expectedHash) { throw 'A saved device script is missing or changed. Restore the exact reviewed script before continuing.' }
                }
                continue
            }
            $extensionId = if ($browserName -eq 'edge') { 'edefcbdhahfolgkoamkbknjppojpaffk' } else { 'nabjdlnkkaonnbnimnmnhjcbigceebml' }
            $policy = $approvedPolicies[$browserName] | ConvertTo-Json -Depth 20 | ConvertFrom-Json -AsHashtable
            $policy.enableGraphTranscriptImport=$m365
            if ($m365) { $policy.graphTenantId=$tenant; $policy.graphClientId=$appId }
            Assert-ManagedSetupPolicy $policy $schema
            $config = @{browser=$browserName; extensionId=$extensionId; deploymentId=$deploymentId; managedPolicy=$policy}
            $configurationJson=ConvertTo-Json -InputObject $config -Depth 20 -Compress
            $configurationHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($configurationJson))).ToLowerInvariant()
            foreach ($action in @('Install','Remove')) {
                $scriptPath = Join-Path $directory "$browserName-$action.ps1"
                $signOperation='AzureSign-'+[IO.Path]::GetFileName($scriptPath)
                $reconcileAzure=$azureProvider -and $receipt.operations.ContainsKey($signOperation)
                if (-not $reconcileAzure) {
                    if (Test-Path -LiteralPath $scriptPath) { throw 'An unrecorded generated script already exists. Preserve it and reconcile the receipt; no script was overwritten.' }
                    New-EndpointPayload $config $template $action -ConfigJson $configurationJson | Set-Content -LiteralPath $scriptPath -Encoding utf8
                }
                if ($azureProvider) {
                    Invoke-SetupAzureSign $scriptPath $azureProvider $context $receipt $directory
                } elseif ($certificate) {
                    $signature = Set-AuthenticodeSignature -FilePath $scriptPath -Certificate $certificate -HashAlgorithm SHA256
                    if ($signature.Status -ne 'Valid') { throw "Script signing failed: $($signature.Status)" }
                }
            }
            $installPath = Join-Path $directory "$browserName-Install.ps1"
            $receipt.scripts += @{browser=$browserName;id=$null;assigned=$false;configurationHash=$configurationHash;installHash=(Get-FileHash -LiteralPath $installPath -Algorithm SHA256).Hash;removeHash=(Get-FileHash -LiteralPath (Join-Path $directory "$browserName-Remove.ps1") -Algorithm SHA256).Hash}
            Save-SetupReceipt $receipt $directory
        }
        $receipt.status='AwaitingScriptApproval'; Save-SetupReceipt $receipt $directory
        Write-SetupStep 'Approve Intune delivery'
        Write-Host "Installation/removal scripts and their hashes are in $directory. Review them before upload/assignment."
        foreach ($script in $receipt.scripts) { Write-Host "$($script.browser): install SHA-256 $($script.installHash)" }
        if ((Read-Host 'Type DEPLOY to upload and assign these exact scripts to the approved group, or Enter to retain an unassigned package') -cne 'DEPLOY') {
            Write-Host 'Package retained without Intune assignment. Any created app/consent and Teams changes remain recorded in receipt.json.'
            return $receipt
        }
        foreach ($script in $receipt.scripts) {
            Write-SetupStep "Upload and assign $($script.browser) to $($group.displayName)"
            $installPath = Join-Path $directory "$($script.browser)-Install.ps1"
            if ((Get-FileHash -LiteralPath $installPath -Algorithm SHA256).Hash -cne $script.installHash) { throw 'Script changed after review.' }
            $body = New-IntuneScriptBody -Name "Better CaptionKeep $($script.browser) $deploymentId" -Signed ([bool]$plan.signedEndpointScripts) -ScriptBytes ([IO.File]::ReadAllBytes($installPath))
            $scriptName=$body.displayName
            $scriptFilter=[uri]::EscapeDataString("displayName eq '$scriptName'")
            $created=Invoke-RecordedSetupCreate $receipt $directory "Upload-$($script.browser)" $body {
                Get-SetupCollection "/deviceManagement/deviceManagementScripts?`$filter=$scriptFilter" -Beta
            } {
                param($candidate)
                $candidate.displayName -ceq $body.displayName -and $candidate.scriptContent -ceq $body.scriptContent -and
                    $candidate.runAsAccount -ceq 'system' -and [bool]$candidate.runAs32Bit -eq $false -and [bool]$candidate.enforceSignatureCheck -eq [bool]$body.enforceSignatureCheck
            } { param($request) Invoke-SetupGraph POST '/deviceManagement/deviceManagementScripts' $request -Beta }
            $script.id = Assert-SetupGuid $created.id
            Save-SetupReceipt $receipt $directory
            $assignmentName="Assign-$($script.browser)"
            $priorAssignment=if ($receipt.operations.ContainsKey($assignmentName)) { $receipt.operations[$assignmentName] } else { $null }
            if ($priorAssignment -and $priorAssignment.groupId -cne $groupId) { throw 'The approved assignment group changed. No assignment was overwritten.' }
            $assignments=@(Get-SetupCollection "/deviceManagement/deviceManagementScripts/$($script.id)/groupAssignments" -Beta)
            if (@($assignments | Where-Object { $_.targetGroupId -cne $groupId }).Count -or $assignments.Count -gt 1) { throw 'The Intune script has unexpected assignments. No assignment was overwritten.' }
            if (-not $assignments.Count) {
                if ($script.assigned -or $priorAssignment) { throw 'The recorded assignment is not visible. A lost response may be eventually consistent; no assignment POST was repeated. Check again later.' }
                $receipt.operations[$assignmentName]=@{state='Pending';groupId=$groupId;operationId=[guid]::NewGuid().ToString()}
                $receipt.pendingOperation=$assignmentName; Save-SetupReceipt $receipt $directory
                Invoke-SetupGraph POST "/deviceManagement/deviceManagementScripts/$($script.id)/assign" (New-GroupAssignment $groupId) -Beta | Out-Null
                $assignments=@(Get-SetupCollection "/deviceManagement/deviceManagementScripts/$($script.id)/groupAssignments" -Beta)
                if ($assignments.Count -ne 1 -or $assignments[0].targetGroupId -cne $groupId) { throw 'Intune has not confirmed the exact group assignment. Continue Setup later to reconcile it; no duplicate upload is needed.' }
            }
            $receipt.operations[$assignmentName]=@{state='Confirmed';groupId=$groupId}
            $script.assigned=$true; $receipt.pendingOperation=$null; Save-SetupReceipt $receipt $directory
        }
        $receipt.status='AssignedPendingEndpointValidation'; Save-SetupReceipt $receipt $directory
        Write-Host 'Intune confirmed the approved group assignments. Devices will install from their browser Store when they check in.'
        try {
            $receipt.delivery=Get-EnterpriseDeliveryStatus $receipt
            Save-SetupReceipt $receipt $directory
            Show-EnterpriseDeliveryStatus $receipt.delivery $directory
        } catch {
            $receipt.delivery=@{state='ReportUnavailable';note='Assignments are retained. Use Check Status later; do not create another deployment.'}
            Save-SetupReceipt $receipt $directory
            Write-Warning $receipt.delivery.note
        }
        return $receipt
    } catch {
        if ($null -ne $receipt -and -not $statusOnly) { $receipt.status='Incomplete'; Save-SetupReceipt $receipt $directory }
        Write-Warning 'Setup stopped. Preserve any receipt. Do not rerun blindly: a timed-out POST may have created a resource without returning its ID.'
        throw
    } finally {
        if ($teamsConnected) { Disconnect-MicrosoftTeams -ErrorAction SilentlyContinue | Out-Null }
        if ($graphConnected) { Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null }
        if ($receipt -and $receipt.Contains('provisioningGrantCleanup')) {
            $receipt.provisioningGrantCleanup.sessionDisconnected=$true
            if ($Options.OutputDirectory -and (Test-Path -LiteralPath $Options.OutputDirectory)) { Save-SetupReceipt $receipt $Options.OutputDirectory }
        }
        Write-Host 'Local setup sign-in sessions disconnected. Existing Microsoft provisioning consent is preserved because its ownership cannot be proved. Review temporary administrator grants using your organization process; the employee transcript app remains configured.'
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    $options = @{
        TenantId=$TenantId; GroupId=$GroupId; Browser=$Browser; WithMicrosoft365=[bool]$WithMicrosoft365
        WithoutMicrosoft365=[bool]$WithoutMicrosoft365; Hardened=[bool]$Hardened
        EnableSpeakerAttribution=[bool]$EnableSpeakerAttribution; SigningCertificateThumbprint=$SigningCertificateThumbprint
        AzureSigningConfigPath=$AzureSigningConfigPath
        AllowUnsignedEndpointScripts=[bool]$AllowUnsignedEndpointScripts; OutputDirectory=$OutputDirectory; PlanOnly=[bool]$PlanOnly
        ResumeReceipt=$ResumeReceipt;StatusReceipt=$StatusReceipt
    }
    Invoke-EnterpriseSetup $options $PSScriptRoot
}
