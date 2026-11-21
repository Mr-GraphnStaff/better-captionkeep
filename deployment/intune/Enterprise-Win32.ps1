# Static publisher-signed worker transport. Customer configuration is data, never generated code.
function Read-SetupWin32Package {
    param([string]$PackageRoot,[string]$Directory)
    $descriptor=Get-Content -LiteralPath (Join-Path $PackageRoot 'endpoint-worker-package.json') -Raw | ConvertFrom-Json -AsHashtable
    if($descriptor.schemaVersion -ne 1 -or $descriptor.setupFile -cne 'EndpointWorker.exe' -or $descriptor.publisher -cne 'DAVID ANTHONY FARRIS'){throw 'Unsupported endpoint package.'}
    $worker=Join-Path $PackageRoot 'EndpointWorker.exe';$bundle=Join-Path $PackageRoot 'endpoint-worker.intunewin'
    foreach($entry in @(@{path=$worker;hash=$descriptor.workerSha256},@{path=$bundle;hash=$descriptor.bundleSha256})){
        if([string]$entry.hash -cnotmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $entry.path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.hash){throw 'The endpoint release package changed.'}
    }
    $signature=Get-AuthenticodeSignature -LiteralPath $worker
    if($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate -or $signature.SignerCertificate.GetNameInfo('SimpleName',$false) -cne $descriptor.publisher){throw 'The endpoint executable needs its verified public publisher signature.'}
    $ekus=@($signature.SignerCertificate.Extensions|Where-Object {$_.Oid.Value -ceq '2.5.29.37'}|ForEach-Object {$_.EnhancedKeyUsages}|ForEach-Object {$_.Value})
    if($ekus -cnotcontains '1.3.6.1.5.5.7.3.3' -or $ekus -cnotcontains '1.3.6.1.4.1.311.97.1.0' -or @($ekus|Where-Object {$_ -like '1.3.6.1.4.1.311.97.1.3.1.*'}).Count){throw 'The endpoint executable must use public code-signing trust, not a private tenant profile.'}
    if(-not $Directory){return $descriptor}
    Add-Type -AssemblyName System.IO.Compression
    $zip=[IO.Compression.ZipFile]::OpenRead($bundle)
    try{
        $metadata=@($zip.Entries|Where-Object FullName -ceq 'IntuneWinPackage/Metadata/Detection.xml')
        $content=@($zip.Entries|Where-Object FullName -ceq 'IntuneWinPackage/Contents/IntunePackage.intunewin')
        if($metadata.Count -ne 1 -or $content.Count -ne 1 -or $metadata[0].Length -gt 65536 -or $content[0].Length -lt 1){throw 'The Microsoft endpoint package is incomplete.'}
        $settings=[Xml.XmlReaderSettings]::new();$settings.DtdProcessing=[Xml.DtdProcessing]::Prohibit;$settings.XmlResolver=$null
        $stream=$metadata[0].Open();$reader=[Xml.XmlReader]::Create($stream,$settings)
        try{$document=[Xml.XmlDocument]::new();$document.XmlResolver=$null;$document.Load($reader)}finally{$reader.Dispose();$stream.Dispose()}
        $info=$document.ApplicationInfo
        if([string]$info.SetupFile -cne 'EndpointWorker.exe' -or [string]$info.FileName -cne 'IntunePackage.intunewin'){throw 'Unexpected endpoint package identity.'}
        $encryption=@{'@odata.type'='#microsoft.graph.fileEncryptionInfo'}
        foreach($name in @('encryptionKey','macKey','initializationVector','mac','profileIdentifier','fileDigest','fileDigestAlgorithm')){
            $xmlName=$name.Substring(0,1).ToUpperInvariant()+$name.Substring(1)
            $encryption[$name]=[string]$info.EncryptionInfo.$xmlName
            if(-not $encryption[$name]){throw 'Endpoint encryption metadata is incomplete.'}
        }
        if($encryption.profileIdentifier -cne 'ProfileVersion1' -or $encryption.fileDigestAlgorithm -cne 'SHA256'){throw 'Unsupported Microsoft content encryption profile.'}
        $targetDirectory=Join-Path $Directory 'win32-content'
        if(-not [IO.Directory]::Exists($targetDirectory)){[IO.Directory]::CreateDirectory($targetDirectory)|Out-Null}
        $target=Join-Path $targetDirectory 'IntunePackage.intunewin'
        if(-not [IO.File]::Exists($target)){
            $input=$content[0].Open();$output=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
            try{$input.CopyTo($output);$output.Flush($true)}finally{$input.Dispose();$output.Dispose()}
        }
        $saved=[IO.File]::OpenRead($target);$original=$content[0].Open()
        try{if([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($saved)) -cne [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($original))){throw 'The preserved encrypted endpoint content changed.'}}finally{$saved.Dispose();$original.Dispose()}
        return @{descriptor=$descriptor;contentPath=$target;size=[long]$info.UnencryptedContentSize;sizeEncrypted=[long]$content[0].Length;encryption=$encryption}
    }finally{$zip.Dispose()}
}

