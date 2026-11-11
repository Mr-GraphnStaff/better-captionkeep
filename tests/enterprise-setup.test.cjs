const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const quote = value => `'${value.replaceAll("'", "''")}'`;

async function withPackage(callback) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'captionkeep-enterprise-'));
  try {
    const {buildEnterprisePackage} = await import('../scripts/build-enterprise-package.mjs');
    const output = path.join(temporaryRoot, 'package');
    await buildEnterprisePackage(output);
    await callback(output, temporaryRoot);
  } finally {
    const base = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(path.resolve(temporaryRoot).startsWith(base));
    fs.rmSync(temporaryRoot, {recursive:true, force:true});
  }
}

function runPowerShell(directory, source) {
  const file = path.join(directory, `test-${Math.random().toString(16).slice(2)}.ps1`);
  fs.writeFileSync(file, `$ErrorActionPreference = 'Stop'\n${source}`);
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', file], {encoding:'utf8', windowsHide:true});
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
  const line = result.stdout.split(/\r?\n/).findLast(line => line.startsWith('RESULT:'));
  assert.ok(line, result.stdout);
  return JSON.parse(line.slice(7));
}

test('enterprise package has a bounded inventory, parses PowerShell, and never packages a prior receipt', async () => {
  await withPackage(async (output, temporaryRoot) => {
    const files = fs.readdirSync(output);
    assert.ok(files.includes('Start-Setup.cmd'));
    assert.ok(!files.some(name => /working|node_modules|receipt|\.pem/i.test(name)));
    assert.ok(files.includes('better-captionkeep-enterprise-setup.zip'));
    assert.ok(fs.readFileSync(path.join(output,'SHA256SUMS.txt'),'utf8').includes('Enterprise-Setup.ps1'));
    for (const line of fs.readFileSync(path.join(output,'SHA256SUMS.txt'),'utf8').trim().split('\n')) {
      const file=path.resolve(output,line.slice(66));
      assert.ok(file.startsWith(path.resolve(output)+path.sep));
      assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),line.slice(0,64));
    }
    const parsed = runPowerShell(temporaryRoot, `
      foreach ($file in @(${quote(path.join(output,'Enterprise-Setup.ps1'))}, ${quote(path.join(output,'Enterprise-Endpoint.ps1'))})) {
        $tokens=$null; $errors=$null
        [Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors) | Out-Null
        if ($errors.Count) { throw ($errors | Out-String) }
      }
      $zip=[IO.Compression.ZipFile]::OpenRead(${quote(path.join(output,'better-captionkeep-enterprise-setup.zip'))})
      try {
        if (@($zip.Entries | Where-Object { $_.FullName -match 'working/|receipts/|node_modules/|\.pem$' }).Count) { throw 'Unsafe ZIP inventory.' }
        if (-not @($zip.Entries | Where-Object FullName -eq 'Enterprise-Setup.ps1').Count) { throw 'Missing setup script in ZIP.' }
      } finally { $zip.Dispose() }
      . ${quote(path.join(output,'Enterprise-Setup.ps1'))}
      $invalid=$false
      try { Assert-ManagedSetupPolicy @{ '../bad'=$true } (@{properties=@{}}) } catch { $invalid=$true }
      $plan = Invoke-EnterpriseSetup @{WithMicrosoft365=$false;WithoutMicrosoft365=$true;Browser='both';PlanOnly=$true;TenantId='';GroupId='';EnableSpeakerAttribution=$false} ${quote(output)}
      Write-Output ('RESULT:' + (@{invalidRejected=$invalid;plan=$plan} | ConvertTo-Json -Depth 10 -Compress))
    `);
    assert.equal(parsed.invalidRejected, true);
    assert.equal(parsed.plan.cloudWrites, false);
    assert.ok(!parsed.plan.scopes.includes('Application.ReadWrite.All'));
    const {buildEnterprisePackage} = await import('../scripts/build-enterprise-package.mjs');
    fs.writeFileSync(path.join(output,'receipt.json'),'private customer receipt');
    await assert.rejects(buildEnterprisePackage(output), /must be empty/);
  });
});

