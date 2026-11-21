const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const root=path.resolve(__dirname,'..');
const quote=value=>`'${value.replaceAll("'","''")}'`;
// Reuse the existing synthetic Graph/Azure boundary fixtures without loading
// their tests or changing owner-maintained fixtures.
const existing=fs.readFileSync(path.join(__dirname,'enterprise-setup.test.cjs'),'utf8');
const fixtures=vm.runInNewContext(existing.slice(existing.indexOf('function provisioningMock('),existing.indexOf("test('Azure provider signs"))+'\n({provisioningMock,azureSigningMock})',{quote,path});

async function runMigration({approve=true, after='', beforeResume=''}={}) {
  assert.ok(process.env.AGENT_WORKING_DIR,'Run through working_area.py');
  const directory=fs.mkdtempSync(path.join(process.env.AGENT_WORKING_DIR,'signer-migration-'));
  const output=path.join(directory,'package');
  const {buildEnterprisePackage}=await import('../scripts/build-enterprise-package.mjs');
  await buildEnterprisePackage(output);
  // Test the currently owned engine/modules even while the packager owner is
  // updating its inventory; these are explicit synthetic package source files.
  for (const name of ['Enterprise-Setup.ps1','Enterprise-SignerMigration.ps1']) {
    fs.copyFileSync(path.join(root,'deployment/intune',name),path.join(output,name));
  }
  const before=`
    $testPackageRoot=${quote(output)}
    ${fixtures.azureSigningMock(directory)}
    $options.AllowUnsignedEndpointScripts=$false;$options.SigningCertificateThumbprint=('A'*40)
    function Select-SetupCertificate {param($Thumbprint,$AllowUnsigned) @{Thumbprint=('A'*40)}}
    function Assert-SetupLocalSigningCertificate {param($Certificate)}
    function Invoke-SetupLocalSign {
      param($Path,$Certificate,$Receipt,$Directory,$ExpectedContent)
      [IO.File]::WriteAllText($Path,$ExpectedContent+"\r\n# SIG # Begin signature block\r\n# U3ludGhldGlj\r\n# SIG # End signature block\r\n")
      throw 'Synthetic old local signing UntrustedRoot'
    }
    function Read-Host {param($Prompt)
      if($Prompt -like 'Type SWITCH SIGNER*'){${approve ? "'SWITCH SIGNER'" : "'CANCEL'"}}
      elseif($Prompt -like 'Type APPROVE*'){'APPROVE'}
      elseif($Prompt -like 'Type DEPLOY*'){'DEPLOY'}
      else{throw "Unexpected prompt $Prompt"}
    }
  `;
  const body=fixtures.provisioningMock(output,directory,true,false,true,false,`
    if(-not $failed){throw 'Synthetic local failure did not pause provisioning'}
    $canonical=Join-Path ${quote(path.join(directory,'receipt'))} 'receipt.json'
    $saved=Read-EnterpriseReceipt $canonical
    # Simulate the legacy saved receipt which predates byte-pinned payload JSON.
    $saved.Remove('payloadConfigurations');Save-SetupReceipt $saved (Split-Path $canonical)
    $originalPlan=Get-SetupFingerprint $saved.plan
    $originalResources=Get-SetupSignerResourceFingerprint $saved
    $originalFile=Join-Path (Split-Path $canonical) 'edge-Install.ps1'
    # The real legacy producer serialized ordinary Hashtables, unlike the new
    # canonical encoder. Build equivalent JSON in deliberately different order.
    $priorBody=Get-SetupLocalReviewedBody ([IO.File]::ReadAllText($originalFile)) -SignedFile
    $priorEncoded=[regex]::Match($priorBody,"FromBase64String\\('([A-Za-z0-9+/=]+)'\\)").Groups[1].Value
    $priorConfig=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($priorEncoded))|ConvertFrom-Json -AsHashtable
    $legacyJson=[ordered]@{managedPolicy=$priorConfig.managedPolicy;deploymentId=$priorConfig.deploymentId;extensionId=$priorConfig.extensionId;browser=$priorConfig.browser}|ConvertTo-Json -Depth 25 -Compress
    $template=Get-Content -LiteralPath (Join-Path $testPackageRoot 'Enterprise-Endpoint.ps1') -Raw
    [IO.File]::WriteAllText($originalFile,(New-EndpointPayload $priorConfig $template Install -ConfigJson $legacyJson)+"\r\n# SIG # Begin signature block\r\n# U3ludGhldGlj\r\n# SIG # End signature block\r\n")
    $originalHash=Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($originalFile))
    $originalBody=Get-SetupLocalReviewedBody ([IO.File]::ReadAllText($originalFile)) -SignedFile
    $originalEncoded=[regex]::Match($originalBody,"FromBase64String\\('([A-Za-z0-9+/=]+)'\\)").Groups[1].Value
    ${beforeResume}
    $migrationFailed=$false;$migrationError=''
    try{Invoke-EnterpriseSetup @{ResumeReceipt=$canonical;AzureSigningConfigPath=$azureConfigPath} ${quote(output)}|Out-Null}catch{$migrationFailed=$true;$migrationError=$_.Exception.Message}
    $migrated=Read-EnterpriseReceipt $canonical
    $extra=@{migrationFailed=$migrationFailed;migrationError=$migrationError;signCalls=$global:azureCalls.Count;
      originalUnchanged=($originalHash -ceq (Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($originalFile))));
      planUnchanged=($originalPlan -ceq (Get-SetupFingerprint $migrated.plan));
      resourcesUnchanged=($originalResources -ceq (Get-SetupSignerResourceFingerprint $migrated));originalEncoded=$originalEncoded}
    $extra.legacyOrderDiffers=$legacyJson -cne (ConvertTo-SetupPayloadJson $priorConfig)
    ${after}
  `,'',before);
  const file=path.join(directory,'migration.ps1');fs.writeFileSync(file,"$ErrorActionPreference='Stop'\n"+body);
  const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',file],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  const line=result.stdout.split(/\r?\n/).findLast(value=>value.startsWith('RESULT:'));
  assert.ok(line,result.stdout);return {result:JSON.parse(line.slice(7)),directory};
}