function New-SetupWin32AppBody {
    param($Config,[string]$Name)
    Assert-SetupGuid $Config.deploymentId|Out-Null
    if($Config.browser -cnotin @('edge','chrome')){throw 'Unsupported endpoint browser.'}
    function Normalize-Win32Configuration($Value){
        if($Value -is [Collections.IDictionary]){$ordered=[ordered]@{};$keys=[string[]]@($Value.Keys);[Array]::Sort($keys,[StringComparer]::Ordinal);foreach($key in $keys){$ordered[$key]=Normalize-Win32Configuration $Value[$key]};return $ordered}
        if($Value -is [array]){return ,@($Value|ForEach-Object {Normalize-Win32Configuration $_})}
        return $Value
    }
    $json=ConvertTo-Json -InputObject (Normalize-Win32Configuration $Config) -Depth 20 -Compress
    $bytes=[Text.UTF8Encoding]::new($false,$true).GetBytes($json)
    if($bytes.Length -gt 4096){throw 'The reviewed device configuration exceeds the supported size.'}
    $encoded=[Convert]::ToBase64String($bytes)
    $hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
    $key="HKEY_LOCAL_MACHINE\SOFTWARE\DAF-TECH\BetterCaptionKeep\Deployments\$($Config.deploymentId)\$($Config.browser)"
    return @{'@odata.type'='#microsoft.graph.win32LobApp';displayName=$Name;description="Better CaptionKeep browser policy configuration. Deployment $($Config.deploymentId).";publisher='DAF-TECH';
        fileName='endpoint-worker.intunewin';setupFilePath='EndpointWorker.exe';applicableArchitectures='x64';minimumSupportedWindowsRelease='1607';
        installCommandLine="`"EndpointWorker.exe`" --configuration `"$encoded`" --action Install";
        uninstallCommandLine="`"EndpointWorker.exe`" --configuration `"$encoded`" --action Remove";
        installExperience=@{runAsAccount='system';deviceRestartBehavior='suppress'};returnCodes=@(@{returnCode=0;type='success'},@{returnCode=1;type='failed'});
        rules=@(@{'@odata.type'='#microsoft.graph.win32LobAppRegistryRule';ruleType='detection';check32BitOn64System=$false;keyPath=$key;valueName='Status';operationType='string';operator='equal';comparisonValue='Complete'},
            @{'@odata.type'='#microsoft.graph.win32LobAppRegistryRule';ruleType='detection';check32BitOn64System=$false;keyPath=$key;valueName='ConfigurationHash';operationType='string';operator='equal';comparisonValue=$hash})}
}

function Test-SetupWin32AppBody {
    param($Actual,$Expected)
    foreach($key in @('displayName','description','publisher','fileName','setupFilePath','applicableArchitectures','minimumSupportedWindowsRelease','installCommandLine','uninstallCommandLine')){
        if(-not $Actual.ContainsKey($key) -or [string]$Actual[$key] -cne [string]$Expected[$key]){return $false}
    }
    foreach($key in @('installExperience','returnCodes','rules')){
        if(-not $Actual.ContainsKey($key)){return $false}
        # Keep comparison limited to authored fields; Graph may return additional read-only fields.
        $projection=@()
        $expectedItems=@($Expected[$key]);$actualItems=@($Actual[$key])
        if($expectedItems.Count -ne $actualItems.Count){return $false}
        for($i=0;$i -lt $expectedItems.Count;$i++){
            $item=@{};foreach($field in $expectedItems[$i].Keys){if(-not $actualItems[$i].ContainsKey($field)){return $false};$item[$field]=$actualItems[$i][$field]};$projection+=,$item
        }
        if($key -ceq 'installExperience'){
            if((Get-SetupFingerprint $projection) -cne (Get-SetupFingerprint $expectedItems)){return $false}
        }else{
            $observedHashes=@($projection|ForEach-Object {Get-SetupFingerprint $_}|Sort-Object)
            $expectedHashes=@($expectedItems|ForEach-Object {Get-SetupFingerprint $_}|Sort-Object)
            if(($observedHashes -join ',') -cne ($expectedHashes -join ',')){return $false}
        }
    }
    return $true
}

