# A signer amendment changes delivery signing only; the deployment plan and
# provisioned Microsoft resource identities remain the original approved ones.
function Get-SetupSignerResourceFingerprint {
    param($Receipt)
    $operations=@{}
    foreach($name in @('CreateApplication','CreateServicePrincipal','GrantTranscriptConsent')) {
        if ($Receipt.operations.ContainsKey($name)) {
            $saved=$Receipt.operations[$name]
            $operations[$name]=@{requestFingerprint=$saved.requestFingerprint;resourceId=$saved.resourceId;operationId=$saved.operationId}
        }
    }
    Get-SetupFingerprint @{plan=$Receipt.plan;appId=$Receipt.appId;applicationObjectId=$Receipt.applicationObjectId;
        servicePrincipalId=$Receipt.servicePrincipalId;consentGrantId=$Receipt.consentGrantId;operations=$operations;
        teamsAfter=$(if ($Receipt.Contains('teamsAfter')) {$Receipt.teamsAfter} else {$null})}
}

function Assert-SetupSignerMigrationEligible {
    param($Receipt)
    if (-not $Receipt.plan.signedEndpointScripts -or [string]$Receipt.plan.signingCertificateThumbprint -cnotmatch '^[A-Fa-f0-9]{40}$' -or
        $Receipt.plan.Contains('signingProvider') -or $Receipt.Contains('signerAmendment')) { throw 'Only an original paused local-certificate deployment can switch signing provider.' }
    foreach($script in @($Receipt.scripts)) {
        if ($script.id -or $script.assigned) { throw 'Signer cannot change after a script has been uploaded or assigned.' }
    }
    foreach($name in $Receipt.operations.Keys) {
        if ($name -match '^(Upload-|Assign-|AzureSign-)') { throw 'Prior upload, assignment or Azure signing operations must be reconciled under their original plan. No signer switch is allowed.' }
    }
    if ($Receipt.plan.microsoft365) {
        foreach($pair in @(@('CreateApplication','applicationObjectId'),@('CreateServicePrincipal','servicePrincipalId'),@('GrantTranscriptConsent','consentGrantId'))) {
            $name=$pair[0];$field=$pair[1]
            if (-not $Receipt.operations.ContainsKey($name) -or $Receipt.operations[$name].state -cnotin @('Confirmed','Reconciled') -or
                -not $Receipt.operations[$name].requestFingerprint -or -not $Receipt.operations[$name].operationId -or
                $Receipt.operations[$name].resourceId -cne $Receipt[$field]) { throw 'Existing Microsoft resources must have confirmed immutable receipt identities before switching signer. No resource POST is allowed.' }
        }
        Assert-SetupGuid $Receipt.appId | Out-Null
        if (-not $Receipt.Contains('teamsAfter') -or -not $Receipt.teamsAfter.EnableGraphTranscriptAccess) { throw 'The original Teams configuration must be recorded before switching signer.' }
    }
}

