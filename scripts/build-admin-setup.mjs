import path from 'node:path';
import { mkdir, readdir, readFile, writeFile, lstat, copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { ZipArchive } from 'archiver';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildEnterprisePackage } from './build-enterprise-package.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function run(command, args, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

// Invoke with the owner's managed launcher: all compiler/NuGet intermediates
// stay in that managed run. Only the deliberate desktop package goes to Dev.
export async function buildAdministratorSetup(outputDirectory, {signing, archive = true, publicDelivery = true} = {}) {
  if (!process.env.AGENT_WORKING_DIR) throw new Error('Use working_area.py run for this build.');
  const output = path.resolve(outputDirectory || path.join(root, 'Dev', 'administrator-setup'));
  const dev = path.join(root, 'Dev') + path.sep;
  if (!output.startsWith(dev)) throw new Error('Administrator candidate output must be under Dev/.');
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new Error('Output must be empty; preserve previous builds.');
  const working = process.env.AGENT_WORKING_DIR;
  const env = { ...process.env,
    DOTNET_CLI_HOME: path.join(working, 'cache', 'dotnet'),
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false', DOTNET_ADD_GLOBAL_TOOLS_TO_PATH: 'false',
    NUGET_PACKAGES: path.join(root, 'working', 'cache', 'nuget'),
    NUGET_HTTP_CACHE_PATH: path.join(working, 'cache', 'nuget-http'),
    NUGET_PLUGINS_CACHE_PATH: path.join(working, 'cache', 'nuget-plugins') };
  await run(process.env.BCK_DOTNET || 'dotnet', ['publish', 'admin-setup/src/BetterCaptionKeep.AdminSetup/BetterCaptionKeep.AdminSetup.csproj',
    '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true',
    '--artifacts-path', path.join(working, 'compiler'), '-o', output], env);
  await run(process.env.BCK_DOTNET || 'dotnet', ['publish', 'admin-setup/src/BetterCaptionKeep.AdminSetup.NativeHost/BetterCaptionKeep.AdminSetup.NativeHost.csproj',
    '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true',
    '--artifacts-path', path.join(working, 'compiler'), '-o', output], env);
  let endpointWorkerPath;
  if(publicDelivery){
    const workerOutput=path.join(working,'endpoint-worker-publish');
    await run(process.env.BCK_DOTNET || 'dotnet',['publish','admin-setup/src/BetterCaptionKeep.EndpointWorker/BetterCaptionKeep.EndpointWorker.csproj',
      '-c','Release','-r','win-x64','--self-contained','true','-p:PublishSingleFile=true','--artifacts-path',path.join(working,'compiler'),'-o',workerOutput],env);
    endpointWorkerPath=path.join(workerOutput,'EndpointWorker.exe');
  }
  await buildEnterprisePackage(path.join(output, 'enterprise'),{publicDelivery,endpointWorkerPath,contentPrepPath:process.env.BCK_INTUNE_CONTENT_PREP});
  await copyFile(path.join(root, 'admin-setup/packaging/Register-NativeHost.ps1'), path.join(output, 'Register-NativeHost.ps1'));
  await writeFile(path.join(output, 'native-host-manifest.template.json'), JSON.stringify(createNativeHostManifest('__NATIVE_HOST_EXE__'), null, 2) + '\n');
  await writeFile(path.join(output, 'Register-Browser-Integration.cmd'), [
    '@echo off',
    '"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoLogo -NoProfile -File "%~dp0Register-NativeHost.ps1" -PackageDirectory "%~dp0."',
    'if errorlevel 1 (',
    '  echo Browser integration was not completed. Preserve the recovery receipt shown above.',
    '  pause',
    '  exit /b 1',
    ')',
    'echo Browser integration registered for your Windows account. Return to Better CaptionKeep and retry Open administrator setup.',
    'pause', ''
  ].join('\r\n'));
  await writeFile(path.join(output, 'START-HERE.txt'), [
    'Better CaptionKeep administrator setup — Development candidate',
    'Open BetterCaptionKeep.AdminSetup.exe, then choose Set up Microsoft 365.',
    publicDelivery ? 'Use the Windows installer to connect the browser automatically, then return to Better CaptionKeep and choose Continue setup.' : 'To open setup from the browser extension, double-click Register-Browser-Integration.cmd once for your Windows account.',
    'Registration supports Brave, Chrome and Edge without elevation. It preserves previous native-host registry values in a recovery receipt.',
    'Keep this extracted folder in place after registration. Moving it requires registration again.',
    'Choose browsers, sign in with your work administrator account, and choose an existing deployment group.',
    'Review the organization-wide Teams/consent effects before approving. Setup never transcribes a meeting.',
    publicDelivery ? 'The endpoint app is publisher-signed at release. Administrators need Microsoft work sign-in and Intune permissions; no Azure subscription, signing account or private signing configuration is required.' : 'Device scripts require an organization-trusted code-signing certificate. Unsigned scripts are an explicit pilot option only.',
    'Keep the receipt folder shown by setup. Use Check deployment status or Continue saved setup with its receipt.json.',
    publicDelivery ? 'Assigned means Intune accepted the rollout. Intune app success confirms policy configuration; browser Store installation and employee sign-in require separate verification.' : 'Assigned means Intune accepted the rollout; device installation and employee sign-in require verification.',
    signing ? 'This package uses Azure Artifact Signing. Live tenant acceptance remains separate. Do not bypass Windows or organizational execution policy.' : 'This candidate is unsigned and has not passed live tenant acceptance. Do not bypass Windows or organizational execution policy.',
    'The package includes the Windows desktop runtime. PowerShell prerequisites are explained and require your approval.',
    'Read enterprise/SECURITY-AND-PERMISSIONS.md before approving privileged changes.', ''
  ].join('\r\n'));
  if (signing) {
    const {signAdministratorPayload} = await import('./sign-admin-payload.mjs');
    await signAdministratorPayload(output, signing);
  }
  return await finalizeAdministratorSetupPackage(output, {signed: Boolean(signing), archive});
}