function provisioningMock(output, directory, microsoft365, failApplication = false, approve = true, resume = false, after = '', lostAssignment = '', before = '') {
  return `
    . ${quote(path.join(output,'Enterprise-Setup.ps1'))}
    $global:calls=[Collections.Generic.List[object]]::new()
    $global:scriptNumber=0
    $global:apps=@(); $global:principals=@(); $global:grants=@(); $global:scripts=@{}; $global:assignments=@{}
    $global:teams=@{EnableGraphTranscriptAccess=$false;EnableAttributedTranscripts=$false}
    $global:connections=@();$global:lostAssignment=$false
    function Require-SetupModules { param($Names) }
    function Connect-MgGraph { param($TenantId,$Scopes,$ContextScope,[switch]$NoWelcome) $global:connections+=,@($Scopes) }
    function Get-MgContext { @{TenantId='11111111-1111-4111-8111-111111111111';Environment='Global';AuthType='Delegated';Account='admin@example.invalid'} }
    function Disconnect-MgGraph { }
    function Connect-MicrosoftTeams { param($TenantId) }
    function Disconnect-MicrosoftTeams { }
    function Get-CsTeamsMeetingConfiguration { param($Identity) $global:teams }
    function Set-CsTeamsMeetingConfiguration { param($Identity,$EnableGraphTranscriptAccess,$EnableAttributedTranscripts)
      $global:calls.Add(@{method='TEAMS';path='Global';enabled=$EnableGraphTranscriptAccess})
      $global:teams.EnableGraphTranscriptAccess=$EnableGraphTranscriptAccess
      if ($PSBoundParameters.ContainsKey('EnableAttributedTranscripts')) { $global:teams.EnableAttributedTranscripts=$EnableAttributedTranscripts }
    }
    function Read-Host { param($Prompt) if ($Prompt -like 'Type APPROVE*') { ${approve ? "'APPROVE'" : "'CANCEL'"} } elseif ($Prompt -like 'Type DEPLOY*') { 'DEPLOY' } else { throw "Unexpected prompt: $Prompt" } }
    function Invoke-MgGraphRequest {
      param($Method,$Uri,$OutputType,$Body,$ContentType)
      $decoded = if ($Body) { $Body | ConvertFrom-Json -AsHashtable } else { $null }
      $global:calls.Add(@{method=$Method;path=$Uri;body=$decoded})
      if ($Uri -like '*/groups/*') { return @{id='22222222-2222-4222-8222-222222222222';displayName='Synthetic pilot';securityEnabled=$true} }
      if ($Method -eq 'GET' -and $Uri -like '*/servicePrincipals?*' -and $Uri -match '00000003-0000-0000-c000-000000000000') {
        $scopes=@(); $n=0
        foreach ($name in @('Calendars.ReadBasic','OnlineMeetings.Read','OnlineMeetingTranscript.Read.All','openid','profile','offline_access')) { $n++; $scopes+=@{value=$name;id=('50000000-0000-4000-8000-{0:d12}' -f $n);isEnabled=$true} }
        return @{value=@(@{id='33333333-3333-4333-8333-333333333333';oauth2PermissionScopes=$scopes})}
      }
      if ($Method -eq 'GET' -and $Uri -match '/applications\\?') { return @{value=@($global:apps)} }
      if ($Method -eq 'GET' -and $Uri -match '/servicePrincipals\\?') { return @{value=@($global:principals)} }
      if ($Method -eq 'GET' -and $Uri -match '/oauth2PermissionGrants\\?') { return @{value=@($global:grants)} }
      if ($Method -eq 'GET' -and $Uri -match '/deviceManagementScripts\\?') {
        $decodedUri=[uri]::UnescapeDataString($Uri)
        $name=($decodedUri -split "displayName eq '",2)[1].TrimEnd("'")
        return @{value=@($global:scripts.Values | Where-Object displayName -eq $name)}
      }
      if ($Method -eq 'GET' -and $Uri -match '/deviceManagementScripts/([^/]+)/groupAssignments$') { return @{value=@($global:assignments[$Matches[1]])} }
      if ($Method -eq 'GET' -and $Uri -match '/deviceManagementScripts/([^/]+)/deviceRunStates') { return @{value=@()} }
      if ($Method -eq 'GET' -and $Uri -match '/deviceManagementScripts/([^/]+)$') { return $global:scripts[$Matches[1]] }
      if ($Uri.EndsWith('/applications')) {
        $app=$decoded.Clone();$app.id='44444444-4444-4444-8444-444444444444';$app.appId='55555555-5555-4555-8555-555555555555'
        $global:apps+=,$app
        ${failApplication ? "throw 'Simulated lost POST response'" : 'return $app'}
      }
      if ($Uri.EndsWith('/servicePrincipals')) { $principal=$decoded.Clone();$principal.id='66666666-6666-4666-8666-666666666666';$global:principals+=,$principal;return $principal }
      if ($Uri.EndsWith('/oauth2PermissionGrants')) { $grant=$decoded.Clone();$grant.id='grant-synthetic';$global:grants+=,$grant;return $grant }
      if ($Uri.EndsWith('/deviceManagementScripts')) { $global:scriptNumber++; $script=$decoded.Clone();$script.id=('70000000-0000-4000-8000-{0:d12}' -f $global:scriptNumber);$global:scripts[$script.id]=$script; $global:assignments[$script.id]=@();return $script }
      if ($Uri -match '/deviceManagementScripts/([^/]+)/assign$') {
        $assignmentId=$Matches[1]
        ${lostAssignment ? `if (-not $global:lostAssignment) {
          $global:lostAssignment=$true
          ${lostAssignment === 'visible' ? '$global:assignments[$assignmentId]=@($decoded.deviceManagementScriptGroupAssignments)' : ''}
          throw 'Simulated lost assignment response'
        }` : ''}
        $global:assignments[$assignmentId]=@($decoded.deviceManagementScriptGroupAssignments); return $null
      }
      throw "Unexpected Graph request: $Method $Uri"
    }
    $options=@{WithMicrosoft365=$${microsoft365};WithoutMicrosoft365=$${!microsoft365};Browser='both';PlanOnly=$false;TenantId='11111111-1111-4111-8111-111111111111';GroupId='22222222-2222-4222-8222-222222222222';EnableSpeakerAttribution=$false;SigningCertificateThumbprint='';AllowUnsignedEndpointScripts=$true;Hardened=$false;OutputDirectory=${quote(path.join(directory,'receipt'))}}
    ${before}
    $failed=$false
    $errorMessage=''
    try { Invoke-EnterpriseSetup $options ${quote(output)} | Out-Null } catch { $failed=$true;$errorMessage=$_.Exception.Message }
    ${resume ? `if ($failed) {
      try { Invoke-EnterpriseSetup @{ResumeReceipt=${quote(path.join(directory,'receipt/receipt.json'))}} ${quote(output)} | Out-Null; $failed=$false;$errorMessage='' } catch { $errorMessage=$_.Exception.Message }
    }` : ''}
    $extra=@{}
    ${after}
    $receipt=$null
    if ([IO.File]::Exists(${quote(path.join(directory,'receipt/receipt.json'))})) { $receipt=Get-Content -LiteralPath ${quote(path.join(directory,'receipt/receipt.json'))} -Raw | ConvertFrom-Json }
    Write-Output ('RESULT:' + (@{failed=$failed;error=$errorMessage;calls=@($global:calls.ToArray());receipt=$receipt;extra=$extra;connections=$global:connections} | ConvertTo-Json -Depth 40 -Compress))
  `;
}