test('explicit Azure amendment reuses existing M365 identities, preserves legacy bytes and correlates all revision payloads',async()=>{
  const {result,directory}=await runMigration({after:`
    $beforeSigns=$global:azureCalls.Count
    Invoke-EnterpriseSetup @{ResumeReceipt=$canonical} $testPackageRoot|Out-Null
    $extra.repeatSignCalls=$global:azureCalls.Count-$beforeSigns
  `});
  assert.equal(result.extra.migrationFailed,false,result.extra.migrationError);
  assert.equal(result.extra.signCalls,4);assert.equal(result.extra.repeatSignCalls,0);
  assert.equal(result.extra.originalUnchanged,true);assert.equal(result.extra.planUnchanged,true);assert.equal(result.extra.resourcesUnchanged,true);
  assert.equal(result.extra.legacyOrderDiffers,true,'Regression must exercise legacy JSON order differing from canonical JSON');
  const receipt=result.receipt;assert.equal(receipt.signerAmendment.approval,'SWITCH SIGNER');assert.equal(receipt.signerAmendment.requestedSignatures,4);assert.equal(receipt.scripts.length,2);
  assert.ok(Number.isSafeInteger(receipt.signerAmendment.approvedAtUnixMs));
  const rootReceipt=path.join(directory,'receipt');
  const backup=fs.readFileSync(path.join(rootReceipt,receipt.signerAmendment.beforeReceiptFile));
  assert.equal(createHash('sha256').update(backup).digest('hex').toUpperCase(),receipt.signerAmendment.beforeReceiptHash);
  for(const script of receipt.scripts){
    assert.ok(script.id);assert.equal(script.assigned,true);
    if(script.browser==='edge')assert.equal(script.configurationHash,createHash('sha256').update(Buffer.from(result.extra.originalEncoded,'base64')).digest('hex'));
    for(const [action,key,hash] of [['Install','installFile','installHash'],['Remove','removeFile','removeHash']]){
      assert.equal(script[key],`${receipt.signerAmendment.revisionDirectory}/${script.browser}-${action}.ps1`);
      const bytes=fs.readFileSync(path.join(rootReceipt,script[key]));
      assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(),script[hash]);
      if(script.browser==='edge')assert.ok(bytes.toString('utf8').includes(result.extra.originalEncoded));
    }
  }
  const posts=result.calls.filter(call=>call.method==='POST');
  for(const suffix of ['/applications','/servicePrincipals','/oauth2PermissionGrants'])assert.equal(posts.filter(call=>call.path.endsWith(suffix)).length,1);
  assert.equal(posts.filter(call=>call.path.endsWith('/deviceManagementScripts')).length,2);
  for(const upload of posts.filter(call=>call.path.endsWith('/deviceManagementScripts'))){
    assert.equal(upload.body.enforceSignatureCheck,true);
    const hash=createHash('sha256').update(Buffer.from(upload.body.scriptContent,'base64')).digest('hex').toUpperCase();
    assert.ok(receipt.scripts.some(script=>script.installHash===hash));
  }
});

