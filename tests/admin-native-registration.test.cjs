const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const script=path.resolve(__dirname,'../admin-setup/packaging/Register-NativeHost.ps1');
const quote=value=>`'${value.replaceAll("'","''")}'`;
const origins=['chrome-extension://pjpibiimicedkckleehljlklmblkacph/',
  'chrome-extension://ecpjboeanaehianibdbgijldbikdgkhm/',
  'chrome-extension://edefcbdhahfolgkoamkbknjppojpaffk/',
  'chrome-extension://nabjdlnkkaonnbnimnmnhjcbigceebml/'];
const windowsOnly={skip:process.platform!=='win32'?'Native registration requires Windows PowerShell; the portable origin contract still runs.':false};

function fixture(callback) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bck-native-registration-'));
  try {
    const packageRoot=path.join(directory,'package');fs.mkdirSync(packageRoot);
    const names=['BetterCaptionKeep.AdminSetup.exe','BetterCaptionKeep.AdminSetup.NativeHost.exe',
      'BetterCaptionKeep.AdminSetup.NativeHost.dll','BetterCaptionKeep.AdminSetup.NativeHost.runtimeconfig.json'];
    const files=names.map(name=>{
      const bytes=Buffer.from(`synthetic fixture never executed: ${name}`);
      fs.writeFileSync(path.join(packageRoot,name),bytes);
      return {path:name,sha256:createHash('sha256').update(bytes).digest('hex')};
    });
    fs.writeFileSync(path.join(packageRoot,'package-manifest.json'),JSON.stringify({schemaVersion:1,files}));
    callback(packageRoot,directory);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

function powershell(directory,source) {
  const testScript=path.join(directory,'registration-test.ps1');
  fs.writeFileSync(testScript,`$ErrorActionPreference='Stop'\n. ${quote(script)}\n${source}`);
  const executable=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result=spawnSync(executable,['-NoProfile','-NonInteractive','-File',testScript],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  const line=result.stdout.split(/\r?\n/).findLast(line=>line.startsWith('RESULT:'));
  assert.ok(line,result.stdout);
  return JSON.parse(line.slice(7));
}

test('native manifest approves only Development, Edge and Chrome identities including Brave Chrome-store installs',async()=>{
  const {createNativeHostManifest}=await import('../scripts/build-admin-setup.mjs');
  const manifest=createNativeHostManifest('P:\\fixture\\BetterCaptionKeep.AdminSetup.NativeHost.exe');
  assert.deepEqual(manifest.allowed_origins,origins);
  assert.equal(manifest.type,'stdio');assert.equal(manifest.name,'com.daftech.bettercaptionkeep.adminsetup');
  assert.ok(manifest.allowed_origins.every(origin=>!origin.includes('*')));
});

test('registration preview validates package without creating files or touching registry',windowsOnly,()=>fixture((packageRoot,directory)=>{
  const recovery=path.join(directory,'recovery');
  const result=powershell(directory,`
    function Get-NativeHostRegistryValue { throw 'Preview must not inspect or mutate registry.' }
    function Set-NativeHostRegistryValue { throw 'Preview must not mutate registry.' }
    $plan=Invoke-NativeHostRegistration -PackageDirectory ${quote(packageRoot)} -RecoveryDirectory ${quote(recovery)} -PlanOnly
    Write-Output ('RESULT:' + (@{plan=$plan;created=[IO.Directory]::Exists(${quote(recovery)})}|ConvertTo-Json -Depth 10 -Compress))
  `);
  assert.equal(result.created,false);assert.equal(result.plan.writes,false);
  assert.deepEqual(result.plan.manifest.allowed_origins,origins);
  assert.equal(result.plan.keys.length,3);
  assert.ok(result.plan.keys.some(key=>key.includes('BraveSoftware\\Brave-Browser')));
}));

function registryFixture(directory,failSecond=false) {
  return `
    $global:registry=@{};$global:sets=0;$global:beforeObserved=$false
    $first=@(Get-NativeHostRegistryKeys)[0]
    $global:registry[$first]=@{keyExists=$true;valueExists=$true;value='%LOCALAPPDATA%\\previous-native-manifest.json';kind='ExpandString'}
    function Get-NativeHostRegistryValue { param($Key)
      if($global:registry.ContainsKey($Key)) { return $global:registry[$Key].Clone() }
      return @{keyExists=$false;valueExists=$false;value=$null;kind=$null}
    }
    function Set-NativeHostRegistryValue { param($Key,$ManifestPath)
      $global:sets++
      $before=Join-Path ([IO.Path]::GetDirectoryName($ManifestPath)) 'registry-before.json'
      if(-not [IO.File]::Exists($before)) { throw 'Before-image must exist before any registry write.' }
      $saved=Get-Content -LiteralPath $before -Raw|ConvertFrom-Json
      if(@($saved.registrations).Count -ne 3) { throw 'Before-image must capture all browser keys before any write.' }
      $global:beforeObserved=$true
      ${failSecond?"if($global:sets -eq 2) { throw 'Synthetic registry write denied.' }":''}
      $global:registry[$Key]=@{keyExists=$true;valueExists=$true;value=$ManifestPath;kind='String'}
    }
  `;
}

test('registration preserves typed prior values before writes and verifies all three browser registrations',windowsOnly,()=>fixture((packageRoot,directory)=>{
  const result=powershell(directory,`${registryFixture(directory)}
    $result=Invoke-NativeHostRegistration -PackageDirectory ${quote(packageRoot)} -RecoveryDirectory ${quote(path.join(directory,'recovery'))}
    $before=Get-Content -LiteralPath (Join-Path ([IO.Path]::GetDirectoryName($result.manifestPath)) 'registry-before.json') -Raw|ConvertFrom-Json
    $manifest=Get-Content -LiteralPath $result.manifestPath -Raw|ConvertFrom-Json
    Write-Output ('RESULT:' + (@{result=$result;before=$before;manifest=$manifest;sets=$global:sets;beforeObserved=$global:beforeObserved}|ConvertTo-Json -Depth 15 -Compress))
  `);
  assert.equal(result.result.state,'Registered');assert.equal(result.sets,3);assert.equal(result.beforeObserved,true);
  assert.deepEqual(result.manifest.allowed_origins,origins);
  assert.equal(result.manifest.path,path.join(packageRoot,'BetterCaptionKeep.AdminSetup.NativeHost.exe'));
  const previous=result.before.registrations.find(entry=>entry.before.valueExists);
  assert.equal(previous.before.kind,'ExpandString');assert.equal(previous.before.value,'%LOCALAPPDATA%\\previous-native-manifest.json');
  assert.ok(result.before.registrations.filter(entry=>!entry.before.keyExists).length===2);
}));

test('partial registry failure retains original before-images and the ambiguous pending key',windowsOnly,()=>fixture((packageRoot,directory)=>{
  const recovery=path.join(directory,'recovery');
  const result=powershell(directory,`${registryFixture(directory,true)}
    $blocked=$false
    try { Invoke-NativeHostRegistration -PackageDirectory ${quote(packageRoot)} -RecoveryDirectory ${quote(recovery)}|Out-Null } catch { $blocked=$true }
    $receipt=Get-ChildItem -LiteralPath ${quote(recovery)} -Filter registration-receipt.json -Recurse|Select-Object -First 1
    $saved=Get-Content -LiteralPath $receipt.FullName -Raw|ConvertFrom-Json
    $before=Get-Content -LiteralPath $saved.beforePath -Raw|ConvertFrom-Json
    Write-Output ('RESULT:' + (@{blocked=$blocked;receipt=$saved;beforeCount=@($before.registrations).Count;sets=$global:sets}|ConvertTo-Json -Depth 12 -Compress))
  `);
  assert.equal(result.blocked,true);assert.equal(result.receipt.state,'NeedsReview');assert.equal(result.beforeCount,3);
  assert.equal(result.receipt.registered.length,1);assert.ok(result.receipt.pendingKey.includes('Microsoft\\Edge'));
}));

test('missing or tampered native host is rejected before registration or recovery writes',windowsOnly,()=>fixture((packageRoot,directory)=>{
  fs.appendFileSync(path.join(packageRoot,'BetterCaptionKeep.AdminSetup.NativeHost.exe'),'tampered');
  const recovery=path.join(directory,'recovery');
  const result=powershell(directory,`
    function Set-NativeHostRegistryValue { throw 'Must never reach registry.' }
    $blocked=$false
    try { Invoke-NativeHostRegistration -PackageDirectory ${quote(packageRoot)} -RecoveryDirectory ${quote(recovery)}|Out-Null } catch { $blocked=$true }
    Write-Output ('RESULT:' + (@{blocked=$blocked;created=[IO.Directory]::Exists(${quote(recovery)})}|ConvertTo-Json -Compress))
  `);
  assert.deepEqual(result,{blocked:true,created:false});
}));