export async function finalizeAdministratorSetupPackage(directory, {signed = false, archive = true} = {}) {
  if (!process.env.AGENT_WORKING_DIR) throw new Error('Use working_area.py run for package finalization.');
  const output = path.resolve(directory);
  if (!output.startsWith(path.join(root, 'Dev') + path.sep)) throw new Error('Administrator candidate output must be under Dev/.');
  const inventory = [];
  async function collect(directory) {
    for (const name of (await readdir(directory)).sort()) {
      const full = path.join(directory, name);
      const stat = await lstat(full);
      if (stat.isSymbolicLink()) throw new Error('Linked package files are forbidden.');
      if (stat.isDirectory()) await collect(full);
      else if (full !== path.join(output, 'package-manifest.json')) inventory.push({ path: path.relative(output, full).replaceAll('\\', '/'),
        sha256: createHash('sha256').update(await readFile(full)).digest('hex') });
    }
  }
  await collect(output);
  await writeFile(path.join(output, 'package-manifest.json'), JSON.stringify({
    schemaVersion: 1, channel: 'Development', signed, liveAcceptance: 'not-run',
    entryPoint: 'BetterCaptionKeep.AdminSetup.exe', files: inventory
  }, null, 2) + '\n');
  const archived = archive ? await archiveAdministratorSetup(output) : {};
  return { output, entryPoint: path.join(output, 'BetterCaptionKeep.AdminSetup.exe'), files: inventory.length, ...archived };
}

export function createNativeHostManifest(hostPath) {
  return { name: 'com.daftech.bettercaptionkeep.adminsetup',
    description: 'Launches Better CaptionKeep administrator setup', path: hostPath, type: 'stdio',
    allowed_origins: [
      'chrome-extension://pjpibiimicedkckleehljlklmblkacph/',
      'chrome-extension://ecpjboeanaehianibdbgijldbikdgkhm/',
      'chrome-extension://edefcbdhahfolgkoamkbknjppojpaffk/',
      'chrome-extension://nabjdlnkkaonnbnimnmnhjcbigceebml/'
    ] };
}

export async function archiveAdministratorSetup(directory) {
  const output = path.resolve(directory);
  if (!output.startsWith(path.join(root, 'Dev') + path.sep)) throw new Error('Only a Dev candidate can be archived.');
  const manifest = JSON.parse(await readFile(path.join(output, 'package-manifest.json'), 'utf8'));
  for (const required of ['BetterCaptionKeep.AdminSetup.exe', 'BetterCaptionKeep.AdminSetup.NativeHost.exe',
    'BetterCaptionKeep.AdminSetup.NativeHost.dll', 'BetterCaptionKeep.AdminSetup.NativeHost.runtimeconfig.json',
    'Register-NativeHost.ps1', 'Register-Browser-Integration.cmd']) {
    if (!manifest.files.some(file => file.path === required)) throw new Error(`Incomplete browser handoff package: ${required}`);
  }
  const names = new Set();
  for (const entry of manifest.files) {
    const full = path.resolve(output, entry.path);
    if (!full.startsWith(output + path.sep) || names.has(entry.path) || /(^|\/)(working|receipts|operations|\.git)(\/|$)/i.test(entry.path)) {
      throw new Error('Unsafe package inventory.');
    }
    names.add(entry.path);
    if ((await lstat(full)).isSymbolicLink()) throw new Error('Linked package input.');
    const actual = createHash('sha256').update(await readFile(full)).digest('hex');
    if (actual !== entry.sha256) throw new Error(`Package changed: ${entry.path}`);
  }
  names.add('package-manifest.json');
  const zipPath = `${output}.zip`;
  const stream = createWriteStream(zipPath, { flags: 'wx' });
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const completed = new Promise((resolve, reject) => {
    stream.on('close', resolve); stream.on('error', reject); archive.on('error', reject);
  });
  archive.pipe(stream);
  for (const name of [...names].sort()) archive.file(path.join(output, name), { name, date: new Date('1980-01-01T00:00:00Z') });
  await archive.finalize();
  await completed;
  const sha256 = createHash('sha256').update(await readFile(zipPath)).digest('hex');
  await writeFile(`${zipPath}.sha256`, `${sha256}  ${path.basename(zipPath)}\n`, { flag: 'wx' });
  return { zipPath, sha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildAdministratorSetup(process.argv[2])));
}