function Wait-SetupWin32File {
    param([string]$Path,[ValidateSet('Storage','Committed')][string]$Purpose)
    for($attempt=0;$attempt -lt 30;$attempt++){
        $file=Invoke-SetupGraph GET $Path $null
        if($Purpose -ceq 'Storage' -and $file.uploadState -cin @('azureStorageUriRequestSuccess','azureStorageUriRenewalSuccess') -and $file.azureStorageUri){return $file}
        if($Purpose -ceq 'Committed' -and $file.isCommitted -and $file.uploadState -ceq 'commitFileSuccess'){return $file}
        if([string]$file.uploadState -match 'Failed|TimedOut|^error$'){throw 'Intune rejected or timed out the endpoint content operation. Keep the receipt; no create/commit request was repeated.'}
        Start-Sleep -Seconds 2
    }
    throw 'Intune is still processing the endpoint content. Continue this saved deployment later; no create/commit request was repeated.'
}

function Get-SetupWin32Storage {
    param([string]$FilePath)
    $file=Wait-SetupWin32File $FilePath Storage
    $expiry=[DateTimeOffset]::MinValue
    if(-not [DateTimeOffset]::TryParse([string]$file.azureStorageUriExpirationDateTime,[ref]$expiry)){throw 'Intune did not return the upload link expiration.'}
    if($expiry -gt [DateTimeOffset]::UtcNow.AddMinutes(5)){return $file}
    # Refresh authorization for the same recorded file; this never creates another app/content file.
    Invoke-SetupGraph POST "$FilePath/renewUpload" $null|Out-Null
    for($attempt=0;$attempt -lt 30;$attempt++){
        $file=Invoke-SetupGraph GET $FilePath $null
        if($file.uploadState -ceq 'azureStorageUriRenewalSuccess' -and [DateTimeOffset]::TryParse([string]$file.azureStorageUriExpirationDateTime,[ref]$expiry) -and $expiry -gt [DateTimeOffset]::UtcNow.AddMinutes(5)){return $file}
        if([string]$file.uploadState -match 'Failed|TimedOut|^error$'){throw 'Intune could not renew this file upload link. Keep its receipt and check later.'}
        Start-Sleep -Seconds 2
    }
    throw 'Intune is still renewing the same upload file. Continue the saved deployment later.'
}

function Send-SetupWin32Blocks {
    param([string]$StorageUri,[string]$ContentPath)
    $uri=[uri]$StorageUri
    if($uri.Scheme -cne 'https' -or $uri.Host -cnotmatch '^[a-z0-9]+\.blob\.core\.windows\.net$' -or $uri.Port -ne 443 -or $uri.UserInfo -or -not $uri.Query -or $uri.Fragment){throw 'Microsoft returned an unsupported upload destination.'}
    $handler=[Net.Http.HttpClientHandler]::new();$handler.AllowAutoRedirect=$false
    $client=[Net.Http.HttpClient]::new($handler);$client.Timeout=[TimeSpan]::FromMinutes(2)
    $file=[IO.File]::OpenRead($ContentPath);$blocks=[Collections.Generic.List[string]]::new();$buffer=[byte[]]::new(4MB)
    try{
        $index=0
        while(($count=$file.Read($buffer,0,$buffer.Length)) -gt 0){
            $id=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($index.ToString('D8')));$blocks.Add($id)
            $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Put,($StorageUri+'&comp=block&blockid='+[uri]::EscapeDataString($id)))
            $request.Headers.TryAddWithoutValidation('x-ms-version','2023-11-03')|Out-Null
            $request.Content=[Net.Http.ByteArrayContent]::new($buffer,0,$count)
            try{$response=$client.SendAsync($request).GetAwaiter().GetResult();try{if(-not $response.IsSuccessStatusCode){throw 'Upload failed.'}}finally{$response.Dispose()}}catch{throw 'Endpoint content upload failed. Keep the receipt to continue the same app; no duplicate app was created.'}finally{$request.Dispose()}
            $index++
        }
        $xml='<?xml version="1.0" encoding="utf-8"?><BlockList>'+(@($blocks|ForEach-Object{"<Latest>$_</Latest>"}) -join '')+'</BlockList>'
        $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Put,($StorageUri+'&comp=blocklist'));$request.Headers.TryAddWithoutValidation('x-ms-version','2023-11-03')|Out-Null
        $request.Content=[Net.Http.StringContent]::new($xml,[Text.Encoding]::UTF8,'application/xml')
        try{$response=$client.SendAsync($request).GetAwaiter().GetResult();try{if(-not $response.IsSuccessStatusCode){throw 'Block commit failed.'}}finally{$response.Dispose()}}catch{throw 'Endpoint upload blocks were not confirmed. Continue the saved app later.'}finally{$request.Dispose()}
    }finally{$file.Dispose();$client.Dispose();$handler.Dispose()}
}

