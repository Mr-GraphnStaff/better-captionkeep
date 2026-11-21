const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const quote=value=>`'${value.replaceAll("'","''")}'`;

function uploadScenario(source) {
  assert.ok(process.env.AGENT_WORKING_DIR,'Use working_area.py');
  const directory=fs.mkdtempSync(path.join(process.env.AGENT_WORKING_DIR,'upload-readback-'));
  const file=path.join(directory,'probe.ps1');
  fs.writeFileSync(file,`$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
    . ${quote(path.join(root,'deployment/intune/Enterprise-Setup.ps1'))}
    $directory=${quote(directory)}
    $id='11111111-1111-4111-8111-111111111111';$otherId='22222222-2222-4222-8222-222222222222'
    $body=New-IntuneScriptBody -Name 'Synthetic reviewed deployment' -Signed $true -ScriptBytes ([Text.Encoding]::UTF8.GetBytes("Write-Output 'synthetic reviewed bytes'"))
    $receipt=@{plan=@{};operations=@{};pendingOperation=$null}
    $global:exists=$false;$global:visible=$true;$global:duplicate=$false;$global:listWrongId=$false
    $global:detailMode='valid';$global:postCalls=0;$global:detailCalls=0;$global:signCalls=0
    $global:detail=$body.Clone();$global:detail.id=$id
    function Get-SetupCollection {param($Path,[switch]$Beta)
      if(-not $global:exists -or -not $global:visible){return @()}
      if($global:duplicate){return @(@{id=$id;displayName=$body.displayName},@{id=$otherId;displayName=$body.displayName})}
      if($global:listWrongId){return @(@{id=$otherId;displayName=$body.displayName})}
      return @(@{id=$id;displayName=$body.displayName})
    }
    function Invoke-SetupGraph {param($Method,$Path,$Body,[switch]$Beta)
      if($Method -cne 'GET' -or $Path -cne "/deviceManagement/deviceManagementScripts/$id"){throw 'Unexpected synthetic request'}
      $global:detailCalls++
      if($global:detailMode -ceq 'unavailable'){throw 'PRIVATE REMOTE RESPONSE'}
      $value=$global:detail.Clone()
      switch($global:detailMode){
        wrongId{$value.id=$otherId}
        wrongHash{$value.scriptContent=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('PRIVATE WRONG BYTES'))}
        noContent{$value.Remove('scriptContent')}
        wrappedBase64{$value.scriptContent=$value.scriptContent.Substring(0,4)+"\r\n"+$value.scriptContent.Substring(4)}
      }
      return $value
    }
    function Set-AuthenticodeSignature {throw 'Signing is forbidden in upload verification'}
    function Invoke-SetupSignTool {$global:signCalls++;throw 'Signing is forbidden in upload verification'}
    function Upload {
      Invoke-RecordedSetupCreate $receipt $directory 'Upload-edge' $body {
        Find-SetupIntuneScriptCandidates $body.displayName $body $receipt $directory 'Upload-edge'
      } {param($candidate) (Get-SetupIntuneScriptVerification $candidate $body).verified} {
        param($request)
        $global:postCalls++;$global:exists=$true
        return @{id=$id}
      }
    }
    ${source}
  `);
  const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',file],{encoding:'utf8',windowsHide:true});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  const line=result.stdout.split(/\r?\n/).findLast(value=>value.startsWith('RESULT:'));
  assert.ok(line,result.stdout);return JSON.parse(line.slice(7));
}