test('Intune-only wizard uploads two SYSTEM scripts without creating or consenting a transcript app', async () => {
  await withPackage(async (output, directory) => {
    const result = runPowerShell(directory, provisioningMock(output,directory,false));
    assert.equal(result.failed,false,result.error);
    assert.equal(result.receipt.status,'AssignedPendingEndpointValidation');
    assert.equal(result.calls.filter(call=>call.method==='POST'&&call.path.endsWith('/deviceManagementScripts')).length,2);
    assert.equal(result.receipt.status,'AssignedPendingEndpointValidation');
    assert.equal(result.receipt.appId,null);
    assert.equal(result.receipt.cleanupVerified,false);
    assert.equal(result.calls.filter(call=>call.method==='POST').length,4);
    assert.ok(result.calls.every(call=>! /applications|oauth2PermissionGrants|servicePrincipals/.test(call.path)));
    const upload = result.calls.find(call=>call.method==='POST'&&call.path.endsWith('/deviceManagementScripts'));
    assert.equal(upload.body.runAsAccount,'system');
    assert.equal(upload.body.runAs32Bit,false);
    const script = Buffer.from(upload.body.scriptContent,'base64').toString('utf8');
    const encoded = script.match(/FromBase64String\('([^']+)'\)/)[1];
    const config = JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
    assert.equal(config.managedPolicy.enableGraphTranscriptImport,false);
    assert.equal(config.managedPolicy.graphClientId,undefined);
  });
});

test('optional Microsoft 365 creates a single-tenant public app and injects its IDs into both deployments', async () => {
  await withPackage(async (output,directory) => {
    const result=runPowerShell(directory,provisioningMock(output,directory,true));
    assert.equal(result.failed,false,result.error);
    const app=result.calls.find(call=>call.method==='POST'&&call.path.endsWith('/applications'));
    assert.equal(app.body.signInAudience,'AzureADMyOrg');
    assert.equal(app.body.spa.redirectUris.length,2);
    assert.equal(app.body.passwordCredentials,undefined);
    assert.equal(app.body.requiredResourceAccess[0].resourceAccess.length,6);
    const grant=result.calls.find(call=>call.path.endsWith('/oauth2PermissionGrants'));
    assert.equal(grant.body.consentType,'AllPrincipals');
    assert.ok(grant.body.scope.includes('OnlineMeetingTranscript.Read.All'));
    assert.equal(result.calls.filter(call=>call.method==='TEAMS').length,1);
    assert.equal(result.receipt.provisioningGrantCleanup.state,'RetainedNotOwned');
    assert.ok(result.calls.every(call=>call.method!=='DELETE'));
    for(const upload of result.calls.filter(call=>call.method==='POST'&&call.path.endsWith('/deviceManagementScripts'))) {
      const script=Buffer.from(upload.body.scriptContent,'base64').toString('utf8');
      const encoded=script.match(/FromBase64String\('([^']+)'\)/)[1];
      const config=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
      assert.equal(config.managedPolicy.graphClientId,result.receipt.appId);
      assert.equal(config.managedPolicy.graphTenantId,result.receipt.plan.tenantId);
      assert.equal(config.managedPolicy.enableGraphTranscriptImport,true);
    }
  });
});

