#!/usr/bin/env node
import path from 'node:path';
import {lstat,mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {prepareSetup,readSetupRequest,savePreparedSetup} from './setup.mjs';
import {createInstallPlan} from './install-plan.mjs';
import {createWindowsInstallerIo,inspectWindowsInstallation,repairWindowsRegistration,removeWindowsRegistration} from './windows-installer.mjs';

const TRUSTED=['S-1-5-18','S-1-5-32-544','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'];
const RECEIPT='registration-receipt.json';
const fail=code=>{throw Object.assign(new Error(code),{code});};
function localPath(value) {
  if(typeof value!=='string' || value.length>1024 || !/^[a-z]:\\/i.test(value)
      || /[\u0000-\u001f\u007f"%&|<>^!:]/.test(value.slice(2))
      || value.split('\\').some(part=>part==='..' || part==='.' || /[. ]$/.test(part)
        || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail('setup-unsafe-path');
  return path.win32.normalize(value);
}
function configurationDirectory(directory) {return path.win32.join(directory,'configuration');}
function installationFor(prepared,directory,registrationConvention) {
  directory=localPath(directory);
  if(directory===path.win32.parse(directory).root) fail('setup-unsafe-path');
  const manifest=JSON.parse(prepared.files['com.daftech.captionkeep.byomcp.json']);
  const config=JSON.parse(prepared.files['helper-config.json']);
  const binding=config.browserConfiguration.allowedCallers;
  if(binding.length!==1) fail('setup-invalid-plan');
  const {browser,caller}=binding[0];
  if(['brave','opera'].includes(browser) && registrationConvention!=='chrome') fail('setup-registration-unverified');
  const extensionId=browser==='firefox'?caller:/^chrome-extension:\/\/([a-p]{32})\/$/.exec(caller)?.[1];
  const configurationPath=path.win32.join(configurationDirectory(directory),'helper-config.json');
  if(prepared.configurationPath!==configurationPath || manifest.path!==path.win32.join(configurationDirectory(directory),'host.cmd')) fail('setup-invalid-plan');
  // The exact Node/package paths are established by prepareWindowsSetup locally,
  // never accepted from the browser request or inferred from a launcher string.
  const {nodePath,cliPath}=prepared.windowsPaths??{};
  return {browser,extensionId,root:directory,nodePath:localPath(nodePath),cliPath:localPath(cliPath),configurationPath,
    launcherPath:manifest.path,manifestPath:path.win32.join(configurationDirectory(directory),`${manifest.name}.json`),
    view:'Registry64',...(['brave','opera'].includes(browser)?{registrationConvention}:{})};
}

// Pure preparation; the existing reviewed helper package and Node installation
// stay in place. This increment does not distribute/install the Node runtime.
export async function prepareWindowsSetup({request,directory,prompt,nodePath=process.execPath,
  cliPath=fileURLToPath(new URL('./cli.mjs',import.meta.url)),registrationConvention,...options}={}) {
  directory=localPath(directory);nodePath=localPath(nodePath);cliPath=localPath(cliPath);
  const prepared=await prepareSetup({...options,request,prompt,directory:configurationDirectory(directory),nodePath,cliPath,platform:'win32'});
  prepared.windowsPaths={nodePath,cliPath};
  const installation=installationFor(prepared,directory,registrationConvention);
  return {version:1,dryRun:true,prepared,installation,receiptPath:path.win32.join(directory,RECEIPT),
    limitations:['Requires an already reviewed local Node.js 22+ runtime and extracted helper package.',
      'NEW setup only. Existing registrations and profiles are never replaced or merged.',
      'No authentication, MCP server launch, tool discovery or tool operation is performed.',
      'Removal unregisters only the unchanged receipt-owned registration; all files and credentials are retained.']};
}
function assertAcl(acl,{privateDirectory=false}={}) {
  if(!acl || !/^S-1-(?:5-21|12-1)-\d+-\d+-\d+-\d+$/.test(acl.currentSid??'') || !Array.isArray(acl.allow)) fail('setup-unsafe-permissions');
  const trusted=new Set([acl.currentSid,...TRUSTED]);
  if(!trusted.has(acl.owner) || privateDirectory && acl.owner!==acl.currentSid) fail('setup-unsafe-permissions');
  for(const entry of acl.allow) {
    if(entry.inheritOnly===true) continue; // Independently inspect each actual descendant.
    if(!trusted.has(entry.sid) && (privateDirectory || (entry.replace??entry.write)===true)) fail('setup-unsafe-permissions');
  }
}
async function inspectAncestors(filename,io,{privateDirectory=false,file=false}={}) {
  for(let current=filename;;current=path.win32.dirname(current)) {
    const metadata=await io.inspect(current);
    if(metadata.isSymbolicLink() || (file && current===filename?!metadata.isFile():!metadata.isDirectory())) fail('setup-unsafe-filesystem');
    const acl=await io.acl(current);
    assertAcl(acl,{privateDirectory:current===filename && privateDirectory});
    if(path.win32.dirname(current)===current) break;
  }
}
async function missingRoot(root,io) {
  try {await io.inspect(root);} catch(error) {if(error.code==='ENOENT') return;throw error;}
  fail('setup-output-exists');
}
function checkedPlan(plan) {
  if(plan?.version!==1 || plan.dryRun!==true || plan.prepared?.dryRun!==true) fail('setup-invalid-plan');
  const installation=installationFor(plan.prepared,plan.installation?.root,plan.installation?.registrationConvention);
  if(JSON.stringify(installation)!==JSON.stringify(plan.installation)
      || plan.receiptPath!==path.win32.join(installation.root,RECEIPT)) fail('setup-invalid-plan');
  return installation;
}
async function preflight(installation,io) {
  const {root,nodePath,cliPath}=installation;
  for(const drive of new Set([root,nodePath,cliPath].map(name=>path.win32.parse(name).root))) {
    if(await io.volume(drive)!=='Fixed') fail('setup-unsafe-filesystem');
  }
  await missingRoot(root,io);
  await inspectAncestors(path.win32.dirname(root),io,{privateDirectory:true});
  await inspectAncestors(nodePath,io,{file:true});await inspectAncestors(cliPath,io,{file:true});
  const convention=['brave','opera'].includes(installation.browser)?'chrome':installation.browser;
  const key=createInstallPlan({...installation,browser:convention,os:'windows'}).windowsRegistry.key;
  if(await io.registryRead(key,installation.view)!==null) fail('registration-conflict');
}

export async function installWindowsSetup(plan,{io=createWindowsSetupIo(),confirmed=false}={}) {
  if(confirmed!==true) fail('setup-confirmation-required');
  const installation=checkedPlan(plan);
  await preflight(installation,io);
  let created=false,registration;
  try {
    await io.createRoot(installation.root);created=true;
    await io.secureRoot(installation.root);
    await inspectAncestors(installation.root,io,{privateDirectory:true});
    if((await io.acl(installation.root)).protected!==true) fail('setup-unsafe-permissions');
    await io.saveArtifacts(plan.prepared,configurationDirectory(installation.root),{
      platform:'win32',verifyParent:()=>inspectAncestors(installation.root,io,{privateDirectory:true})});
    const health=await inspectWindowsInstallation(installation,{io});
    if(!health.valid || health.registration!=='missing') fail(health.valid?'registration-conflict':health.reason);
    // Persist an inert recovery record first. A completed receipt is separate and
    // exclusive; failure to persist it rolls back only our newly owned value.
    await io.writeReceipt(path.win32.join(installation.root,'installation-plan.json'),{
      version:1,state:'prepared',installation,registered:false});
    registration=await repairWindowsRegistration(installation,{io,confirmed:true});
    if(!registration.changed || !registration.receipt) fail('setup-registration-ownership');
    const receipt={version:1,installation,registration:registration.receipt};
    await io.writeReceipt(plan.receiptPath,receipt);
    return {installed:true,registered:true,filesCreated:true,receipt,receiptPath:plan.receiptPath,
      browserConfigurationPath:path.win32.join(configurationDirectory(installation.root),'browser-configuration.json'),authenticated:false};
  } catch(error) {
    let rollback=error.code==='rollback-failed'?'failed':'not-needed';
    if(registration?.changed && registration.receipt) {
      try {await removeWindowsRegistration(installation,registration.receipt,{io,confirmed:true});rollback='registration-removed';}
      catch {rollback='failed';}
    }
    // Bounded facts remain available even for a partial installation. Never
    // remove files, copy credentials, or overwrite another registration here.
    throw Object.assign(new Error('setup-install-failed'),{code:'setup-install-failed',
      reason:['setup-unsafe-permissions','setup-unsafe-filesystem','registration-conflict','registration-changed','registration-failed','rollback-failed','unsafe-permissions','unsafe-filesystem'].includes(error.code??error.message)?error.code??error.message:'installation-incomplete',
      filesCreated:created,rollback});
  }
}
export async function removeWindowsSetup(receipt,{io=createWindowsSetupIo(),confirmed=false}={}) {
  if(confirmed!==true) fail('setup-confirmation-required');
  if(!receipt || Object.keys(receipt).sort().join('|')!=='installation|registration|version' || receipt.version!==1) fail('setup-invalid-receipt');
  const installation=receipt.installation;
  // Existing validator checks exact paths, manifest/launcher/configuration,
  // ACLs and receipt ownership before any removal, without reading credentials.
  const result=await removeWindowsRegistration(installation,receipt.registration,{io,confirmed:true});
  return {...result,filesRetained:true,credentialsRetained:true};
}

const SECURE_ROOT_SCRIPT=String.raw`
$ErrorActionPreference='Stop'; $p=[Console]::In.ReadToEnd()
try {
 $d=[IO.DirectoryInfo]::new($p)
 if(-not $d.Exists -or ($d.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'directory'}
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
 # Read ownership separately and refuse to take it. Persist only the modified
 # Access section: writing a freshly constructed owner unnecessarily requires
 # WRITE_OWNER even when this user already owns the new directory.
 $owner=$d.GetAccessControl([Security.AccessControl.AccessControlSections]::Owner).GetOwner([Security.Principal.SecurityIdentifier]).Value
 if($owner -ne $sid.Value){throw 'owner'}
 $a=$d.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
 $a.SetAccessRuleProtection($true,$false)
 foreach($old in @($a.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))) {$a.RemoveAccessRuleSpecific($old)}
 foreach($id in @($sid.Value,'S-1-5-18','S-1-5-32-544')) {
  $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($id),'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $a.AddAccessRule($rule)
 }
 $d.SetAccessControl($a)
 $check=$d.GetAccessControl([Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner)
 if(-not $check.AreAccessRulesProtected -or $check.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'verification'}
 $rules=@($check.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
 if($rules.Count -ne 3){throw 'verification'}
 foreach($r in $rules){
  if($r.IdentityReference.Value -notin @($sid.Value,'S-1-5-18','S-1-5-32-544') -or $r.AccessControlType -ne 'Allow' -or $r.IsInherited -or $r.FileSystemRights -ne 'FullControl' -or $r.InheritanceFlags -ne 'ContainerInherit,ObjectInherit' -or $r.PropagationFlags -ne 'None'){throw 'verification'}
 }
 [Console]::Write('private')
} catch {[Console]::Error.Write('Private setup directory could not be secured.');exit 1}
`;
export function createWindowsSetupIo({platform=process.platform,systemRoot=process.env.SystemRoot,execute=execFile}={}) {
  if(platform!=='win32') fail('os-unavailable');
  const installer=createWindowsInstallerIo({platform,systemRoot,execute});
  const powershell=path.win32.join(localPath(systemRoot),'System32','WindowsPowerShell','v1.0','powershell.exe');
  return {...installer,
    createRoot:directory=>mkdir(directory,{recursive:false}),
    secureRoot:directory=>new Promise((resolve,reject)=>{
      const child=execute(powershell,['-NoLogo','-NoProfile','-NonInteractive','-Command',SECURE_ROOT_SCRIPT],
        {windowsHide:true,timeout:10000,maxBuffer:4096,encoding:'utf8',env:{...process.env,PSModulePath:path.win32.join(localPath(systemRoot),'System32','WindowsPowerShell','v1.0','Modules')}},
        (error,stdout)=>error || stdout!=='private'?reject(Object.assign(new Error('setup-unsafe-permissions'),{code:'setup-unsafe-permissions'})):resolve());
      child.stdin.on?.('error',()=>reject(Object.assign(new Error('setup-unsafe-permissions'),{code:'setup-unsafe-permissions'})));
      child.stdin.end(localPath(directory));
    }),saveArtifacts:savePreparedSetup,
    writeReceipt:(filename,value)=>writeFile(filename,`${JSON.stringify(value,null,2)}\n`,{flag:'wx',mode:0o600}),
    readReceipt:async filename=>{
      filename=localPath(filename);
      await inspectAncestors(path.win32.dirname(filename),installer,{privateDirectory:true});
      const metadata=await lstat(filename);
      if(!metadata.isFile() || metadata.isSymbolicLink() || metadata.size>16384) fail('setup-invalid-receipt');
      assertAcl(await installer.acl(filename),{privateDirectory:true});
      return JSON.parse(await readFile(filename,'utf8'));
    }};
}
export const WINDOWS_SETUP_HELP=`CaptionKeep Windows helper setup (development candidate)
Requires an already reviewed local Node.js 22+ runtime and extracted helper package.
  node companion/byomcp/windows-setup.mjs --request ABS_JSON --output NEW_PRIVATE_DIR [--install] [--registration-convention chrome]
  node companion/byomcp/windows-setup.mjs --remove ABS_REGISTRATION_RECEIPT
  node companion/byomcp/windows-setup.mjs --help
Default: prepare in memory, no files/ACLs/registry/authentication/MCP operations.
--install asks for INSTALL and creates only a NEW directory beneath an existing private parent.
Brave/Opera require a separately verified Chrome registration convention; the flag records that review.
--remove asks for REMOVE; only receipt-owned registration is removed. All files/credentials stay.
No existing registration is replaced; profile addition/upgrade and bundled runtime distribution remain pending.
`;
export function windowsSetupReview(plan) {
  const installation=checkedPlan(plan),configuration=JSON.parse(plan.prepared.files['helper-config.json']);
  const entry=configuration.browserConfiguration.profiles;
  if(entry.length!==1) fail('setup-invalid-plan');
  const {profile}=entry[0],convention=['brave','opera'].includes(installation.browser)?'chrome':installation.browser;
  const key=createInstallPlan({...installation,browser:convention,os:'windows'}).windowsRegistry.key;
  // JSON quoting keeps exact argument boundaries and prevents control characters
  // in a tampered local plan from becoming terminal instructions.
  const field=(label,value)=>`${label}: ${JSON.stringify(value)}`;
  return [
    'Review this exact NEW local installation:',
    field('Browser',installation.browser),field('Extension ID',installation.extensionId),
    field('Allowed browser caller',configuration.browserConfiguration.allowedCallers[0].caller),
    field('Service name',profile.label),field('Transport',profile.transport),
    ...(profile.transport==='remote'?[field('MCP HTTPS endpoint',profile.resource),
      field('Separate authentication method (not started)',plan.prepared.authentication)]
      :[field('Server executable',profile.executable),field('Server executable SHA256',profile.executableDigest),
        field('Server working directory',profile.cwd),field('Server argument vector',profile.args)]),
    field('Node runtime',installation.nodePath),field('Reviewed helper entry point',installation.cliPath),
    field('New private output directory',installation.root),field('Capacity-check folder',configuration.browserStoragePath),
    field('Per-user registry key',key),field('Registry view',installation.view),field('Native manifest',installation.manifestPath),
    'No sign-in, MCP server launch, tool discovery or tool operation is approved by INSTALL.'
  ];
}
export function windowsRemovalReview(receipt,receiptPath) {
  const installation=receipt?.installation;
  if(!installation || !['chrome','edge','brave','opera','firefox'].includes(installation.browser)) fail('setup-invalid-receipt');
  const convention=['brave','opera'].includes(installation.browser)?'chrome':installation.browser;
  const key=createInstallPlan({...installation,browser:convention,os:'windows'}).windowsRegistry.key;
  const field=(label,value)=>`${label}: ${JSON.stringify(value)}`;
  return ['Review this exact browser registration removal:',field('Receipt',receiptPath),
    field('Browser',installation.browser),field('Extension ID',installation.extensionId),
    field('Per-user registry key',key),field('Registry view',installation.view),
    field('Native manifest',installation.manifestPath),
    'Only the unchanged receipt-owned registration will be removed. All files and credentials will remain.'];
}
export async function runWindowsSetupCli(args,{prompt,report=console.log,load=readSetupRequest,
  prepare=prepareWindowsSetup,install=installWindowsSetup,remove=removeWindowsSetup,ioFactory=createWindowsSetupIo}={}) {
  if(args.length===1 && ['--help','-h'].includes(args[0])) {report(WINDOWS_SETUP_HELP);return {help:true};}
  if(args.length===2 && args[0]==='--remove') {
    const filename=localPath(args[1]),io=ioFactory(),receipt=await io.readReceipt(filename);
    if(filename!==path.win32.join(localPath(receipt?.installation?.root),RECEIPT)) fail('setup-invalid-receipt');
    for(const field of windowsRemovalReview(receipt,filename)) report(field);
    if(await prompt('Type REMOVE to confirm: ')!=='REMOVE') return {cancelled:true,changed:false};
    return remove(receipt,{io,confirmed:true});
  }
  if(args.length<4 || args[0]!=='--request' || args[2]!=='--output') fail('setup-usage');
  const requestPath=localPath(args[1]),directory=localPath(args[3]);
  let apply=false,registrationConvention;
  for(let index=4;index<args.length;index++) {
    if(args[index]==='--install' && !apply) apply=true;
    else if(args[index]==='--registration-convention' && registrationConvention===undefined && args[++index]==='chrome') registrationConvention='chrome';
    else fail('setup-usage');
  }
  const plan=await prepare({request:await load(requestPath),directory,prompt,registrationConvention});
  report(`Prepared ${plan.installation.browser} setup. No installation, registration or authentication has occurred.`);
  for(const field of windowsSetupReview(plan)) report(field);
  for(const limitation of plan.limitations) report(limitation);
  if(!apply) return plan;
  report('Installation creates the new private folder and registers the exact extension binding. Review the local request, executable and package before confirming.');
  if(await prompt('Type INSTALL to confirm: ')!=='INSTALL') return {cancelled:true,changed:false};
  return install(plan,{io:ioFactory(),confirmed:true});
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const terminal=createInterface({input:process.stdin,output:process.stdout});
  try {
    const result=await runWindowsSetupCli(process.argv.slice(2),{prompt:question=>terminal.question(question)});
    if(result.installed) console.log(`Helper registered. Import the nonsecret binding at ${result.browserConfigurationPath}, then choose Connect enrolled helper. No authentication or MCP operation ran.`);
    else if(result.removed) console.log('Receipt-owned registration removed. All files and credentials retained.');
    else if(result.cancelled) console.log('Canceled before installation/removal. No changes made.');
  } catch(error) {
    process.stderr.write(error.filesCreated
      ? `Setup did not complete. Partial private setup files remain; registration rollback: ${error.rollback}. No authentication or MCP operation was attempted.\n`
      : 'Setup/removal did not complete. Review the request, private parent and registration before retrying.\n');
    process.exitCode=1;
  } finally {terminal.close();}
}
