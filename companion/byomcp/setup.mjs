#!/usr/bin/env node
import {readFile,stat,lstat,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {contracts} from './helper.mjs';
import {validateConfiguredProfiles,NATIVE_HOST_NAME} from './enrollment.mjs';
import {createInstallPlan} from './install-plan.mjs';
import {RESOURCE} from './cloudflare-oauth.mjs';
const require=createRequire(import.meta.url),runtime=require('../../teams-captions-saver/byomcpRuntimeAdapter.js');
const clean=(value,max)=>typeof value==='string' && value.length>0 && value.length<=max && !/[\u0000-\u001f\u007f]/.test(value);
const exact=(value,required,optional=[])=>value && typeof value==='object' && !Array.isArray(value)
  && required.every(key=>Object.hasOwn(value,key)) && Object.keys(value).every(key=>required.includes(key) || optional.includes(key));
function localOutputPath(directory,platform=process.platform) {
  if(typeof directory!=='string' || !path.isAbsolute(directory) || /[\u0000-\u001f\u007f]/.test(directory)
      || platform==='win32' && (!/^[a-z]:[\\/]/i.test(directory) || directory.startsWith('\\\\') || /:/.test(directory.slice(2)))) throw Error('setup-output-required');
}

export function validateSetupRequest(request) {
  if(!exact(request,['version','browser','extensionId','profile']) || request.version!==1
      || !['chrome','edge','brave','opera','firefox'].includes(request.browser)
      || !(request.browser==='firefox'?clean(request.extensionId,128) && /^[a-zA-Z0-9@._{}-]+$/.test(request.extensionId):/^[a-p]{32}$/.test(request.extensionId))
      || !exact(request.profile,['label','transport'],['resource']) || !clean(request.profile.label,120)
      || !['remote','stdio'].includes(request.profile.transport)) throw Error('invalid-setup-request');
  if(request.profile.transport==='remote') {
    if(!clean(request.profile.resource,2048)) throw Error('invalid-setup-resource');
    let resource;try {resource=new URL(request.profile.resource);} catch {throw Error('invalid-setup-resource');}
    if(resource.protocol!=='https:' || resource.username || resource.password || resource.search || resource.hash) throw Error('invalid-setup-resource');
  } else if(request.profile.resource!==undefined) throw Error('invalid-setup-request');
  return structuredClone(request);
}
export async function readSetupRequest(filename) {
  if(!path.isAbsolute(filename || '')) throw Error('absolute-request-required');
  const metadata=await stat(filename);
  if(!metadata.isFile() || metadata.size>16384) throw Error('setup-request-limit');
  return validateSetupRequest(JSON.parse(await readFile(filename,'utf8')));
}

// Preparation is side-effect free. Local process paths never come from a browser
// request; no installed configuration, registry, credential store or provider is read.
export async function prepareSetup({request,prompt,directory,nodePath=process.execPath,
  cliPath=fileURLToPath(new URL('./cli.mjs',import.meta.url)),platform=process.platform,
  inspect=stat,read=readFile}={}) {
  request=validateSetupRequest(request);
  if(typeof prompt!=='function') throw Error('setup-input-required');
  localOutputPath(directory,platform);
  const os=platform==='win32'?'windows':platform==='darwin'?'macos':null;
  if(!os) throw Error('setup-platform-unsupported');
  const browserStoragePath=await prompt('Full path to the folder used for browser storage (capacity checks only): ');
  if(!path.isAbsolute(browserStoragePath || '') || !(await inspect(browserStoragePath)).isDirectory()) throw Error('setup-storage-unavailable');
  const profile={id:'user-mcp',label:request.profile.label,revision:1,transport:request.profile.transport,tools:[],toolAccess:'catalog'};
  let authentication='none';
  if(profile.transport==='stdio') {
    profile.executable=await prompt('Full path to the MCP server executable (no command line): ');
    profile.cwd=await prompt('Full path to its working folder: ');
    if(!clean(profile.executable,4096) || !clean(profile.cwd,4096) || !path.isAbsolute(profile.executable) || !path.isAbsolute(profile.cwd)) throw Error('setup-process-unavailable');
    const executableMetadata=await inspect(profile.executable);
    if(!executableMetadata.isFile() || executableMetadata.size>256*1024*1024 || !(await inspect(profile.cwd)).isDirectory()) throw Error('setup-process-unavailable');
    profile.args=[];
    for(let index=0;index<=32;index++) {
      const argument=await prompt('One server argument, or Enter to finish. Do not enter credentials: ');
      if(argument==='') break;
      if(index===32 || !clean(argument,1024)) throw Error('setup-argument-limit');
      profile.args.push(argument);
    }
    profile.executableDigest=createHash('sha256').update(await read(profile.executable)).digest('hex');
  } else {
    profile.resource=new URL(request.profile.resource).href;profile.credentialReference='CAPTIONKEEP_MCP_TOKEN';
    authentication=await prompt(profile.resource===RESOURCE
      ? 'Authentication: type cloudflare for separate helper-owned sign-in, or environment for a separately provisioned token: '
      : 'Authentication: type environment for a separately provisioned token (generic OAuth is not supported): ');
    if(!['environment',...(profile.resource===RESOURCE?['cloudflare']:[])].includes(authentication)) throw Error('setup-authentication-unsupported');
  }
  profile.profileDigest=await contracts.digest(profile);
  await validateConfiguredProfiles([profile]);
  const caller=request.browser==='firefox'?request.extensionId:`chrome-extension://${request.extensionId}/`;
  const browserConfiguration={version:1,hostName:NATIVE_HOST_NAME,allowedCallers:[{browser:request.browser,caller}],profiles:[{profile,actions:[]}]};
  await runtime.validateConfiguration(browserConfiguration,{contracts,browserTarget:request.browser,caller});
  const configurationPath=path.join(directory,'helper-config.json'),launcherPath=path.join(directory,os==='windows'?'host.cmd':'host.sh');
  const manifestPath=path.join(directory,`${NATIVE_HOST_NAME}.json`);
  const plan=createInstallPlan({browser:request.browser,os,extensionId:request.extensionId,nodePath,cliPath,configurationPath,launcherPath,manifestPath});
  const helperConfiguration={enabled:true,browserConfiguration,browserStoragePath,verificationTools:[],
    ...(authentication==='cloudflare'?{oauthStorePath:path.join(directory,'cloudflare-oauth.dpapi')}:{})};
  return {version:1,dryRun:true,authentication,profileId:profile.id,configurationPath,plan,
    files:{'helper-config.json':JSON.stringify(helperConfiguration,null,2),'browser-configuration.json':JSON.stringify(browserConfiguration,null,2),
      [`${NATIVE_HOST_NAME}.json`]:JSON.stringify(plan.manifest,null,2),[os==='windows'?'host.cmd':'host.sh']:plan.launcher},
    nextSteps:[authentication==='cloudflare'
      ? 'After a reviewed private installation, run authorize-cloudflare.mjs with this configuration, profile user-mcp and your browser path. Choose scopes separately; no sign-in has started.'
      : authentication==='environment'?'Provision CAPTIONKEEP_MCP_TOKEN privately in the helper launch environment; never paste it into the extension or setup request.':'Review the executable and exact argument list locally.',
      'Import the generated browser-configuration.json in CaptionKeep; import does not connect or authorize a tool operation.',
      'Owner-only permissions, browser registration, connection acceptance and removal/upgrade testing remain required.']};
}

async function privateOutputParent(directory,{platform=process.platform,inspect=lstat,systemRoot=process.env.SystemRoot}={}) {
  localOutputPath(directory,platform);
  const parent=path.dirname(directory),metadata=await inspect(parent);
  // Resolve no links: every existing ancestor must be an actual directory.
  // On Windows lstat.isSymbolicLink also identifies directory junctions.
  for(let ancestor=parent;;ancestor=path.dirname(ancestor)) {
    const details=ancestor===parent?metadata:await inspect(ancestor);
    if(!details.isDirectory() || details.isSymbolicLink()) throw Error('setup-output-parent');
    if(path.dirname(ancestor)===ancestor) break;
  }
  if(platform!=='win32') {
    if(metadata.mode & 0o022 || metadata.uid!==process.getuid?.()) throw Error('setup-output-permissions');
    return;
  }
  if(!path.win32.isAbsolute(systemRoot || '')) throw Error('setup-output-permissions');
  const script="$ErrorActionPreference='Stop'; $p=[Console]::In.ReadToEnd(); $acl=Get-Acl -LiteralPath $p; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $owner=([Security.Principal.NTAccount]::new($acl.Owner)).Translate([Security.Principal.SecurityIdentifier]).Value; if($owner -ne $sid){exit 1}; foreach($a in $acl.Access){if($a.AccessControlType -eq 'Allow'){ $i=$a.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value; if($i -notin @($sid,'S-1-5-18','S-1-5-32-544')){exit 1}}}; [Console]::Write('private')";
  const result=execFileSync(path.win32.join(systemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],
    {input:parent,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024});
  if(result!=='private') throw Error('setup-output-permissions');
}

// New-setup artifact preparation only: never overwrites an existing directory
// or registers the shared native host. Future installation must merge profiles.
export async function savePreparedSetup(prepared,directory,{verifyParent=privateOutputParent,platform=process.platform}={}) {
  localOutputPath(directory,platform);
  if(path.dirname(directory)===directory || !prepared?.dryRun) throw Error('setup-output-required');
  if(!prepared.files || typeof prepared.files!=='object' || Array.isArray(prepared.files)
      || Object.entries(prepared.files).some(([name,content])=>path.basename(name)!==name || typeof content!=='string')) throw Error('invalid-setup-artifact');
  await verifyParent(directory);
  await mkdir(directory,{mode:0o700}); // Nonrecursive and exclusive: occupied targets fail closed.
  for(const [name,content] of Object.entries(prepared.files)) {
    await writeFile(path.join(directory,name),content,{flag:'wx',mode:name.endsWith('.sh')?0o700:0o600});
  }
  return {saved:true,directory,installed:false,registered:false};
}

export async function runSetup({requestPath,directory,prompt,report=()=>{},apply=false,install,save=false,saveArtifacts=savePreparedSetup,
  prepare=prepareSetup,load=readSetupRequest,...options}={}) {
  const request=await load(requestPath),prepared=await prepare({request,directory,prompt,...options});
  report(`Prepared ${request.profile.label} for ${request.browser}. No installation, authentication or tool operation has run.`);
  for(const message of prepared.nextSteps) report(message);
  if(save) {
    if(await prompt('Save NEW setup files only, without installing or registering? Type SAVE to confirm: ')!=='SAVE') return {...prepared,cancelled:true};
    await saveArtifacts(prepared,directory);
    report('New setup files saved. Nothing installed or registered. Existing helper profiles were not changed; adding a service to an existing installation still requires a reviewed merge.');
  }
  if(!apply) return prepared;
  if(!prepared.plan.registrationConventionVerified) throw Error('setup-registration-unverified');
  // The application embedding this increment must supply an audited, private,
  // reversible per-user installer. This module never shells out to reg/icacls.
  if(typeof install!=='function') throw Error('setup-installer-unavailable');
  if(await prompt('Install this reviewed per-user helper and exact browser binding? Type INSTALL to confirm: ')!=='INSTALL') return {...prepared,cancelled:true};
  await install(structuredClone(prepared));return {...prepared,dryRun:false};
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const args=process.argv.slice(2),terminal=createInterface({input:process.stdin,output:process.stdout});
  try {
    if(![4,5].includes(args.length) || args[0]!=='--request' || args[2]!=='--output' || args.length===5 && args[4]!=='--save'
        || !path.isAbsolute(args[1]) || !path.isAbsolute(args[3])) throw Error('setup-usage');
    await runSetup({requestPath:args[1],directory:args[3],save:args[4]==='--save',prompt:question=>terminal.question(question),report:message=>console.log(message)});
    console.log('Preparation complete; this is new-setup-only, not installation or registration. Reviewed installer and existing-profile merge integration remain pending.');
  } catch {process.stderr.write('CaptionKeep setup could not prepare this request. Nothing was installed or authenticated.\n');process.exitCode=1;}
  finally {terminal.close();}
}