test('Continue reconciles a lost app POST response without creating the app twice', async () => {
  await withPackage(async (output,directory) => {
    const result=runPowerShell(directory,provisioningMock(output,directory,true,true,true,true));
    assert.equal(result.failed,false,result.error);
    assert.equal(result.calls.filter(call=>call.method==='POST'&&call.path.endsWith('/applications')).length,1);
    assert.equal(result.receipt.operations.CreateApplication.state,'Reconciled');
    assert.equal(result.receipt.status,'AssignedPendingEndpointValidation');
    assert.equal(result.receipt.scripts.length,2);
  });
});

test('Continue reuses reviewed signed scripts without reopening the original signing certificate', async () => {
  await withPackage(async (output,directory) => {
    const receiptPath=quote(path.join(directory,'receipt/receipt.json'));
    const result=runPowerShell(directory,provisioningMock(output,directory,false,false,true,false,`
      $before=Get-Content -LiteralPath ${receiptPath} -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
      function Select-SetupCertificate { param($Thumbprint,$AllowUnsigned) throw 'The old private certificate must not be required to reuse reviewed scripts.' }
      function Read-Host { param($Prompt) if ($Prompt -like 'Type APPROVE*') { 'APPROVE' } elseif ($Prompt -like 'Type DEPLOY*') { 'DEPLOY' } else { throw "Unexpected prompt: $Prompt" } }
      Invoke-EnterpriseSetup @{ResumeReceipt=${receiptPath}} ${quote(output)} | Out-Null
      $extra.signedPlan=$before.plan.signedEndpointScripts
      $extra.uploads=@($global:calls | Where-Object { $_.method -eq 'POST' -and $_.path.EndsWith('/deviceManagementScripts') } | ForEach-Object {
        $upload=$_
        $bytes=[Convert]::FromBase64String($upload.body.scriptContent)
        $browser=if ($upload.body.displayName -like '* edge *') { 'edge' } else { 'chrome' }
        $saved=@($before.scripts | Where-Object browser -eq $browser)[0]
        @{browser=$browser;signatureRequired=$upload.body.enforceSignatureCheck;hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes));expected=$saved.installHash;prefix=[Convert]::ToHexString($bytes[0..2])}
      })
    `,'',`
      $options.AllowUnsignedEndpointScripts=$false
      function Select-SetupCertificate { param($Thumbprint,$AllowUnsigned) [pscustomobject]@{Thumbprint=('a'*40)} }
      function Set-AuthenticodeSignature { param($FilePath,$Certificate,$HashAlgorithm)
        [byte[]]$bytes=@(239,187,191)+[IO.File]::ReadAllBytes($FilePath)
        [IO.File]::WriteAllBytes($FilePath,$bytes)
        @{Status='Valid'}
      }
      function Read-Host { param($Prompt) if ($Prompt -like 'Type APPROVE*') { 'APPROVE' } elseif ($Prompt -like 'Type DEPLOY*') { '' } else { throw "Unexpected prompt: $Prompt" } }
    `));
    assert.equal(result.failed,false,result.error);
    assert.equal(result.extra.signedPlan,true);
    assert.equal(result.extra.uploads.length,2);
    for (const upload of result.extra.uploads) {
      assert.equal(upload.signatureRequired,true);
      assert.equal(upload.hash,upload.expected);
      assert.equal(upload.prefix,'EFBBBF');
    }
    assert.equal(result.receipt.status,'AssignedPendingEndpointValidation');
  });
});

test('Continue reconciles a lost assignment response and never repeats an assignment that remains invisible', async () => {
  for (const mode of ['visible','not-visible']) {
    await withPackage(async (output,directory) => {
      const result=runPowerShell(directory,provisioningMock(output,directory,false,false,true,true,'',mode));
      const assigns=result.calls.filter(call=>call.method==='POST'&&call.path.endsWith('/assign'));
      assert.equal(assigns.filter(call=>call.path.includes('70000000-0000-4000-8000-000000000001')).length,1);
      if (mode==='visible') {
        assert.equal(result.failed,false,result.error);
        assert.equal(assigns.length,2);
        assert.equal(result.receipt.status,'AssignedPendingEndpointValidation');
      } else {
        assert.equal(result.failed,true);
        assert.equal(assigns.length,1);
        assert.match(result.error,/no assignment POST was repeated/);
      }
    });
  }
});