test('metadata-only list hydrates the exact entity and verifies decoded bytes, typed settings and metadata',()=>{
  const result=uploadScenario(`$global:detailMode='wrappedBase64';Upload|Out-Null;Upload|Out-Null
    Write-Output ('RESULT:'+(@{posts=$global:postCalls;details=$global:detailCalls;signs=$global:signCalls;operation=$receipt.operations['Upload-edge']}|ConvertTo-Json -Depth 15 -Compress))`);
  assert.equal(result.posts,1);assert.equal(result.details,2);assert.equal(result.signs,0);
  assert.equal(result.operation.state,'Reconciled');assert.equal(result.operation.resourceId,'11111111-1111-4111-8111-111111111111');
  assert.equal(result.operation.verification.reason,'Verified');assert.equal(result.operation.verification.contentHashMatches,true);
  const diagnostic=JSON.stringify(result.operation.verification);
  assert.ok(!diagnostic.includes('11111111'));assert.ok(!diagnostic.includes('Synthetic reviewed'));assert.ok(!diagnostic.includes('scriptContent":"'));
});

test('delayed empty post-create list retains the known ID and recovers with zero repeated upload or signing',()=>{
  const result=uploadScenario(`$global:visible=$false;$failed=$false;try{Upload|Out-Null}catch{$failed=$true}
    $before=$receipt.operations['Upload-edge']|ConvertTo-Json -Depth 15 -Compress
    $global:visible=$true;Upload|Out-Null
    Write-Output ('RESULT:'+(@{failed=$failed;before=$before;posts=$global:postCalls;signs=$global:signCalls;operation=$receipt.operations['Upload-edge']}|ConvertTo-Json -Depth 15 -Compress))`);
  assert.equal(result.failed,true);const before=JSON.parse(result.before);
  assert.equal(before.state,'Ambiguous');assert.equal(before.verification.reason,'ListEmpty');assert.ok(before.resourceId);
  assert.equal(result.posts,1);assert.equal(result.signs,0);assert.equal(result.operation.state,'Reconciled');
});

test('duplicate list and wrong list/detail IDs fail closed without adopting or repeating the known upload',()=>{
  for(const mode of ['duplicate','listWrongId','wrongId']){
    const setup=mode==='wrongId'?"$global:detailMode='wrongId'":`$global:${mode}=$true`;
    const result=uploadScenario(`${setup};$failed=$false;try{Upload|Out-Null}catch{$failed=$true};try{Upload|Out-Null}catch{}
      Write-Output ('RESULT:'+(@{failed=$failed;posts=$global:postCalls;details=$global:detailCalls;operation=$receipt.operations['Upload-edge']}|ConvertTo-Json -Depth 15 -Compress))`);
    assert.equal(result.failed,true);assert.equal(result.posts,1);assert.equal(result.operation.state,'Ambiguous');
    assert.equal(result.operation.resourceId,'11111111-1111-4111-8111-111111111111');
    assert.equal(result.operation.verification.reason,{duplicate:'ListNotUnique',listWrongId:'RecordedIdMismatch',wrongId:'DetailIdMismatch'}[mode]);
    if(mode!=='wrongId')assert.equal(result.details,0);
  }
});

test('detail omission, unavailable readback and wrong content preserve ambiguity and expose no raw response',()=>{
  for(const mode of ['noContent','unavailable','wrongHash']){
    const result=uploadScenario(`$global:detailMode='${mode}';$failed=$false;$message='';try{Upload|Out-Null}catch{$failed=$true;$message=$_.Exception.Message};try{Upload|Out-Null}catch{}
      Write-Output ('RESULT:'+(@{failed=$failed;message=$message;posts=$global:postCalls;operation=$receipt.operations['Upload-edge']}|ConvertTo-Json -Depth 15 -Compress))`);
    assert.equal(result.failed,true);assert.equal(result.posts,1);assert.equal(result.operation.state,'Ambiguous');
    assert.equal(result.operation.verification.reason,mode==='unavailable'?'DetailReadUnavailable':'FieldMismatch');
    assert.ok(!JSON.stringify(result.operation.verification).includes('PRIVATE'));
    assert.ok(!result.message.includes('PRIVATE'));
    if(mode!=='unavailable'){
      assert.equal(result.operation.verification.contentHashMatches,false);
      assert.match(result.message,/reviewed fields: scriptContent/);
    }
  }
});

