const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const quote=value=>`'${value.replaceAll("'","''")}'`;
const original='{"managedPolicy":{"enabled":true},"deploymentId":"11111111-1111-4111-8111-111111111111","extensionId":"synthetic","browser":"edge"}';
const common=`. ${quote(path.join(root,'deployment/intune/Enterprise-Setup.ps1'))}
$config=@{browser='edge';extensionId='synthetic';deploymentId='11111111-1111-4111-8111-111111111111';managedPolicy=@{enabled=$true}}
$template='param($ConfigJson,$Action) # synthetic endpoint template'
$receipt=[ordered]@{plan=@{signingCertificateThumbprint=('A'*40)};operations=@{};pendingOperation=$null}
`;
function run(directory,code){
 const script=path.join(directory,`probe-${Math.random().toString(16).slice(2)}.ps1`);
 fs.writeFileSync(script,`$ErrorActionPreference='Stop'\n${common}\n$directory=${quote(directory)}\n${code}`);
 const result=spawnSync('pwsh.exe',['-NoProfile','-NonInteractive','-File',script],{encoding:'utf8',windowsHide:true,timeout:45000});
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
 return JSON.parse(result.stdout.split(/\r?\n/).findLast(line=>line.startsWith('RESULT:')).slice(7));
}
function fixture(fn){
 assert.ok(process.env.AGENT_WORKING_DIR,'Managed working run required');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'payload-recovery-'));
 try{return fn(directory);}finally{
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));
  fs.rmSync(directory,{recursive:true,force:true});
 }
}
function create(directory,json=original,action='Install'){
 return run(directory,`$json=${quote(json)}
 $body=New-EndpointPayload $config $template '${action}' -ConfigJson $json
 $body+="# SIG # Begin signature block\n# QUJD\n# SIG # End signature block\n"
 [IO.File]::WriteAllText((Join-Path $directory 'edge-${action}.ps1'),$body,[Text.UTF8Encoding]::new($false))
 Write-Output ('RESULT:'+(@{created=$true}|ConvertTo-Json -Compress))`);
}
test('a new process recovers original config bytes and marker hash before reconciling a legacy signed partial',()=>fixture(directory=>{
 create(directory);
 const script=path.join(directory,'edge-Install.ps1');const before=fs.readFileSync(script);
 const result=run(directory,`
  $selected=Get-SetupPayloadConfiguration $config $template $directory 'edge' $receipt
  Save-SetupPayloadConfiguration $receipt $directory 'edge' $selected
  $cert=@{Thumbprint=('A'*40);RawData=[byte[]]@(1,2,3)}
  function Assert-SetupLocalSigningCertificate {param($Certificate) } # Synthetic trust; real policy is covered separately.
  function Set-AuthenticodeSignature {throw 'Existing script must never be signed again'}
  function Get-AuthenticodeSignature {param($LiteralPath,$ErrorAction) @{Status='Valid';SignerCertificate=$cert}}
  $expected=New-EndpointPayload $config $template 'Install' -ConfigJson $selected.json
  Invoke-SetupLocalSign -Path (Join-Path $directory 'edge-Install.ps1') -Certificate $cert -Receipt $receipt -Directory $directory -ExpectedContent $expected
  Write-Output ('RESULT:'+(@{json=$selected.json;sha256=$selected.sha256;canonical=ConvertTo-SetupPayloadJson $config;state=$receipt.operations['LocalSign-edge-Install.ps1'].state;durable=(Get-Content -LiteralPath (Join-Path $directory 'receipt.json') -Raw|ConvertFrom-Json -AsHashtable).payloadConfigurations.edge.json}|ConvertTo-Json -Compress))`);
 assert.equal(result.json,original);assert.equal(result.durable,original);
 assert.notEqual(result.canonical,original);
 assert.equal(result.sha256,createHash('sha256').update(original).digest('hex').toUpperCase());
 assert.equal(result.state,'Reconciled');assert.deepEqual(fs.readFileSync(script),before);
}));
test('configuration semantics and full scaffold must match before any receipt mutation',()=>fixture(directory=>{
 create(directory);
 const result=run(directory,`
  $config.managedPolicy.enabled=$false
  $semanticRejected=$false
  try {Get-SetupPayloadConfiguration $config $template $directory 'edge' $receipt|Out-Null}catch{$semanticRejected=$true}
  $config.managedPolicy.enabled=$true
  $template+=' # unexpected change'
  $templateRejected=$false
  try {Get-SetupPayloadConfiguration $config $template $directory 'edge' $receipt|Out-Null}catch{$templateRejected=$true}
  Write-Output ('RESULT:'+(@{semanticRejected=$semanticRejected;templateRejected=$templateRejected;receiptExists=(Test-Path -LiteralPath (Join-Path $directory 'receipt.json'))}|ConvertTo-Json -Compress))`);
 assert.deepEqual(result,{semanticRejected:true,templateRejected:true,receiptExists:false});
}));
test('matching semantic values with conflicting saved byte orders stop before signing or receipt changes',()=>fixture(directory=>{
 create(directory);
 create(directory,JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(original)).reverse())),'Remove');
 const result=run(directory,`
  $rejected=$false
  try {Get-SetupPayloadConfiguration $config $template $directory 'edge' $receipt|Out-Null}catch{$rejected=$_.Exception.Message -like '*configuration bytes disagree*'}
  Write-Output ('RESULT:'+(@{rejected=$rejected;receiptExists=(Test-Path -LiteralPath (Join-Path $directory 'receipt.json'))}|ConvertTo-Json -Compress))`);
 assert.equal(result.rejected,true);assert.equal(result.receiptExists,false);
}));
test('new configurations are deterministic and durable readback rejects a changed receipt',()=>fixture(directory=>{
 const result=run(directory,`
  $first=Get-SetupPayloadConfiguration $config $template $directory 'edge' $receipt
  $reordered=[ordered]@{managedPolicy=[ordered]@{enabled=$true};extensionId='synthetic';deploymentId=$config.deploymentId;browser='edge'}
  $second=Get-SetupPayloadConfiguration $reordered $template $directory 'edge' $receipt
  function Save-SetupReceipt {param($Receipt,$Directory) [IO.File]::WriteAllText((Join-Path $Directory 'receipt.json'),'{}')}
  $rejected=$false
  try {Save-SetupPayloadConfiguration $receipt $directory 'edge' $first}catch{$rejected=$true}
  Write-Output ('RESULT:'+(@{equal=($first.json -ceq $second.json);hashEqual=($first.sha256 -ceq $second.sha256);rejected=$rejected}|ConvertTo-Json -Compress))`);
 assert.deepEqual(result,{equal:true,hashEqual:true,rejected:true});
}));