test('Check Status requests read-only scope and stops on a different signed-in tenant without cloud writes', async () => {
  await withPackage(async (output,directory) => {
    const receiptPath=quote(path.join(directory,'receipt/receipt.json'));
    const result=runPowerShell(directory,provisioningMock(output,directory,false,false,true,false,`
      $before=@($global:calls | Where-Object method -ne 'GET').Count
      Invoke-EnterpriseSetup @{StatusReceipt=${receiptPath}} ${quote(output)} | Out-Null
      $extra.readOnly=(@($global:calls | Where-Object method -ne 'GET').Count -eq $before)
      $extra.statusScopes=@($global:connections[-1])
      function Get-MgContext { @{TenantId='99999999-9999-4999-8999-999999999999';Environment='Global';AuthType='Delegated';Account='other@example.invalid'} }
      $readsBefore=$global:calls.Count
      $extra.wrongTenantStopped=$false
      try { Invoke-EnterpriseSetup @{StatusReceipt=${receiptPath}} ${quote(output)} | Out-Null } catch { $extra.wrongTenantStopped=$_.Exception.Message -like '*does not match*' }
      $extra.noTenantRequests=($global:calls.Count -eq $readsBefore)
    `));
    assert.equal(result.failed,false,result.error);
    assert.equal(result.extra.readOnly,true);
    assert.deepEqual(result.extra.statusScopes,['DeviceManagementScripts.Read.All']);
    assert.equal(result.extra.wrongTenantStopped,true);
    assert.equal(result.extra.noTenantRequests,true);
  });
});

test('browser and signing certificate choices work by number without flags or thumbprint entry', async () => {
  await withPackage(async (output,directory) => {
    const result=runPowerShell(directory, `
      . ${quote(path.join(output,'Enterprise-Setup.ps1'))}
      $global:choices=[Collections.Generic.Queue[string]]::new()
      $global:choices.Enqueue('3');$global:choices.Enqueue('1')
      function Read-Host { param($Prompt) $global:choices.Dequeue() }
      function Get-ChildItem { param($Path,$ErrorAction)
        @{Subject='CN=Synthetic Signing';HasPrivateKey=$true;NotAfter=[datetime]::UtcNow.AddYears(1);Thumbprint=('a'*40);EnhancedKeyUsageList=@(@{ObjectId=@{Value='1.3.6.1.5.5.7.3.3'}})}
      }
      $browser=Select-SetupBrowser
      $certificate=Select-SetupCertificate '' $false
      Write-Output ('RESULT:' + (@{browser=$browser;certificate=$certificate.Subject;choicesRemaining=$global:choices.Count} | ConvertTo-Json -Compress))
    `);
    assert.deepEqual(result,{browser:'chrome',certificate:'CN=Synthetic Signing',choicesRemaining:0});
  });
});

test('certificate picker accepts Windows string and Oid EKUs while excluding non-signing and missing-private-key certificates', async () => {
  await withPackage(async (output,directory) => {
    const result=runPowerShell(directory, `
      . ${quote(path.join(output,'Enterprise-Setup.ps1'))}
      $future=[datetime]::UtcNow.AddYears(1)
      $global:certificates=@(
        [pscustomobject]@{Subject='Server authentication';HasPrivateKey=$true;NotAfter=$future;EnhancedKeyUsageList=@([pscustomobject]@{ObjectId='1.3.6.1.5.5.7.3.1'})},
        [pscustomobject]@{Subject='No private key';HasPrivateKey=$false;NotAfter=$future;EnhancedKeyUsageList=@([pscustomobject]@{ObjectId='1.3.6.1.5.5.7.3.3'})},
        [pscustomobject]@{Subject='Windows string OID';HasPrivateKey=$true;NotAfter=$future;EnhancedKeyUsageList=@([pscustomobject]@{ObjectId='1.3.6.1.5.5.7.3.3'})},
        [pscustomobject]@{Subject='Cryptography Oid';HasPrivateKey=$true;NotAfter=$future;EnhancedKeyUsageList=@([pscustomobject]@{ObjectId=[Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3')})}
      )
      function Get-ChildItem { param($Path,$ErrorAction) $global:certificates }
      function Read-Host { param($Prompt) '2' }
      $selected=Select-SetupCertificate '' $false
      $eligible=@($global:certificates | Where-Object { Test-SetupCodeSigningCertificate $_ } | ForEach-Object Subject)
      $global:certificates=@($global:certificates[0],$global:certificates[1])
      function Read-Host { param($Prompt) 'UNSIGNED' }
      $unsigned=Select-SetupCertificate '' $false
      Write-Output ('RESULT:' + (@{selected=$selected.Subject;eligible=$eligible;unsignedAvailable=($null -eq $unsigned)} | ConvertTo-Json -Compress))
    `);
    assert.equal(result.selected,'Cryptography Oid');
    assert.deepEqual(result.eligible,['Windows string OID','Cryptography Oid']);
    assert.equal(result.unsignedAvailable,true);
  });
});

