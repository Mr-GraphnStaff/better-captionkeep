const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const quote = value => `'${value.replaceAll("'", "''")}'`;

function scenario(source) {
  assert.ok(process.env.AGENT_WORKING_DIR, 'Run through working_area.py');
  const directory = fs.mkdtempSync(path.join(process.env.AGENT_WORKING_DIR, 'local-signing-'));
  const script = path.join(directory, 'synthetic.ps1');
  fs.writeFileSync(script, `
    $ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
    . ${quote(path.join(root, 'deployment/intune/Enterprise-Signing.ps1'))}
    $tokens=$null;$errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile(${quote(path.join(root,'deployment/intune/Enterprise-Setup.ps1'))},[ref]$tokens,[ref]$errors)
    foreach($name in @('Get-SetupCertificateProperty','Test-SetupCodeSigningCertificate')) {
      $definition=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq $name},$true)
      . ([scriptblock]::Create($definition.Extent.Text))
    }
    $directory=${quote(directory)};$file=Join-Path $directory 'edge-Install.ps1'
    $body="Write-Output 'synthetic reviewed payload'"
    $certificate=[pscustomobject]@{HasPrivateKey=$true;NotBefore=(Get-Date).AddDays(-1);NotAfter=(Get-Date).AddDays(1);
      EnhancedKeyUsageList=@('1.3.6.1.5.5.7.3.3');Thumbprint=('A'*40);RawData=[byte[]]@(1,2,3,4)}
    $receipt=@{plan=@{signingCertificateThumbprint=('A'*40)};operations=@{};pendingOperation=$null}
    $global:trusted=$true;$global:signatureStatus='Valid';$global:signer=$certificate
    $global:signCalls=0;$global:readCalls=0;$global:saveMode='normal';$global:signMode='normal';$global:policyChecked=$false
    function New-SetupLocalCertificateChain {
      $chain=[pscustomobject]@{ChainPolicy=[Security.Cryptography.X509Certificates.X509ChainPolicy]::new();ChainStatus=@()}
      $chain | Add-Member ScriptMethod Build {
        param($cert)
        if ($this.ChainPolicy.ApplicationPolicy.Count -ne 1 -or $this.ChainPolicy.ApplicationPolicy[0].Value -cne '1.3.6.1.5.5.7.3.3' -or
          [string]$this.ChainPolicy.RevocationMode -cne 'Online' -or [string]$this.ChainPolicy.VerificationFlags -cne 'NoFlag') {throw 'Incorrect chain enforcement'}
        $global:policyChecked=$true
        if(-not $global:trusted) { $this.ChainStatus=@([pscustomobject]@{Status='UntrustedRoot';StatusInformation='PRIVATE UNSAFE ERROR'}) }
        return $global:trusted
      }
      $chain | Add-Member ScriptMethod Dispose {}
      return $chain
    }
    function Save-SetupReceipt {
      param($Receipt,$Directory)
      if($global:saveMode -ceq 'fail') {throw 'Synthetic journal failure'}
      $json=$Receipt|ConvertTo-Json -Depth 40
      if($global:saveMode -ceq 'tamper') {$json=$json.Replace('Pending','Wrong')}
      [IO.File]::WriteAllText((Join-Path $Directory 'receipt.json'),$json)
    }
    function Get-AuthenticodeSignature {
      param($LiteralPath)
      $global:readCalls++
      @{Status=$global:signatureStatus;SignerCertificate=$global:signer;StatusMessage='PRIVATE UNSAFE ERROR'}
    }
    function Set-AuthenticodeSignature {
      param($LiteralPath,$Certificate,$HashAlgorithm)
      $global:signCalls++
      $disk=[IO.File]::ReadAllText((Join-Path $directory 'receipt.json'))|ConvertFrom-Json -AsHashtable
      if($disk.operations['LocalSign-edge-Install.ps1'].state -cne 'Pending' -or -not $disk.operations['LocalSign-edge-Install.ps1'].unsignedHash) {throw 'Missing durable signing journal'}
      if($HashAlgorithm -cne 'SHA256') {throw 'Unexpected digest'}
      [IO.File]::AppendAllText($LiteralPath,"\r\n# SIG # Begin signature block\r\n# U3ludGhldGlj\r\n# SIG # End signature block\r\n")
      if($global:signMode -ceq 'untrusted') {$global:signatureStatus='UnknownError';$global:trusted=$false}
      if($global:signMode -ceq 'throw') {throw 'PRIVATE SIGNER ERROR'}
      # Deliberately unreliable return value: only independent readback is authoritative.
      return @{Status='UnknownError'}
    }
    function Sign {Invoke-SetupLocalSign -Path $file -Certificate $certificate -Receipt $receipt -Directory $directory -ExpectedContent $body}
    function Legacy {[IO.File]::WriteAllText($file,$body+"\r\n# SIG # Begin signature block\r\n# U3ludGhldGlj\r\n# SIG # End signature block\r\n")}
    ${source}
  `);
  const result = spawnSync('pwsh', ['-NoProfile','-NonInteractive','-File',script], {encoding:'utf8',windowsHide:true});
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout+'\n'+result.stderr);
  const line = result.stdout.split(/\r?\n/).findLast(value => value.startsWith('RESULT:'));
  assert.ok(line, result.stdout);
  return JSON.parse(line.slice(7));
}

