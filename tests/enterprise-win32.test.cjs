const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const quote=value=>`'${value.replaceAll("'","''")}'`;
function scenario(source){
  assert.ok(process.env.AGENT_WORKING_DIR,'Managed run required.');
  const dir=fs.mkdtempSync(path.join(process.env.AGENT_WORKING_DIR,'win32-contract-'));
  const script=path.join(dir,'probe.ps1');
  fs.writeFileSync(script,`$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
    . ${quote(path.join(root,'deployment/intune/Enterprise-Setup.ps1'))}
    $directory=${quote(dir)}
    $config=@{browser='edge';extensionId='edefcbdhahfolgkoamkbknjppojpaffk';deploymentId='11111111-1111-4111-8111-111111111111';managedPolicy=@{enableGraphTranscriptImport=$false}}
    function Start-Sleep {}
    ${source}
  `);
  const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',script],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  return JSON.parse(result.stdout.split(/\r?\n/).findLast(line=>line.startsWith('RESULT:')).slice(7));
}
test('Win32 transport requests app permissions without Azure configuration or script scope',()=>{
  const result=scenario(`$plan=Invoke-EnterpriseSetupCore @{DeploymentTransport='Win32';Browser='edge';WithoutMicrosoft365=$true;PlanOnly=$true} $directory
    Write-Output ('RESULT:'+($plan|ConvertTo-Json -Depth 10 -Compress))`);
  assert.equal(result.cloudWrites,false);assert.equal(result.deploymentTransport,'Win32');
  assert.ok(result.scopes.includes('DeviceManagementApps.ReadWrite.All'));assert.ok(!result.scopes.some(x=>x.includes('Scripts')));
});
test('tenant configuration stays data and detection binds its exact bytes and completed state',()=>{
  const result=scenario(`$body=New-SetupWin32AppBody $config 'Synthetic BCK'
    Write-Output ('RESULT:'+($body|ConvertTo-Json -Depth 20 -Compress))`);
  assert.match(result.installCommandLine,/^"EndpointWorker.exe" --configuration "[A-Za-z0-9+/=]+" --action Install$/);
  assert.ok(!/powershell|bypass|encodedcommand/i.test(result.installCommandLine));
  assert.equal(result.rules.length,2);assert.equal(result.rules[0].comparisonValue,'Complete');assert.match(result.rules[1].comparisonValue,/^[a-f0-9]{64}$/);
});
test('configuration serialization stays stable across dictionary insertion orders for continuation',()=>{
  const result=scenario(`$first=[ordered]@{browser='edge';extensionId=$config.extensionId;deploymentId=$config.deploymentId;managedPolicy=[ordered]@{forcePrivacyScrubber=$true;enableGraphTranscriptImport=$false}}
    $second=[ordered]@{managedPolicy=[ordered]@{enableGraphTranscriptImport=$false;forcePrivacyScrubber=$true};deploymentId=$config.deploymentId;extensionId=$config.extensionId;browser='edge'}
    $a=New-SetupWin32AppBody $first 'Synthetic';$b=New-SetupWin32AppBody $second 'Synthetic'
    Write-Output ('RESULT:'+(@{commandMatches=$a.installCommandLine -ceq $b.installCommandLine;hashMatches=$a.rules[1].comparisonValue -ceq $b.rules[1].comparisonValue}|ConvertTo-Json -Compress))`);
  assert.deepEqual(result,{commandMatches:true,hashMatches:true});
});
test('app readback accepts reordered arrays and extra read-only properties, rejects missing or changed authored state',()=>{
  const result=scenario(`$body=New-SetupWin32AppBody $config 'Synthetic BCK';$actual=$body|ConvertTo-Json -Depth 20|ConvertFrom-Json -AsHashtable
    $actual.rules=@($actual.rules[1],$actual.rules[0]);$actual.returnCodes=@($actual.returnCodes[1],$actual.returnCodes[0]);$actual.id='read-only';$actual.installExperience.extraReadOnly='ignored'
    $reordered=Test-SetupWin32AppBody $actual $body
    $actual.Remove('installCommandLine');$missing=Test-SetupWin32AppBody $actual $body
    $actual.installCommandLine=$body.installCommandLine;$actual.rules[0].comparisonValue='tampered';$changed=Test-SetupWin32AppBody $actual $body
    Write-Output ('RESULT:'+(@{reordered=$reordered;missing=$missing;changed=$changed}|ConvertTo-Json -Compress))`);
  assert.deepEqual(result,{reordered:true,missing:false,changed:false});
});
test('expired content authorization renews the same file without a create or commit request',()=>{
  const result=scenario(`$global:renewed=$false;$global:posts=@()
    function Invoke-SetupGraph {param($Method,$Path,$Body,[switch]$Beta)
      if($Method -ceq 'POST'){$global:posts+=,$Path;$global:renewed=$true;return}
      if($global:renewed){return @{uploadState='azureStorageUriRenewalSuccess';azureStorageUri='https://synthetic.blob.core.windows.net/file?sas=synthetic';azureStorageUriExpirationDateTime=[DateTimeOffset]::UtcNow.AddHours(1).ToString('o')}}
      return @{uploadState='azureStorageUriRequestSuccess';azureStorageUri='https://synthetic.blob.core.windows.net/file?sas=synthetic';azureStorageUriExpirationDateTime=[DateTimeOffset]::UtcNow.AddHours(-1).ToString('o')}
    }
    $file=Get-SetupWin32Storage '/deviceAppManagement/mobileApps/owned/contentVersions/1/files/owned'
    Write-Output ('RESULT:'+(@{state=$file.uploadState;posts=$global:posts}|ConvertTo-Json -Compress))`);
  assert.equal(result.state,'azureStorageUriRenewalSuccess');assert.equal(result.posts.length,1);assert.match(result.posts[0],/\/renewUpload$/);
});
test('a pending content commit reconciles by readback and never repeats commit POST',()=>{
  const result=scenario(`$global:posts=0;$global:gets=0
    $receipt=@{plan=@{};operations=@{'CommitContent-edge'=@{state='Pending'}};pendingOperation='CommitContent-edge'}
    $app=@{browser='edge';id='22222222-2222-4222-8222-222222222222'};$package=@{size=10;sizeEncrypted=20}
    function Invoke-RecordedSetupCreate {param($Receipt,$Directory,$Name,$Body,$Find,$Matches,$Create)
      if($Name -ceq 'ContentVersion-edge'){return @{id='1'}}
      return @{id='file1'}
    }
    function Get-SetupWin32ContentVersion {param($Receipt,$Directory,$App) return @{id='1'}}
    function Invoke-SetupGraph {param($Method,$Path,$Body,[switch]$Beta)
      if($Method -cne 'GET'){$global:posts++;throw 'Mutation forbidden for pending commit fixture.'}
      $global:gets++
      return @{isCommitted=$false;uploadState='commitFilePending'}
    }
    $stopped=$false;try{Invoke-SetupWin32Content $receipt $directory $app $package}catch{$stopped=$true}
    Write-Output ('RESULT:'+(@{stopped=$stopped;posts=$global:posts;gets=$global:gets}|ConvertTo-Json -Compress))`);
  assert.equal(result.stopped,true);assert.equal(result.posts,0);assert.equal(result.gets,31);
});
test('encrypted content upload hydrates metadata-only file lists and continuation reuses the same app/version/file',()=>{
  const result=scenario(`$global:version=$false;$global:file=$false;$global:committed=$false;$global:published=$false;$global:uploads=0;$global:calls=@{version=0;file=0;commit=0;patch=0}
    $app=@{browser='edge';id='22222222-2222-4222-8222-222222222222';body=(New-SetupWin32AppBody $config 'Synthetic BCK')}
    $receipt=@{plan=@{};operations=@{'CreateWin32-edge'=@{state='Confirmed';resourceId=$app.id;requestFingerprint=(Get-SetupFingerprint $app.body)}};pendingOperation=$null}
    $package=@{size=10;sizeEncrypted=20;contentPath='synthetic';encryption=@{profileIdentifier='ProfileVersion1'}}
    $script:versionCollectionPath='/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222/microsoft.graph.win32LobApp/contentVersions'
    function Get-SetupCollection {param($Path,[switch]$Beta)
      if($Path -ceq '/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222/assignments'){return @()}
      if($Path -ceq $script:versionCollectionPath){if($global:version){return @{id='1'}};return @()}
      if($Path -ceq ($script:versionCollectionPath+'/1/files')){if($global:file){return @{id='file1'}};return @()}
      throw 'Unexpected collection request.'
    }
    function Send-SetupWin32Blocks {param($StorageUri,$ContentPath) $global:uploads++}
    function Invoke-SetupGraph {param($Method,$Path,$Body,[switch]$Beta)
      if($Method -ceq 'POST'){
        if($Path -ceq $script:versionCollectionPath){$global:version=$true;$global:calls.version++;return @{id='1'}}
        if($Path -ceq ($script:versionCollectionPath+'/1/files')){$global:file=$true;$global:calls.file++;return @{id='file1'}}
        if($Path -ceq ($script:versionCollectionPath+'/1/files/file1/commit')){$global:committed=$true;$global:calls.commit++;return}
        throw 'Unexpected mutation.'
      }
      if($Method -ceq 'PATCH'){$global:published=$true;$global:calls.patch++;return}
      if($Path -ceq ($script:versionCollectionPath+'/1/files/file1')){return @{id='file1';name='IntunePackage.intunewin';size=10;sizeEncrypted=20;isDependency=$false;isCommitted=$global:committed;uploadState=$(if($global:committed){'commitFileSuccess'}else{'azureStorageUriRequestSuccess'});azureStorageUri='https://synthetic.blob.core.windows.net/file?sas=synthetic';azureStorageUriExpirationDateTime=[DateTimeOffset]::UtcNow.AddHours(1).ToString('o')}}
      if($Path -ceq ($script:versionCollectionPath+'/1')){return @{id='1'}}
      if($Path -ceq '/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222'){$value=$app.body.Clone();$value.id=$app.id;$value.committedContentVersion=$(if($global:published){'1'}else{''});$value.publishingState=$(if($global:published){'published'}else{'notPublished'});return $value}
      throw 'Unexpected read.'
    }
    Invoke-SetupWin32Content $receipt $directory $app $package
    Invoke-SetupWin32Content $receipt $directory $app $package
    Write-Output ('RESULT:'+(@{calls=$global:calls;uploads=$global:uploads;state=$receipt.operations['CommitContent-edge'].state}|ConvertTo-Json -Depth 10 -Compress))`);
  assert.deepEqual(result.calls,{version:1,file:1,commit:1,patch:1});assert.equal(result.uploads,1);assert.equal(result.state,'Confirmed');
});
test('a receipt-owned app can append one content version while leaving its existing version untouched',()=>{
  const result=scenario(`$body=New-SetupWin32AppBody $config 'Synthetic BCK';$id='22222222-2222-4222-8222-222222222222'
    $app=@{browser='edge';id=$id;body=$body};$receipt=@{plan=@{};operations=@{'CreateWin32-edge'=@{state='Confirmed';resourceId=$id;requestFingerprint=(Get-SetupFingerprint $body)}};pendingOperation=$null}
    $newId='fe0bb9a9-b9a9-fe0b-a9b9-0bfea9b90bfe';$global:created=$false;$global:versionPosts=0;$global:otherWrites=0
    $script:versionCollectionPath="/deviceAppManagement/mobileApps/$id/microsoft.graph.win32LobApp/contentVersions"
    function Get-SetupCollection {param($Path,[switch]$Beta)
      if($Path -ceq "/deviceAppManagement/mobileApps/$id/assignments"){return @()}
      if($Path -ceq $script:versionCollectionPath){if($global:created){return @(@{id='old-version'},@{id=$newId})};return @{id='old-version'}}
      if($Path -ceq ($script:versionCollectionPath+'/old-version/files')){return @()}
      if($Path -ceq ($script:versionCollectionPath+'/'+$newId+'/files')){return @()}
      throw 'Unexpected collection.'
    }
    function Invoke-SetupGraph {param($Method,$Path,$Body,[switch]$Beta)
      if($Method -ceq 'GET' -and $Path -ceq "/deviceAppManagement/mobileApps/$id"){$live=$app.body.Clone();$live.id=$id;$live.publishingState='notPublished';$live.committedContentVersion='';return $live}
      if($Method -ceq 'GET' -and $Path -ceq ($script:versionCollectionPath+'/'+$newId)){return @{id=$newId}}
      if($Method -ceq 'POST' -and $Path -ceq $script:versionCollectionPath){$global:created=$true;$global:versionPosts++;return @{id=$newId}}
      if($Method -ceq 'POST' -and $Path -ceq ($script:versionCollectionPath+'/'+$newId+'/files')){throw 'Synthetic content-file boundary reached.'}
      $global:otherWrites++;throw 'Unexpected request.'
    }
    $message='';try{Invoke-SetupWin32Content $receipt $directory $app @{size=10;sizeEncrypted=20}}catch{$message=$_.Exception.Message}
    $saved=if($receipt.operations.ContainsKey('ContentVersion-edge')){$receipt.operations['ContentVersion-edge']}else{@{}}
    Write-Output ('RESULT:'+(@{versionPosts=$global:versionPosts;otherWrites=$global:otherWrites;resourceId=$(if($saved.ContainsKey('resourceId')){$saved.resourceId}else{$null});message=$message}|ConvertTo-Json -Depth 10 -Compress))`);
  assert.equal(result.versionPosts,1,result.message);assert.equal(result.otherWrites,0);assert.equal(result.resourceId,'fe0bb9a9-b9a9-fe0b-a9b9-0bfea9b90bfe');assert.match(result.message,/Synthetic content-file boundary/);
});
test('version creation binds returned opaque IDs and reconciles a unique empty lost-response child without repeating POST',()=>{
  const result=scenario(`$script:newVersion='fe0bb9a9-b9a9-fe0b-a9b9-0bfea9b90bfe';$script:collection='/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222/microsoft.graph.win32LobApp/contentVersions'
    function Run-VersionCase([string]$mode){
      $script:mode=$mode;$script:created=$false;$script:posts=0
      $app=@{browser='edge';id='22222222-2222-4222-8222-222222222222';body=(New-SetupWin32AppBody $config 'Synthetic BCK')}
      $receipt=@{operations=@{'CreateWin32-edge'=@{state='Confirmed';resourceId=$app.id;requestFingerprint=(Get-SetupFingerprint $app.body)}};pendingOperation=$null}
      function Get-SetupCollection {param($Path,[switch]$Beta)
        if($Path -ceq '/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222/assignments'){return @()}
        if($Path -ceq ($script:collection+'/old/files')){return @()}
        if($Path -ceq $script:collection){if($script:created -and $script:mode -ne 'known-list-lag'){return @(@{id='old'},@{id=$script:newVersion})};return @{id='old'}}
        if($Path -ceq ($script:collection+'/'+$script:newVersion+'/files')){return @()};throw 'Unexpected collection.'
      }
      function Invoke-SetupGraph {param($Method,$Path,$Body,[switch]$Beta)
        if($Method -ceq 'GET' -and $Path -ceq '/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222'){$live=$app.body.Clone();$live.id=$app.id;$live.publishingState='notPublished';$live.committedContentVersion='';return $live}
        if($Method -ceq 'GET' -and $Path -ceq ($script:collection+'/'+$script:newVersion)){return @{id=$script:newVersion}}
        if($Method -ceq 'POST' -and $Path -ceq $script:collection){$script:posts++;$script:created=$true;if($script:mode -ceq 'lost'){throw 'Synthetic lost response.'};return @{id=$script:newVersion}}
        throw 'Unexpected request.'
      }
      try{Get-SetupWin32ContentVersion $receipt $directory $app|Out-Null}catch{if($mode -cne 'lost'){throw}}
      $again=Get-SetupWin32ContentVersion $receipt $directory $app
      return @{mode=$mode;posts=$script:posts;id=$again.id;state=$receipt.operations['ContentVersion-edge'].state;before=$receipt.operations['ContentVersion-edge'].beforeIds}
    }
    $cases=@(Run-VersionCase 'normal';Run-VersionCase 'known-list-lag';Run-VersionCase 'lost')
    Write-Output ('RESULT:'+(@{cases=$cases}|ConvertTo-Json -Depth 10 -Compress))`);
  assert.equal(result.cases.length,3);for(const item of result.cases){assert.equal(item.posts,1);assert.equal(item.id,'fe0bb9a9-b9a9-fe0b-a9b9-0bfea9b90bfe');assert.equal(item.state,'Confirmed');assert.deepEqual(item.before,['old']);}
});
test('version reconciliation refuses foreign, occupied, ambiguous and mismatched identities without a second POST',()=>{
  const result=scenario(`$script:newVersion='fe0bb9a9-b9a9-fe0b-a9b9-0bfea9b90bfe';$script:collection='/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222/microsoft.graph.win32LobApp/contentVersions'
    function Run-RejectedVersion([string]$mode){
      $script:mode=$mode;$script:created=$false;$script:posts=0
      $app=@{browser='edge';id='22222222-2222-4222-8222-222222222222';body=(New-SetupWin32AppBody $config 'Synthetic BCK')}
      $receipt=@{operations=@{'CreateWin32-edge'=@{state='Confirmed';resourceId=$app.id;requestFingerprint=(Get-SetupFingerprint $app.body)}};pendingOperation=$null}
      if($mode -ceq 'foreign-parent'){$receipt.operations['CreateWin32-edge'].resourceId='33333333-3333-4333-8333-333333333333'}
      function Get-SetupCollection {param($Path,[switch]$Beta)
        if($Path -ceq '/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222/assignments'){return @()}
        if($Path -ceq ($script:collection+'/old/files')){return @()}
        if($Path -ceq $script:collection){if(-not $script:created){return @{id='old'}};if($script:mode -ceq 'multiple'){return @(@{id='old'},@{id=$script:newVersion},@{id='another'})};return @(@{id='old'},@{id=$script:newVersion})}
        if($Path -ceq ($script:collection+'/'+$script:newVersion+'/files')){if($script:mode -ceq 'occupied'){return @{id='foreign-file'}};return @()};throw 'Unexpected collection.'
      }
      function Invoke-SetupGraph {param($Method,$Path,$Body,[switch]$Beta)
        if($Method -ceq 'GET' -and $Path -ceq '/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222'){$live=$app.body.Clone();$live.id=$app.id;$live.publishingState='notPublished';$live.committedContentVersion=$(if($script:mode -ceq 'committed'){$script:newVersion}else{''});return $live}
        if($Method -ceq 'POST' -and $Path -ceq $script:collection){$script:posts++;$script:created=$true;if($script:mode -ceq 'wrong-readback'){return @{id=$script:newVersion}};throw 'Synthetic lost response.'}
        if($Method -ceq 'GET' -and $Path -ceq ($script:collection+'/'+$script:newVersion)){return @{id='wrong-version'}}
        throw 'Unexpected request.'
      }
      try{Get-SetupWin32ContentVersion $receipt $directory $app|Out-Null}catch{}
      $stopped=$false;try{Get-SetupWin32ContentVersion $receipt $directory $app|Out-Null}catch{$stopped=$true}
      return @{mode=$mode;posts=$script:posts;stopped=$stopped}
    }
    $cases=@('foreign-parent','occupied','multiple','committed','wrong-readback'|ForEach-Object {Run-RejectedVersion $_})
    $unsafe=$false;try{ConvertTo-SetupWin32ContentVersionId '../foreign'|Out-Null}catch{$unsafe=$true}
    Write-Output ('RESULT:'+(@{cases=$cases;unsafe=$unsafe}|ConvertTo-Json -Depth 10 -Compress))`);
  assert.equal(result.unsafe,true);for(const item of result.cases){assert.equal(item.stopped,true);assert.equal(item.posts,item.mode==='foreign-parent'?0:1);}
});
test('full upload promotes an unchanged unpublished zero sentinel or empty referenced baseline child',()=>{
  const result=scenario(`$script:collection='/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222/microsoft.graph.win32LobApp/contentVersions'
    function Run-PromotionCase([string]$initial){
      $script:initial=$initial;$script:created=$false;$script:hasFile=$false;$script:committed=$false;$script:published=$false;$script:patches=0;$script:versionPosts=0
      $app=@{browser='edge';id='22222222-2222-4222-8222-222222222222';body=(New-SetupWin32AppBody $config 'Synthetic BCK')}
      $receipt=@{operations=@{'CreateWin32-edge'=@{state='Confirmed';resourceId=$app.id;requestFingerprint=(Get-SetupFingerprint $app.body)}};pendingOperation=$null}
      $package=@{size=10;sizeEncrypted=20;contentPath='synthetic';encryption=@{profileIdentifier='ProfileVersion1'}}
      function Get-SetupCollection {param($Path,[switch]$Beta)
        if($Path -ceq '/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222/assignments'){return @()}
        if($Path -ceq $script:collection){$list=@();if($script:initial -ceq '1'){$list+=@{id='1'}};if($script:created){$list+=@{id='2'}};return $list}
        if($Path -ceq ($script:collection+'/1/files')){return @()}
        if($Path -ceq ($script:collection+'/2/files')){if($script:hasFile){return @{id='file2'}};return @()}
        throw 'Unexpected collection.'
      }
      function Send-SetupWin32Blocks {}
      function Invoke-SetupGraph {param($Method,$Path,$Body,[switch]$Beta)
        if($Method -ceq 'GET' -and $Path -ceq '/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222'){$live=$app.body.Clone();$live.id=$app.id;$live.committedContentVersion=$(if($script:published){'2'}else{$script:initial});$live.publishingState=$(if($script:published){'published'}elseif($script:committed){'processing'}else{'notPublished'});return $live}
        if($Method -ceq 'GET' -and $Path -ceq ($script:collection+'/2')){return @{id='2'}}
        if($Method -ceq 'POST' -and $Path -ceq $script:collection){$script:created=$true;$script:versionPosts++;return @{id='2'}}
        if($Method -ceq 'POST' -and $Path -ceq ($script:collection+'/2/files')){$script:hasFile=$true;return @{id='file2'}}
        if($Method -ceq 'GET' -and $Path -ceq ($script:collection+'/2/files/file2')){return @{id='file2';name='IntunePackage.intunewin';size=10;sizeEncrypted=20;isDependency=$false;isCommitted=$script:committed;uploadState=$(if($script:committed){'commitFileSuccess'}else{'azureStorageUriRequestSuccess'});azureStorageUri='https://synthetic.blob.core.windows.net/file?sas=synthetic';azureStorageUriExpirationDateTime=[DateTimeOffset]::UtcNow.AddHours(1).ToString('o')}}
        if($Method -ceq 'POST' -and $Path -ceq ($script:collection+'/2/files/file2/commit')){$script:committed=$true;return}
        if($Method -ceq 'PATCH' -and $Path -ceq '/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222'){if($Body.committedContentVersion -cne '2'){throw 'Wrong promotion.'};$script:patches++;$script:published=$true;return}
        throw 'Unexpected request.'
      }
      Invoke-SetupWin32Content $receipt $directory $app $package
      Invoke-SetupWin32Content $receipt $directory $app $package
      return @{initial=$initial;patches=$script:patches;versionPosts=$script:versionPosts;state=$receipt.operations['PromoteContent-edge'].state;baseline=$receipt.operations['ContentVersion-edge'].parentBaseline.committedContentVersion}
    }
    Write-Output ('RESULT:'+(@{cases=@(Run-PromotionCase '0';Run-PromotionCase '1')}|ConvertTo-Json -Depth 15 -Compress))`);
  for(const item of result.cases){assert.equal(item.patches,1);assert.equal(item.versionPosts,1);assert.equal(item.state,'Confirmed');assert.equal(item.baseline,item.initial);}
});
test('parent promotion refuses publication, assignment, existing content, pointer drift and missing commit proof',()=>{
  const result=scenario(`function Run-BlockedPromotion([string]$mode){
      $script:mode=$mode;$script:patches=0
      $app=@{browser='edge';id='22222222-2222-4222-8222-222222222222';body=(New-SetupWin32AppBody $config 'Synthetic BCK')}
      $fingerprint=Get-SetupFingerprint $app.body
      $receipt=@{operations=@{'ContentVersion-edge'=@{resourceId='2';parentResourceId=$app.id;parentBaseline=@{committedContentVersion='1';publishingState='notPublished';versionIds=@('1');appFingerprint=$fingerprint;unassigned=$true}};'CommitContent-edge'=@{state='Confirmed';appId=$app.id;version='2'}};pendingOperation=$null}
      if($mode -ceq 'missing-commit'){$receipt.operations.Remove('CommitContent-edge')}
      function Get-SetupCollection {param($Path,[switch]$Beta)
        if($Path -like '*/assignments'){if($script:mode -ceq 'assigned'){return @{id='foreign-assignment'}};return @()}
        if($Path -like '*/contentVersions'){return @(@{id='1'},@{id='2'})}
        if($Path -like '*/1/files'){if($script:mode -ceq 'nonempty'){return @{id='foreign-file'}};return @()}
        throw 'Unexpected collection.'
      }
      function Invoke-SetupGraph {param($Method,$Path,$Body,[switch]$Beta)
        if($Method -ceq 'PATCH'){$script:patches++;throw 'Mutation forbidden.'}
        $live=$app.body.Clone();$live.id=$app.id;$live.committedContentVersion=$(if($script:mode -ceq 'pointer-drift'){'another'}else{'1'});$live.publishingState=$(if($script:mode -ceq 'published'){'published'}else{'processing'});return $live
      }
      $stopped=$false;try{Set-SetupWin32ParentContent $receipt $directory $app '2'}catch{$stopped=$true}
      return @{mode=$mode;stopped=$stopped;patches=$script:patches}
    }
    Write-Output ('RESULT:'+(@{cases=@('published','assigned','nonempty','pointer-drift','missing-commit'|ForEach-Object {Run-BlockedPromotion $_})}|ConvertTo-Json -Depth 15 -Compress))`);
  for(const item of result.cases){assert.equal(item.stopped,true);assert.equal(item.patches,0);}
});
test('a lost parent PATCH response reconciles its journal from the exact published pointer without another mutation',()=>{
  const result=scenario(`$app=@{browser='edge';id='22222222-2222-4222-8222-222222222222';body=(New-SetupWin32AppBody $config 'Synthetic BCK')}
    $receipt=@{operations=@{'PromoteContent-edge'=@{state='Pending';appId=$app.id;version='2';before='0'}};pendingOperation='PromoteContent-edge'};$global:patches=0
    function Invoke-SetupGraph {param($Method,$Path,$Body,[switch]$Beta)
      if($Method -cne 'GET'){$global:patches++;throw 'Mutation forbidden.'}
      $live=$app.body.Clone();$live.id=$app.id;$live.committedContentVersion='2';$live.publishingState='published';return $live
    }
    Set-SetupWin32ParentContent $receipt $directory $app '2'
    Write-Output ('RESULT:'+(@{patches=$global:patches;state=$receipt.operations['PromoteContent-edge'].state;pending=$receipt.pendingOperation}|ConvertTo-Json -Compress))`);
  assert.deepEqual(result,{patches:0,state:'Confirmed',pending:null});
});
test('a POST-acknowledged existing empty draft and the saved 6.0.2 Partial response validate once and continue after own content exists',()=>{
  const result=scenario(`$script:draftPath='/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222/microsoft.graph.win32LobApp/contentVersions'
    function Run-AcknowledgedDraft([bool]$saved602){
      $script:ownContent=$false;$script:published=$false;$script:posts=0
      $app=@{browser='edge';id='22222222-2222-4222-8222-222222222222';body=(New-SetupWin32AppBody $config 'Synthetic BCK')}
      $receipt=@{operations=@{'CreateWin32-edge'=@{state='Confirmed';resourceId=$app.id;requestFingerprint=(Get-SetupFingerprint $app.body)}};pendingOperation=$null}
      if($saved602){$receipt.operations['ContentVersion-edge']=@{state='Partial';parentResourceId=$app.id;requestFingerprint=(Get-SetupFingerprint @{'@odata.type'='#microsoft.graph.mobileAppContent'});beforeIds=@('1');resourceId='1';parentBaseline=@{committedContentVersion='';publishingState='notPublished';versionIds=@('1');appFingerprint=(Get-SetupFingerprint $app.body);unassigned=$true}}}
      function Get-SetupCollection {param($Path,[switch]$Beta)
        if($Path -ceq $script:draftPath){return @{id='1'}}
        if($Path -like '*/assignments'){return @()}
        if($Path -ceq ($script:draftPath+'/1/files')){if($script:ownContent){return @{id='own-file'}};return @()};throw 'Unexpected collection.'
      }
      function Invoke-SetupGraph {param($Method,$Path,$Body,[switch]$Beta)
        if($Method -ceq 'POST' -and $Path -ceq $script:draftPath){$script:posts++;return @{id='1'}}
        if($Method -ceq 'GET' -and $Path -ceq ($script:draftPath+'/1')){return @{id='1'}}
        if($Method -ceq 'GET' -and $Path -ceq '/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222'){$live=$app.body.Clone();$live.id=$app.id;$live.publishingState=$(if($script:published){'published'}else{'notPublished'});$live.committedContentVersion=$(if($script:published){'1'}else{''});return $live};throw 'Unexpected request.'
      }
      $first=Get-SetupWin32ContentVersion $receipt $directory $app
      $persisted=Get-Content -LiteralPath (Join-Path $directory 'receipt.json') -Raw|ConvertFrom-Json -AsHashtable
      $script:ownContent=$true;$script:published=$true
      $receipt=$persisted
      $next=Get-SetupWin32ContentVersion $receipt $directory $app
      return @{saved602=$saved602;posts=$script:posts;first=$first.id;next=$next.id;origin=$receipt.operations['ContentVersion-edge'].serviceReturnedDraft.origin;state=$receipt.operations['ContentVersion-edge'].state}
    }
    Write-Output ('RESULT:'+(@{cases=@(Run-AcknowledgedDraft $false;Run-AcknowledgedDraft $true)}|ConvertTo-Json -Depth 15 -Compress))`);
  for(const item of result.cases){assert.equal(item.posts,item.saved602?0:1);assert.equal(item.first,'1');assert.equal(item.next,'1');assert.equal(item.origin,'CreateResponse');assert.equal(item.state,'Confirmed');}
});
test('a reused draft cannot be selected from a lost response or validated once occupied, assigned or published',()=>{
  const result=scenario(`$script:draftPath='/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222/microsoft.graph.win32LobApp/contentVersions'
    function Run-RejectedDraft([string]$mode){
      $script:mode=$mode;$script:responded=$false;$script:posts=0
      $app=@{browser='edge';id='22222222-2222-4222-8222-222222222222';body=(New-SetupWin32AppBody $config 'Synthetic BCK')}
      $receipt=@{operations=@{'CreateWin32-edge'=@{state='Confirmed';resourceId=$app.id;requestFingerprint=(Get-SetupFingerprint $app.body)}};pendingOperation=$null}
      function Get-SetupCollection {param($Path,[switch]$Beta)
        if($Path -ceq $script:draftPath){return @{id='1'}}
        if($Path -like '*/assignments'){if($script:responded -and $script:mode -ceq 'assigned'){return @{id='foreign-assignment'}};return @()}
        if($Path -ceq ($script:draftPath+'/1/files')){if($script:responded -and $script:mode -ceq 'occupied'){return @{id='foreign-file'}};return @()};throw 'Unexpected collection.'
      }
      function Invoke-SetupGraph {param($Method,$Path,$Body,[switch]$Beta)
        if($Method -ceq 'POST' -and $Path -ceq $script:draftPath){$script:posts++;$script:responded=$true;if($script:mode -ceq 'lost'){throw 'Synthetic lost response.'};return @{id='1'}}
        if($Method -ceq 'GET' -and $Path -ceq ($script:draftPath+'/1')){return @{id='1'}}
        if($Method -ceq 'GET' -and $Path -ceq '/deviceAppManagement/mobileApps/22222222-2222-4222-8222-222222222222'){$live=$app.body.Clone();$live.id=$app.id;$live.publishingState=$(if($script:responded -and $script:mode -ceq 'published'){'published'}else{'notPublished'});$live.committedContentVersion='';return $live};throw 'Unexpected request.'
      }
      try{Get-SetupWin32ContentVersion $receipt $directory $app|Out-Null}catch{}
      $stopped=$false;try{Get-SetupWin32ContentVersion $receipt $directory $app|Out-Null}catch{$stopped=$true}
      return @{mode=$mode;posts=$script:posts;stopped=$stopped;bound=$receipt.operations['ContentVersion-edge'].ContainsKey('serviceReturnedDraft')}
    }
    Write-Output ('RESULT:'+(@{cases=@('lost','occupied','assigned','published'|ForEach-Object {Run-RejectedDraft $_})}|ConvertTo-Json -Depth 15 -Compress))`);
  for(const item of result.cases){assert.equal(item.posts,1);assert.equal(item.stopped,true);assert.equal(item.bound,false);}
});