test('ambiguous zero or duplicate resource reads never repeat a recorded POST', async () => {
  await withPackage(async (output,directory) => {
    const result=runPowerShell(directory, `
      . ${quote(path.join(output,'Enterprise-Setup.ps1'))}
      $body=@{displayName='Owned synthetic deployment'}
      $receipt=@{operations=@{CreateApplication=@{state='Ambiguous';requestFingerprint=(Get-SetupFingerprint $body);resourceId=$null}};pendingOperation='CreateApplication'}
      $global:posts=0;$blocked=0
      foreach ($count in @(0,2)) {
        $global:findCount=$count
        try { Invoke-RecordedSetupCreate $receipt ${quote(directory)} 'CreateApplication' $body { 1..$global:findCount | Where-Object { $global:findCount -gt 0 } | ForEach-Object { @{id='same';displayName='Owned synthetic deployment'} } } { param($value) $true } { param($request) $global:posts++;@{id='new'} } | Out-Null } catch { $blocked++ }
      }
      Write-Output ('RESULT:' + (@{posts=$global:posts;blocked=$blocked} | ConvertTo-Json -Compress))
    `);
    assert.deepEqual(result,{posts:0,blocked:2});
  });
});

test('dependency approval is consolidated and rejects a substituted gallery before installation', async () => {
  await withPackage(async (output,directory) => {
    const result=runPowerShell(directory, `
      . ${quote(path.join(output,'Enterprise-Setup.ps1'))}
      $global:prompts=0;$global:installs=0
      function Get-Module { param($Name,[switch]$ListAvailable) return $null }
      function Read-Host { param($Prompt) $global:prompts++;return 'INSTALL' }
      function Get-PSRepository { param($Name) @{SourceLocation='https://not-official.example.invalid/api/v2'} }
      function Install-Module { param($Name,$Repository,$Scope,[switch]$Force,$ErrorAction) $global:installs++ }
      $blocked=$false
      try { Require-SetupModules @('Microsoft.Graph.Authentication','MicrosoftTeams') } catch { $blocked=$true }
      Write-Output ('RESULT:' + (@{prompts=$global:prompts;installs=$global:installs;blocked=$blocked} | ConvertTo-Json -Compress))
    `);
    assert.deepEqual(result,{prompts:1,installs:0,blocked:true});
  });
});

test('one dependency approval installs a missing Graph module and updates unsupported Teams before tenant sign-in', async () => {
  await withPackage(async (output,directory) => {
    const result=runPowerShell(directory, `
      . ${quote(path.join(output,'Enterprise-Setup.ps1'))}
      $global:prompts=0;$global:updated=$false;$global:installs=@();$global:removed=@()
      function Get-Module { param($Name,[switch]$ListAvailable) if ($Name -eq 'MicrosoftTeams') { @{Name=$Name} } }
      function Import-Module { param($Name,[switch]$Force,$ErrorAction) }
      function Get-Command { param($Name,$ErrorAction) if ($global:updated) { @{Parameters=@{EnableGraphTranscriptAccess=$true;EnableAttributedTranscripts=$true}} } else { @{Parameters=@{}} } }
      function Get-PSRepository { param($Name) @{SourceLocation='https://www.powershellgallery.com/api/v2'} }
      function Read-Host { param($Prompt) $global:prompts++;'INSTALL' }
      function Remove-Module { param($Name,[switch]$Force,$ErrorAction) $global:removed+=,$Name }
      function Install-Module { param($Name,$Repository,$Scope,[switch]$Force,$ErrorAction) $global:installs+=,$Name;if ($Name -eq 'MicrosoftTeams') { $global:updated=$true } }
      Require-SetupModules @('Microsoft.Graph.Authentication','MicrosoftTeams')
      Write-Output ('RESULT:' + (@{prompts=$global:prompts;installs=$global:installs;removed=$global:removed;updated=$global:updated} | ConvertTo-Json -Compress))
    `);
    assert.equal(result.prompts,1);
    assert.deepEqual(result.installs,['Microsoft.Graph.Authentication','MicrosoftTeams']);
    assert.deepEqual(result.removed,['MicrosoftTeams']);
    assert.equal(result.updated,true);
  });
});