function Assert-SetupSignerAmendment {
    param($Receipt,[string]$Directory)
    $amendment=$Receipt.signerAmendment
    if ([IO.Path]::GetFullPath($Directory).TrimEnd([IO.Path]::DirectorySeparatorChar) -ine
        [IO.Path]::GetFullPath([string]$Receipt.plan.outputDirectory).TrimEnd([IO.Path]::DirectorySeparatorChar)) {
        throw 'Signer amendment must use the original canonical receipt directory.'
    }
    if ($amendment.version -ne 1 -or $amendment.state -cne 'Approved' -or
        $amendment.revisionDirectory -cnotmatch '^signing-revision-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' -or
        $amendment.beforeReceiptFile -cne ($amendment.revisionDirectory+'.before-receipt.json') -or
        $amendment.originalPlanFingerprint -cne (Get-SetupFingerprint $Receipt.plan) -or
        $amendment.originalPlanFingerprint -cne (Get-SetupFingerprint $amendment.originalPlan) -or
        $amendment.resourceFingerprint -cne (Get-SetupSignerResourceFingerprint $Receipt) -or
        $amendment.provider.name -cne 'AzureArtifactSigning' -or $amendment.approval -cne 'SWITCH SIGNER' -or
        $amendment.requestedSignatures -ne (@($Receipt.plan.browsers).Count*2)) { throw 'The approved signer amendment, original plan or Microsoft identities changed. Preserve the receipt.' }
    $beforePath=Join-Path $Directory $amendment.beforeReceiptFile
    if (-not [IO.File]::Exists($beforePath) -or (Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($beforePath))) -cne $amendment.beforeReceiptHash) {
        throw 'The immutable before-amendment receipt is missing or changed.'
    }
    $beforeReceipt=[IO.File]::ReadAllText($beforePath)|ConvertFrom-Json -AsHashtable
    if ((Get-SetupFingerprint $beforeReceipt.plan) -cne $amendment.originalPlanFingerprint -or
        (Get-SetupSignerResourceFingerprint $beforeReceipt) -cne $amendment.resourceFingerprint -or
        (Get-SetupFingerprint @($beforeReceipt.scripts)) -cne (Get-SetupFingerprint @($amendment.originalScripts))) {
        throw 'Signer amendment history differs from its immutable original receipt.'
    }
    foreach($name in $amendment.originalFiles.Keys) {
        if ($name -cnotmatch '^(edge|chrome)-(Install|Remove)\.ps1$') { throw 'Invalid original script path in signer amendment.' }
        $path=Join-Path $Directory $name
        $expected=$amendment.originalFiles[$name]
        if (($null -eq $expected -and [IO.File]::Exists($path)) -or
            ($null -ne $expected -and (-not [IO.File]::Exists($path) -or (Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($path))) -cne $expected))) {
            throw 'An original local signing file changed. Restore its exact preserved bytes; no Azure signing request may proceed.'
        }
    }
    $revision=Join-Path $Directory $amendment.revisionDirectory
    if ([IO.Directory]::Exists($revision) -and (([IO.File]::GetAttributes($revision) -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'Signing revision directory cannot be a linked path.' }
}

function Invoke-SetupSignerAmendment {
    param($Receipt,[string]$Directory,$Provider,$GraphContext)
    Assert-SetupSignerMigrationEligible $Receipt
    Assert-SetupAzureSigningIdentity $Provider $GraphContext
    if ((Get-SetupFingerprint (Assert-SetupMicrosoftSigningTools $Provider.config)) -cne (Get-SetupFingerprint $Provider.identity.toolHashes)) { throw 'Azure signing tools changed before signer review.' }
    Write-SetupStep 'Review signing provider change'
    Write-SetupMessage "This saved deployment will use Azure Artifact Signing account $($Provider.identity.account), profile $($Provider.identity.profile), endpoint $($Provider.identity.endpoint)."
    Write-SetupMessage 'The original local certificate scripts and receipt will be preserved. Existing Microsoft app, consent, Teams settings and deployment group will be reused; this amendment creates none of those resources.'
    Write-SetupMessage 'Approval permits billable signing requests for the new installation/removal scripts. No failed signing request is automatically retried. Upload and assignment still require separate approval.'
    Write-SetupMessage "Requested signatures: $(@($Receipt.plan.browsers).Count*2), one installation and one removal script per approved browser."
    if ((Read-SetupAnswer 'Type SWITCH SIGNER to approve Azure signing for this saved deployment, or Cancel to stop') -cne 'SWITCH SIGNER') { throw 'Signing provider change was not approved. Original deployment retained.' }
    $before=[IO.File]::ReadAllBytes((Join-Path $Directory 'receipt.json'))
    $disk=[Text.Encoding]::UTF8.GetString($before)|ConvertFrom-Json -AsHashtable
    if ((Get-SetupFingerprint $disk) -cne (Get-SetupFingerprint $Receipt)) { throw 'Saved receipt changed before signer amendment. No change was recorded.' }
    $revision='signing-revision-'+[guid]::NewGuid().ToString()
    $backup=$revision+'.before-receipt.json'
    $stream=[IO.File]::Open((Join-Path $Directory $backup),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {$stream.Write($before,0,$before.Length);$stream.Flush($true)} finally {$stream.Dispose()}
    $originalFiles=@{}
    foreach($browser in $Receipt.plan.browsers) { foreach($action in @('Install','Remove')) {
        $name="$browser-$action.ps1";$path=Join-Path $Directory $name
        $originalFiles[$name]=if ([IO.File]::Exists($path)) {Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($path))} else {$null}
    }}
    # Integer time survives ConvertFrom-Json on supported PowerShell versions;
    # ISO date strings may be coerced and reformatted during receipt readback.
    $Receipt.signerAmendment=@{version=1;state='Approved';approvedAtUnixMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();approval='SWITCH SIGNER';
        originalPlan=($Receipt.plan|ConvertTo-Json -Depth 35|ConvertFrom-Json -AsHashtable);originalPlanFingerprint=(Get-SetupFingerprint $Receipt.plan);
        originalScripts=@($Receipt.scripts);resourceFingerprint=(Get-SetupSignerResourceFingerprint $Receipt);originalFiles=$originalFiles;
        beforeReceiptFile=$backup;beforeReceiptHash=(Get-SetupLocalBytesHash $before);revisionDirectory=$revision;
        provider=$Provider.identity;azureSigningConfigPath=$Provider.configurationPath;requestedSignatures=(@($Receipt.plan.browsers).Count*2)}
    $Receipt.scripts=@()
    Save-SetupReceipt $Receipt $Directory
    $saved=Get-Content -LiteralPath (Join-Path $Directory 'receipt.json') -Raw|ConvertFrom-Json -AsHashtable
    if ((Get-SetupFingerprint $saved.signerAmendment) -cne (Get-SetupFingerprint $Receipt.signerAmendment) -or @($saved.scripts).Count) { throw 'Signer amendment receipt readback failed. No signing request may proceed.' }
    Assert-SetupSignerAmendment $saved $Directory
    [IO.Directory]::CreateDirectory((Join-Path $Directory $revision)) | Out-Null
}

function Get-SetupSigningPayloadDirectory {
    param($Receipt,[string]$Directory)
    if (-not $Receipt.Contains('signerAmendment')) {return $Directory}
    Assert-SetupSignerAmendment $Receipt $Directory
    $path=Join-Path $Directory $Receipt.signerAmendment.revisionDirectory
    [IO.Directory]::CreateDirectory($path) | Out-Null
    $path
}

function Resolve-SetupScriptPath {
    param($Receipt,[string]$Directory,$Script,[ValidateSet('Install','Remove')][string]$Action)
    if ($Script.browser -cnotin @('edge','chrome')) {throw 'Unsupported script browser in receipt.'}
    $name="$($Script.browser)-$Action.ps1"
    $key=if ($Action -ceq 'Install') {'installFile'} else {'removeFile'}
    if (-not $Receipt.Contains('signerAmendment')) {
        if ($Script.ContainsKey($key) -and $Script[$key] -cne $name) {throw 'Unexpected script path in original receipt.'}
        return Join-Path $Directory $name
    }
    Assert-SetupSignerAmendment $Receipt $Directory
    $expected=$Receipt.signerAmendment.revisionDirectory+'/'+$name
    if (-not $Script.ContainsKey($key) -or $Script[$key] -cne $expected) {throw 'Script path does not match its approved signing revision.'}
    Join-Path $Directory $expected
}
