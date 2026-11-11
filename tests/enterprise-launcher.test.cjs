const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');
const engine = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const available = !spawnSync(engine, ['-NoLogo','-NoProfile','-Command','exit 0'], {windowsHide:true}).error;
const psQuote = text => `'${text.replaceAll("'", "''")}'`;

async function temporary(t) {
  const parent = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(parent, 'captionkeep-launcher-'));
  t.after(async () => {
    const real = await fs.realpath(directory);
    assert(real.startsWith(parent + path.sep) && path.basename(real).startsWith('captionkeep-launcher-'));
    await fs.rm(real, {recursive:true, force:true});
  });
  return directory;
}

async function runFixture(t, body) {
  const directory = await temporary(t);
  await fs.writeFile(path.join(directory,'Enterprise-Setup.ps1'),'# synthetic backend; never executed\n');
  await fs.writeFile(path.join(directory,'receipt.json'),'{}');
  const script = path.join(directory,'test.ps1');
  await fs.writeFile(script, `. ${psQuote(path.join(root,'deployment/intune/Enterprise-Launcher.ps1'))}\n$fixtureRoot=${psQuote(directory)}\n${body}\n`, 'utf8');
  const result = spawnSync(engine,['-NoLogo','-NoProfile','-File',script],{encoding:'utf8',windowsHide:true,timeout:20000});
  assert.equal(result.status,0,result.stderr || result.stdout);
  const line = result.stdout.split(/\r?\n/).find(value => value.startsWith('LAUNCHER_RESULT:'));
  assert(line,result.stdout);
  return JSON.parse(line.slice('LAUNCHER_RESULT:'.length));
}

test('status and continue route an existing receipt to the backend without invoking tenant work', {skip:!available}, async t => {
  const result = await runFixture(t, `
function Request-SetupPowerShell { return 'synthetic-engine' }
function Invoke-SetupChild { param($Engine,$Arguments); $script:captured=@($Arguments); return 0 }
$results=@()
foreach($mode in @('Status','Continue')) {
  $code=Invoke-EnterpriseLauncher -Mode $mode -PackageRoot $fixtureRoot -ReceiptPath (Join-Path $fixtureRoot 'receipt.json')
  $results+=@{mode=$mode;code=$code;arguments=$script:captured}
}
Write-Output ('LAUNCHER_RESULT:'+($results|ConvertTo-Json -Depth 5 -Compress))`);
  assert.equal(result[0].code,0); assert.equal(result[1].code,0);
  assert(result[0].arguments.includes('-StatusReceipt'));
  assert(result[1].arguments.includes('-ResumeReceipt'));
  assert(result.every(item => item.arguments.some(argument => argument.endsWith('receipt.json'))));
});

test('missing PowerShell offers official instructions and never launches setup', {skip:!available}, async t => {
  const result = await runFixture(t, `
function Find-SetupPowerShell { return $null }
function Read-Host { return '2' }
function Start-Process { param($FilePath); $script:opened=$FilePath }
$enginePath=Request-SetupPowerShell
Write-Output ('LAUNCHER_RESULT:'+(@{missing=($null -eq $enginePath);opened=$script:opened}|ConvertTo-Json -Compress))`);
  assert.equal(result.missing,true);
  assert.equal(result.opened,'https://learn.microsoft.com/powershell/scripting/install/install-powershell-on-windows');
});

test('approved prerequisite installation invokes only the exact official WinGet package', {skip:!available || process.platform!=='win32'}, async t => {
  const result = await runFixture(t, `
$fake=Join-Path $fixtureRoot 'winget.cmd'
$fakeSource=@'
@echo off
echo %* > "%BCK_WINGET_ARGS%"
exit /b 0
'@
Set-Content -LiteralPath $fake -Value $fakeSource -Encoding Ascii
$env:BCK_WINGET_ARGS=Join-Path $fixtureRoot 'winget-args.txt'
$script:findCount=0
function Find-SetupPowerShell { param([switch]$IncludeUnsupported); if($IncludeUnsupported){return $null}; $script:findCount++; if($script:findCount -gt 1){return 'installed-synthetic-engine'}; return $null }
function Read-Host { return '1' }
function Get-Command { param($Name,$CommandType,$ErrorAction); return [PSCustomObject]@{Source=$fake} }
$resolved=Request-SetupPowerShell
$arguments=(Get-Content -LiteralPath $env:BCK_WINGET_ARGS -Raw).Trim()
Write-Output ('LAUNCHER_RESULT:'+(@{resolved=$resolved;arguments=$arguments}|ConvertTo-Json -Compress))`);
  assert.equal(result.resolved,'installed-synthetic-engine');
  assert.equal(result.arguments,'install --id Microsoft.PowerShell --exact --source winget');
});

test('invalid or cancelled receipt selection cannot reach the backend', {skip:!available}, async t => {
  const result = await runFixture(t, `
$script:childCalled=$false
function Invoke-SetupChild { $script:childCalled=$true; return 0 }
$rejected=$false
try { Invoke-EnterpriseLauncher -Mode Continue -PackageRoot $fixtureRoot -ReceiptPath (Join-Path $fixtureRoot 'missing.json') | Out-Null } catch { $rejected=$true }
$backupRejected=$false
Copy-Item (Join-Path $fixtureRoot 'receipt.json') (Join-Path $fixtureRoot 'backup.json')
try { Invoke-EnterpriseLauncher -Mode Continue -PackageRoot $fixtureRoot -ReceiptPath (Join-Path $fixtureRoot 'backup.json') | Out-Null } catch { $backupRejected=$true }
function Select-SetupReceipt { return $null }
$cancel=Invoke-EnterpriseLauncher -Mode Status -PackageRoot $fixtureRoot
Write-Output ('LAUNCHER_RESULT:'+(@{rejected=$rejected;backupRejected=$backupRejected;cancel=$cancel;child=$script:childCalled}|ConvertTo-Json -Compress))`);
  assert.deepEqual(result,{rejected:true,backupRejected:true,cancel:2,child:false});
});

test('enterprise package includes the guided entry points and excludes customer records', async t => {
  const directory = await temporary(t);
  const output = path.join(directory,'package');
  const {buildEnterprisePackage} = await import(pathToFileURL(path.join(root,'scripts/build-enterprise-package.mjs')));
  const result = await buildEnterprisePackage(output);
  assert(result.zipPath.startsWith(directory+path.sep));
  const names = await fs.readdir(output);
  for (const name of ['Start-Setup.cmd','Check-Status.cmd','Continue-Setup.cmd','Enterprise-Launcher.ps1','LICENSE','SHA256SUMS.txt']) assert(names.includes(name));
  assert(!names.includes('receipts') && !names.includes('working'));
  assert.match(await fs.readFile(path.join(output,'Start-Setup.cmd'),'utf8'),/powershell\.exe.*Enterprise-Launcher\.ps1.*-Mode Setup/);
  assert.match(await fs.readFile(path.join(output,'Check-Status.cmd'),'utf8'),/-Mode Status/);
  assert.match(await fs.readFile(path.join(output,'Continue-Setup.cmd'),'utf8'),/-Mode Continue/);
  assert.match(await fs.readFile(path.join(output,'SHA256SUMS.txt'),'utf8'),/  Enterprise-Launcher\.ps1/);
  assert.equal(await fs.readFile(path.join(output,'LICENSE'),'utf8'),await fs.readFile(path.join(root,'LICENSE'),'utf8'));
  await assert.rejects(buildEnterprisePackage(output),/must be empty/);
});
