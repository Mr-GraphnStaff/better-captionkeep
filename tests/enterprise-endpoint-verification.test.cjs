const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const quote = value => `'${value.replaceAll("'", "''")}'`;

function runPowerShell(source, executable='pwsh') {
  const result=spawnSync(executable,['-NoProfile','-NonInteractive','-Command',source],{encoding:'utf8',windowsHide:true});
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  const line=result.stdout.split(/\r?\n/).find(line=>line.startsWith('RESULT:'));
  assert.ok(line,result.stdout);
  return JSON.parse(line.slice(7));
}

test('Windows PowerShell 5.1 reads a genuinely absent HKCU value without treating it as an ACL failure', {skip:process.platform!=='win32'}, () => {
  const endpoint=path.resolve(__dirname,'../deployment/intune/Enterprise-Endpoint.ps1');
  const result=runPowerShell(`
    $ErrorActionPreference='Stop';Set-StrictMode -Version Latest
    $tokens=$null;$errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile(${quote(endpoint)},[ref]$tokens,[ref]$errors)
    if($errors.Count){throw 'Endpoint parser failed'}
    foreach($name in @('Read-EndpointOptionalRegistryValue','Test-EndpointManagementAuthority','Test-ExpectedEndpointPolicy')){
      $definition=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
      . ([scriptblock]::Create($definition.Extent.Text))
    }
    $browserRoot='HKCU:\\Software';$policyPath=$browserRoot
    $missing='CaptionKeep_Absent_7ef0a09551984917a93b7a844bb2f45e'
    $config=[pscustomobject]@{extensionId='synthetic';managedPolicy=[pscustomobject]@{}}
    if((Get-Item -LiteralPath $browserRoot -ErrorAction Stop).GetValueNames() -contains $missing){throw 'Read-only regression name unexpectedly exists'}
    $originalThrows=$false
    try{Get-ItemPropertyValue -LiteralPath $browserRoot -Name $missing -ErrorAction SilentlyContinue | Out-Null}catch [Management.Automation.PSArgumentException]{$originalThrows=$true}
    $absent=$null -eq (Read-EndpointOptionalRegistryValue $browserRoot $missing)
    # Exercise the same helper used by both authority and scalar policy checks.
    $config.managedPolicy | Add-Member NoteProperty $missing 'expected'
    $policyMissing=-not (Test-ExpectedEndpointPolicy)
    $missingKey=$null -eq (Read-EndpointOptionalRegistryValue ($browserRoot+'\\'+$missing) $missing)
    Write-Output ('RESULT:'+(@{major=$PSVersionTable.PSVersion.Major;minor=$PSVersionTable.PSVersion.Minor;originalThrows=$originalThrows;absent=$absent;policyMissing=$policyMissing;missingKey=$missingKey}|ConvertTo-Json -Compress))
  `,'powershell.exe');
  assert.deepEqual(result,{major:5,minor:1,originalThrows:true,absent:true,policyMissing:true,missingKey:true});
});