test('declined signer switch leaves the original deployment and local partial without Azure calls',async()=>{
  const {result}=await runMigration({approve:false});
  assert.equal(result.extra.migrationFailed,true);assert.match(result.extra.migrationError,/not approved/);
  assert.equal(result.extra.signCalls,0);assert.equal(result.extra.originalUnchanged,true);assert.equal(result.extra.planUnchanged,true);
  assert.equal(result.receipt.signerAmendment,undefined);assert.equal(result.calls.filter(call=>call.method==='POST').length,3);
});

test('uploaded scripts and ambiguous Azure operations block signer amendment before any request',async()=>{
  for(const change of ["$saved.scripts=@(@{browser='edge';id='77777777-7777-4777-8777-777777777777';assigned=$false})","$saved.scripts=@(@{browser='edge';id=$null;assigned=$true})","$saved.operations['AzureSign-edge-Install.ps1']=@{state='Ambiguous'}"]){
    const {result}=await runMigration({beforeResume:`${change};Save-SetupReceipt $saved (Split-Path $canonical)`});
    assert.equal(result.extra.migrationFailed,true);assert.equal(result.extra.signCalls,0);assert.equal(result.extra.originalUnchanged,true);
    assert.equal(result.receipt.signerAmendment,undefined);assert.equal(result.calls.filter(call=>call.method==='POST').length,3);
  }
});

test('revision resolver rejects changed originals, history, path traversal and provider substitution before new signing',async()=>{
  const {result}=await runMigration({after:`
    $checks=@();$receiptDirectory=Split-Path $canonical
    $bytes=[IO.File]::ReadAllBytes($originalFile);[IO.File]::AppendAllText($originalFile,'tampered')
    try{Assert-SetupSignerAmendment $migrated $receiptDirectory;$checks+=$false}catch{$checks+=$true}
    [IO.File]::WriteAllBytes($originalFile,$bytes)
    $backup=Join-Path $receiptDirectory $migrated.signerAmendment.beforeReceiptFile
    $bytes=[IO.File]::ReadAllBytes($backup);[IO.File]::AppendAllText($backup,'tampered')
    try{Assert-SetupSignerAmendment $migrated $receiptDirectory;$checks+=$false}catch{$checks+=$true}
    [IO.File]::WriteAllBytes($backup,$bytes)
    $script=$migrated.scripts[0];$expected=$script.installFile;$script.installFile='../outside.ps1'
    try{Resolve-SetupScriptPath $migrated $receiptDirectory $script Install|Out-Null;$checks+=$false}catch{$checks+=$true}
    $script.installFile=$expected
    $provider=Read-SetupAzureSigningConfig $azureConfigPath;$provider.identity.configurationFingerprint='changed'
    $revision=Get-SetupSigningPayloadDirectory $migrated $receiptDirectory
    $expectedBody=Get-SetupLocalReviewedBody ([IO.File]::ReadAllText((Resolve-SetupScriptPath $migrated $receiptDirectory $script Install))) -SignedFile
    try{Invoke-SetupAzureSign (Resolve-SetupScriptPath $migrated $receiptDirectory $script Install) $provider (Get-MgContext) $migrated $revision -ReceiptDirectory $receiptDirectory -OperationPrefix ($migrated.signerAmendment.revisionDirectory+'-') -ExpectedContent $expectedBody;$checks+=$false}catch{$checks+=$true}
    $extra.guards=$checks;$extra.signsAfterGuards=$global:azureCalls.Count
  `});
  assert.equal(result.extra.migrationFailed,false,result.extra.migrationError);
  assert.deepEqual(result.extra.guards,[true,true,true,true]);assert.equal(result.extra.signsAfterGuards,4);
});