test('renamed receipt selection is rejected before authentication and preserves the canonical receipt', async () => {
  await withPackage(async (output,directory) => {
    const original=quote(path.join(directory,'receipt/receipt.json'));
    const renamed=quote(path.join(directory,'receipt/deployment-backup.json'));
    const result=runPowerShell(directory,provisioningMock(output,directory,false,false,true,false,`
      Copy-Item -LiteralPath ${original} -Destination ${renamed}
      $before=(Get-FileHash -LiteralPath ${original} -Algorithm SHA256).Hash
      $connectionsBefore=$global:connections.Count
      $extra.blocked=$false
      try { Invoke-EnterpriseSetup @{StatusReceipt=${renamed}} ${quote(output)} | Out-Null } catch { $extra.blocked=$_.Exception.Message -like '*original receipt.json*' }
      $extra.beforeAuthentication=($global:connections.Count -eq $connectionsBefore)
      $extra.originalPreserved=((Get-FileHash -LiteralPath ${original} -Algorithm SHA256).Hash -ceq $before)
    `));
    assert.equal(result.failed,false,result.error);
    assert.deepEqual(result.extra,{blocked:true,beforeAuthentication:true,originalPreserved:true});
  });
});

test('Intune upload preserves the exact reviewed script bytes including a UTF-8 signature-file BOM', async () => {
  await withPackage(async (output,directory) => {
    const result=runPowerShell(directory, `
      . ${quote(path.join(output,'Enterprise-Setup.ps1'))}
      [byte[]]$bytes=@(239,187,191)+[Text.Encoding]::UTF8.GetBytes('synthetic signed-script bytes')
      $body=New-IntuneScriptBody -Name 'Synthetic signed script' -Signed $true -ScriptBytes $bytes
      $actual=[Convert]::FromBase64String($body.scriptContent)
      Write-Output ('RESULT:' + (@{actual=[Convert]::ToBase64String($actual);expected=[Convert]::ToBase64String($bytes);signatureRequired=$body.enforceSignatureCheck} | ConvertTo-Json -Compress))
    `);
    assert.equal(result.actual,result.expected);
    assert.equal(Buffer.from(result.actual,'base64').subarray(0,3).toString('hex'),'efbbbf');
    assert.equal(result.signatureRequired,true);
  });
});

test('delivery report follows approved pages and distinguishes script success from correlated endpoint evidence', async () => {
  await withPackage(async (output,directory) => {
    const result=runPowerShell(directory, `
      . ${quote(path.join(output,'Enterprise-Setup.ps1'))}
      $content='synthetic exact install script'
      $hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($content)))
      $global:scriptContent=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($content))
      $global:page=0
      $receipt=@{plan=@{deploymentId='11111111-1111-4111-8111-111111111111'};scripts=@(@{id='22222222-2222-4222-8222-222222222222';browser='edge';installHash=$hash;configurationHash=('c'*64)})}
      function Invoke-SetupGraph {
        param($Method,$Path,$Body,[switch]$Beta)
        if ($Path -match '/deviceManagementScripts/[^/]+$') { return @{scriptContent=$global:scriptContent} }
        $global:page++
        if ($global:page -eq 1) {
          $message='BCK_ENDPOINT_RESULT:'+(@{schemaVersion=1;deploymentId='11111111-1111-4111-8111-111111111111';browser='edge';configurationHash=('C'*64);action='Install';policyVerified=$true;forceInstallVerified=$true;installationObserved=$true} | ConvertTo-Json -Compress)
          return @{value=@(@{id='report-1';runState='success';resultMessage=$message;managedDevice=@{id='device-1';deviceName='Synthetic PC'}});'@odata.nextLink'='https://graph.microsoft.com/beta/deviceManagement/deviceManagementScripts/22222222-2222-4222-8222-222222222222/deviceRunStates?$skiptoken=next'}
        }
        $overridden='BCK_ENDPOINT_RESULT:'+(@{schemaVersion=1;deploymentId='11111111-1111-4111-8111-111111111111';browser='edge';configurationHash=('c'*64);action='Install';policyVerified=$false;forceInstallVerified=$false;installationObserved=$false} | ConvertTo-Json -Compress)
        return @{value=@(@{id='report-2';runState='success';resultMessage='ordinary successful exit';managedDevice=@{id='device-1';deviceName='Synthetic PC'}},@{id='report-3';runState='success';resultMessage=$overridden;managedDevice=@{id='device-1';deviceName='Synthetic PC'}})}
      }
      $report=Get-EnterpriseDeliveryStatus $receipt
      Write-Output ('RESULT:' + ($report | ConvertTo-Json -Depth 15 -Compress))
    `);
    assert.equal(result.reports,3);
    assert.equal(result.reportingDevices,1);
    assert.equal(result.succeeded,3);
    assert.equal(result.configurationVerified,1);
    assert.equal(result.installationObserved,1);
    assert.equal(result.devices[0].status,'ConfigurationVerifiedInstallationObserved');
    assert.equal(result.devices[1].status,'ScriptSucceeded');
    assert.equal(result.devices[2].status,'ConfigurationNotVerified');
    assert.equal(result.configurationNotVerified,1);
    assert.ok(result.devices.every(device=>device.browserVerified===false));
    assert.equal(result.microsoft365Verification,'NotEstablished');
  });
});

