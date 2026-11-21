# Local signing never installs trust or retries a partially completed signature.
function New-SetupLocalCertificateChain {
    [Security.Cryptography.X509Certificates.X509Chain]::new()
}

function Get-SetupLocalChainFlags {
    param($Chain)
    $known = [Enum]::GetNames([Security.Cryptography.X509Certificates.X509ChainStatusFlags])
    @($Chain.ChainStatus | ForEach-Object {
        foreach ($flag in ([string]$_.Status -split ',\s*')) {
            if ($flag -cin $known -and $flag -cne 'NoError') { $flag }
        }
    } | Sort-Object -Unique)
}

function Assert-SetupLocalSigningCertificate {
    param($Certificate)
    if (-not (Test-SetupCodeSigningCertificate $Certificate) -or
        $Certificate.NotBefore -isnot [datetime] -or $Certificate.NotBefore -gt (Get-Date)) {
        throw 'Choose a currently valid code-signing certificate with its private key and code-signing EKU.'
    }
    $chain = New-SetupLocalCertificateChain
    try {
        $null = $chain.ChainPolicy.ApplicationPolicy.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))
        $chain.ChainPolicy.RevocationMode = [Security.Cryptography.X509Certificates.X509RevocationMode]::Online
        $chain.ChainPolicy.VerificationFlags = [Security.Cryptography.X509Certificates.X509VerificationFlags]::NoFlag
        if (-not $chain.Build($Certificate)) {
            $flags = @(Get-SetupLocalChainFlags $chain)
            if ('UntrustedRoot' -cin $flags) {
                throw 'Signing certificate has an UntrustedRoot. Ask your organization to establish its approved certificate trust before continuing. Setup does not install trust or change trust settings.'
            }
            throw ('Signing certificate chain is not trusted for code signing. Chain flags: ' + ($flags -join ', ') + '. No tenant changes may begin.')
        }
    } finally { $chain.Dispose() }
}

function Get-SetupLocalBytesHash {
    param([byte[]]$Bytes)
    [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToUpperInvariant()
}

function Get-SetupLocalReviewedBody {
    param([string]$Content, [switch]$SignedFile)
    $body = $Content.Replace("`r`n", "`n")
    if ($SignedFile) {
        # Only the conventional trailing Authenticode block is removable.
        $body = [regex]::Replace($body, '(?m)\n?# SIG # Begin signature block\n(?:#(?: [A-Za-z0-9+/=]+)?\n)+# SIG # End signature block\n*\z', '')
    }
    if ($body.Contains('# SIG # Begin signature block') -or $body.Contains('# SIG # End signature block')) {
        throw 'Generated script has an ambiguous signature block. Preserve the original file.'
    }
    $body.TrimEnd([char[]]"`r`n")
}

function Get-SetupLocalSignatureDiagnostic {
    param($Signature)
    $known = @('Valid','UnknownError','NotSigned','HashMismatch','NotTrusted','NotSupportedFileFormat','Incompatible')
    $status = [string]$Signature.Status
    if ($status -cnotin $known) { $status = 'UnknownError' }
    $flags = @()
    if ($Signature.SignerCertificate) {
        $chain = New-SetupLocalCertificateChain
        try {
            $null = $chain.ChainPolicy.ApplicationPolicy.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))
            $chain.ChainPolicy.RevocationMode = [Security.Cryptography.X509Certificates.X509RevocationMode]::Online
            $chain.ChainPolicy.VerificationFlags = [Security.Cryptography.X509Certificates.X509VerificationFlags]::NoFlag
            try { $null = $chain.Build($Signature.SignerCertificate); $flags = @(Get-SetupLocalChainFlags $chain) } catch { $flags = @() }
        } finally { $chain.Dispose() }
    }
    @{status=$status;chainFlags=$flags}
}

function Assert-SetupLocalSignedFile {
    param([string]$Path, [string]$ExpectedBody, [string]$SignerThumbprint, [string]$SignerHash)
    $before = Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($Path))
    $body = Get-SetupLocalReviewedBody ([IO.File]::ReadAllText($Path)) -SignedFile
    if ($body -cne $ExpectedBody) { throw 'The generated script body differs from the reviewed payload. Preserve the original file; it was not signed again.' }
    $signature = Get-AuthenticodeSignature -LiteralPath $Path -ErrorAction Stop
    if ([string]$signature.Status -cne 'Valid' -or -not $signature.SignerCertificate) {
        throw 'The existing script does not have a valid trusted Authenticode signature. Preserve it; no signing retry or unsigned fallback was performed.'
    }
    if ($signature.SignerCertificate.Thumbprint.ToUpperInvariant() -cne $SignerThumbprint -or
        (Get-SetupLocalBytesHash $signature.SignerCertificate.RawData) -cne $SignerHash) {
        throw 'The script signer differs from the immutable approved plan. Preserve the file.'
    }
    $after = Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($Path))
    if ($after -cne $before) { throw 'The signed script changed during verification. Preserve the file.' }
    $after
}