test('ambiguous Azure revision signing is never repeated and canonical receipt remains outside revision folder',async()=>{
  const {result,directory}=await runMigration({beforeResume:`function Invoke-SetupSignTool {param($Path,$Arguments,$DiagnosticPath);$global:azureCalls.Add(@{synthetic='ambiguous'});throw 'Synthetic ambiguous paid request'}`,after:`
    $beforeSigns=$global:azureCalls.Count;$retryFailed=$false
    try{Invoke-EnterpriseSetup @{ResumeReceipt=$canonical} $testPackageRoot|Out-Null}catch{$retryFailed=$true}
    $extra.retryFailed=$retryFailed;$extra.repeatSignCalls=$global:azureCalls.Count-$beforeSigns
  `});
  assert.equal(result.extra.migrationFailed,true);assert.equal(result.extra.retryFailed,true);assert.equal(result.extra.signCalls,1);assert.equal(result.extra.repeatSignCalls,0);
  assert.equal(result.extra.originalUnchanged,true);
  const revision=path.join(directory,'receipt',result.receipt.signerAmendment.revisionDirectory);
  assert.equal(fs.existsSync(path.join(revision,'receipt.json')),false);
  assert.ok(Object.entries(result.receipt.operations).some(([key,value])=>key.startsWith('AzureSign-signing-revision-')&&value.state==='Ambiguous'));
});

test('migration source never installs trust or creates tenant resources',()=>{
  const source=fs.readFileSync(path.join(root,'deployment/intune/Enterprise-SignerMigration.ps1'),'utf8');
  assert.doesNotMatch(source,/Import-Certificate|X509Store|Set-AuthenticodeSignature|Invoke-SetupGraph\s+POST|Invoke-MgGraphRequest/);
  assert.match(source,/CreateNew/);assert.match(source,/SWITCH SIGNER/);
});

