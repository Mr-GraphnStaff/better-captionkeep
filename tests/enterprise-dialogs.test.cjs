const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const quote = text => `'${text.replaceAll("'", "''")}'`;

test('Azure signer amendment has an explicit approval action and preserves cancellation', async () => {
  const source = await fs.readFile(path.join(root,'deployment/intune/Enterprise-Dialogs.ps1'),'utf8');
  const branch = source.match(/elseif\(\$Prompt -like 'Type SWITCH SIGNER\*'\)\{([^\n]+)\}/)?.[1];
  assert(branch, 'reviewed provider amendment must have a dedicated graphical action');
  assert.match(branch, /\$approvedAnswer='SWITCH SIGNER'/);
  assert.match(branch, /\$acceptText='Use Azure Artifact Signing'/);
  assert.match(branch, /paid signing effects/);
  assert.match(source, /if\(\$window\.ShowDialog\(\) -ne \$true\)\{throw \[OperationCanceledException\]/);
  assert.match(source, /if\(\$approvedAnswer\)\{return \$approvedAnswer\}/);
});

test('dialog adapter preserves console answers and prevents an implicit graphical cancellation approval', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bck-dialogs-'));
  // Managed launcher redirects os.tmpdir() inside working/. Retain failed fixtures.
  const script = path.join(directory, 'fixture.ps1');
  await fs.writeFile(script, `. ${quote(path.join(root,'deployment/intune/Enterprise-Dialogs.ps1'))}\nfunction Read-Host { param($Prompt) 'explicit-answer' }\n$answer=Read-SetupAnswer 'Synthetic prompt'\nif($answer -cne 'explicit-answer'){throw 'Console answer changed'}\nWrite-Output 'PASS'\n`);
  const result = spawnSync('pwsh',['-NoProfile','-File',script],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/PASS/);
  const source = await fs.readFile(path.join(root,'deployment/intune/Enterprise-Dialogs.ps1'),'utf8');
  assert.match(source,/OperationCanceledException/);
  assert.match(source,/Approve these changes/);
  assert.match(source,/Deploy to selected group/);
});
