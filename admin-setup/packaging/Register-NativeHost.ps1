#Requires -Version 5.1
[CmdletBinding()]
param([string]$PackageDirectory=$PSScriptRoot, [string]$RecoveryDirectory, [switch]$PlanOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

# Current-user browser integration only. No elevation, tenant calls or trust installation.
function Get-NativeHostOrigins {
    return @('chrome-extension://pjpibiimicedkckleehljlklmblkacph/',
        'chrome-extension://ecpjboeanaehianibdbgijldbikdgkhm/',
        'chrome-extension://edefcbdhahfolgkoamkbknjppojpaffk/',
        'chrome-extension://nabjdlnkkaonnbnimnmnhjcbigceebml/')
}

function Get-NativeHostRegistryKeys {
    $name='com.daftech.bettercaptionkeep.adminsetup'
    return @("Software\Google\Chrome\NativeMessagingHosts\$name",
        "Software\Microsoft\Edge\NativeMessagingHosts\$name",
        "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$name")
}

function Get-NativeHostRegistryValue {
    param([string]$Key)
    $registry=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($Key,$false)
    if ($null -eq $registry) { return @{keyExists=$false;valueExists=$false;value=$null;kind=$null} }
    try {
        $exists=@($registry.GetValueNames()) -contains ''
        return @{keyExists=$true;valueExists=$exists;
            value=$(if($exists){$registry.GetValue('', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)}else{$null});
            kind=$(if($exists){$registry.GetValueKind('').ToString()}else{$null})}
    } finally { $registry.Dispose() }
}

function Set-NativeHostRegistryValue {
    param([string]$Key,[string]$ManifestPath)
    if ($Key -cnotin @(Get-NativeHostRegistryKeys)) { throw 'Registry path is outside the approved browser integration.' }
    $registry=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($Key,$true)
    try { $registry.SetValue('',$ManifestPath,[Microsoft.Win32.RegistryValueKind]::String) }
    finally { $registry.Dispose() }
}

function Assert-NativeHostPath {
    param([string]$Path)
    $current=[IO.Path]::GetFullPath($Path)
    while($current) {
        if (([IO.File]::GetAttributes($current) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked registration/package paths are not supported.' }
        $parent=[IO.Path]::GetDirectoryName($current)
        if ($parent -ceq $current) { break }
        $current=$parent
    }
}

function Test-NativeHostPackage {
    param([string]$Directory)
    $root=[IO.Path]::GetFullPath($Directory).TrimEnd('\','/')
    Assert-NativeHostPath $root
    $manifestPath=Join-Path $root 'package-manifest.json'
    Assert-NativeHostPath $manifestPath
    $manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.schemaVersion -ne 1) { throw 'Unsupported administrator package.' }
    $seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach($file in $manifest.files) {
        $name=[string]$file.path
        if (-not $name -or $name -match '[:\\]' -or $name.StartsWith('/') -or @($name.Split('/') | Where-Object { $_ -in @('','..','.') }).Count -or
            -not $seen.Add($name) -or [string]$file.sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Unsafe package inventory.' }
        $full=[IO.Path]::GetFullPath((Join-Path $root $name))
        if (-not $full.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Package inventory escaped its directory.' }
        Assert-NativeHostPath $full
        $stream=[IO.File]::OpenRead($full)
        $algorithm=[Security.Cryptography.SHA256]::Create()
        try { $digest=[BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','') }
        finally { $stream.Dispose();$algorithm.Dispose() }
        if ($digest -ine [string]$file.sha256) { throw 'Administrator package integrity check failed. Nothing was registered.' }
    }
    foreach($required in @('BetterCaptionKeep.AdminSetup.exe','BetterCaptionKeep.AdminSetup.NativeHost.exe',
        'BetterCaptionKeep.AdminSetup.NativeHost.dll','BetterCaptionKeep.AdminSetup.NativeHost.runtimeconfig.json')) {
        if (-not $seen.Contains($required)) { throw "Administrator package is missing $required. Nothing was registered." }
    }
    return $root
}

function Save-NativeHostReceipt {
    param($Receipt,[string]$Path)
    $next=$Path+'.next'
    [IO.File]::WriteAllText($next,($Receipt | ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $next -Destination $Path -Force
}

function Invoke-NativeHostRegistration {
    param([string]$PackageDirectory,[string]$RecoveryDirectory,[switch]$PlanOnly)
    $root=Test-NativeHostPackage $PackageDirectory
    if (-not $RecoveryDirectory) {
        $RecoveryDirectory=if([IO.Path]::GetPathRoot($root) -ieq 'P:\') { Join-Path $root 'operations\native-host-registration' }
        else { Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'DAF-TECH\Better CaptionKeep\NativeHostRegistration' }
    }
    $RecoveryDirectory=[IO.Path]::GetFullPath($RecoveryDirectory)
    $plan=@{name='com.daftech.bettercaptionkeep.adminsetup';path=(Join-Path $root 'BetterCaptionKeep.AdminSetup.NativeHost.exe');
        type='stdio';description='Launches Better CaptionKeep administrator setup';allowed_origins=@(Get-NativeHostOrigins)}
    $keys=@(Get-NativeHostRegistryKeys)
    if($PlanOnly) { return @{mode='PlanOnly';registryHive='HKEY_CURRENT_USER';keys=$keys;manifest=$plan;recoveryRoot=$RecoveryDirectory;writes=$false} }
    # Verify existing destination ancestors before creating an operation folder; never follow links.
    $ancestor=$RecoveryDirectory
    while(-not [IO.Directory]::Exists($ancestor)) {
        $ancestor=[IO.Path]::GetDirectoryName($ancestor)
        if(-not $ancestor) { throw 'Recovery destination has no existing parent.' }
    }
    Assert-NativeHostPath $ancestor
    $operation=Join-Path $RecoveryDirectory ([guid]::NewGuid().ToString('D'))
    New-Item -ItemType Directory -Path $operation -ErrorAction Stop | Out-Null
    $nativeManifest=Join-Path $operation 'com.daftech.bettercaptionkeep.adminsetup.json'
    [IO.File]::WriteAllText($nativeManifest,($plan|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    $before=@($keys | ForEach-Object { @{key=$_;before=(Get-NativeHostRegistryValue $_)} })
    $beforePath=Join-Path $operation 'registry-before.json'
    [IO.File]::WriteAllText($beforePath,(@{schemaVersion=1;hive='HKEY_CURRENT_USER';capturedAtUtc=[DateTime]::UtcNow.ToString('o');registrations=$before}|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
    $receiptPath=Join-Path $operation 'registration-receipt.json'
    $receipt=@{schemaVersion=1;state='Prepared';packageDirectory=$root;manifestPath=$nativeManifest;beforePath=$beforePath;registered=@();
        pendingKey=$null;trust='No signing trust was installed or asserted.'}
    Save-NativeHostReceipt $receipt $receiptPath
    try {
        foreach($entry in $before) {
            $current=Get-NativeHostRegistryValue $entry.key
            if ($current.keyExists -ne $entry.before.keyExists -or $current.valueExists -ne $entry.before.valueExists -or
                $current.kind -cne $entry.before.kind -or
                (ConvertTo-Json -InputObject $current.value -Compress) -cne (ConvertTo-Json -InputObject $entry.before.value -Compress)) { throw 'Browser registration changed during setup. Preserve the recovery receipt and review it before retrying.' }
            $receipt.pendingKey=$entry.key;Save-NativeHostReceipt $receipt $receiptPath
            Set-NativeHostRegistryValue $entry.key $nativeManifest
            $observed=Get-NativeHostRegistryValue $entry.key
            if(-not $observed.valueExists -or $observed.kind -cne 'String' -or [string]$observed.value -cne $nativeManifest) { throw 'Browser registration could not be verified.' }
            $receipt.registered+=@($entry.key)
            $receipt.pendingKey=$null
            $receipt.state='Partial';Save-NativeHostReceipt $receipt $receiptPath
        }
        $receipt.state='Registered';Save-NativeHostReceipt $receipt $receiptPath
        return @{state='Registered';manifestPath=$nativeManifest;receiptPath=$receiptPath;browserCount=$keys.Count}
    } catch {
        $receipt.state='NeedsReview';Save-NativeHostReceipt $receipt $receiptPath
        throw "Browser integration stopped. Preserve $receiptPath. Previous registrations were recorded before any registry change. $($_.Exception.Message)"
    }
}

if($MyInvocation.InvocationName -ne '.') {
    try { Invoke-NativeHostRegistration -PackageDirectory $PackageDirectory -RecoveryDirectory $RecoveryDirectory -PlanOnly:$PlanOnly }
    catch { Write-Error $_;exit 1 }
}