test('actual wizard payload and endpoint marker correlate through the real delivery report', async () => {
  await withPackage(async (output,directory) => {
    const endpointRunner=path.join(directory,'execute-endpoint-in-memory.ps1');
    fs.writeFileSync(endpointRunner, `param([string]$InstallPath)\n. ${quote(path.join(__dirname,'fixtures/enterprise-registry-harness.ps1'))} -EndpointPath ${quote(path.join(output,'Enterprise-Endpoint.ps1'))} -FunctionsOnly\n& $InstallPath\n`);
    const result=runPowerShell(directory,provisioningMock(output,directory,false,false,true,false,`
      $saved=Get-Content -LiteralPath ${quote(path.join(directory,'receipt/receipt.json'))} -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
      $edge=@($saved.scripts | Where-Object browser -eq 'edge')[0]
      $marker=@(& pwsh -NoProfile -NonInteractive -File ${quote(endpointRunner)} -InstallPath ${quote(path.join(directory,'receipt/edge-Install.ps1'))} | Where-Object { $_ -is [string] -and $_.StartsWith('BCK_ENDPOINT_RESULT:') })
      if ($LASTEXITCODE -ne 0 -or $marker.Count -ne 1) { throw 'Actual generated endpoint script failed in the isolated registry fixture.' }
      $global:actualMarker=$marker[0];$global:actualContent=$global:scripts[$edge.id].scriptContent
      function Invoke-SetupGraph {
        param($Method,$Path,$Body,[switch]$Beta)
        if ($Path -match '/deviceRunStates') { return @{value=@(@{id='state-1';runState='success';resultMessage=$global:actualMarker;managedDevice=@{id='device-1';deviceName='Synthetic PC'}})} }
        return @{scriptContent=$global:actualContent}
      }
      $extra.configurationHash=$edge.configurationHash
      $extra.actualMarker=$global:actualMarker | ForEach-Object { $_.Substring('BCK_ENDPOINT_RESULT:'.Length) | ConvertFrom-Json -AsHashtable }
      $extra.report=Get-EnterpriseDeliveryStatus @{plan=$saved.plan;scripts=@($edge)}
    `));
    assert.equal(result.failed,false,result.error);
    assert.match(result.extra.configurationHash,/^[a-f0-9]{64}$/);
    assert.equal(result.extra.actualMarker.configurationHash,result.extra.configurationHash);
    assert.equal(result.extra.report.configurationVerified,1);
    assert.equal(result.extra.report.devices[0].status,'ConfigurationVerifiedBrowserPending');
    assert.equal(result.extra.report.devices[0].sourceVerified,true);
    assert.equal(result.extra.report.devices[0].browserVerified,false);
    assert.equal(result.extra.report.microsoft365Verification,'NotEstablished');
  });
});

test('pagination rejects another host before forwarding a second Graph request', async () => {
  await withPackage(async (output,directory) => {
    const result=runPowerShell(directory, `
      . ${quote(path.join(output,'Enterprise-Setup.ps1'))}
      $global:reads=0
      function Invoke-SetupGraph { param($Method,$Path,$Body,[switch]$Beta) $global:reads++;return @{value=@();'@odata.nextLink'='https://untrusted.example.invalid/beta/applications?$skiptoken=next'} }
      $blocked=$false
      try { Get-SetupCollection '/applications' | Out-Null } catch { $blocked=$true }
      Write-Output ('RESULT:' + (@{blocked=$blocked;reads=$global:reads} | ConvertTo-Json -Compress))
    `);
    assert.deepEqual(result,{blocked:true,reads:1});
  });
});

test('cancelled approval causes no resource writes; lost create response retains an incomplete recovery receipt', async () => {
  await withPackage(async (output,directory) => {
    const cancelled=runPowerShell(directory,provisioningMock(output,directory,true,false,false));
    assert.equal(cancelled.failed,true);
    assert.equal(cancelled.receipt,null);
    assert.ok(cancelled.calls.every(call=>call.method==='GET'));
    const failed=runPowerShell(directory,provisioningMock(output,directory,true,true));
    assert.equal(failed.failed,true);
    assert.equal(failed.receipt.status,'Incomplete');
    assert.equal(failed.receipt.pendingOperation,'CreateApplication');
    assert.equal(failed.calls.filter(call=>call.method==='POST').length,1);
    assert.equal(failed.receipt.scripts.length,0);
  });
});

test('endpoint policy script preserves other extensions, detects drift, and restores typed before-images', async () => {
  await withPackage(async (output,directory) => {
    const result=runPowerShell(directory, `& ${quote(path.join(__dirname,'fixtures/enterprise-registry-harness.ps1'))} -EndpointPath ${quote(path.join(output,'Enterprise-Endpoint.ps1'))}`);
    assert.deepEqual(result,{idempotent:true,rollback:true,driftBlocked:true,unrelatedPreserved:true});
  });
});
