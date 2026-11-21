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
    [ValidateSet('PlatformScripts','Win32')][string]$DeploymentTransport='PlatformScripts',
    [switch]$AllowUnsignedEndpointScripts,
    [string]$OutputDirectory,
    [switch]$PlanOnly,
    [string]$ResumeReceipt,
    [string]$StatusReceipt,
    [switch]$GuidedUi,
    [long]$OwnerWindowHandle=0,
    [int]$OwnerProcessId=0,
    [string]$StatusPipeName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Enterprise-Runtime.ps1')
. (Join-Path $PSScriptRoot 'Enterprise-Dialogs.ps1')
. (Join-Path $PSScriptRoot 'Enterprise-Signing.ps1')
. (Join-Path $PSScriptRoot 'Enterprise-SignerMigration.ps1')
$win32Module=Join-Path $PSScriptRoot 'Enterprise-Win32.ps1'
if(Test-Path -LiteralPath $win32Module){. $win32Module}
$script:SetupGuidedUi = [bool]$GuidedUi

function Get-SetupScopes {
    param([bool]$Microsoft365,[string]$DeploymentTransport='PlatformScripts')
    $scopes = @('GroupMember.Read.All', $(if($DeploymentTransport -ceq 'Win32'){'DeviceManagementApps.ReadWrite.All'}else{'DeviceManagementScripts.ReadWrite.All'}))
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
    if ($Path -notmatch '^/(applications|servicePrincipals|oauth2PermissionGrants|groups|deviceManagement|deviceAppManagement)(/|\?|$)') { throw 'Graph path outside setup operations.' }
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
    Write-SetupMessage "`n>> $Message" -ForegroundColor Cyan
}

