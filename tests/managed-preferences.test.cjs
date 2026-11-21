const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const schema=JSON.parse(fs.readFileSync(path.join(root,'teams-captions-saver/managed-schema.json')));
function api(storage={},runtime={}){const context=vm.createContext({chrome:{storage,runtime},URL});vm.runInContext(fs.readFileSync(path.join(root,'teams-captions-saver/configuration.js'),'utf8'),context);return context.CaptionKeepConfiguration;}
const preferences={defaultSaveFormat:'md',saveAsType:'custom',saveLocation:'BCK/Transcripts',timestampFormat:'24hr',filenamePattern:'{date}_{title}',uiTheme:'slate',webmailDestination:'outlook_work'};

test('managed preference schema, runtime overlay and build validation agree without adding capture or AI force controls',async()=>{
 const configuration=api();const {validateManagedPolicy}=await import('../scripts/build-intune-bundle.mjs');
 assert.equal(Object.keys(schema.properties).length,27);
 assert.deepEqual([...configuration.POLICY_KEYS].sort(),Object.keys(schema.properties).sort());
 const policy=configuration.applyPolicy({uiTheme:'light',trackCaptions:false,autoAISummary:false},preferences);
 for(const [key,value] of Object.entries(preferences)){assert.equal(policy.settings[key],value);assert.ok(policy.locked.includes(key));}
 assert.equal(policy.settings.trackCaptions,false);assert.equal(policy.settings.autoAISummary,false);
 assert.deepEqual(validateManagedPolicy(preferences,schema),preferences);
 assert.equal(configuration.applyPolicy({uiTheme:'light'},{}).settings.uiTheme,'light');
 assert.equal(configuration.applyPolicy({uiTheme:'light'},{uiTheme:'invalid'}).settings.uiTheme,'light');
 assert.ok(!configuration.applyPolicy({}, {saveAsType:'custom'}).locked.includes('saveAsType'));
});

test('invalid managed enums, paths, URLs and arrays are refused before packaging and ignored by runtime',async()=>{
 const configuration=api();const {validateManagedPolicy}=await import('../scripts/build-intune-bundle.mjs');
 for(const bad of [{uiTheme:'arbitrary'},{saveAsType:'custom'},{saveLocation:'../escape'},{saveLocation:'C:/escape'},
   {saveLocation:'folder//child'},{saveLocation:'CON.txt'},{filenamePattern:'../bad'},
   {chatgptWorkspaceUrl:'https://attacker.invalid/'},{chatgptWorkspaceUrl:'https://chatgpt.com/?token=x'},
   {allowedAiProviders:['unknown']},{customScrubTerms:['x']},
   {filenamePattern:'__BCK_EMPLOYEE_CHOICE__'},{saveLocation:'__BCK_EMPLOYEE_CHOICE__'}]){
   assert.throws(()=>validateManagedPolicy(bad,schema));
   const result=configuration.applyPolicy({},bad);assert.equal(result.locked.length,0,JSON.stringify(bad));
 }
});

test('a missing managed API is unmanaged but an actual policy read failure rejects protected operations',async()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(await api().readManaged())),{});
 await assert.rejects(api({managed:{get:async()=>{throw Error('Unavailable');}}}).readManaged(),/Organization settings could not be read/);
});

test('only the verified unconfigured Firefox provider error is unmanaged, never loss of known policy',async()=>{
 const unavailable={managed:{get:async()=>{throw Error('Managed storage manifest not found');}}};
 const firefox={getBrowserInfo:async()=>({name:'Firefox'})};
 assert.deepEqual(JSON.parse(JSON.stringify(await api(unavailable,firefox).readManaged())),{});
 await assert.rejects(api(unavailable,{getBrowserInfo:async()=>({name:'Chrome'})}).readManaged());
 await assert.rejects(api({managed:{get:async()=>{throw Error('Network error');}}},firefox).readManaged());
 let known=true;const configuration=api({managed:{get:async()=>{if(known)return {disableFileExport:true};throw Error('Managed storage manifest not found');}}},firefox);
 assert.equal((await configuration.readManaged()).disableFileExport,true);known=false;
 await assert.rejects(configuration.readManaged());
});

