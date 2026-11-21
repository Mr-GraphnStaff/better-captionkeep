[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$FilePath,
    [Parameter(Mandatory)][string]$ExpectedPublisher,
    [string]$MetadataPath,
    [string]$SignToolPath,
    [string]$DlibPath,
    [string]$ProfileResourceId,
    [switch]$VerifyOnly
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if (-not $env:AGENT_WORKING_DIR) { throw 'Run release signing through working_area.py run.' }

function Assert-OrdinaryFile([string]$Path) {
    if (-not [IO.Path]::IsPathFullyQualified($Path) -or -not [IO.File]::Exists($Path)) { throw 'An existing absolute file path is required.' }
    $full=[IO.Path]::GetFullPath($Path)
    for($ancestor=$full;$ancestor;$ancestor=[IO.Path]::GetDirectoryName($ancestor)) {
        if (([IO.File]::GetAttributes($ancestor) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked signing inputs are not supported.' }
    }
    return $full
}
function Assert-PublicSignature([string]$Path) {
    $signature=Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate -or $null -eq $signature.TimeStamperCertificate) {
        throw 'A valid, timestamped Authenticode signature is required.'
    }
    if ($signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false) -cne $ExpectedPublisher) {
        throw 'The signed publisher does not match the reviewed release publisher.'
    }
    $ekus=@($signature.SignerCertificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | ForEach-Object { $_.EnhancedKeyUsages } | ForEach-Object { $_.Value })
    if ($ekus -notcontains '1.3.6.1.5.5.7.3.3' -or $ekus -notcontains '1.3.6.1.4.1.311.97.1.0' -or
        @($ekus | Where-Object { $_ -like '1.3.6.1.4.1.311.97.1.3.1.*' }).Count) {
        throw 'The release requires public code-signing trust; private tenant/profile signatures cannot ship.'
    }
}

$file=Assert-OrdinaryFile $FilePath
$checkout=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$allowedRoots=@((Join-Path $checkout 'Dev'),(Join-Path $checkout 'working'))
if (-not @($allowedRoots | Where-Object { $file.StartsWith(([IO.Path]::GetFullPath($_).TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase) }).Count) {
    throw 'Administrator signing inputs must be deliberate Dev artifacts or managed working intermediates.'
}
if ([IO.Path]::GetExtension($file) -notin @('.exe','.dll','.ps1')) { throw 'Only owned executable, library and PowerShell release files can be signed.' }
if ([string]::IsNullOrWhiteSpace($ExpectedPublisher)) { throw 'A reviewed publisher name is required.' }
if ($VerifyOnly) {
    Assert-PublicSignature $file
    @{file=[IO.Path]::GetFileName($file);sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash;verified=$true} | ConvertTo-Json -Compress
    exit 0
}
$metadataFile=Assert-OrdinaryFile $MetadataPath
$metadata=Get-Content -LiteralPath $metadataFile -Raw | ConvertFrom-Json -AsHashtable
$keys=@('Endpoint','CodeSigningAccountName','CertificateProfileName')
if ($metadata.Count -ne 3 -or @($metadata.Keys | Where-Object { $_ -cnotin $keys }).Count) { throw 'Signing metadata accepts exactly Endpoint, CodeSigningAccountName and CertificateProfileName.' }
$endpoint=[uri]$metadata.Endpoint
if ($endpoint.Scheme -cne 'https' -or $endpoint.Host -cnotmatch '^[a-z][a-z0-9-]{1,15}\.codesigning\.azure\.net$' -or $endpoint.Port -ne 443 -or $endpoint.AbsolutePath -ne '/' -or $endpoint.Query -or $endpoint.Fragment -or $endpoint.UserInfo) { throw 'Only a regional Azure Artifact Signing HTTPS endpoint is accepted.' }
if ($ProfileResourceId -cnotmatch '^/subscriptions/[a-fA-F0-9-]{36}/resourceGroups/[A-Za-z0-9_.()-]+/providers/Microsoft.CodeSigning/codeSigningAccounts/([A-Za-z0-9-]+)/certificateProfiles/([A-Za-z0-9-]+)$') { throw 'An exact Azure certificate profile resource ID is required.' }
if ($metadata.CodeSigningAccountName -cne $Matches[1] -or $metadata.CertificateProfileName -cne $Matches[2]) { throw 'Signing metadata does not match the reviewed Azure profile.' }
$profileJson=& az.cmd rest --method get --url "https://management.azure.com${ProfileResourceId}?api-version=2024-02-05-preview" --query properties --output json --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Azure profile readback failed; no signing was requested.' }
$profile=($profileJson -join "`n") | ConvertFrom-Json
if ($profile.profileType -cne 'PublicTrust' -or $profile.status -cne 'Active') { throw 'An active Public Trust profile is required. No private or test signing fallback is allowed.' }
foreach($tool in @($SignToolPath,$DlibPath)) {
    $null=Assert-OrdinaryFile $tool
    $signature=Get-AuthenticodeSignature -LiteralPath $tool
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|,\s*)O=Microsoft Corporation(,|$)') { throw 'Signing tools must have valid Microsoft Authenticode signatures.' }
}
if ((Get-AuthenticodeSignature -LiteralPath $file).Status -ne 'NotSigned') { throw 'Input is already signed or has an ambiguous signature; no automatic signing retry.' }
# Share a request budget across payload, compiler callback and outer installer.
# A reservation remains consumed even if the service result is ambiguous.
$journalPath=$env:BCK_ADMIN_SIGNING_JOURNAL
$maximum=0
if (-not [int]::TryParse($env:BCK_ADMIN_SIGNING_MAX_REQUESTS,[ref]$maximum) -or $maximum -lt 1 -or $maximum -gt 20) {
    throw 'Release signing requires an explicit request budget of at most 20.'
}
if ([string]::IsNullOrWhiteSpace($journalPath) -or -not [IO.Path]::IsPathFullyQualified($journalPath)) { throw 'A managed signing journal is required.' }
$journalPath=[IO.Path]::GetFullPath($journalPath)
if (-not $journalPath.StartsWith((Join-Path $checkout 'working')+'\',[StringComparison]::OrdinalIgnoreCase) -or
    -not $journalPath.EndsWith('.json',[StringComparison]::OrdinalIgnoreCase)) { throw 'The signing journal must be inside working/.' }
$null=Assert-OrdinaryFile $metadataFile
for($ancestor=[IO.Path]::GetDirectoryName($journalPath);$ancestor;$ancestor=[IO.Path]::GetDirectoryName($ancestor)) {
    if (([IO.File]::GetAttributes($ancestor) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked journal ancestors are forbidden.' }
}
if ([IO.File]::Exists($journalPath)) { $null=Assert-OrdinaryFile $journalPath }
if ([IO.File]::Exists($journalPath+'.lock')) { $null=Assert-OrdinaryFile ($journalPath+'.lock') }
$lock=[IO.File]::Open($journalPath+'.lock',[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {
    $journal=if ([IO.File]::Exists($journalPath)) {Get-Content -LiteralPath $journalPath -Raw|ConvertFrom-Json -AsHashtable} else {@{schemaVersion=1;maximumRequests=$maximum;attempts=@()}}
    if ($journal.schemaVersion -ne 1 -or $journal.maximumRequests -ne $maximum -or $journal.attempts -isnot [array]) { throw 'Signing journal is incompatible.' }
    if ($journal.attempts.Count -ge $maximum) { throw 'The signing request budget is exhausted.' }
    if (@($journal.attempts|Where-Object {$_.path -ieq $file}).Count) { throw 'This file already has a signing attempt; automatic retries are forbidden.' }
    $attempt=@{path=$file;unsignedSha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash;status='Reserved';createdUtc=[DateTimeOffset]::UtcNow.ToString('o')}
    $journal.attempts+=@($attempt)
    [IO.File]::WriteAllText($journalPath,($journal|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    try {
        & $SignToolPath sign /fd SHA256 /tr 'http://timestamp.acs.microsoft.com' /td SHA256 /dlib $DlibPath /dmdf $metadataFile $file
        if ($LASTEXITCODE -ne 0) { throw 'Artifact Signing failed. Inspect the file before any explicit retry.' }
        Assert-PublicSignature $file
        & $SignToolPath verify /pa /all $file
        if ($LASTEXITCODE -ne 0) { throw 'SignTool public-policy verification failed.' }
        $attempt.status='Verified'
        $attempt.signedSha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    } catch {
        $attempt.status='NeedsReview'
        throw
    } finally {
        [IO.File]::WriteAllText($journalPath,($journal|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    }
} finally { $lock.Dispose() }
@{file=[IO.Path]::GetFileName($file);sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash;verified=$true} | ConvertTo-Json -Compress