function azureBoundary(mode) {
  assert.ok(process.env.AGENT_WORKING_DIR);
  const directory=fs.mkdtempSync(path.join(process.env.AGENT_WORKING_DIR,'azure-boundary-'));
  const file=path.join(directory,'boundary.ps1');
  fs.writeFileSync(file,`$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
    . ${quote(path.join(root,'deployment/intune/Enterprise-Setup.ps1'))}
    $directory=${quote(directory)};$file=Join-Path $directory 'edge-Install.ps1';$expected="Write-Output 'reviewed'"
    [IO.File]::WriteAllText($file,$expected)
    $receipt=@{plan=@{deploymentId='11111111-1111-4111-8111-111111111111'};operations=@{};pendingOperation=$null}
    $provider=@{identity=@{configurationFingerprint=('A'*64);toolHashes=@{tool='pinned'}};config=@{Endpoint='https://cus.codesigning.azure.net';CodeSigningAccountName='synthetic';CertificateProfileName='synthetic';ExpectedEnhancedKeyUsages=@();SignToolPath='fake.exe';DlibPath='fake.dll'}}
    $global:nativeCalls=0;$global:mutated=$false
    function Assert-SetupAzureSigningIdentity {param($Provider,$GraphContext)}
    function Assert-SetupMicrosoftSigningTools {param($Config) @{tool='pinned'}}
    function Get-AuthenticodeSignature {param($LiteralPath)
      if('${mode}' -ceq 'verification' -and $global:nativeCalls -gt 0 -and -not $global:mutated){
        $global:mutated=$true;[IO.File]::WriteAllText($LiteralPath,$expected)
      }
      @{Status='Valid';SignerCertificate=@{EnhancedKeyUsageList=@('1.3.6.1.5.5.7.3.3')};TimeStamperCertificate=@{Thumbprint=('B'*40)}}}
    function Save-SetupReceipt {param($Receipt,$Directory)
      [IO.File]::WriteAllText((Join-Path $Directory 'receipt.json'),($Receipt|ConvertTo-Json -Depth 40))
      if('${mode}' -ceq 'journal' -and $Receipt.pendingOperation -like 'AzureSign-*' -and -not $global:mutated){$global:mutated=$true;[IO.File]::WriteAllText($file,"Write-Output 'changed after durable journal'")}
    }
    function Invoke-SetupSignTool {param($Path,$Arguments,$DiagnosticPath)
      $global:nativeCalls++
      if('${mode}' -ceq 'signer'){[IO.File]::WriteAllText($file,"Write-Output 'changed by native signer'")}
      else{[IO.File]::AppendAllText($file,"\r\n# SIG # Begin signature block\r\n# U3ludGhldGlj\r\n# SIG # End signature block\r\n")}
    }
    if('${mode}' -ceq 'entry'){[IO.File]::WriteAllText($file,"Write-Output 'wrong initial scaffold'")}
    $rejected=$false
    try{Invoke-SetupAzureSign $file $provider @{} $receipt $directory -ExpectedContent $expected}catch{$rejected=$true}
    if('${mode}' -ceq 'legacy'){
      if($rejected){throw 'Legacy setup did not sign the initial reviewed body'}
      $receipt.operations['AzureSign-edge-Install.ps1'].Remove('expectedContentHash')
      [IO.File]::WriteAllText($file,"Write-Output 'different legacy scaffold'")
      $receipt.operations['AzureSign-edge-Install.ps1'].signedHash=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
      try{Invoke-SetupAzureSign $file $provider @{} $receipt $directory -ExpectedContent $expected}catch{$rejected=$true}
    }
    $retryRejected=$false
    if('${mode}' -cin @('journal','signer','verification')){try{Invoke-SetupAzureSign $file $provider @{} $receipt $directory -ExpectedContent $expected}catch{$retryRejected=$true}}
    $state=if($receipt.operations.ContainsKey('AzureSign-edge-Install.ps1')){$receipt.operations['AzureSign-edge-Install.ps1'].state}else{'Absent'}
    Write-Output ('RESULT:'+(@{rejected=$rejected;retryRejected=$retryRejected;nativeCalls=$global:nativeCalls;state=$state}|ConvertTo-Json -Compress))
  `);
  const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',file],{encoding:'utf8',windowsHide:true});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  const line=result.stdout.split(/\r?\n/).find(value=>value.startsWith('RESULT:'));assert.ok(line,result.stdout);return JSON.parse(line.slice(7));
}

test('wrong entry body cannot become signing authority merely by being hashed into a new journal',()=>{
  assert.deepEqual(azureBoundary('entry'),{rejected:true,retryRejected:false,nativeCalls:0,state:'Absent'});
});

test('post-journal unsigned drift stops before the paid native boundary and cannot retry',()=>{
  assert.deepEqual(azureBoundary('journal'),{rejected:true,retryRejected:true,nativeCalls:0,state:'Ambiguous'});
});

test('trusted Authenticode is insufficient when the signer changed the reviewed body',()=>{
  assert.deepEqual(azureBoundary('signer'),{rejected:true,retryRejected:true,nativeCalls:1,state:'Ambiguous'});
});

test('same reviewed body with signature removed during Authenticode readback cannot become Confirmed',()=>{
  assert.deepEqual(azureBoundary('verification'),{rejected:true,retryRejected:true,nativeCalls:1,state:'Ambiguous'});
});

test('legacy confirmed Azure journal without body fingerprint still requires current Core reviewed scaffold',()=>{
  const result=azureBoundary('legacy');assert.equal(result.rejected,true);assert.equal(result.nativeCalls,1);
});