test('missing, null, string or numeric boolean settings never become false through coercion',()=>{
  for(const setup of ["$global:detail.Remove('runAs32Bit')","$global:detail.runAs32Bit=$null","$global:detail.runAs32Bit='false'","$global:detail.runAs32Bit=0","$global:detail.Remove('enforceSignatureCheck')","$global:detail.enforceSignatureCheck='true'"]){
    const result=uploadScenario(`${setup};$failed=$false;try{Upload|Out-Null}catch{$failed=$true}
      Write-Output ('RESULT:'+(@{failed=$failed;posts=$global:postCalls;operation=$receipt.operations['Upload-edge']}|ConvertTo-Json -Depth 15 -Compress))`);
    assert.equal(result.failed,true);assert.equal(result.posts,1);assert.equal(result.operation.state,'Ambiguous');
    assert.equal(result.operation.verification.reason,'FieldMismatch');
  }
});

test('every requested metadata and execution setting must match independently',()=>{
  const result=uploadScenario(`$checks=@{}
    foreach($key in @('displayName','description','fileName','runAsAccount','runAs32Bit','enforceSignatureCheck')){
      $value=$body.Clone()
      if($key -cin @('runAs32Bit','enforceSignatureCheck')){$value[$key]=-not $value[$key]}else{$value[$key]='different'}
      $checks[$key]=-not (Get-SetupIntuneScriptVerification $value $body).verified
    }
    Write-Output ('RESULT:'+($checks|ConvertTo-Json -Compress))`);
  assert.ok(Object.values(result).every(value=>value===true));assert.equal(Object.keys(result).length,6);
});

test('changed reviewed request fingerprint rejects continuation before another read or POST',()=>{
  const result=uploadScenario(`$global:detailMode='noContent';try{Upload|Out-Null}catch{}
    $before=$receipt.operations['Upload-edge'].requestFingerprint;$body.fileName='changed.ps1';$failed=$false
    try{Upload|Out-Null}catch{$failed=$true}
    Write-Output ('RESULT:'+(@{failed=$failed;posts=$global:postCalls;details=$global:detailCalls;unchanged=($before -ceq $receipt.operations['Upload-edge'].requestFingerprint)}|ConvertTo-Json -Compress))`);
  assert.deepEqual(result,{failed:true,posts:1,details:1,unchanged:true});
});

test('an unrecorded existing name cannot become a fresh POST when detail hydration is unavailable',()=>{
  const result=uploadScenario(`$global:exists=$true;$global:detailMode='unavailable';$failed=$false;try{Upload|Out-Null}catch{$failed=$true}
    Write-Output ('RESULT:'+(@{failed=$failed;posts=$global:postCalls;details=$global:detailCalls;operations=$receipt.operations.Count}|ConvertTo-Json -Compress))`);
  assert.deepEqual(result,{failed:true,posts:0,details:0,operations:0});
});

