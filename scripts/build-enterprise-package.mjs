import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { ZipArchive } from 'archiver';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIntuneBundle } from './build-intune-bundle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// This is a deployment-tool package, not a repackaged or re-signed extension.
export async function buildEnterprisePackage(outputDir = path.join(root, 'output/enterprise-setup-dev')) {
  outputDir = path.resolve(outputDir);
  await mkdir(outputDir, { recursive: true });
  if ((await readdir(outputDir)).length) throw new Error('Enterprise package output must be empty; preserve prior packages and receipts.');
  for (const file of ['Enterprise-Setup.ps1', 'Enterprise-Endpoint.ps1', 'Enterprise-Launcher.ps1']) {
    await copyFile(path.join(root, 'deployment/intune', file), path.join(outputDir, file));
  }
  await copyFile(path.join(root, 'teams-captions-saver/managed-schema.json'), path.join(outputDir, 'managed-schema.json'));
  await copyFile(path.join(root, 'LICENSE'), path.join(outputDir, 'LICENSE'));
  await copyFile(path.join(root, 'docs/wiki/Deployment-Security-and-Permissions.md'), path.join(outputDir, 'SECURITY-AND-PERMISSIONS.md'));
  for (const [name, browser] of [['profile.json','edge'], ['profile.chrome.json','chrome'], ['profile.local-only.json','edge']]) {
    await copyFile(path.join(root, 'deployment/intune', name), path.join(outputDir, name));
    await buildIntuneBundle({browser, profilePath:path.join(root, 'deployment/intune', name), outputDir:path.join(outputDir, name.replace('.json',''))});
  }
  await writeFile(path.join(outputDir, 'START-HERE.txt'), [
    'Better CaptionKeep administrator setup - development pilot, not tenant-certified.',
    'Extract the complete ZIP, then double-click Start-Setup.cmd.',
    'The launcher checks for supported stable PowerShell 7.6 or newer and offers the official Microsoft install/upgrade path if needed.',
    'The wizard signs in to Microsoft, lets you choose an existing group and browsers,',
    'and asks whether to provision Microsoft 365. It previews changes before approval.',
    'The wizard explains and offers its required Microsoft modules before installing them.',
    'To check a submitted rollout, double-click Check-Status.cmd and choose its receipt.json.',
    'To continue an incomplete setup, double-click Continue-Setup.cmd and choose its receipt.json.',
    'Keep the receipts folder. Assignment submitted is not the same as verified device installation.',
    'Read SECURITY-AND-PERMISSIONS.md before approving privileged changes.',
    'If Windows or your organization blocks unsigned scripts, stop and obtain an approved signed package.',
    'Do not bypass execution policy. Endpoint signing inside the wizard does not sign this downloaded administrator package.',
    'No extension ZIP, credential, transcript, working folder, or Node runtime is included.',
    'Intune script delivery uses Microsoft Graph beta and requires tenant/endpoint pilot testing.',
    ''
  ].join('\n'));
  for (const [name, mode] of [['Start-Setup.cmd','Setup'], ['Check-Status.cmd','Status'], ['Continue-Setup.cmd','Continue']]) {
    await writeFile(path.join(outputDir, name), [
      '@echo off',
      'echo Better CaptionKeep administrator setup - development pilot',
      `powershell.exe -NoLogo -NoProfile -File "%~dp0Enterprise-Launcher.ps1" -Mode ${mode} %*`,
      'set "BCK_SETUP_EXIT=%ERRORLEVEL%"',
      'if not "%BCK_SETUP_EXIT%"=="0" (',
      '  echo Setup stopped before completion. Review the message above and START-HERE.txt.',
      '  echo If Windows blocked scripts, obtain an organization-approved signed package; do not bypass execution policy.',
      '  pause',
      ')',
      'exit /b %BCK_SETUP_EXIT%',
      ''
    ].join('\r\n'));
  }
  const hashes = [];
  async function collect(dir) {
    for (const entry of (await readdir(dir, {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Linked package content is forbidden.');
      if (entry.isDirectory()) await collect(full);
      else if (entry.name !== 'SHA256SUMS.txt') hashes.push(`${createHash('sha256').update(await readFile(full)).digest('hex')}  ${path.relative(outputDir, full).replaceAll('\\','/')}`);
    }
  }
  await collect(outputDir);
  await writeFile(path.join(outputDir, 'SHA256SUMS.txt'), `${hashes.join('\n')}\n`);
  const zipPath = path.join(outputDir, 'better-captionkeep-enterprise-setup.zip');
  const archive = new ZipArchive({zlib:{level:9}});
  const stream = createWriteStream(zipPath, {flags:'wx'});
  const completion = new Promise((resolve,reject)=>{
    stream.on('close',resolve); stream.on('error',reject); archive.on('error',reject);
  });
  archive.pipe(stream);
  for (const name of [...hashes.map(line=>line.slice(66)), 'SHA256SUMS.txt'].sort()) {
    archive.file(path.join(outputDir,name), {name, date:new Date('1980-01-01T00:00:00Z')});
  }
  await archive.finalize();
  await completion;
  return {outputDir, zipPath, fileCount:hashes.length};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildEnterprisePackage(process.argv[2])));
}
