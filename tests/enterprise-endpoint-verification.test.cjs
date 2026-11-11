const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const quote = value => `'${value.replaceAll("'", "''")}'`;

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