test('actual Azure setup continues ambiguous Edge by its saved ID, then completes Chrome and both assignments without re-signing',async()=>{
  const fixtureSource=fs.readFileSync(path.join(__dirname,'enterprise-setup.test.cjs'),'utf8');
  const fixtures=vm.runInNewContext(fixtureSource.slice(fixtureSource.indexOf('function provisioningMock('),fixtureSource.indexOf("test('Azure provider signs"))+'\n({provisioningMock,azureSigningMock})',{quote,path});
  const directory=fs.mkdtempSync(path.join(process.env.AGENT_WORKING_DIR,'upload-continuation-'));
  const output=path.join(directory,'package');
  const {buildEnterprisePackage}=await import('../scripts/build-enterprise-package.mjs');
  await buildEnterprisePackage(output);
  const before=`
    ${fixtures.azureSigningMock(directory)}
    $options.AzureSigningConfigPath=$azureConfigPath;$options.AllowUnsignedEndpointScripts=$false
    $global:blockReadback=$true;$global:graphMock=(Get-Command Invoke-MgGraphRequest).ScriptBlock
    function Invoke-MgGraphRequest {
      param($Method,$Uri,$OutputType,$Body,$ContentType)
      $response=& $global:graphMock @PSBoundParameters
      if($Method -ceq 'GET' -and $Uri -match '/deviceManagementScripts\\?'){
        return @{value=@($response.value|ForEach-Object {@{id=$_.id;displayName=$_.displayName}})}
      }
      if($Method -ceq 'GET' -and $Uri -match '/deviceManagementScripts/[^/?]+$' -and $global:blockReadback){throw 'Synthetic first entity readback unavailable'}
      return $response
    }
  `;
  const after=`
    $canonical=${quote(path.join(directory,'receipt/receipt.json'))}
    $paused=Read-EnterpriseReceipt $canonical
    if(-not $failed -or $paused.operations['Upload-edge'].state -cne 'Ambiguous'){throw 'Expected paused Upload-edge ambiguity'}
    $savedId=$paused.operations['Upload-edge'].resourceId
    $beforeFingerprint=$paused.operations['Upload-edge'].requestFingerprint
    $beforeSigns=$global:azureCalls.Count
    $beforeConfirmedSigns=@($paused.operations.Keys|Where-Object {$_ -like 'AzureSign-*' -and $paused.operations[$_].state -ceq 'Confirmed'}).Count
    $global:blockReadback=$false
    Invoke-EnterpriseSetup @{ResumeReceipt=$canonical} ${quote(output)}|Out-Null
    $continued=Read-EnterpriseReceipt $canonical
    $extra=@{savedId=$savedId;retainedId=($continued.scripts[0].id -ceq $savedId);beforeSigns=$beforeSigns;
      confirmedSigns=$beforeConfirmedSigns;additionalSigns=($global:azureCalls.Count-$beforeSigns);
      fingerprintUnchanged=($continued.operations['Upload-edge'].requestFingerprint -ceq $beforeFingerprint)}
  `;
  const file=path.join(directory,'continue.ps1');
  fs.writeFileSync(file,"$ErrorActionPreference='Stop'\n"+fixtures.provisioningMock(output,directory,true,false,true,false,after,'',before));
  const run=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',file],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
  assert.equal(run.error,undefined);assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
  const line=run.stdout.split(/\r?\n/).findLast(value=>value.startsWith('RESULT:'));assert.ok(line,run.stdout);
  const result=JSON.parse(line.slice(7));
  assert.equal(result.extra.beforeSigns,4);assert.equal(result.extra.confirmedSigns,4);assert.equal(result.extra.additionalSigns,0);
  assert.equal(result.extra.retainedId,true);assert.equal(result.extra.fingerprintUnchanged,true);
  assert.equal(result.receipt.status,'AssignedPendingEndpointValidation');assert.equal(result.receipt.scripts.length,2);
  assert.ok(result.receipt.scripts.every(script=>script.id&&script.assigned));
  assert.equal(result.receipt.operations['Upload-edge'].state,'Reconciled');
  assert.equal(result.receipt.operations['Upload-edge'].verification.reason,'Verified');
  const uploads=result.calls.filter(call=>call.method==='POST'&&call.path.endsWith('/deviceManagementScripts'));
  assert.equal(uploads.length,2);assert.equal(uploads.filter(call=>call.body.displayName.includes(' edge ')).length,1);
  assert.equal(uploads.filter(call=>call.body.displayName.includes(' chrome ')).length,1);
  assert.equal(result.calls.filter(call=>call.method==='POST'&&call.path.endsWith('/assign')).length,2);
  for(const suffix of ['/applications','/servicePrincipals','/oauth2PermissionGrants']){
    assert.equal(result.calls.filter(call=>call.method==='POST'&&call.path.endsWith(suffix)).length,1);
  }
});
