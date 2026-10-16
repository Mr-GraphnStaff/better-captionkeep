import path from 'node:path';
import {lstat,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {NATIVE_HOST_NAME} from './enrollment.mjs';
import {contracts} from './helper.mjs';
import {createInstallPlan} from './install-plan.mjs';

const require=createRequire(import.meta.url),runtime=require('../../teams-captions-saver/byomcpRuntimeAdapter.js');
const SYSTEM='S-1-5-18',ADMINS='S-1-5-32-544';
const TRUSTED_INSTALLER='S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464';
const hash=value=>createHash('sha256').update(value).digest('hex');
const samePath=(a,b)=>a.toLowerCase()===b.toLowerCase();
const fail=code=>{throw Object.assign(new Error(code),{code});};
const CODES=new Set(['invalid-installation','unsupported-registration','unsafe-path','unsafe-filesystem','unsafe-permissions',
  'invalid-manifest','invalid-launcher','invalid-configuration','registration-conflict','registration-changed',
  'registration-failed','rollback-failed','ownership-unverified','os-unavailable']);

function localPath(value) {
  if(typeof value!=='string' || value.length>1024 || !/^[a-z]:\\/i.test(value)
    || /[\u0000-\u001f\u007f"%&|<>^!:]/.test(value.slice(2))
    || value.split('\\').some(part=>part==='..' || part==='.' || /[. ]$/.test(part)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail('unsafe-path');
  return path.win32.normalize(value);
}
function within(root,filename) {
  const relative=path.win32.relative(root,filename);
  return relative && !relative.startsWith('..') && !path.win32.isAbsolute(relative);
}
function optionsFor(input) {
  if(!input || !['chrome','edge','firefox','brave','opera'].includes(input.browser)) fail('invalid-installation');
  // Brave and Opera use the Chrome convention only after the caller has checked
  // that convention against its installed browser. No speculative vendor key.
  if(['brave','opera'].includes(input.browser) && input.registrationConvention!=='chrome') fail('unsupported-registration');
  const browser=input.browser,convention=['brave','opera'].includes(browser)?'chrome':browser;
  const value={browser,convention,extensionId:input.extensionId,
    view:input.view??'Registry64',root:localPath(input.root),
    nodePath:localPath(input.nodePath),cliPath:localPath(input.cliPath),
    configurationPath:localPath(input.configurationPath),launcherPath:localPath(input.launcherPath),manifestPath:localPath(input.manifestPath)};
  if(!['Registry32','Registry64'].includes(value.view) || value.root===path.win32.parse(value.root).root) fail('invalid-installation');
  for(const key of ['configurationPath','launcherPath','manifestPath']) if(!within(value.root,value[key])) fail('unsafe-path');
  value.plan=createInstallPlan({...value,browser:convention,os:'windows'});
  return value;
}
function assertAcl(acl,{privateFile=false,protectedDirectory=false,ancestor=false}={}) {
  // Windows domain/local users and Entra-joined Windows users have different
  // SID authorities. Both must come from the actual local OS identity adapter.
  if(!acl || !/^S-1-(?:5-21|12-1)-\d+-\d+-\d+-\d+$/.test(acl.currentSid??'') || !Array.isArray(acl.allow)) fail('unsafe-permissions');
  const trusted=new Set([acl.currentSid,SYSTEM,ADMINS,TRUSTED_INSTALLER]);
  if(!trusted.has(acl.owner) || privateFile && acl.owner!==acl.currentSid || protectedDirectory && acl.protected!==true) fail('unsafe-permissions');
  for(const entry of acl.allow) {
    // Inherit-only entries apply to descendants, not this inspected object.
    // Each actual descendant on the installation path is checked separately.
    if(entry.inheritOnly===true) continue;
    // Creating a sibling beneath C:\ is not permission to replace this existing
    // owner-controlled directory. Delete-child/delete/ACL-change rights are.
    if(!trusted.has(entry.sid) && (privateFile || (ancestor?entry.replace??entry.write:entry.write)===true)) fail('unsafe-permissions');
  }
}
async function inspectPath(filename,io,{file=false,privateFile=false}={}) {
  // Every ancestor is checked: an innocuous immediate parent can live below a junction.
  for(let current=filename;;current=path.win32.dirname(current)) {
    const metadata=await io.inspect(current);
    if(metadata.isSymbolicLink() || (current===filename && file?!metadata.isFile():!metadata.isDirectory())) fail('unsafe-filesystem');
    assertAcl(await io.acl(current),{privateFile:current===filename && privateFile,ancestor:current!==filename});
    if(path.win32.dirname(current)===current) break;
  }
}
async function boundedRead(filename,io) {
  const metadata=await io.inspect(filename);
  if(metadata.size>131072) fail('invalid-installation');
  const text=await io.read(filename);
  if(typeof text!=='string' || Buffer.byteLength(text)>131072) fail('invalid-installation');
  return text;
}
async function validateInstallation(input,io) {
  const value=optionsFor(input);
  for(const drive of new Set(['root','nodePath','cliPath'].map(key=>path.win32.parse(value[key]).root))) {
    if(await io.volume(drive)!=='Fixed') fail('unsafe-filesystem');
  }
  await inspectPath(value.root,io,{privateFile:true});
  assertAcl(await io.acl(value.root),{privateFile:true,protectedDirectory:true});
  for(const key of ['nodePath','cliPath','configurationPath','launcherPath','manifestPath']) {
    await inspectPath(value[key],io,{file:true,privateFile:['configurationPath','launcherPath','manifestPath'].includes(key)});
  }
  const manifestText=await boundedRead(value.manifestPath,io),launcher=await boundedRead(value.launcherPath,io);
  let manifest,config;
  try {manifest=JSON.parse(manifestText);config=JSON.parse(await boundedRead(value.configurationPath,io));} catch {fail('invalid-configuration');}
  if(JSON.stringify(manifest)!==JSON.stringify(value.plan.manifest)) {
    // Property order is not security-relevant; the exact keys and values are.
    const expected=value.plan.manifest;
    if(Object.keys(manifest??{}).sort().join('|')!==Object.keys(expected).sort().join('|')
      || Object.keys(expected).some(key=>JSON.stringify(manifest[key])!==JSON.stringify(expected[key]))) fail('invalid-manifest');
  }
  if(launcher!==value.plan.launcher) fail('invalid-launcher');
  if(!config || Object.keys(config).filter(key=>key!=='oauthStorePath').sort().join('|')!=='browserConfiguration|browserStoragePath|enabled|verificationTools'
    || config.enabled!==true || !Array.isArray(config.verificationTools)) fail('invalid-configuration');
  localPath(config.browserStoragePath);
  if(config.oauthStorePath!==undefined) {
    const store=localPath(config.oauthStorePath);
    if(!within(value.root,store)) fail('unsafe-path');
    // Never read credential bytes. If the store exists, inspect only its ACL and metadata.
    try {await inspectPath(store,io,{file:true,privateFile:true});} catch(error) {if(error.code!=='ENOENT') throw error;}
  }
  const caller=value.browser==='firefox'?value.extensionId:`chrome-extension://${value.extensionId}/`;
  try {await runtime.validateConfiguration(config.browserConfiguration,{contracts,browserTarget:value.browser,caller});}
  catch {fail('invalid-configuration');}
  return {...value,manifestHash:hash(manifestText),profileCount:config.browserConfiguration.profiles.length};
}

// Read-only, bounded diagnostic: never returns paths, callers, profiles, URLs,
// arbitrary OS error messages or credential material to a UI/log.
export async function inspectWindowsInstallation(input,{io=createWindowsInstallerIo()}={}) {
  try {
    const value=await validateInstallation(input,io),current=await io.registryRead(value.plan.windowsRegistry.key,value.view);
    return {valid:true,registration:current===null?'missing':samePath(current,value.manifestPath)?'matches':'conflict',
      browser:value.browser,view:value.view,profileCount:value.profileCount,credentialsRead:false};
  } catch(error) {return {valid:false,reason:CODES.has(error.code??error.message)?error.code??error.message:'invalid-installation',credentialsRead:false};}
}

// Bounded installer increment: repairs registration for existing validated files.
// Does not copy packages, change ACLs, merge profiles, launch MCPs or authenticate.
export async function repairWindowsRegistration(input,{io=createWindowsInstallerIo(),confirmed=false}={}) {
  if(confirmed!==true) fail('ownership-unverified');
  const value=await validateInstallation(input,io),key=value.plan.windowsRegistry.key;
  const previous=await io.registryRead(key,value.view);
  // Never replace a registration belonging to another installation automatically.
  if(previous!==null && !samePath(previous,value.manifestPath)) fail('registration-conflict');
  if(previous!==null) return {changed:false,browser:value.browser,view:value.view,registered:true};
  // Check again immediately before mutation; no browser/config content is written.
  await validateInstallation(input,io);
  if(await io.registryRead(key,value.view)!==null) fail('registration-changed');
  try {
    await io.registryWrite(key,value.view,value.manifestPath);
    if(await io.registryRead(key,value.view)!==value.manifestPath) fail('registration-failed');
  } catch {
    try {
      const current=await io.registryRead(key,value.view);
      if(current!==null && current!==value.manifestPath) fail('registration-changed');
      if(current!==null) await io.registryRemove(key,value.view);
      if(await io.registryRead(key,value.view)!==null) fail('rollback-failed');
    } catch {fail('rollback-failed');}
    fail('registration-failed');
  }
  return {changed:true,browser:value.browser,view:value.view,registered:true,
    receipt:{version:1,hostName:NATIVE_HOST_NAME,browser:value.browser,view:value.view,manifestPath:value.manifestPath,manifestHash:value.manifestHash,previous:null}};
}

// Removes only this increment's unchanged default value, not the registry key,
// package/configuration, credentials or any pre-existing registration.
export async function removeWindowsRegistration(input,receipt,{io=createWindowsInstallerIo(),confirmed=false}={}) {
  if(confirmed!==true) fail('ownership-unverified');
  const value=await validateInstallation(input,io);
  if(!receipt || Object.keys(receipt).sort().join('|')!=='browser|hostName|manifestHash|manifestPath|previous|version|view'
    || receipt.version!==1 || receipt.hostName!==NATIVE_HOST_NAME || receipt.previous!==null
    || receipt.browser!==value.browser || receipt.view!==value.view || receipt.manifestPath!==value.manifestPath
    || receipt.manifestHash!==value.manifestHash) fail('ownership-unverified');
  const key=value.plan.windowsRegistry.key;
  if(await io.registryRead(key,value.view)!==value.manifestPath) fail('registration-changed');
  await io.registryRemove(key,value.view);
  if(await io.registryRead(key,value.view)!==null) fail('registration-failed');
  return {removed:true,filesRemoved:false,credentialsRemoved:false};
}

// Constant script + stdin data, never shell interpolation. Registry scope is
// CurrentUser only. This adapter makes no change unless repair/remove is called.
const OS_SCRIPT=String.raw`
$ErrorActionPreference='Stop'; $r=[Console]::In.ReadToEnd() | ConvertFrom-Json
try {
 if($r.operation -eq 'volume') {
  [Console]::Write(('"'+[IO.DriveInfo]::new([string]$r.path).DriveType.ToString()+'"'))
 } elseif($r.operation -eq 'acl') {
  $item=if([IO.Directory]::Exists([string]$r.path)){[IO.DirectoryInfo]::new([string]$r.path)}else{[IO.FileInfo]::new([string]$r.path)}
  $a=$item.GetAccessControl(); $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $allow=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | Where-Object {$_.AccessControlType -eq 'Allow'} | ForEach-Object {
   @{sid=$_.IdentityReference.Value;inheritOnly=($_.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -ne 0;write=([int64]$_.FileSystemRights -band 852310) -ne 0;replace=([int64]$_.FileSystemRights -band 852032) -ne 0}
  })
  @{owner=$a.GetOwner([Security.Principal.SecurityIdentifier]).Value;currentSid=$sid;protected=$a.AreAccessRulesProtected;allow=$allow} | ConvertTo-Json -Compress -Depth 5
 } else {
  if($r.key -notmatch '^HKCU\\Software\\(Google\\Chrome|Microsoft\\Edge|Mozilla)\\NativeMessagingHosts\\com\.daftech\.captionkeep\.byomcp$') {throw 'scope'}
  if($r.view -notin @('Registry32','Registry64')) {throw 'view'}
  $view=[Enum]::Parse([Microsoft.Win32.RegistryView],[string]$r.view)
  $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view)
  $sub=([string]$r.key).Substring(5); $key=$null
  try {
   if($r.operation -eq 'read') {
    $key=$base.OpenSubKey($sub); $v=if($null -eq $key){$null}else{$key.GetValue('', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)}
    # Windows PowerShell 5.1 emits no JSON for null; preserve the missing-registration result explicitly.
    if($null -eq $v){[Console]::Write('null')}else{ConvertTo-Json -InputObject $v -Compress}
   }
   elseif($r.operation -eq 'write') {$key=$base.CreateSubKey($sub);$key.SetValue('',[string]$r.value,[Microsoft.Win32.RegistryValueKind]::String);[Console]::Write('true')}
   elseif($r.operation -eq 'remove') {$key=$base.OpenSubKey($sub,$true);if($null -ne $key){$key.DeleteValue('',$false)};[Console]::Write('true')}
   else {throw 'operation'}
  } finally {if($null -ne $key){$key.Dispose()};$base.Dispose()}
 }
} catch {[Console]::Error.Write('Windows installation check failed.');exit 1}
`;
export function createWindowsInstallerIo({platform=process.platform,systemRoot=process.env.SystemRoot,execute=execFile}={}) {
  if(platform!=='win32') fail('os-unavailable');
  const executable=path.win32.join(localPath(systemRoot),'System32','WindowsPowerShell','v1.0','powershell.exe');
  // PowerShell 7 may leave incompatible/user module directories in the parent
  // environment. Use the trusted Windows PowerShell built-ins only.
  const env={...process.env,PSModulePath:path.win32.join(localPath(systemRoot),'System32','WindowsPowerShell','v1.0','Modules')};
  const operate=request=>new Promise((resolve,reject)=>{
    const child=execute(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',OS_SCRIPT],
      {windowsHide:true,timeout:10000,maxBuffer:65536,encoding:'utf8',env},(error,stdout)=>{
        if(error) return reject(Object.assign(new Error('os-unavailable'),{code:'os-unavailable'}));
        try {resolve(JSON.parse(stdout));} catch {reject(Object.assign(new Error('os-unavailable'),{code:'os-unavailable'}));}
      });
    child.stdin.on?.('error',()=>reject(Object.assign(new Error('os-unavailable'),{code:'os-unavailable'})));
    child.stdin.end(JSON.stringify(request));
  });
  return {inspect:lstat,read:filename=>readFile(filename,'utf8'),acl:filename=>operate({operation:'acl',path:filename}),
    volume:filename=>operate({operation:'volume',path:filename}),
    registryRead:(key,view)=>operate({operation:'read',key,view}),
    registryWrite:(key,view,value)=>operate({operation:'write',key,view,value}),
    registryRemove:(key,view)=>operate({operation:'remove',key,view})};
}