test('trusted signing preflights code-signing chain and journals before independent signature verification', () => {
  const result = scenario(`Sign; Write-Output ('RESULT:'+(@{state=$receipt.operations['LocalSign-edge-Install.ps1'].state;signs=$global:signCalls;reads=$global:readCalls;policy=$global:policyChecked;pending=$receipt.pendingOperation;hash=$receipt.operations['LocalSign-edge-Install.ps1'].signedHash}|ConvertTo-Json -Compress))`);
  assert.equal(result.state, 'Confirmed'); assert.equal(result.signs, 1); assert.ok(result.reads >= 2);
  assert.equal(result.policy, true); assert.equal(result.pending, null); assert.match(result.hash,/^[A-F0-9]{64}$/);
});

test('UntrustedRoot and certificate eligibility fail before any file or signing mutation', () => {
  const result = scenario(`$failures=@();foreach($mode in @('trust','private','future','expired','eku')) {
    $global:trusted=$true;$certificate.HasPrivateKey=$true;$certificate.NotBefore=(Get-Date).AddDays(-1);$certificate.NotAfter=(Get-Date).AddDays(1);$certificate.EnhancedKeyUsageList=@('1.3.6.1.5.5.7.3.3')
    switch($mode){trust{$global:trusted=$false} private{$certificate.HasPrivateKey=$false} future{$certificate.NotBefore=(Get-Date).AddDays(1)} expired{$certificate.NotAfter=(Get-Date).AddDays(-1)} eku{$certificate.EnhancedKeyUsageList=@('1.3.6.1.5.5.7.3.1')}}
    try{Sign;throw 'Accepted invalid certificate'}catch{if($_.Exception.Message -ceq 'Accepted invalid certificate'){throw};$failures+= $_.Exception.Message}
  };Write-Output ('RESULT:'+(@{errors=$failures;signs=$global:signCalls;exists=[IO.File]::Exists($file)}|ConvertTo-Json -Compress))`);
  assert.equal(result.signs,0); assert.equal(result.exists,false); assert.equal(result.errors.length,5);
  assert.match(result.errors[0],/UntrustedRoot/); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('journal failure or wrong durable readback never reaches signing and leaves recoverable unsigned bytes', () => {
  for (const mode of ['fail','tamper']) {
    const result=scenario(`$global:saveMode='${mode}';$rejected=$false;try{Sign}catch{$rejected=$true};Write-Output ('RESULT:'+(@{rejected=$rejected;signs=$global:signCalls;body=[IO.File]::ReadAllText($file)}|ConvertTo-Json -Compress))`);
    assert.equal(result.rejected,true); assert.equal(result.signs,0); assert.equal(result.body,"Write-Output 'synthetic reviewed payload'");
  }
});

test('legacy valid signed partial reconciles exact reviewed body and pinned signer without signing again', () => {
  const result=scenario(`Legacy;$before=Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($file));Sign;Sign;Write-Output ('RESULT:'+(@{state=$receipt.operations['LocalSign-edge-Install.ps1'].state;signs=$global:signCalls;unchanged=($before -ceq (Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($file))))}|ConvertTo-Json -Compress))`);
  assert.deepEqual(result,{state:'Reconciled',signs:0,unchanged:true});
});

test('untrusted legacy partial remains byte-identical and reconciles only after externally approved trust', () => {
  const result=scenario(`Legacy;$before=Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($file));$global:trusted=$false;$rejected=$false;try{Sign}catch{$rejected=$true};$untouched=($before -ceq (Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($file))));$global:trusted=$true;Sign;Write-Output ('RESULT:'+(@{rejected=$rejected;untouched=$untouched;signs=$global:signCalls;state=$receipt.operations['LocalSign-edge-Install.ps1'].state}|ConvertTo-Json -Compress))`);
  assert.deepEqual(result,{rejected:true,untouched:true,signs:0,state:'Reconciled'});
});

test('legacy body drift, signer drift, untrusted signature and unsigned partial are preserved and rejected', () => {
  for (const mode of ['body','signer','untrusted','unsigned']) {
    const result=scenario(`Legacy;switch('${mode}') {
      body{[IO.File]::WriteAllText($file,([IO.File]::ReadAllText($file)).Replace('reviewed','modified'))}
      signer{$global:signer=[pscustomobject]@{Thumbprint=('B'*40);RawData=[byte[]]@(7,8)}}
      untrusted{$global:signatureStatus='UnknownError'} unsigned{$global:signatureStatus='NotSigned';[IO.File]::WriteAllText($file,$body)}
    };$before=Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($file));$rejected=$false;try{Sign}catch{$rejected=$true};Write-Output ('RESULT:'+(@{rejected=$rejected;signs=$global:signCalls;unchanged=($before -ceq (Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($file))))}|ConvertTo-Json -Compress))`);
    assert.deepEqual(result,{rejected:true,signs:0,unchanged:true},mode);
  }
});

test('confirmed signed hash drift hard-stops even when the independent signature would be valid', () => {
  const result=scenario(`Sign;[IO.File]::AppendAllText($file,"\r\n");$before=Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($file));$rejected=$false;try{Sign}catch{$rejected=$true};Write-Output ('RESULT:'+(@{rejected=$rejected;signs=$global:signCalls;unchanged=($before -ceq (Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($file))))}|ConvertTo-Json -Compress))`);
  assert.deepEqual(result,{rejected:true,signs:1,unchanged:true});
});

test('immutable plan, certificate bytes and expected reviewed payload cannot drift on continuation', () => {
  for (const mode of ['plan','certificate','body']) {
    const result=scenario(`Sign;switch('${mode}') {plan{$receipt.plan.signingCertificateThumbprint=('B'*40)} certificate{$certificate.RawData=[byte[]]@(9,8,7)} body{$body="Write-Output 'different reviewed payload'"}};$before=Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($file));$rejected=$false;try{Sign}catch{$rejected=$true};Write-Output ('RESULT:'+(@{rejected=$rejected;signs=$global:signCalls;unchanged=($before -ceq (Get-SetupLocalBytesHash ([IO.File]::ReadAllBytes($file))))}|ConvertTo-Json -Compress))`);
    assert.deepEqual(result,{rejected:true,signs:1,unchanged:true},mode);
  }
});

test('failed signature records only bounded status/chain enums and reconciles after approved trust without re-signing', () => {
  const result=scenario(`$global:signMode='untrusted';$rejected=$false;try{Sign}catch{$rejected=$true};$failed=$receipt|ConvertTo-Json -Depth 30 -Compress;$failedHash=$receipt.operations['LocalSign-edge-Install.ps1'].signedHash;$global:trusted=$true;$global:signatureStatus='Valid';Sign;Write-Output ('RESULT:'+(@{rejected=$rejected;failed=$failed;hash=$failedHash;state=$receipt.operations['LocalSign-edge-Install.ps1'].state;signs=$global:signCalls}|ConvertTo-Json -Compress))`);
  assert.equal(result.rejected,true); assert.equal(result.signs,1); assert.equal(result.state,'Reconciled');
  assert.match(result.hash,/^[A-F0-9]{64}$/); assert.ok(!result.failed.includes('PRIVATE'));
  assert.deepEqual(JSON.parse(result.failed).operations['LocalSign-edge-Install.ps1'].diagnostic,{status:'UnknownError',chainFlags:['UntrustedRoot']});
});

test('local signing code contains no trust installation, unsigned fallback or tenant calls', () => {
  const source=fs.readFileSync(path.join(root,'deployment/intune/Enterprise-Signing.ps1'),'utf8');
  assert.doesNotMatch(source,/Import-Certificate|New-SelfSignedCertificate|X509Store|AllowUnknownCertificateAuthority|NoCheck|Invoke-MgGraphRequest|Invoke-SetupGraph/);
  assert.match(source,/FileMode\]::CreateNew/);
});