function Select-SetupBrowser {
    Write-SetupMessage 'Which browsers should receive Better CaptionKeep?'
    Write-SetupMessage '1. Microsoft Edge and Google Chrome (recommended)'
    Write-SetupMessage '2. Microsoft Edge only'
    Write-SetupMessage '3. Google Chrome only'
    switch (Read-SetupAnswer 'Choose 1, 2, or 3') {
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
        Write-SetupMessage "Setup needs to install/update these Microsoft PowerShell modules: $($changes -join ', ')."
        Write-SetupMessage 'They will be downloaded from the official PowerShell Gallery for your Windows user.'
        if ((Read-SetupAnswer 'Type INSTALL to approve these dependencies, or Enter to stop') -cne 'INSTALL') { throw 'Dependency installation declined. No tenant resources changed.' }
        if ((Get-PSRepository -Name PSGallery).SourceLocation.TrimEnd('/') -cne 'https://www.powershellgallery.com/api/v2') { throw 'PSGallery is not the official repository. Restore it before continuing.' }
        if ($updateTeams) { Remove-Module MicrosoftTeams -Force -ErrorAction Stop }
        if ($script:SetupGuidedUi) {
            Install-SetupModulesWithProgress -ModuleNames $changes
        } else {
            foreach ($name in $changes) { Install-Module -Name $name -Repository PSGallery -Scope CurrentUser -Force -ErrorAction Stop }
        }
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
    Write-SetupMessage 'Choose a certificate to sign the device scripts. No thumbprint typing is needed.'
    for ($i=0; $i -lt $certificates.Count; $i++) { Write-SetupMessage "$($i+1). $($certificates[$i].Subject) (expires $($certificates[$i].NotAfter.ToString('yyyy-MM-dd')))" }
    Write-SetupMessage 'Unsigned scripts are available only as an explicitly approved pilot option.'
    $choice = Read-SetupAnswer 'Certificate number, UNSIGNED for a pilot, or Enter to stop'
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
    # Windows Azure CLI installs both az.cmd and an extensionless Unix shim.
    # Resolve one real application in PATH order; aliases/functions are never eligible.
    $command=Get-Command az -CommandType Application -ErrorAction Stop |
        Where-Object { $_.CommandType -eq [Management.Automation.CommandTypes]::Application -and
            [IO.Path]::IsPathFullyQualified($_.Source) -and [IO.File]::Exists($_.Source) -and
            (-not $IsWindows -or [IO.Path]::GetExtension($_.Source) -in @('.exe','.cmd','.bat')) } |
        Select-Object -First 1
    if ($null -eq $command) { throw 'Azure CLI executable was not found. Install the official Azure CLI and reopen setup.' }
    $commandPath=[string]$command.Source
    $output=@(& $commandPath @Arguments 2>&1)
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
    param([string]$Path, [string[]]$Arguments, [string]$DiagnosticPath)
    if ($DiagnosticPath -and [IO.File]::Exists($DiagnosticPath)) { throw 'Signing diagnostic already exists. Preserve it and the receipt; no automatic retry was performed.' }
    $exitCode=$null;$output=@()
    try { $output=@(& $Path @Arguments 2>&1);$exitCode=$LASTEXITCODE }
    catch { $output+= $_.Exception.Message }
    if ($null -eq $exitCode -or $exitCode -ne 0) {
        if ($DiagnosticPath) {
            # Keep troubleshooting evidence private and bounded; never print native output.
            $detail=$output -join "`n"
            $detail=$detail -replace '(?im)^.*(?:authorization|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|bearer)\b.*$','[REDACTED credential line]'
            $detail=$detail -replace '\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b','[REDACTED token]'
            $truncated=$detail.Length -gt 16384
            if ($truncated) { $detail=$detail.Substring(0,16384) }
            $diagnostic=@{recordedAtUtc=[DateTime]::UtcNow.ToString('o');nativeExitCode=$exitCode;output=$detail;truncated=$truncated;
                requestOutcome='Unknown; a native failure does not prove whether a signing request reached the service.'}
            [IO.File]::WriteAllText($DiagnosticPath,($diagnostic | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
        }
        throw 'Azure Artifact Signing failed. Review the private diagnostic referenced by the receipt and preserve the signed/partial file; no automatic signing retry or fallback was performed.'
    }
}

function Get-SetupAzureReviewedFileHash {
    param([string]$Path,[string]$ExpectedBody,[switch]$SignedFile)
    $before=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    $body=Get-SetupLocalReviewedBody ([IO.File]::ReadAllText($Path)) -SignedFile:$SignedFile
    if ($body -cne $ExpectedBody) {throw 'Azure signing payload differs from its reviewed body/template. Preserve the file; no signing request may proceed.'}
    $after=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    if ($after -cne $before) {throw 'Azure signing payload changed during body verification. Preserve the file.'}
    $after
}

function Invoke-SetupAzureSign {
    param([string]$Path, $Provider, $GraphContext, $Receipt, [string]$Directory, [string]$ReceiptDirectory, [string]$OperationPrefix='', [string]$ExpectedContent)
    if (-not $PSBoundParameters.ContainsKey('ExpectedContent')) {throw 'Reviewed expected script content is required before Azure signing or reconciliation.'}
    $expectedBody=Get-SetupLocalReviewedBody $ExpectedContent
    $expectedContentHash=Get-SetupLocalBytesHash ([Text.Encoding]::UTF8.GetBytes($expectedBody))
    if (-not $ReceiptDirectory) { $ReceiptDirectory=$Directory }
    if ($Receipt.Contains('signerAmendment')) {
        $approvedDirectory=Get-SetupSigningPayloadDirectory $Receipt $ReceiptDirectory
        if ([IO.Path]::GetFullPath($Directory) -ine [IO.Path]::GetFullPath($approvedDirectory) -or
            [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Path)) -ine [IO.Path]::GetFullPath($approvedDirectory) -or
            $OperationPrefix -cne ($Receipt.signerAmendment.revisionDirectory+'-') -or
            (Get-SetupFingerprint $Provider.identity) -cne (Get-SetupFingerprint $Receipt.signerAmendment.provider)) {
            throw 'Azure payload path or provider differs from the approved signing revision.'
        }
    }
    $operation='AzureSign-'+$OperationPrefix+[IO.Path]::GetFileName($Path)
    $prior=if ($Receipt.operations.ContainsKey($operation)) { $Receipt.operations[$operation] } else { $null }
    if ($prior) {
        if ($prior.providerFingerprint -cne $Provider.identity.configurationFingerprint) { throw 'The original Azure signing provider changed. No signing request was repeated.' }
        if ($prior.state -cnotin @('Confirmed','Reconciled') -or -not $prior.signedHash -or -not [IO.File]::Exists($Path) -or
            (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -cne $prior.signedHash) { throw 'The prior Azure signing operation is ambiguous or its reviewed file changed. Preserve the receipt and reconcile the original operation; no signing request was repeated.' }
        if ($prior.ContainsKey('expectedContentHash') -and $prior.expectedContentHash -cne $expectedContentHash) {throw 'The originally reviewed Azure payload body changed. No signing request was repeated.'}
        Assert-SetupAzureSignedFile $Path $Provider | Out-Null
        $verified=Get-SetupAzureReviewedFileHash $Path $expectedBody -SignedFile
        if ($verified -cne $prior.signedHash) {throw 'The Azure signed file changed during reconciliation.'}
        $prior.state='Reconciled';$prior.expectedContentHash=$expectedContentHash
        $Receipt.pendingOperation=$null;Save-SetupReceipt $Receipt $ReceiptDirectory
        return
    }
    Assert-SetupAzureSigningIdentity $Provider $GraphContext
    $hashes=Assert-SetupMicrosoftSigningTools $Provider.config
    if ((Get-SetupFingerprint $hashes) -cne (Get-SetupFingerprint $Provider.identity.toolHashes)) { throw 'Azure signing tools changed after plan approval.' }
    $metadata=@{Endpoint=$Provider.config.Endpoint;CodeSigningAccountName=$Provider.config.CodeSigningAccountName;
        CertificateProfileName=$Provider.config.CertificateProfileName;CorrelationId=$Receipt.plan.deploymentId;
        ExcludeCredentials=@('EnvironmentCredential','WorkloadIdentityCredential','ManagedIdentityCredential','SharedTokenCacheCredential',
            'VisualStudioCredential','VisualStudioCodeCredential','AzurePowerShellCredential','AzureDeveloperCliCredential','InteractiveBrowserCredential')}
    $metadataPath=Join-Path $Directory 'azure-signing-metadata.json'
    [IO.File]::WriteAllText($metadataPath,($metadata | ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
    $diagnosticName=$operation+'.diagnostic.json';$diagnosticPath=Join-Path $Directory $diagnosticName
    $relativePath=[IO.Path]::GetRelativePath($ReceiptDirectory,$Path).Replace('\','/')
    $relativeDiagnostic=[IO.Path]::GetRelativePath($ReceiptDirectory,$diagnosticPath).Replace('\','/')
    $unsignedHash=Get-SetupAzureReviewedFileHash $Path $expectedBody
    $Receipt.operations[$operation]=@{state='Pending';providerFingerprint=$Provider.identity.configurationFingerprint;unsignedHash=$unsignedHash;expectedContentHash=$expectedContentHash;signedHash=$null;diagnosticFile=$relativeDiagnostic;payloadFile=$relativePath}
    $Receipt.pendingOperation=$operation;Save-SetupReceipt $Receipt $ReceiptDirectory
    $savedSigningReceipt=Get-Content -LiteralPath (Join-Path $ReceiptDirectory 'receipt.json') -Raw|ConvertFrom-Json -AsHashtable
    if ($savedSigningReceipt.pendingOperation -cne $operation -or
        -not $savedSigningReceipt.operations.ContainsKey($operation) -or
        (Get-SetupFingerprint $savedSigningReceipt.operations[$operation]) -cne (Get-SetupFingerprint $Receipt.operations[$operation])) {
        throw 'Azure signing receipt readback failed. No signing request was made.'
    }
    try {
        # The durable journal is not authority for changed file bytes. Recheck
        # immediately before crossing the potentially billable native boundary.
        if ((Get-SetupAzureReviewedFileHash $Path $expectedBody) -cne $unsignedHash) {throw 'Unsigned Azure payload changed after journal readback. No signing request was made.'}
        Invoke-SetupSignTool $Provider.config.SignToolPath @('sign','/fd','SHA256','/tr','http://timestamp.acs.microsoft.com','/td','SHA256','/dlib',$Provider.config.DlibPath,'/dmdf',$metadataPath,$Path) -DiagnosticPath $diagnosticPath
        $signatureReadbackHash=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
        Assert-SetupAzureSignedFile $Path $Provider | Out-Null
        $verified=Get-SetupAzureReviewedFileHash $Path $expectedBody -SignedFile
        if ($verified -cne $signatureReadbackHash) {throw 'Azure signed bytes changed during signature verification. Preserve the file; no signing retry was performed.'}
        $Receipt.operations[$operation].state='Confirmed';$Receipt.operations[$operation].signedHash=$verified
        $Receipt.pendingOperation=$null;Save-SetupReceipt $Receipt $ReceiptDirectory
    } catch {
        if ([IO.File]::Exists($Path)) {$Receipt.operations[$operation].observedHash=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash}
        if ([IO.File]::Exists($diagnosticPath)) { $Receipt.operations[$operation].diagnosticHash=(Get-FileHash -LiteralPath $diagnosticPath -Algorithm SHA256).Hash }
        $Receipt.operations[$operation].state='Ambiguous';Save-SetupReceipt $Receipt $ReceiptDirectory
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
        # A POST response records identity, not accepted state. Preserve it before independent
        # readback so recovery can distinguish a lost/lagging read from permission to POST again.
        $Receipt.operations[$Name].state='Partial'; Save-SetupReceipt $Receipt $Directory
        $observed = @(& $Find)
        $matching = @($observed | Where-Object { & $Matches $_ })
        if ($observed.Count -ne 1 -or $matching.Count -ne 1 -or [string]$matching[0].id -cne [string]$created.id) {
            throw "The created resource for $Name could not be verified against the approved state. Keep the receipt and check again later; no POST will be repeated."
        }
        $Receipt.operations[$Name].state='Confirmed'; $Receipt.pendingOperation=$null
        Save-SetupReceipt $Receipt $Directory
        return $matching[0]
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
    if($Receipt.plan.Contains('deploymentTransport') -and $Receipt.plan.deploymentTransport -ceq 'Win32'){return Get-SetupWin32DeliveryStatus $Receipt}
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
    $successLabel=if($Report.Contains('transport') -and $Report.transport -ceq 'Win32'){'policy configuration applied'}else{'script success'}
    Write-SetupMessage "Device/browser reports: $($Report.reports); identified devices: $($Report.reportingDevices); ${successLabel}: $($Report.succeeded); failed: $($Report.failed); pending: $($Report.pending); configuration not verified: $($Report.configurationNotVerified)."
    foreach ($device in $Report.devices) {
        $last=if ($device.lastUpdate) { $device.lastUpdate } else { 'time not reported' }
        Write-SetupMessage "  $($device.device) / $($device.browser): $($device.status) (last report: $last)"
    }
    if (-not $Report.reports) { Write-SetupMessage 'Waiting for the first Intune device check-in. Check Status later; do not deploy a second copy.' }
    Write-SetupMessage $Report.note
    Write-SetupMessage "Recovery receipt and results: $Directory"
}

function New-EndpointPayload {
    param($Config, [string]$Template, [ValidateSet('Install','Remove')][string]$Action, [string]$ConfigJson)
    $json = if ($ConfigJson) { $ConfigJson } else { ConvertTo-Json -InputObject $Config -Depth 20 -Compress }
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
    return "& {`n$Template`n} -ConfigJson ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('$encoded'))) -Action '$Action'`n"
}

function ConvertTo-SetupPayloadJson {
    param($Value)
    function Normalize-PayloadValue($Item) {
        if ($Item -is [Collections.IDictionary]) {
            $normalized=[ordered]@{}
            foreach($key in @($Item.Keys|Sort-Object)) { $normalized[$key]=Normalize-PayloadValue $Item[$key] }
            return $normalized
        }
        if ($Item -is [array]) { return ,@($Item|ForEach-Object {Normalize-PayloadValue $_}) }
        return $Item
    }
    ConvertTo-Json -InputObject (Normalize-PayloadValue $Value) -Depth 25 -Compress
}

function Get-SetupPayloadConfiguration {
    param($Config,[string]$Template,[string]$Directory,[ValidateSet('edge','chrome')][string]$Browser,$Receipt)
    $fingerprint=Get-SetupFingerprint $Config
    $chosen=$null
    if ($Receipt.Contains('payloadConfigurations') -and $Receipt.payloadConfigurations.Contains($Browser)) {
        $saved=$Receipt.payloadConfigurations[$Browser]
        $savedHash=Get-SetupLocalBytesHash ([Text.Encoding]::UTF8.GetBytes([string]$saved.json))
        $savedConfig=[string]$saved.json|ConvertFrom-Json -AsHashtable -Depth 30
        if ($savedHash -cne $saved.sha256 -or $saved.semanticFingerprint -cne $fingerprint -or
            (Get-SetupFingerprint $savedConfig) -cne $fingerprint) { throw 'Saved payload configuration changed. Preserve the receipt and scripts; no signing request was made.' }
        $chosen=[string]$saved.json
    }
    foreach($action in @('Install','Remove')) {
        $path=Join-Path $Directory "$Browser-$action.ps1"
        if (-not [IO.File]::Exists($path)) { continue }
        $body=Get-SetupLocalReviewedBody ([IO.File]::ReadAllText($path)) -SignedFile
        $pattern="FromBase64String\('([A-Za-z0-9+/=]+)'\)\)\) -Action '$action'\z"
        $match=[regex]::Match($body,$pattern)
        if (-not $match.Success) { throw 'Saved device script has an unrecognized configuration wrapper. Preserve it; no signing request was made.' }
        $originalJson=[Text.UTF8Encoding]::new($false,$true).GetString([Convert]::FromBase64String($match.Groups[1].Value))
        $originalConfig=$originalJson|ConvertFrom-Json -AsHashtable -Depth 30
        if ($originalConfig -isnot [Collections.IDictionary] -or (Get-SetupFingerprint $originalConfig) -cne $fingerprint) {
            throw 'Saved device script configuration differs from the approved plan. Preserve it; no signing request was made.'
        }
        $expected=Get-SetupLocalReviewedBody (New-EndpointPayload $Config $Template $action -ConfigJson $originalJson)
        if ($body -cne $expected) { throw 'Saved device script differs from the approved template. Preserve it; no signing request was made.' }
        if ($null -ne $chosen -and $chosen -cne $originalJson) { throw 'Saved device script configuration bytes disagree. Preserve both scripts and receipt; no signing request was made.' }
        $chosen=$originalJson
    }
    if ($null -eq $chosen) { $chosen=ConvertTo-SetupPayloadJson $Config }
    @{json=$chosen;sha256=(Get-SetupLocalBytesHash ([Text.Encoding]::UTF8.GetBytes($chosen)));semanticFingerprint=$fingerprint}
}

function Save-SetupPayloadConfiguration {
    param($Receipt,[string]$Directory,[ValidateSet('edge','chrome')][string]$Browser,$Configuration)
    if (-not $Receipt.Contains('payloadConfigurations')) { $Receipt.payloadConfigurations=@{} }
    $Receipt.payloadConfigurations[$Browser]=$Configuration
    Save-SetupReceipt $Receipt $Directory
    $saved=Get-Content -LiteralPath (Join-Path $Directory 'receipt.json') -Raw|ConvertFrom-Json -AsHashtable
    if (-not $saved.ContainsKey('payloadConfigurations') -or -not $saved.payloadConfigurations.ContainsKey($Browser) -or
        (Get-SetupFingerprint $saved.payloadConfigurations[$Browser]) -cne (Get-SetupFingerprint $Configuration)) {
        throw 'Payload configuration receipt readback failed. No signing request may proceed.'
    }
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

function Get-SetupIntuneScriptVerification {
    param($Candidate,$Expected)
    $presence=@{};$types=@{};$matches=@{}
    foreach($key in @('displayName','description','fileName','runAsAccount','runAs32Bit','enforceSignatureCheck','scriptContent')) {
        $presence[$key]=$Candidate -is [Collections.IDictionary] -and $Candidate.Contains($key)
        $types[$key]=$false;$matches[$key]=$false
        if (-not $presence[$key]) {continue}
        if ($key -cin @('runAs32Bit','enforceSignatureCheck')) {
            $types[$key]=$Candidate[$key] -is [bool]
            $matches[$key]=$types[$key] -and $Candidate[$key] -eq $Expected[$key]
        } elseif ($key -cne 'scriptContent') {
            $types[$key]=$Candidate[$key] -is [string]
            $matches[$key]=$types[$key] -and $Candidate[$key] -ceq $Expected[$key]
        } else {
            $types[$key]=$Candidate[$key] -is [string] -and -not [string]::IsNullOrWhiteSpace($Candidate[$key])
            if ($types[$key]) {
                try {
                    $observed=[Convert]::FromBase64String($Candidate[$key])
                    $approved=[Convert]::FromBase64String($Expected[$key])
                    $matches[$key]=(Get-SetupLocalBytesHash $observed) -ceq (Get-SetupLocalBytesHash $approved)
                } catch {$matches[$key]=$false}
            }
        }
    }
    $mismatches=@($matches.Keys|Where-Object {-not $matches[$_]}|Sort-Object)
    @{verified=($mismatches.Count -eq 0);fieldPresence=$presence;fieldTypesValid=$types;fieldMatches=$matches;
        contentHashMatches=$matches.scriptContent;mismatchedFields=$mismatches}
}

function Save-SetupUploadVerification {
    param($Receipt,[string]$Directory,[string]$Operation,$Diagnostic)
    if ($Receipt.operations.ContainsKey($Operation)) {
        $Receipt.operations[$Operation].verification=$Diagnostic
        Save-SetupReceipt $Receipt $Directory
    }
}

function Find-SetupIntuneScriptCandidates {
    param([string]$DisplayName,$Expected,$Receipt,[string]$Directory,[string]$Operation)
    $diagnostic=@{source='ListAndDetail';listCount=$null;detailFetched=$false;reason='ListReadUnavailable';recordedIdMatches=$null;detailIdMatches=$null}
    $filter=[uri]::EscapeDataString("displayName eq '$($DisplayName.Replace("'","''"))'")
    try {$summaries=@(Get-SetupCollection "/deviceManagement/deviceManagementScripts?`$filter=$filter" -Beta)}
    catch {
        Save-SetupUploadVerification $Receipt $Directory $Operation $diagnostic
        throw 'Intune script list readback is unavailable. Preserve the receipt; no upload POST was repeated.'
    }
    $diagnostic.listCount=$summaries.Count
    if ($summaries.Count -ne 1) {
        $diagnostic.reason=if ($summaries.Count -eq 0) {'ListEmpty'} else {'ListNotUnique'}
        Save-SetupUploadVerification $Receipt $Directory $Operation $diagnostic
        return $summaries
    }
    # An unrecorded existing name remains a conflict, regardless of detail shape.
    # Do not fetch its script content or let failed hydration appear as absence.
    if (-not $Receipt.operations.ContainsKey($Operation)) {return $summaries}
    $prior=$Receipt.operations[$Operation]
    try {$id=Assert-SetupGuid ([string]$summaries[0].id)}
    catch {
        $diagnostic.reason='ListIdInvalid'
        Save-SetupUploadVerification $Receipt $Directory $Operation $diagnostic
        throw 'Intune script list returned an invalid identity. Preserve the receipt; no upload POST was repeated.'
    }
    if ($prior.resourceId) {
        $diagnostic.recordedIdMatches=$id -ceq [string]$prior.resourceId
        if (-not $diagnostic.recordedIdMatches) {
            $diagnostic.reason='RecordedIdMismatch'
            Save-SetupUploadVerification $Receipt $Directory $Operation $diagnostic
            throw 'Intune script identity differs from the recorded upload. No script was adopted or uploaded again.'
        }
    }
    try {$detail=Invoke-SetupGraph GET "/deviceManagement/deviceManagementScripts/$id" $null -Beta}
    catch {
        $diagnostic.reason='DetailReadUnavailable'
        Save-SetupUploadVerification $Receipt $Directory $Operation $diagnostic
        throw 'Intune script detail readback is unavailable. Preserve the receipt; no upload POST was repeated.'
    }
    $diagnostic.detailFetched=$true
    $diagnostic.detailIdMatches=$detail -is [Collections.IDictionary] -and $detail.Contains('id') -and [string]$detail.id -ceq $id
    if (-not $diagnostic.detailIdMatches) {
        $diagnostic.reason='DetailIdMismatch'
        Save-SetupUploadVerification $Receipt $Directory $Operation $diagnostic
        throw 'Intune script detail identity differs from the list/recorded upload. No script was adopted or uploaded again.'
    }
    $verification=Get-SetupIntuneScriptVerification $detail $Expected
    foreach($key in @('fieldPresence','fieldTypesValid','fieldMatches','contentHashMatches','mismatchedFields')) {$diagnostic[$key]=$verification[$key]}
    $diagnostic.reason=if ($verification.verified) {'Verified'} else {'FieldMismatch'}
    Save-SetupUploadVerification $Receipt $Directory $Operation $diagnostic
    if (-not $verification.verified) {
        $fields=@($verification.mismatchedFields|Where-Object {$_ -cin @('displayName','description','fileName','runAsAccount','runAs32Bit','enforceSignatureCheck','scriptContent')})
        throw ('Intune script verification did not match reviewed fields: '+($fields -join ', ')+'. Preserve the receipt; no upload POST was repeated.')
    }
    return $detail
}

function Assert-ManagedSetupPolicy {
    param($Policy, $Schema)
    if($Policy -isnot [Collections.IDictionary]){throw 'Managed settings must be an object.'}
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
        if($definition.type -ceq 'string'){Assert-ManagedSetupText $value $definition $key}
        if($definition.type -ceq 'array'){
            if($definition.Contains('maxItems') -and $value.Count -gt $definition.maxItems){throw "Too many items: $key"}
            foreach($item in $value){Assert-ManagedSetupText $item $definition.items $key}
        }
    }
    if($Policy.Contains('saveLocation')){
        $parts=$Policy.saveLocation.Split('/')
        if($Policy.saveLocation.StartsWith('/') -or @($parts|Where-Object {-not $_ -or $_ -cin @('.','..') -or $_ -match '[. ]$|^(?i:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)'}).Count){throw 'Use a relative Downloads subfolder without empty, parent, reserved or trailing-dot segments.'}
    }
    if($Policy.Contains('saveAsType') -and $Policy.saveAsType -ceq 'custom' -and -not $Policy.Contains('saveLocation')){throw 'A managed custom save behavior requires a managed Downloads subfolder.'}
}

function Assert-ManagedSetupText {
    param([string]$Value,$Definition,[string]$Key)
    if($Key -cin @('filenamePattern','saveLocation') -and $Value -ceq '__BCK_EMPLOYEE_CHOICE__'){throw "Reserved managed value: $Key"}
    if($Value.Contains([char]0) -or ($Definition.Contains('minLength') -and $Value.Length -lt $Definition.minLength) -or ($Definition.Contains('maxLength') -and $Value.Length -gt $Definition.maxLength) -or ($Definition.Contains('enum') -and $Value -cnotin $Definition.enum) -or ($Definition.Contains('pattern') -and $Value -cnotmatch $Definition.pattern)){throw "Invalid managed value: $Key"}
}

function Assert-ManagedSetupEnvelope {
    param($Policy,[string]$Browser,[bool]$Microsoft365)
    $copy=$Policy|ConvertTo-Json -Depth 20|ConvertFrom-Json -AsHashtable
    $copy.enableGraphTranscriptImport=$Microsoft365
    if($Microsoft365){$copy.graphTenantId='11111111-2222-4333-8444-555555555555';$copy.graphClientId='11111111-2222-4333-8444-555555555555'}
    $config=@{browser=$Browser;extensionId='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';deploymentId='11111111-2222-4333-8444-555555555555';managedPolicy=$copy}
    if([Text.Encoding]::UTF8.GetByteCount(($config|ConvertTo-Json -Depth 20 -Compress)) -gt 4096){throw 'Managed settings exceed the endpoint configuration limit (4096 UTF-8 bytes). Reduce custom terms or destination URL lengths before continuing.'}
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
    $prefix = (Read-SetupAnswer 'Deployment group name begins with').Trim()
    if (-not $prefix) { throw 'A group name is required. There is no All Users or All Devices default.' }
    $filter = [Uri]::EscapeDataString("startswith(displayName,'$($prefix.Replace("'","''"))')")
    $response = Invoke-SetupGraph GET "/groups?`$filter=$filter&`$select=id,displayName,securityEnabled&`$top=100" $null
    $groups = @($response.value)
    if (-not $groups.Count) { throw 'No matching group. No group was created or modified.' }
    if ($response.ContainsKey('@odata.nextLink')) { throw 'Too many groups match. Use a more specific name or an exact GroupId.' }
    for ($i=0; $i -lt $groups.Count; $i++) { Write-SetupMessage "$($i+1). $($groups[$i].displayName) [$($groups[$i].id)]" }
    $selection = 0
    if (-not [int]::TryParse((Read-SetupAnswer 'Group number'), [ref]$selection) -or $selection -lt 1 -or $selection -gt $groups.Count) { throw 'Invalid group selection.' }
    return $groups[$selection-1]
}

function Invoke-EnterpriseSetupCore {
    param($Options, [string]$PackageRoot)
    $defaults = @{TenantId='';GroupId='';Browser='';WithMicrosoft365=$false;WithoutMicrosoft365=$false;Hardened=$false;EnableSpeakerAttribution=$false;SigningCertificateThumbprint='';AzureSigningConfigPath='';DeploymentTransport='PlatformScripts';AllowUnsignedEndpointScripts=$false;OutputDirectory='';PlanOnly=$false;ResumeReceipt='';StatusReceipt=''}
    foreach ($key in $defaults.Keys) { if (-not $Options.ContainsKey($key)) { $Options[$key]=$defaults[$key] } }
    if ($Options.ResumeReceipt -and $Options.StatusReceipt) { throw 'Choose Continue or Check Status, not both.' }
    $existing = $null
    $switchSigner = $false
    $statusOnly = [bool]$Options.StatusReceipt
    $receiptPath = if ($statusOnly) { $Options.StatusReceipt } else { $Options.ResumeReceipt }
    if ($receiptPath) {
        $receiptPath = [IO.Path]::GetFullPath($receiptPath)
        $existing = Read-EnterpriseReceipt $receiptPath
        $Options.DeploymentTransport=if($existing.plan.Contains('deploymentTransport')){[string]$existing.plan.deploymentTransport}else{'PlatformScripts'}
        $Options.TenantId=$existing.plan.tenantId; $Options.GroupId=$existing.plan.groupId
        $Options.Browser=if (@($existing.plan.browsers).Count -eq 2) { 'both' } else { $existing.plan.browsers[0] }
        $Options.WithMicrosoft365=[bool]$existing.plan.microsoft365; $Options.WithoutMicrosoft365=-not $Options.WithMicrosoft365
        $Options.EnableSpeakerAttribution=[bool]$existing.plan.enableGlobalSpeakerAttribution
        $Options.AllowUnsignedEndpointScripts=-not [bool]$existing.plan.signedEndpointScripts
        $Options.SigningCertificateThumbprint=[string]$existing.plan.signingCertificateThumbprint
        $amended=$existing.Contains('signerAmendment')
        if ($amended) { Assert-SetupSignerAmendment $existing (Split-Path -Parent $receiptPath) }
        $savedAzure=$amended -or ($existing.plan.ContainsKey('signingProvider') -and $existing.plan.signingProvider.name -ceq 'AzureArtifactSigning')
        if ($savedAzure -and -not $Options.AzureSigningConfigPath) {
            $Options.AzureSigningConfigPath=if ($amended) {[string]$existing.signerAmendment.azureSigningConfigPath} else {[string]$existing.plan.azureSigningConfigPath}
        }
        $switchSigner=-not $statusOnly -and -not $savedAzure -and [bool]$Options.AzureSigningConfigPath
        if ($switchSigner) { Assert-SetupSignerMigrationEligible $existing }
        if ($savedAzure -or $switchSigner) { $Options.SigningCertificateThumbprint='';$Options.AllowUnsignedEndpointScripts=$false }
        $Options.OutputDirectory=Split-Path -Parent $receiptPath
        Write-SetupStep $(if ($statusOnly) { 'Check an existing deployment' } else { 'Continue an existing deployment safely' })
        Write-SetupMessage "Using saved deployment $($existing.plan.deploymentId). Existing resource identities will be reconciled before any write."
    }
    $win32=$Options.DeploymentTransport -ceq 'Win32'
    if($Options.DeploymentTransport -cnotin @('Win32','PlatformScripts')){throw 'Unsupported saved deployment transport.'}
    if (-not $Options.Browser) { $Options.Browser=Select-SetupBrowser }
    if ($Options.WithMicrosoft365 -and $Options.WithoutMicrosoft365) { throw 'Choose with or without Microsoft 365, not both.' }
    if (-not $Options.WithMicrosoft365 -and -not $Options.WithoutMicrosoft365) {
        Write-SetupMessage '1. Install the extension and set up Microsoft 365 transcript access'
        Write-SetupMessage '2. Install the extension only'
        $choice = Read-SetupAnswer 'Microsoft 365 option: choose 1 or 2'
        if ($choice -cnotin @('1','2')) { throw 'Choose Microsoft 365 option 1 or 2.' }
        $Options.WithMicrosoft365 = $choice -eq '1'
    }
    $m365 = [bool]$Options.WithMicrosoft365
    if ($Options.EnableSpeakerAttribution -and -not $m365) { throw 'Speaker attribution requires Microsoft 365 setup.' }
    $scopes = if ($statusOnly) { @($(if($win32){'DeviceManagementApps.Read.All'}else{'DeviceManagementScripts.Read.All'})) } else { @(Get-SetupScopes $m365 $Options.DeploymentTransport) }
    $browsers = if ($Options.Browser -eq 'both') { @('edge','chrome') } else { @($Options.Browser) }
    if ($Options.PlanOnly) {
        return @{mode='OfflinePlan'; browsers=$browsers; microsoft365=$m365; scopes=$scopes; tenant=$Options.TenantId; group=$Options.GroupId; cloudWrites=$false; betaApis=$(if($win32){@('Intune Win32 device status reports')}else{@('Intune deviceManagementScripts')});endpointContext='SYSTEM';deploymentTransport=$Options.DeploymentTransport}
    }
    $schema = Get-Content -LiteralPath (Join-Path $PackageRoot 'managed-schema.json') -Raw | ConvertFrom-Json -AsHashtable
    if (-not $statusOnly -and $Options.AzureSigningConfigPath -and ($Options.SigningCertificateThumbprint -or $Options.AllowUnsignedEndpointScripts)) { throw 'Choose Azure signing or a local certificate/unsigned pilot, not multiple providers.' }
    $approvedPolicies = @{}
    $chosenPolicy=$null
    foreach ($browserName in $browsers) {
        $profileFile = if ($Options.Hardened) { 'profile.local-only.json' } elseif ($browserName -eq 'edge') { 'profile.json' } else { 'profile.chrome.json' }
        $profile = Get-Content -LiteralPath (Join-Path $PackageRoot $profileFile) -Raw | ConvertFrom-Json -AsHashtable
        Assert-ManagedSetupPolicy $profile.managedPolicy $schema
        if(-not $existing -and $null -eq $chosenPolicy){$chosenPolicy=Select-SetupManagedPolicy $profile.managedPolicy $schema $browserName $m365}
        $approvedPolicies[$browserName]=if ($existing) { $existing.plan.baseManagedPolicies[$browserName] } else { $chosenPolicy }
        Assert-ManagedSetupPolicy $approvedPolicies[$browserName] $schema
        if($win32){Assert-ManagedSetupEnvelope $approvedPolicies[$browserName] $browserName $m365}
    }
    $templatePath = Join-Path $PackageRoot $(if($win32){'EndpointWorker.exe'}else{'Enterprise-Endpoint.ps1'})
    $template = if($win32){''}else{Get-Content -LiteralPath $templatePath -Raw}
    if($win32 -and -not $statusOnly){$win32Package=Read-SetupWin32Package $PackageRoot;if($existing -and (-not $existing.plan.Contains('endpointPackageHash') -or $existing.plan.endpointPackageHash -cne $win32Package.bundleSha256)){throw 'The endpoint package differs from the saved approved plan.'}}
    $templateHash = (Get-FileHash -LiteralPath $templatePath -Algorithm SHA256).Hash
    if ($existing -and -not $statusOnly -and $existing.plan.endpointTemplateHash -cne $templateHash) { throw 'The device template differs from the approved receipt. Continue using the original setup package; no scripts were changed.' }
    if ($Options.TenantId -and $Options.TenantId -notmatch '^([a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}|[0-9a-fA-F-]{36})$') { throw 'Invalid tenant ID or domain.' }
    Write-SetupStep 'Prepare Microsoft sign-in'
    Write-SetupMessage 'Read SECURITY-AND-PERMISSIONS.md before approving. This setup requires an Intune-licensed tenant and administrator permissions.'
    Write-SetupMessage 'Provisioning uses Microsoft Graph PowerShell, separate from the employee transcript app.'
    Write-SetupMessage "Requested administrative scopes: $($scopes -join ', ')"
    Write-SetupMessage $(if($win32){'These permissions have broader reach than this deployment. The signed endpoint app runs as SYSTEM. No Azure signing account is required.'}else{'These permissions have broader reach than this deployment. Intune scripts run as SYSTEM.'})
    if ($script:SetupGuidedUi) {
        if ((Read-SetupAnswer 'Type APPROVE to continue to Microsoft administrator sign-in, or Cancel to stop') -cne 'APPROVE') {
            throw 'Microsoft sign-in cancelled. No deployment was started.'
        }
    }
    $modules=@('Microsoft.Graph.Authentication')
    if ($m365 -and -not $statusOnly) { $modules+='MicrosoftTeams' }
    Write-SetupStage 'prerequisites'
    Require-SetupModules $modules
    $teamsConnected = $false
    $graphConnected = $false
    $freshOperationLock = $null
    $receipt = $existing
    $directory = if ($existing) { [IO.Path]::GetFullPath($Options.OutputDirectory) } else { $null }
    try {
        $signIn = @{Scopes=$scopes; ContextScope='Process'; NoWelcome=$true}
        if ($Options.TenantId) { $signIn.TenantId=$Options.TenantId }
        Write-SetupStage 'signin'
        Assert-SetupSignInOwner
        Connect-MgGraph @signIn
        $graphConnected = $true
        $context = Get-MgContext
        if ($context.Environment -ne 'Global' -or $context.AuthType -ne 'Delegated') { throw 'This pilot supports delegated sign-in to the commercial Microsoft cloud only.' }
        $tenant = Assert-SetupGuid $context.TenantId
        $expectedGuid = [guid]::Empty
        if ([guid]::TryParse($Options.TenantId, [ref]$expectedGuid) -and $tenant -ne $expectedGuid.ToString()) { throw 'Signed-in tenant does not match requested tenant.' }
        if ($statusOnly) {
            Write-SetupStage 'verifying'
            $report = Get-EnterpriseDeliveryStatus $receipt
            $receipt.delivery=$report; Save-SetupReceipt $receipt $Options.OutputDirectory
            Show-EnterpriseDeliveryStatus $report $Options.OutputDirectory
            return $receipt
        }
        Write-SetupStage 'group'
        $group = Select-DeploymentGroup $Options.GroupId
        $groupId = Assert-SetupGuid $group.id
        if ($existing -and $groupId -cne $existing.plan.groupId) {throw 'Microsoft returned a different deployment group than the saved plan.'}
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
            Write-SetupStage 'signin-teams'
            Assert-SetupSignInOwner
            Connect-MicrosoftTeams -TenantId $tenant -AccountId $context.Account | Out-Null
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
        if ($switchSigner) {$needsScriptGeneration=$true}
        $certificate = $null
        $azureProvider = $null
        if ($needsScriptGeneration -and -not $win32) {
            Write-SetupStage 'signing'
            if ($Options.AzureSigningConfigPath) {
                $azureProvider=Read-SetupAzureSigningConfig $Options.AzureSigningConfigPath
                Assert-SetupAzureSigningIdentity $azureProvider $context
                if ($switchSigner) {
                    Invoke-SetupSignerAmendment $receipt $directory $azureProvider $context
                } elseif ($existing) {
                    $approvedProvider=if ($existing.Contains('signerAmendment')) {$existing.signerAmendment.provider} else {$existing.plan.signingProvider}
                    if ((Get-SetupFingerprint $approvedProvider) -cne (Get-SetupFingerprint $azureProvider.identity)) { throw 'Azure signing configuration/provider differs from the immutable approved plan.' }
                }
            } else {
                $certificate = Select-SetupCertificate $Options.SigningCertificateThumbprint ([bool]$Options.AllowUnsignedEndpointScripts)
                if ($certificate) { Assert-SetupLocalSigningCertificate $certificate }
            }
            if ($existing -and $existing.plan.signedEndpointScripts -and $null -eq $certificate -and $null -eq $azureProvider) { throw 'This signed deployment needs its original signing provider only to generate missing scripts. Its signing policy cannot be downgraded.' }
        }
        $deploymentId = if ($existing) { $existing.plan.deploymentId } else { [guid]::NewGuid().ToString() }
        $directory = if ($Options.OutputDirectory) { [IO.Path]::GetFullPath($Options.OutputDirectory) } else { Join-Path $PackageRoot "receipts/$deploymentId" }
        $Options.OutputDirectory=$directory
        if (-not $existing -and (Test-Path -LiteralPath $directory)) { throw 'Output directory already exists. Choose Continue Setup and its receipt instead of deploying another copy.' }
        $plan = if ($existing) { $existing.plan } else { [ordered]@{deploymentId=$deploymentId; tenantId=$tenant; account=$context.Account; groupName=$group.displayName; groupId=$groupId; browsers=$browsers; microsoft365=$m365; signedEndpointScripts=($null -ne $certificate -or $null -ne $azureProvider); signingCertificateThumbprint=$(if ($certificate) { $certificate.Thumbprint } else { '' }); outputDirectory=$directory; teamsBefore=$teamsBefore; enableGlobalTranscriptApi=$m365; enableGlobalSpeakerAttribution=[bool]$Options.EnableSpeakerAttribution; administrativeScopes=$scopes; baseManagedPolicies=$approvedPolicies; endpointTemplateHash=$templateHash; employeeScopes=$(if ($m365) { $delegatedScopes } else { @() })} }
        if (-not $existing -and $azureProvider) { $plan.signingProvider=$azureProvider.identity; $plan.azureSigningConfigPath=$azureProvider.configurationPath }
        if(-not $existing -and $win32){$plan.deploymentTransport='Win32';$plan.signedEndpointScripts=$false;$plan.endpointPackageHash=$win32Package.bundleSha256}
        Write-SetupStage 'review'
        Write-SetupStep 'Review the deployment plan'
        Write-SetupMessage "Tenant: $tenant"
        Write-SetupMessage "Signed in as: $($context.Account)"
        Write-SetupMessage "Deployment group: $($group.displayName) [$groupId]"
        Write-SetupMessage $(if($win32){"Browsers: $($browsers -join ', '); Microsoft 365 transcript setup: $m365; publisher-signed Win32 endpoint app. No customer signing credentials are required."}else{"Browsers: $($browsers -join ', '); Microsoft 365 transcript setup: $m365; signed device scripts: $($plan.signedEndpointScripts)."})
        if ($azureProvider) {
            Write-SetupMessage "Azure Artifact Signing: account $($azureProvider.identity.account), profile $($azureProvider.identity.profile), endpoint $($azureProvider.identity.endpoint)."
            Write-SetupMessage 'Approval includes signing each generated install/removal script through this Azure service. Signing requests may be billable; failures are not automatically retried.'
        }
        Write-SetupMessage "Recovery receipt will be saved in: $directory"
        Write-SetupMessage ('Managed extension choices (unset preferences remain employee choices): '+($plan.baseManagedPolicies|ConvertTo-Json -Depth 20))
        if ($m365) {
            $attributionAfter=if ($Options.EnableSpeakerAttribution) { $true } else { [bool]$teamsBefore.EnableAttributedTranscripts }
            Write-SetupMessage "Global Teams Graph transcript access: $($teamsBefore.EnableGraphTranscriptAccess) -> True."
            Write-SetupMessage "Global Teams speaker attribution: $($teamsBefore.EnableAttributedTranscripts) -> $attributionAfter."
            Write-SetupMessage 'These are organization-wide Teams settings: Graph transcript access can affect every already-consented transcript app, beyond this deployment group and customer app.'
            Write-SetupMessage "Employee app permissions: $($delegatedScopes -join ', '). Consent is tenant-wide; the Intune group does not restrict it."
        }
        Write-SetupMessage 'Existing extension managed settings on assigned devices will be backed up and replaced. Other extension policies are preserved.'
        Write-SetupMessage 'No Store package is re-signed. No meeting transcription is automatically started.'
        if ((Read-SetupAnswer 'Type APPROVE to create these resources, or Enter to cancel') -cne 'APPROVE') { throw 'Setup cancelled before resource creation.' }
        Write-SetupStage 'deploying'
        if (-not $existing) {
            New-Item -ItemType Directory -Path $directory -ErrorAction Stop | Out-Null
            $freshOperationLock = [IO.File]::Open((Join-Path $directory '.setup-operation.lock'),
                [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
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
        if($win32){
            if((Get-FileHash -LiteralPath $templatePath -Algorithm SHA256).Hash -cne $templateHash){throw 'The endpoint executable changed after approval.'}
            Invoke-SetupWin32Deployment $receipt $directory $PackageRoot $approvedPolicies $schema $appId
            return $receipt
        }
        if ((Get-FileHash -LiteralPath $templatePath -Algorithm SHA256).Hash -cne $templateHash) { throw 'Endpoint template changed after approval.' }
        Write-SetupStage 'signing'
        $payloadDirectory=Get-SetupSigningPayloadDirectory $receipt $directory
        $signingPrefix=if ($receipt.Contains('signerAmendment')) {$receipt.signerAmendment.revisionDirectory+'-'} else {''}
        foreach ($browserName in $browsers) {
            $savedScript = @($receipt.scripts | Where-Object browser -eq $browserName)
            if ($savedScript.Count -gt 1) { throw 'Receipt contains duplicate browser scripts.' }
            if ($savedScript.Count -eq 1) {
                foreach ($action in @('Install','Remove')) {
                    $savedPath=Resolve-SetupScriptPath $receipt $directory $savedScript[0] $action
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
            # Recover original embedded JSON from preserved local partials first;
            # both new Azure scripts keep that exact marker/configuration hash.
            $configurationDirectory=if ($receipt.Contains('signerAmendment')) {$directory} else {$payloadDirectory}
            $payloadConfiguration=Get-SetupPayloadConfiguration $config $template $configurationDirectory $browserName $receipt
            Save-SetupPayloadConfiguration $receipt $directory $browserName $payloadConfiguration
            $configurationJson=$payloadConfiguration.json
            $configurationHash=$payloadConfiguration.sha256.ToLowerInvariant()
            foreach ($action in @('Install','Remove')) {
                $scriptPath = Join-Path $payloadDirectory "$browserName-$action.ps1"
                $expectedContent=New-EndpointPayload $config $template $action -ConfigJson $configurationJson
                if ($certificate) {
                    Invoke-SetupLocalSign -Path $scriptPath -Certificate $certificate -Receipt $receipt -Directory $directory -ExpectedContent $expectedContent
                    continue
                }
                $signOperation='AzureSign-'+$signingPrefix+[IO.Path]::GetFileName($scriptPath)
                $reconcileAzure=$azureProvider -and $receipt.operations.ContainsKey($signOperation)
                if (-not $reconcileAzure) {
                    if (Test-Path -LiteralPath $scriptPath) { throw 'An unrecorded generated script already exists. Preserve it and reconcile the receipt; no script was overwritten.' }
                    $stream=[IO.File]::Open($scriptPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
                    try {$bytes=[Text.UTF8Encoding]::new($false).GetBytes($expectedContent);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)} finally {$stream.Dispose()}
                }
                if ($azureProvider) {
                    Invoke-SetupAzureSign $scriptPath $azureProvider $context $receipt $payloadDirectory -ReceiptDirectory $directory -OperationPrefix $signingPrefix -ExpectedContent $expectedContent
                }
            }
            $installPath = Join-Path $payloadDirectory "$browserName-Install.ps1"
            $receipt.scripts += @{browser=$browserName;id=$null;assigned=$false;configurationHash=$configurationHash;
                installFile=[IO.Path]::GetRelativePath($directory,$installPath).Replace('\','/');removeFile=[IO.Path]::GetRelativePath($directory,(Join-Path $payloadDirectory "$browserName-Remove.ps1")).Replace('\','/');
                installHash=(Get-FileHash -LiteralPath $installPath -Algorithm SHA256).Hash;removeHash=(Get-FileHash -LiteralPath (Join-Path $payloadDirectory "$browserName-Remove.ps1") -Algorithm SHA256).Hash}
            Save-SetupReceipt $receipt $directory
        }
        $receipt.status='AwaitingScriptApproval'; Save-SetupReceipt $receipt $directory
        Write-SetupStep 'Approve Intune delivery'
        Write-SetupMessage "Installation/removal scripts and their hashes are in $directory. Review them before upload/assignment."
        foreach ($script in $receipt.scripts) { Write-SetupMessage "$($script.browser): install SHA-256 $($script.installHash)" }
        if ((Read-SetupAnswer 'Type DEPLOY to upload and assign these exact scripts to the approved group, or Enter to retain an unassigned package') -cne 'DEPLOY') {
            Write-SetupMessage 'Package retained without Intune assignment. Any created app/consent and Teams changes remain recorded in receipt.json.'
            return $receipt
        }
        foreach ($script in $receipt.scripts) {
            Write-SetupStep "Upload and assign $($script.browser) to $($group.displayName)"
            $installPath = Resolve-SetupScriptPath $receipt $directory $script 'Install'
            if ((Get-FileHash -LiteralPath $installPath -Algorithm SHA256).Hash -cne $script.installHash) { throw 'Script changed after review.' }
            $body = New-IntuneScriptBody -Name "Better CaptionKeep $($script.browser) $deploymentId" -Signed ([bool]$plan.signedEndpointScripts) -ScriptBytes ([IO.File]::ReadAllBytes($installPath))
            $scriptName=$body.displayName
            $created=Invoke-RecordedSetupCreate $receipt $directory "Upload-$($script.browser)" $body {
                Find-SetupIntuneScriptCandidates $scriptName $body $receipt $directory "Upload-$($script.browser)"
            } {
                param($candidate)
                (Get-SetupIntuneScriptVerification $candidate $body).verified
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
        Write-SetupStage 'verifying'
        Write-SetupMessage 'Intune confirmed the approved group assignments. Devices will install from their browser Store when they check in.'
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
        try {
        if ($teamsConnected) { Disconnect-MicrosoftTeams -ErrorAction SilentlyContinue | Out-Null }
        if ($graphConnected) { Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null }
        if ($receipt -and $receipt.Contains('provisioningGrantCleanup')) {
            $receipt.provisioningGrantCleanup.sessionDisconnected=$true
            if ($Options.OutputDirectory -and (Test-Path -LiteralPath $Options.OutputDirectory)) { Save-SetupReceipt $receipt $Options.OutputDirectory }
        }
        if ($graphConnected -or $teamsConnected) {
            Write-SetupMessage 'Local setup sign-in sessions disconnected. Existing Microsoft provisioning consent is preserved because its ownership cannot be proved. Review temporary administrator grants using your organization process.'
            if ($receipt -and $receipt.appId) { Write-SetupMessage 'The application recorded in this deployment receipt has not been removed. Check the receipt for its verified configuration state.' }
        } else {
            Write-SetupMessage 'Microsoft sign-in did not complete. No approved deployment was started by this attempt.'
        }
        } finally { if ($freshOperationLock) { $freshOperationLock.Dispose() } }
    }
}

function Invoke-EnterpriseSetup {
    param($Options, [string]$PackageRoot)
    # The receipt is the operation identity. Serialize every continuation/status
    # read-modify-write across processes, including direct console entry points.
    $receiptLock = $null
    try {
        $receiptPath = if ($Options.ContainsKey('ResumeReceipt') -and $Options.ResumeReceipt) {
            $Options.ResumeReceipt
        } elseif ($Options.ContainsKey('StatusReceipt') -and $Options.StatusReceipt) { $Options.StatusReceipt } else { $null }
        if ($receiptPath) {
            $canonical = [IO.Path]::GetFullPath($receiptPath)
            if ([IO.Path]::GetFileName($canonical) -ine 'receipt.json' -or -not [IO.File]::Exists($canonical)) {
                throw 'Choose the original receipt.json. No operation was resumed.'
            }
            try {
                $receiptLock = [IO.File]::Open((Join-Path ([IO.Path]::GetDirectoryName($canonical)) '.setup-operation.lock'),
                    [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
            } catch [IO.IOException] {
                throw 'This deployment is already open in another setup window. Close that operation before continuing.'
            }
        }
        return Invoke-EnterpriseSetupCore $Options $PackageRoot
    } finally { if ($receiptLock) { $receiptLock.Dispose() } }
}

if ($MyInvocation.InvocationName -ne '.') {
    $options = @{
        TenantId=$TenantId; GroupId=$GroupId; Browser=$Browser; WithMicrosoft365=[bool]$WithMicrosoft365
        WithoutMicrosoft365=[bool]$WithoutMicrosoft365; Hardened=[bool]$Hardened
        EnableSpeakerAttribution=[bool]$EnableSpeakerAttribution; SigningCertificateThumbprint=$SigningCertificateThumbprint
        AzureSigningConfigPath=$AzureSigningConfigPath
        DeploymentTransport=$DeploymentTransport
        AllowUnsignedEndpointScripts=[bool]$AllowUnsignedEndpointScripts; OutputDirectory=$OutputDirectory; PlanOnly=[bool]$PlanOnly
        ResumeReceipt=$ResumeReceipt;StatusReceipt=$StatusReceipt
    }
    try {
        Initialize-SetupRuntime -OwnerWindowHandle $OwnerWindowHandle -OwnerProcessId $OwnerProcessId -StatusPipeName $StatusPipeName
        Write-SetupStage 'preparing'
        $result = Invoke-EnterpriseSetup $options $PSScriptRoot
        Write-SetupStage 'complete'
        if ($GuidedUi) {
            $status = if ($result -and $result.Contains('status')) { [string]$result.status } else { 'No deployment result' }
            Show-SetupOutcome "Setup result: $status. Submitted assignments are not proof of installation. Use Check deployment status for device reports."
        } else { $result }
    } catch {
        if ($_.Exception -is [OperationCanceledException]) { Write-SetupStage 'canceled' } else { Write-SetupStage 'failed' }
        $failureReceipt = if ($ResumeReceipt) { $ResumeReceipt } elseif ($StatusReceipt) { $StatusReceipt }
            elseif ($options.OutputDirectory) { Join-Path $options.OutputDirectory 'receipt.json' } else { $null }
        $recoveryMessage = if ($failureReceipt -and [IO.File]::Exists($failureReceipt)) {
            'Preserve your receipt. Use Continue saved setup to reconcile existing resources; do not start another copy.'
        } else { 'No deployment receipt was created. Close this result and return to the setup window; there is no saved deployment to continue from this attempt.' }
        Show-SetupOutcome "Setup stopped: $($_.Exception.Message)`n$recoveryMessage" -Failure
        exit 1
    } finally { Close-SetupRuntime }
}