test('optional registry reads distinguish missing values from malformed management policy and denied reads', () => {
  const endpoint=path.resolve(__dirname,'../deployment/intune/Enterprise-Endpoint.ps1');
  const fixture=path.join(__dirname,'fixtures/enterprise-registry-harness.ps1');
  const result=runPowerShell(`
    $ErrorActionPreference='Stop'
    . ${quote(fixture)} -EndpointPath ${quote(endpoint)} -FunctionsOnly
    $browserRoot='HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge'
    $id='edefcbdhahfolgkoamkbknjppojpaffk'
    $policy=$browserRoot+'\\3rdparty\\extensions\\'+$id+'\\policy';$force=$browserRoot+'\\ExtensionInstallForcelist'
    $config=@{browser='edge';extensionId=$id;deploymentId='11111111-1111-4111-8111-111111111111';managedPolicy=@{forcePrivacyScrubber=$true}}|ConvertTo-Json -Depth 10 -Compress
    $global:registry[$browserRoot]=@{}
    $realistic=$false;try{Get-ItemPropertyValue $browserRoot ExtensionSettings -ErrorAction SilentlyContinue}catch [Management.Automation.PSArgumentException]{$realistic=$true}
    & ${quote(endpoint)} -ConfigJson $config -Action Install | Out-Null
    $global:registry[$policy].Remove('forcePrivacyScrubber')
    $policyResult=(@(& ${quote(endpoint)} -ConfigJson $config -Action Verify)[-1]).Substring('BCK_ENDPOINT_RESULT:'.Length)|ConvertFrom-Json
    $global:registry[$policy].forcePrivacyScrubber=@{kind='DWord';value=1}
    $global:registry[$force].Remove('1')
    $forceResult=(@(& ${quote(endpoint)} -ConfigJson $config -Action Verify)[-1]).Substring('BCK_ENDPOINT_RESULT:'.Length)|ConvertFrom-Json
    $global:registry[$force]['1']=@{kind='String';value=($id+';https://edge.microsoft.com/extensionwebstorebase/v1/crx')}
    $blocked=0
    foreach($entry in @(@{kind='String';value=''},@{kind='String';value='not-json'},@{kind='DWord';value=0},@{kind='String';value='[]'},@{kind='String';value='{"*":{}}'})){
      $global:registry[$browserRoot].ExtensionSettings=$entry
      $before=$global:registry|ConvertTo-Json -Depth 20 -Compress
      $rejected=$false;try{& ${quote(endpoint)} -ConfigJson $config -Action Install|Out-Null}catch{$blocked++;$rejected=$true}
      if(-not $rejected){throw ('Invalid authority accepted: '+($entry|ConvertTo-Json -Compress))}
      if(($global:registry|ConvertTo-Json -Depth 20 -Compress) -cne $before){throw 'Invalid authority changed policy'}
    }
    $global:registry[$browserRoot].ExtensionSettings=@{kind='String';value='{}'}
    & ${quote(endpoint)} -ConfigJson $config -Action Install|Out-Null
    $global:originalGetItem=(Get-Command Get-Item).ScriptBlock
    function Get-Item {param($LiteralPath) if($LiteralPath -eq $browserRoot){throw [UnauthorizedAccessException]::new('Synthetic denied registry read')};& $global:originalGetItem -LiteralPath $LiteralPath}
    $before=$global:registry|ConvertTo-Json -Depth 20 -Compress;$denied=$false
    try{& ${quote(endpoint)} -ConfigJson $config -Action Install|Out-Null}catch [UnauthorizedAccessException]{$denied=$true}
    if(($global:registry|ConvertTo-Json -Depth 20 -Compress) -cne $before){throw 'Denied read changed policy'}
    Write-Output ('RESULT:'+(@{realistic=$realistic;policyMissing=(-not $policyResult.policyVerified);forceMissing=(-not $forceResult.forceInstallVerified);blocked=$blocked;denied=$denied}|ConvertTo-Json -Compress))
  `);
  assert.deepEqual(result,{realistic:true,policyMissing:true,forceMissing:true,blocked:5,denied:true});
});

test('endpoint readback distinguishes applied policy, pending browser installation, and drift without registry writes', () => {
  const result = spawnSync('pwsh', ['-NoProfile','-NonInteractive','-File',
    path.join(__dirname,'fixtures/enterprise-registry-harness.ps1'),
    '-EndpointPath',path.resolve(__dirname,'../deployment/intune/Enterprise-Endpoint.ps1'),'-VerifyEndpoint'],
    {encoding:'utf8',windowsHide:true});
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  const line=result.stdout.split(/\r?\n/).find(line=>line.startsWith('RESULT:'));
  assert.ok(line,result.stdout);
  assert.deepEqual(JSON.parse(line.slice(7)),{configurationVerified:true,browserPending:true,driftObserved:true,rollbackPreserved:true});
});

test('standalone SYSTEM payload rejects wrong Store identity, malformed GUIDs and registry traversal before mutation', () => {
  const endpoint=path.resolve(__dirname,'../deployment/intune/Enterprise-Endpoint.ps1');
  const fixture=path.join(__dirname,'fixtures/enterprise-registry-harness.ps1');
  const source=`
    $ErrorActionPreference='Stop'
    . ${quote(fixture)} -EndpointPath ${quote(endpoint)} -FunctionsOnly
    $base=@{browser='edge';extensionId='edefcbdhahfolgkoamkbknjppojpaffk';deploymentId='11111111-1111-4111-8111-111111111111';managedPolicy=@{forcePrivacyScrubber=$true}}
    $rejected=0
    foreach ($case in 1..5) {
      $bad=$base | ConvertTo-Json -Depth 10 | ConvertFrom-Json
      if ($case -eq 1) { $bad.extensionId='a'*32 }
      if ($case -eq 2) { $bad.deploymentId='-'*36 }
      if ($case -eq 3) { $bad.managedPolicy=[pscustomobject]@{'../other'=$true} }
      if ($case -eq 4) { $bad.managedPolicy=[pscustomobject]@{nested=@{unsafe=$true}} }
      if ($case -eq 5) { $bad.browser='chrome' }
      try { & ${quote(endpoint)} -ConfigJson ($bad|ConvertTo-Json -Depth 10 -Compress) -Action Install | Out-Null }
      catch { $rejected++ }
      if ($global:registry.Count) { throw 'Invalid payload mutated registry.' }
    }
    if ($rejected -ne 5) { throw 'Invalid payload accepted.' }
    Write-Output 'RESULT:{"rejected":5,"registryWrites":0}'
  `;
  const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',source],{encoding:'utf8',windowsHide:true});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  assert.match(result.stdout,/"rejected":5,"registryWrites":0/);
});