test('setup rejects invalid policy and oversized final tenant configuration before cloud work',()=>{
 assert.ok(process.env.AGENT_WORKING_DIR,'Managed run required');
 const file=path.join(process.env.AGENT_WORKING_DIR,'managed-policy-probe.ps1');
 fs.writeFileSync(file,`$ErrorActionPreference='Stop'
 . '${path.join(root,'deployment/intune/Enterprise-Setup.ps1').replaceAll("'","''")}'
 $schema=Get-Content '${path.join(root,'teams-captions-saver/managed-schema.json').replaceAll("'","''")}' -Raw|ConvertFrom-Json -AsHashtable
 $valid=@{saveAsType='custom';saveLocation='BCK/Transcripts';uiTheme='slate'}
 Assert-ManagedSetupPolicy $valid $schema;Assert-ManagedSetupEnvelope $valid edge $true
 $rejected=0
 foreach($invalid in @(@{uiTheme='invalid'},@{saveAsType='custom'},@{saveLocation='../parent'},@{chatgptWorkspaceUrl='https://chatgpt.com/?token=x'},@{filenamePattern='__BCK_EMPLOYEE_CHOICE__'},@{saveLocation='__BCK_EMPLOYEE_CHOICE__'})){
   try{Assert-ManagedSetupPolicy $invalid $schema}catch{$rejected++}
 }
 $large=@{customScrubTerms=@(1..100|ForEach-Object {'A'*80})}
 Assert-ManagedSetupPolicy $large $schema
 try{Assert-ManagedSetupEnvelope $large edge $true}catch{$rejected++}
 if($rejected -ne 7){throw 'Setup validator did not reject all invalid settings.'}
 'Validated'
 `);
 const result=spawnSync('pwsh',['-NoProfile','-File',file],{encoding:'utf8',windowsHide:true,timeout:30000});
 assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/Validated/);
});

test('read-only status accepts an older endpoint package while continuation still refuses a changed package',()=>{
 const directory=fs.mkdtempSync(path.join(process.env.AGENT_WORKING_DIR,'old-policy-status-'));
 for(const name of ['managed-schema.json'])fs.copyFileSync(path.join(root,'teams-captions-saver',name),path.join(directory,name));
 fs.copyFileSync(path.join(root,'deployment/intune/profile.json'),path.join(directory,'profile.json'));
 fs.writeFileSync(path.join(directory,'EndpointWorker.exe'),'synthetic never executed');
 const file=path.join(directory,'probe.ps1');const quoted=value=>"'"+value.replaceAll("'","''")+"'";
 fs.writeFileSync(file,`$ErrorActionPreference='Stop'
 . ${quoted(path.join(root,'deployment/intune/Enterprise-Setup.ps1'))}
 $global:saved=@{appId=$null;plan=@{deploymentTransport='Win32';deploymentId='11111111-2222-4333-8444-555555555555';tenantId='11111111-2222-4333-8444-555555555555';groupId='11111111-2222-4333-8444-555555555555';browsers=@('edge');microsoft365=$false;enableGlobalSpeakerAttribution=$false;signedEndpointScripts=$false;signingCertificateThumbprint='';endpointPackageHash='old-package';endpointTemplateHash='old-worker';baseManagedPolicies=@{edge=@{forcePrivacyScrubber=$true}}}}
 function Read-EnterpriseReceipt {$global:saved}
 function Require-SetupModules {}
 function Assert-SetupSignInOwner {}
 function Connect-MgGraph {}
 function Disconnect-MgGraph {}
 function Get-MgContext {@{TenantId='11111111-2222-4333-8444-555555555555';Environment='Global';AuthType='Delegated';Account='synthetic@example.invalid'}}
 function Get-EnterpriseDeliveryStatus {@{state='ReadOnlySynthetic'}}
 function Save-SetupReceipt {}
 function Show-EnterpriseDeliveryStatus {}
 function Read-SetupWin32Package {throw 'Status incorrectly read the changed package.'}
 $result=Invoke-EnterpriseSetupCore @{StatusReceipt=${quoted(path.join(directory,'receipt.json'))}} ${quoted(directory)}
 if($result.delivery.state -cne 'ReadOnlySynthetic'){throw 'Status did not finish.'}
 function Read-SetupWin32Package {@{bundleSha256='new-package'}}
 $refused=$false
 try{Invoke-EnterpriseSetupCore @{ResumeReceipt=${quoted(path.join(directory,'receipt.json'))}} ${quoted(directory)}}catch{$refused=$_.Exception.Message -like '*endpoint package differs*'}
 if(-not $refused){throw 'Continuation adopted a changed endpoint package.'}
 'StatusCompatibleContinueRefused'
 `);
 const result=spawnSync('pwsh',['-NoProfile','-File',file],{encoding:'utf8',windowsHide:true,timeout:30000});
 assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stdout,/StatusCompatibleContinueRefused/);
});
