import path from 'node:path';
import {readdir,lstat,readFile,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {ZipArchive} from 'archiver';
import {spawn} from 'node:child_process';

export const ADMIN_SIGNING_PAYLOAD = Object.freeze([
  'BetterCaptionKeep.AdminSetup.NativeHost.dll','BetterCaptionKeep.AdminSetup.NativeHost.exe',
  'BetterCaptionKeep.AdminSetup.dll','BetterCaptionKeep.AdminSetup.exe','Register-NativeHost.ps1',
  ...['Enterprise-Dialogs','Enterprise-Endpoint','Enterprise-Launcher','Enterprise-Runtime','Enterprise-Setup','Enterprise-SignerMigration','Enterprise-Signing'].map(name=>`enterprise/${name}.ps1`),
  ...['profile','profile.chrome','profile.local-only'].flatMap(name=>['detect-managed-policy.ps1','remediate-managed-policy.ps1'].map(file=>`enterprise/${name}/${file}`))
].sort());
export const ADMIN_PUBLIC_SIGNING_PAYLOAD=Object.freeze([
  ...ADMIN_SIGNING_PAYLOAD.filter(name=>!/^enterprise\/profile(?:\.chrome|\.local-only)?\//.test(name)),
  'enterprise/EndpointWorker.exe','enterprise/Enterprise-Win32.ps1'
].sort());

export function signingArguments(file,signing) {
  const names=['metadataPath','signToolPath','dlibPath','profileResourceId','expectedPublisher'];
  for(const name of ['powerShellPath','scriptPath',...names])if(typeof signing[name]!=='string'||!signing[name]||/[\r\n"]/.test(signing[name]))throw Error(`Invalid signing option: ${name}`);
  return ['-NoProfile','-NonInteractive','-File',signing.scriptPath,'-FilePath',file,
    '-MetadataPath',signing.metadataPath,'-SignToolPath',signing.signToolPath,
    '-DlibPath',signing.dlibPath,'-ProfileResourceId',signing.profileResourceId,'-ExpectedPublisher',signing.expectedPublisher];
}
export async function signAdministratorFile(file,signing) {
  if(!process.env.AGENT_WORKING_DIR)throw Error('Managed signing run required.');
  const args=signingArguments(file,signing);
  await new Promise((resolve,reject)=>{const child=spawn(signing.powerShellPath,args,{env:process.env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`Public release signing exited ${code}`)));});
}
export async function administratorSigningPlan(directory) {
  const owned=[];
  async function visit(dir){for(const entry of await readdir(dir)){const full=path.join(dir,entry),stat=await lstat(full);if(stat.isSymbolicLink())throw Error('Linked signing input.');if(stat.isDirectory())await visit(full);else if(entry.endsWith('.ps1')||entry==='EndpointWorker.exe'||/^BetterCaptionKeep\.AdminSetup(?:\.NativeHost)?\.(exe|dll)$/.test(entry))owned.push(full);}}
  await visit(directory);
  const actual=owned.map(file=>path.relative(directory,file).replaceAll('\\','/')).sort();
  const expected=actual.includes('enterprise/EndpointWorker.exe')?ADMIN_PUBLIC_SIGNING_PAYLOAD:ADMIN_SIGNING_PAYLOAD;
  if(actual.length!==expected.length||actual.join('\n')!==expected.join('\n'))throw Error('Signing inputs differ from the reviewed fixed payload budget. No signing request started.');
  return await Promise.all(actual.map(async name=>({path:name,sha256:createHash('sha256').update(await readFile(path.join(directory,name))).digest('hex')})));
}
export async function signAdministratorPayload(directory,signing) {
  const plan=await administratorSigningPlan(directory);
  for(const entry of plan)await signAdministratorFile(path.join(directory,entry.path),signing);
  if(plan.some(entry=>entry.path==='enterprise/EndpointWorker.exe')){const {buildEndpointWin32Package}=await import('./build-endpoint-win32-package.mjs');await buildEndpointWin32Package(path.join(directory,'enterprise'));}
  await refreshSignedEnterprisePackage(path.join(directory,'enterprise'));
}

export async function refreshSignedEnterprisePackage(directory) {
  const inventoryFile=path.join(directory,'SHA256SUMS.txt');
  const prior=(await readFile(inventoryFile,'utf8')).trim().split(/\r?\n/);
  const files=[];
  for(const line of prior){
    const match=/^[a-f0-9]{64}  ([A-Za-z0-9_./-]+)$/.exec(line);
    if(!match||match[1].split('/').some(p=>!p||p==='..'||p==='.')||files.includes(match[1]))throw Error('Unsafe enterprise checksum inventory.');
    files.push(match[1]);
  }
  const hashes=[];
  for(const name of files){const full=path.join(directory,name);if((await lstat(full)).isSymbolicLink())throw Error('Linked enterprise input.');hashes.push(`${createHash('sha256').update(await readFile(full)).digest('hex')}  ${name}`);}
  await writeFile(inventoryFile,hashes.join('\n')+'\n');
  const stream=createWriteStream(path.join(directory,'better-captionkeep-enterprise-setup.zip'),{flags:'w'});
  const archive=new ZipArchive({zlib:{level:9}});
  const completed=new Promise((resolve,reject)=>{stream.on('close',resolve);stream.on('error',reject);archive.on('error',reject);});
  archive.pipe(stream);
  for(const name of [...files,'SHA256SUMS.txt'].sort())archive.file(path.join(directory,name),{name,date:new Date('1980-01-01T00:00:00Z')});
  await archive.finalize();await completed;
}