function ConvertTo-SetupWin32ContentVersionId {
    param($Value)
    # Graph defines this as an opaque string (its own examples include GUIDs), not an integer.
    if($Value -isnot [string] -or $Value -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$'){throw 'Intune returned an unsupported content version identity.'}
    return $Value
}

function Get-SetupWin32UnpublishedParent {
    param($App,$Current,[string]$VersionsPath,[string[]]$VersionIds,[string]$ExcludeVersion)
    if(-not $Current.ContainsKey('publishingState') -or -not $Current.ContainsKey('committedContentVersion') -or $Current.publishingState -cnotin @('notPublished','processing')){throw 'The receipt-owned app is not in a known unpublished state.'}
    $assignments=@(Get-SetupCollection "/deviceAppManagement/mobileApps/$($App.id)/assignments")
    if($assignments.Count){throw 'The app already has assignments. Its content pointer was not changed.'}
    foreach($versionId in @($VersionIds)){
        if($versionId -ceq $ExcludeVersion){continue}
        $safe=ConvertTo-SetupWin32ContentVersionId $versionId
        $files=@(Get-SetupCollection "$VersionsPath/$([uri]::EscapeDataString($safe))/files")
        if($files.Count){throw 'The unpublished app already contains other uploaded content. Its versions were preserved.'}
    }
    return @{committedContentVersion=[string]$Current.committedContentVersion;publishingState=[string]$Current.publishingState;versionIds=@($VersionIds);appFingerprint=(Get-SetupFingerprint $App.body);unassigned=$true}
}

function Get-SetupWin32ContentVersion {
    param($Receipt,[string]$Directory,$App)
    $browser=[string]$App.browser;$id=Assert-SetupGuid $App.id
    $creationName="CreateWin32-$browser";$name="ContentVersion-$browser"
    if(-not $Receipt.operations.ContainsKey($creationName) -or -not $App.Contains('body')){throw 'The content version requires its saved app-creation receipt.'}
    $creation=$Receipt.operations[$creationName]
    if($creation.state -cnotin @('Confirmed','Reconciled') -or $creation.resourceId -cne $id -or $creation.requestFingerprint -cne (Get-SetupFingerprint $App.body)){throw 'The content version is not bound to this receipt-owned app.'}
    $current=Invoke-SetupGraph GET "/deviceAppManagement/mobileApps/$id" $null
    if([string]$current.id -cne $id -or -not (Test-SetupWin32AppBody $current $App.body)){throw 'The receipt-owned app changed before content upload.'}
    $path="/deviceAppManagement/mobileApps/$id/microsoft.graph.win32LobApp/contentVersions"
    $body=@{'@odata.type'='#microsoft.graph.mobileAppContent'};$fingerprint=Get-SetupFingerprint $body
    $prior=if($Receipt.operations.ContainsKey($name)){$Receipt.operations[$name]}else{$null}
    if($prior -and ($prior.requestFingerprint -cne $fingerprint -or ($prior.ContainsKey('parentResourceId') -and $prior.parentResourceId -cne $id))){throw 'The saved content-version request belongs to a different app or request.'}
    $versions=@(Get-SetupCollection $path)
    $ids=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach($version in $versions){$versionId=ConvertTo-SetupWin32ContentVersionId $version.id;if(-not $ids.Add($versionId)){throw 'Intune returned duplicate content version identities.'}}
    if(-not $prior){
        # Existing version IDs can describe empty service drafts. Record the baseline,
        # then bind the service's create response; do not assume its ID must be novel.
        $baseline=Get-SetupWin32UnpublishedParent $App $current $path @($ids) ''
        $prior=@{state='Pending';requestFingerprint=$fingerprint;parentResourceId=$id;beforeIds=@($ids|Sort-Object);parentBaseline=$baseline;resourceId=$null;operationId=[guid]::NewGuid().ToString()}
        $Receipt.operations[$name]=$prior;$Receipt.pendingOperation=$name;Save-SetupReceipt $Receipt $Directory
        try{
            $created=Invoke-SetupGraph POST $path $body
            $prior.resourceId=ConvertTo-SetupWin32ContentVersionId $created.id
            $prior.resourceIdSource='CreateResponse'
            $prior.state='Partial';Save-SetupReceipt $Receipt $Directory
        }catch{$prior.state='Ambiguous';Save-SetupReceipt $Receipt $Directory;throw}
    }elseif(-not $prior.resourceId){
        if(-not $prior.ContainsKey('beforeIds')){throw 'The earlier content-version response was lost without a baseline. Keep the receipt for explicit reconciliation; no POST was repeated.'}
        $before=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
        foreach($item in @($prior.beforeIds)){if(-not $before.Add((ConvertTo-SetupWin32ContentVersionId $item))){throw 'The saved content-version baseline contains duplicate identities.'}}
        $newIds=@($ids|Where-Object {-not $before.Contains($_)})
        if($newIds.Count -ne 1){throw 'The earlier content-version POST has no unique new version yet. Keep the receipt and check later; no POST was repeated.'}
        $candidateId=ConvertTo-SetupWin32ContentVersionId $newIds[0]
        # A lost response can be reconciled only while the unique new child is still
        # empty and uncommitted. Occupied or concurrent versions need explicit review.
        if($current.committedContentVersion -and [string]$current.committedContentVersion -ceq $candidateId){throw 'The unrecorded content version is committed. It was not adopted.'}
        if(-not $prior.ContainsKey('parentBaseline')){throw 'The lost content-version response has no saved parent baseline. No version was adopted.'}
        $baseline=Get-SetupWin32UnpublishedParent $App $current $path @($ids) $candidateId
        if($baseline.committedContentVersion -cne $prior.parentBaseline.committedContentVersion){throw 'The app content pointer changed after the lost response. No version was adopted.'}
        $files=@(Get-SetupCollection "$path/$([uri]::EscapeDataString($candidateId))/files")
        if($files.Count){throw 'The unrecorded content version contains files. It was not adopted or overwritten.'}
        $prior.resourceId=$candidateId;$prior.state='Partial';Save-SetupReceipt $Receipt $Directory
    }
    $recordedId=ConvertTo-SetupWin32ContentVersionId $prior.resourceId
    $observed=Invoke-SetupGraph GET "$path/$([uri]::EscapeDataString($recordedId))" $null
    if($observed -and -not $observed.ContainsKey('id') -and $observed.ContainsKey('value') -and $observed.value -is [Collections.IDictionary]){$observed=$observed.value}
    if($null -eq $observed -or -not $observed.ContainsKey('id') -or (ConvertTo-SetupWin32ContentVersionId $observed.id) -cne $recordedId){throw 'Intune has not confirmed the recorded content version. Keep the receipt; no POST was repeated.'}
    if($prior.ContainsKey('beforeIds') -and @($prior.beforeIds) -ccontains $recordedId){
        if(-not $prior.ContainsKey('parentBaseline')){throw 'The service-returned draft has no saved parent baseline.'}
        $baselineFingerprint=Get-SetupFingerprint $prior.parentBaseline
        if($prior.ContainsKey('serviceReturnedDraft')){
            $binding=$prior.serviceReturnedDraft
            if($binding.origin -cne 'CreateResponse' -or $binding.parentResourceId -cne $id -or $binding.resourceId -cne $recordedId -or $binding.requestFingerprint -cne $fingerprint -or $binding.baselineFingerprint -cne $baselineFingerprint){throw 'The saved service-returned draft binding changed.'}
        }else{
            # 6.0.2 persisted a successful create response as Partial before rejecting
            # its prelisted ID. That exact saved response can be validated without a
            # second POST; an unknown/lost response cannot authorize draft selection.
            $acknowledged=($prior.ContainsKey('resourceIdSource') -and $prior.resourceIdSource -ceq 'CreateResponse') -or $prior.state -ceq 'Partial'
            if(-not $acknowledged -or $prior.parentBaseline.appFingerprint -cne (Get-SetupFingerprint $App.body) -or -not $prior.parentBaseline.unassigned){throw 'The prelisted draft was not acknowledged by this owned app create request.'}
            $live=Invoke-SetupGraph GET "/deviceAppManagement/mobileApps/$id" $null
            if([string]$live.id -cne $id -or -not (Test-SetupWin32AppBody $live $App.body)){throw 'The receipt-owned app changed while validating the returned draft.'}
            $empty=Get-SetupWin32UnpublishedParent $App $live $path @($ids) ''
            if($empty.committedContentVersion -cne $prior.parentBaseline.committedContentVersion){throw 'The parent pointer changed while validating the returned empty draft.'}
            $draftFiles=@(Get-SetupCollection "$path/$([uri]::EscapeDataString($recordedId))/files")
            if($draftFiles.Count){throw 'The service-returned draft contains uploaded content without a validated draft binding.'}
            $prior.serviceReturnedDraft=@{origin='CreateResponse';parentResourceId=$id;resourceId=$recordedId;requestFingerprint=$fingerprint;baselineFingerprint=$baselineFingerprint;validatedAtUtc=[DateTimeOffset]::UtcNow.ToString('o')}
            $prior.resourceIdSource='CreateResponse';Save-SetupReceipt $Receipt $Directory
        }
    }
    $prior.parentResourceId=$id;$prior.state='Confirmed';$Receipt.pendingOperation=$null;Save-SetupReceipt $Receipt $Directory
    return $observed
}

function Set-SetupWin32ParentContent {
    param($Receipt,[string]$Directory,$App,[string]$VersionId)
    $id=Assert-SetupGuid $App.id;$version=ConvertTo-SetupWin32ContentVersionId $VersionId
    $path="/deviceAppManagement/mobileApps/$id";$current=Invoke-SetupGraph GET $path $null
    if([string]$current.id -cne $id -or -not (Test-SetupWin32AppBody $current $App.body)){throw 'The receipt-owned app changed before content promotion.'}
    $promotion="PromoteContent-$($App.browser)"
    if($current.ContainsKey('committedContentVersion') -and [string]$current.committedContentVersion -ceq $version){
        if($Receipt.operations.ContainsKey($promotion)){
            $saved=$Receipt.operations[$promotion]
            if($saved.appId -cne $id -or $saved.version -cne $version){throw 'The saved content promotion refers to another app version.'}
            $saved.state='Confirmed';if($Receipt.pendingOperation -ceq $promotion){$Receipt.pendingOperation=$null};Save-SetupReceipt $Receipt $Directory
        }
        return
    }
    $name="ContentVersion-$($App.browser)"
    if(-not $Receipt.operations.ContainsKey($name) -or -not $Receipt.operations[$name].ContainsKey('parentBaseline')){throw 'Content promotion requires the saved unpublished parent baseline.'}
    $operation=$Receipt.operations[$name];$baseline=$operation.parentBaseline
    if($operation.resourceId -cne $version -or $operation.parentResourceId -cne $id -or $baseline.appFingerprint -cne (Get-SetupFingerprint $App.body)){throw 'Content promotion does not match the owned version and app.'}
    $commitName="CommitContent-$($App.browser)"
    if(-not $Receipt.operations.ContainsKey($commitName) -or $Receipt.operations[$commitName].state -cne 'Confirmed' -or $Receipt.operations[$commitName].appId -cne $id -or $Receipt.operations[$commitName].version -cne $version){throw 'Content promotion requires the verified commit of this exact app version.'}
    $versionsPath="$path/microsoft.graph.win32LobApp/contentVersions"
    $ids=@(Get-SetupCollection $versionsPath|ForEach-Object {ConvertTo-SetupWin32ContentVersionId $_.id})
    if(@($baseline.versionIds|Where-Object {$_ -cnotin $ids}).Count){throw 'The saved parent content baseline changed before promotion.'}
    $now=Get-SetupWin32UnpublishedParent $App $current $versionsPath $ids $version
    if($now.committedContentVersion -cne $baseline.committedContentVersion){throw 'The app content pointer changed after approval. It was not overwritten.'}
    $Receipt.operations[$promotion]=@{state='Pending';appId=$id;before=$baseline.committedContentVersion;version=$version};$Receipt.pendingOperation=$promotion;Save-SetupReceipt $Receipt $Directory
    Invoke-SetupGraph PATCH $path @{'@odata.type'='#microsoft.graph.win32LobApp';committedContentVersion=$version}|Out-Null
    $observed=Invoke-SetupGraph GET $path $null
    if(-not $observed.ContainsKey('committedContentVersion') -or [string]$observed.committedContentVersion -cne $version){throw 'Intune has not confirmed the reviewed content promotion. Keep the receipt.'}
    $Receipt.operations[$promotion].state='Confirmed';$Receipt.pendingOperation=$null;Save-SetupReceipt $Receipt $Directory
}

function Invoke-SetupWin32Content {
    param($Receipt,[string]$Directory,$App,$Package)
    $browser=$App.browser;$id=Assert-SetupGuid $App.id
    $versionsPath="/deviceAppManagement/mobileApps/$id/microsoft.graph.win32LobApp/contentVersions"
    $version=Get-SetupWin32ContentVersion $Receipt $Directory $App
    $versionId=ConvertTo-SetupWin32ContentVersionId $version.id
    $versionId=[uri]::EscapeDataString($versionId)
    $filesPath="$versionsPath/$versionId/files"
    $body=@{'@odata.type'='#microsoft.graph.mobileAppContentFile';name='IntunePackage.intunewin';size=$Package.size;sizeEncrypted=$Package.sizeEncrypted;isDependency=$false}
    $file=Invoke-RecordedSetupCreate $Receipt $Directory "ContentFile-$browser" $body {
        foreach($candidate in @(Get-SetupCollection $filesPath)){Invoke-SetupGraph GET "$filesPath/$($candidate.id)" $null}
    } {param($item) $item.name -ceq $body.name -and [long]$item.size -eq $body.size -and [long]$item.sizeEncrypted -eq $body.sizeEncrypted -and -not $item.isDependency} {param($request) Invoke-SetupGraph POST $filesPath $request}
    $fileId=[uri]::EscapeDataString([string]$file.id)
    if([string]$file.id -cnotmatch '^[A-Za-z0-9-]{1,128}$'){throw 'Intune returned an unsupported content file identity.'}
    $filePath="$filesPath/$fileId";$commit="CommitContent-$browser"
    $observed=Invoke-SetupGraph GET $filePath $null
    if(-not $observed.isCommitted){
        if($Receipt.operations.ContainsKey($commit)){
            $null=Wait-SetupWin32File $filePath Committed
        }else{
            $storage=Get-SetupWin32Storage $filePath
            Write-SetupMessage "Uploading the signed endpoint package for $browser. This can take a moment."
            Send-SetupWin32Blocks $storage.azureStorageUri $Package.contentPath
            $Receipt.operations[$commit]=@{state='Pending';appId=$id;version=$versionId;fileId=[string]$file.id};$Receipt.pendingOperation=$commit;Save-SetupReceipt $Receipt $Directory
            Invoke-SetupGraph POST "$filePath/commit" @{fileEncryptionInfo=$Package.encryption}|Out-Null
            $null=Wait-SetupWin32File $filePath Committed
        }
    }
    $Receipt.operations[$commit]=@{state='Confirmed';appId=$id;version=$versionId;fileId=[string]$file.id};$Receipt.pendingOperation=$null;Save-SetupReceipt $Receipt $Directory
    $appPath="/deviceAppManagement/mobileApps/$id"
    Set-SetupWin32ParentContent $Receipt $Directory $App $version.id
    for($attempt=0;$attempt -lt 30;$attempt++){
        $current=Invoke-SetupGraph GET $appPath $null
        if([string]$current.committedContentVersion -ceq $versionId -and $current.publishingState -ceq 'published'){return}
        Start-Sleep -Seconds 2
    }
    throw 'Intune is processing the app before assignment. Continue this saved deployment later.'
}

function Invoke-SetupWin32Deployment {
    param($Receipt,[string]$Directory,[string]$PackageRoot,$Policies,$Schema,[string]$AppId)
    $package=Read-SetupWin32Package $PackageRoot $Directory
    if(-not $Receipt.plan.Contains('endpointPackageHash') -or $Receipt.plan.endpointPackageHash -cne $package.descriptor.bundleSha256){throw 'The endpoint package differs from the reviewed deployment plan.'}
    if(-not $Receipt.Contains('win32Apps')){$Receipt.win32Apps=@()}
    foreach($browser in $Receipt.plan.browsers){
        $extensionId=if($browser -ceq 'edge'){'edefcbdhahfolgkoamkbknjppojpaffk'}else{'nabjdlnkkaonnbnimnmnhjcbigceebml'}
        $policy=$Policies[$browser]|ConvertTo-Json -Depth 20|ConvertFrom-Json -AsHashtable
        $policy.enableGraphTranscriptImport=[bool]$Receipt.plan.microsoft365
        if($Receipt.plan.microsoft365){$policy.graphTenantId=$Receipt.plan.tenantId;$policy.graphClientId=$AppId}
        Assert-ManagedSetupPolicy $policy $Schema
        $config=@{browser=$browser;extensionId=$extensionId;deploymentId=$Receipt.plan.deploymentId;managedPolicy=$policy}
        $body=New-SetupWin32AppBody $config "Better CaptionKeep $browser $($Receipt.plan.deploymentId)"
        $filter=[uri]::EscapeDataString("displayName eq '$($body.displayName)'")
        $created=Invoke-RecordedSetupCreate $Receipt $Directory "CreateWin32-$browser" $body {
            foreach($candidate in @(Get-SetupCollection "/deviceAppManagement/mobileApps?`$filter=$filter")){Invoke-SetupGraph GET "/deviceAppManagement/mobileApps/$($candidate.id)" $null}
        } {param($candidate) Test-SetupWin32AppBody $candidate $body} {param($request) Invoke-SetupGraph POST '/deviceAppManagement/mobileApps' $request}
        $saved=@($Receipt.win32Apps|Where-Object browser -ceq $browser)
        if($saved.Count -gt 1){throw 'Duplicate saved Win32 browser app.'}
        if($saved.Count -eq 0){$entry=@{browser=$browser;id=(Assert-SetupGuid $created.id);assigned=$false;configurationHash=$body.rules[1].comparisonValue;packageHash=$package.descriptor.bundleSha256;body=$body};$Receipt.win32Apps+=,$entry;Save-SetupReceipt $Receipt $Directory}else{$entry=$saved[0]}
        if($entry.id -cne $created.id -or $entry.packageHash -cne $package.descriptor.bundleSha256 -or -not (Test-SetupWin32AppBody $created $entry.body)){throw 'The approved Win32 app or package changed.'}
        Invoke-SetupWin32Content $Receipt $Directory $entry $package
        $assignPath="/deviceAppManagement/mobileApps/$($entry.id)/assignments";$assignName="AssignWin32-$browser"
        $assignments=@(Get-SetupCollection $assignPath)
        if(@($assignments|Where-Object {$_.intent -cne 'required' -or $_.target.'@odata.type' -cne '#microsoft.graph.groupAssignmentTarget' -or $_.target.groupId -cne $Receipt.plan.groupId}).Count -or $assignments.Count -gt 1){throw 'The app has unexpected assignments. Nothing was overwritten.'}
        if($assignments.Count -eq 0){
            if($entry.assigned -or $Receipt.operations.ContainsKey($assignName)){throw 'The previous assignment is not visible yet. Check again later; its POST was not repeated.'}
            $Receipt.operations[$assignName]=@{state='Pending';groupId=$Receipt.plan.groupId};$Receipt.pendingOperation=$assignName;Save-SetupReceipt $Receipt $Directory
            Invoke-SetupGraph POST "/deviceAppManagement/mobileApps/$($entry.id)/assign" @{mobileAppAssignments=@(@{'@odata.type'='#microsoft.graph.mobileAppAssignment';intent='required';target=@{'@odata.type'='#microsoft.graph.groupAssignmentTarget';groupId=$Receipt.plan.groupId}})}|Out-Null
            $assignments=@(Get-SetupCollection $assignPath)
            if($assignments.Count -ne 1 -or $assignments[0].intent -cne 'required' -or $assignments[0].target.groupId -cne $Receipt.plan.groupId){throw 'Intune has not confirmed the exact app assignment. Continue the saved deployment later.'}
        }
        $entry.assigned=$true;$Receipt.operations[$assignName]=@{state='Confirmed';groupId=$Receipt.plan.groupId};$Receipt.pendingOperation=$null;Save-SetupReceipt $Receipt $Directory
    }
    $Receipt.status='AssignedPendingEndpointValidation';Save-SetupReceipt $Receipt $Directory
    Write-SetupStage 'verifying'
    try{$Receipt.delivery=Get-SetupWin32DeliveryStatus $Receipt;Save-SetupReceipt $Receipt $Directory;Show-EnterpriseDeliveryStatus $Receipt.delivery $Directory}catch{Write-SetupMessage 'Assignments are retained. Device reports are not available yet; check this saved deployment later.'}
}

function Get-SetupWin32DeliveryStatus {
    param($Receipt)
    $devices=@()
    foreach($app in $Receipt.win32Apps){
        $source=Invoke-SetupGraph GET "/deviceAppManagement/mobileApps/$($app.id)" $null
        $sourceVerified=Test-SetupWin32AppBody $source $app.body
        foreach($state in @(Get-SetupCollection "/deviceAppManagement/mobileApps/$($app.id)/deviceStatuses" -Beta)){
            $installed=$sourceVerified -and [string]$state.installState -ceq 'installed';$failed=[string]$state.installState -match 'failed'
            $devices+=@{browser=$app.browser;device=[string]$state.deviceName;deviceId=[string]$state.deviceId;status=$(if($installed){'PolicyConfigurationApplied'}elseif($failed){'Failed'}else{'Pending'});runState=$(if($installed){'success'}elseif($failed){'fail'}else{'pending'});lastUpdate=[string]$state.lastSyncDateTime;browserVerified=$false;endpoint=@{policyVerified=$installed;forceInstallVerified=$installed;installationObserved=$false}}
        }
    }
    return @{transport='Win32';checkedAt=[DateTimeOffset]::UtcNow.ToString('o');devices=$devices;reports=$devices.Count;reportingDevices=@($devices.deviceId|Where-Object {$_}|Sort-Object -Unique).Count;succeeded=@($devices|Where-Object status -ceq 'PolicyConfigurationApplied').Count;failed=@($devices|Where-Object status -ceq 'Failed').Count;pending=@($devices|Where-Object status -ceq 'Pending').Count;configurationVerified=@($devices|Where-Object status -ceq 'PolicyConfigurationApplied').Count;configurationNotVerified=0;installationObserved=0;browserVerification='NotEstablished';microsoft365Verification='NotEstablished';note='Intune app success confirms policy configuration and its detection rules. Browser Store installation, enabled runtime and Microsoft 365 employee sign-in require separate verification.'}
}