function Save-SetupLocalSigningJournal {
    param($Receipt, [string]$Directory, [string]$Operation)
    Save-SetupReceipt $Receipt $Directory
    $saved = [IO.File]::ReadAllText((Join-Path $Directory 'receipt.json')) | ConvertFrom-Json -AsHashtable -ErrorAction Stop
    if (-not $saved.operations.ContainsKey($Operation) -or
        ($saved.operations[$Operation] | ConvertTo-Json -Depth 10 -Compress) -cne
        ($Receipt.operations[$Operation] | ConvertTo-Json -Depth 10 -Compress) -or
        $saved.pendingOperation -cne $Receipt.pendingOperation -or
        $saved.plan.signingCertificateThumbprint -cne $Receipt.plan.signingCertificateThumbprint) {
        throw 'Signing receipt readback did not match. No signing request may proceed; preserve the file and receipt.'
    }
}

function Invoke-SetupLocalSign {
    param([string]$Path, $Certificate, $Receipt, [string]$Directory, [string]$ExpectedContent)
    if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Path)) -ine [IO.Path]::GetFullPath($Directory).TrimEnd([IO.Path]::DirectorySeparatorChar)) {
        throw 'Signing file must belong to its receipt directory.'
    }
    $thumbprint = $Certificate.Thumbprint.ToUpperInvariant()
    if ($thumbprint -cnotmatch '^[A-F0-9]{40}$' -or
        $Receipt.plan.signingCertificateThumbprint.ToUpperInvariant() -cne $thumbprint) {
        throw 'Local signing certificate differs from the immutable approved plan.'
    }
    $signerHash = Get-SetupLocalBytesHash $Certificate.RawData
    $body = Get-SetupLocalReviewedBody $ExpectedContent
    $bodyHash = Get-SetupLocalBytesHash ([Text.Encoding]::UTF8.GetBytes($body))
    $operation = 'LocalSign-' + [IO.Path]::GetFileName($Path)
    $prior = if ($Receipt.operations.ContainsKey($operation)) { $Receipt.operations[$operation] } else { $null }
    if ($prior) {
        if ($prior.state -cnotin @('Pending','Ambiguous','Confirmed','Reconciled') -or
            ($prior.state -cin @('Confirmed','Reconciled') -and -not $prior.signedHash)) {
            throw 'The prior signing journal is incomplete or ambiguous. Preserve it and the file.'
        }
        if ($prior.signerThumbprint -cne $thumbprint -or $prior.signerCertificateHash -cne $signerHash -or
            $prior.expectedContentHash -cne $bodyHash) { throw 'The original signing identity or reviewed payload changed. Preserve the receipt and file.' }
        if (-not [IO.File]::Exists($Path)) { throw 'The previously journaled signing file is missing. Restore it; no replacement was created.' }
        if ($prior.signedHash -and (Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($Path))) -cne $prior.signedHash) {
            throw 'The previously recorded signed hash changed. Restore the exact original file; no signing retry was performed.'
        }
    }
    Assert-SetupLocalSigningCertificate $Certificate
    if ([IO.File]::Exists($Path)) {
        $signedHash = Assert-SetupLocalSignedFile $Path $body $thumbprint $signerHash
        $Receipt.operations[$operation] = @{state='Reconciled';signerThumbprint=$thumbprint;signerCertificateHash=$signerHash;
            expectedContentHash=$bodyHash;unsignedHash=$(if ($prior) { $prior.unsignedHash } else { $null });signedHash=$signedHash}
        $Receipt.pendingOperation=$null
        Save-SetupLocalSigningJournal $Receipt $Directory $operation
        return
    }
    # Exclusive creation preserves every preexisting file, including unjournaled partials.
    $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($ExpectedContent)
        $stream.Write($bytes, 0, $bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
    $unsignedHash = Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($Path))
    $Receipt.operations[$operation] = @{state='Pending';signerThumbprint=$thumbprint;signerCertificateHash=$signerHash;
        expectedContentHash=$bodyHash;unsignedHash=$unsignedHash;signedHash=$null}
    $Receipt.pendingOperation=$operation
    Save-SetupLocalSigningJournal $Receipt $Directory $operation
    try {
        if ((Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($Path))) -cne $unsignedHash) { throw 'Unsigned script changed after journal readback.' }
        $null = Set-AuthenticodeSignature -LiteralPath $Path -Certificate $Certificate -HashAlgorithm SHA256 -ErrorAction Stop
        $Receipt.operations[$operation].signedHash = Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($Path))
        $signature = Get-AuthenticodeSignature -LiteralPath $Path -ErrorAction Stop
        $Receipt.operations[$operation].diagnostic = Get-SetupLocalSignatureDiagnostic $signature
        $verified = Assert-SetupLocalSignedFile $Path $body $thumbprint $signerHash
        if ($verified -cne $Receipt.operations[$operation].signedHash) { throw 'Signed script changed during final verification.' }
        $Receipt.operations[$operation].state='Confirmed'
        $Receipt.pendingOperation=$null
        Save-SetupLocalSigningJournal $Receipt $Directory $operation
    } catch {
        $Receipt.operations[$operation].state='Ambiguous'
        $Receipt.operations[$operation].signedHash=Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($Path))
        # Preserve only bounded public status/chain enums, never raw signer errors.
        try { $Receipt.operations[$operation].diagnostic=Get-SetupLocalSignatureDiagnostic (Get-AuthenticodeSignature -LiteralPath $Path -ErrorAction Stop) } catch { }
        Save-SetupLocalSigningJournal $Receipt $Directory $operation
        throw 'Local signing could not be independently verified. Preserve the file and receipt; review the recorded signature status and chain flags. No signing retry or unsigned fallback was performed.'
    }
}
