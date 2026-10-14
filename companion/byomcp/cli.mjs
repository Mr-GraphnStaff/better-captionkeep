#!/usr/bin/env node
import {readFile,stat,statfs} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {contracts} from './helper.mjs';
import {createEnrollmentAuthority,createNativeSession} from './enrollment.mjs';
import {createSdkAdapters} from './transports.mjs';
import {createControlledActions} from './controlled-actions.mjs';
import {isCloudflareDnsProfile} from './cloudflare-dns.mjs';
import {serveNative} from './native.mjs';
const require=createRequire(import.meta.url);
const runtime=require('../../teams-captions-saver/byomcpRuntimeAdapter.js');

// This entry point performs no registry writes, installation, OAuth extraction
// or shell execution. Installation/provisioning remain explicit user operations.
export async function loadConfiguration(filename) {
  if(!path.isAbsolute(filename)) throw Error('absolute-config-required');
  const metadata=await stat(filename);
  if(!metadata.isFile() || metadata.size>131072 || (process.platform!=='win32' && (metadata.mode & 0o022))) throw Error('unsafe-config');
  const config=JSON.parse(await readFile(filename,'utf8'));
  if(!config || Object.keys(config).sort().join('|')!=='browserConfiguration|browserStoragePath|enabled|verificationTools' || config.enabled!==true
      || !path.isAbsolute(config.browserStoragePath || '')
      || !Array.isArray(config.verificationTools) || config.verificationTools.length>100) throw Error('invalid-config');
  return config;
}
export function parseLaunch(argv,allowedCallers) {
  if(argv[0]!=='--config' || !path.isAbsolute(argv[1] || '')) throw Error('launch-config-required');
  const args=argv.slice(2).filter(arg=>!arg.startsWith('--parent-window='));
  // Chromium supplies the extension origin. Firefox supplies manifest path and
  // extension ID; only that documented position is accepted, never message data.
  const matches=allowedCallers.filter(entry=>entry.browser==='firefox'
    ? args.length===2 && path.isAbsolute(args[0]) && args[1]===entry.caller
    : args.length===1 && args[0]===entry.caller);
  if(matches.length!==1) throw Error('native-caller-unverified');
  return {...matches[0],hostName:'com.daftech.captionkeep.byomcp'};
}
export async function launch(argv,{input=process.stdin,output=process.stdout,env=process.env}={}) {
  const filename=argv[1],config=await loadConfiguration(filename);
  const registry=config.browserConfiguration,context=parseLaunch(argv,registry.allowedCallers);
  await runtime.validateConfiguration(registry,{contracts,browserTarget:context.browser,caller:context.caller});
  const entries=registry.profiles,profiles=entries.map(entry=>entry.profile);
  const originalDigest=await contracts.digest(config);
  const adapters=createSdkAdapters({cloudflareActions:entries,getAuthorization:async resource=>{
    const profile=profiles.find(entry=>entry.transport==='remote' && entry.resource===resource);
    const token=profile && env[profile.credentialReference];
    if(typeof token!=='string' || !token || /[\r\n]/.test(token)) return null;
    return `Bearer ${token}`;
  }});
  const controls=createControlledActions({entries,readState:async(profile,action,args)=>{
    if(isCloudflareDnsProfile(profile,action)) return adapters.remote.observeCloudflareDns(profile,action,args);
    const verifier=config.verificationTools.find(item=>item.profileId===profile.id && item.actionTool===action.tool);
    if(!verifier || !/^[a-zA-Z0-9._-]{1,100}$/.test(verifier.readTool)) throw Error('readback-not-configured');
    const parameters=action.kind==='dns-change'
      ? {accountId:args.accountId,zoneId:args.zoneId,recordId:args.recordId}
      : {tenantId:args.tenantId,personId:args.matchedPersonId,fields:[...args.workFields]};
    return adapters[profile.transport].observe(profile,verifier.readTool,parameters);
  }});
  const authority=await createEnrollmentAuthority({allowedCallers:registry.allowedCallers,profiles,
    // Explicit provisioned local config plus actual OS/browser caller are the
    // enrollment decision. No unattended self-enrollment from a webpage.
    confirmLocalUser:async()=>config.enabled===true});
  const helper=createNativeSession(authority,context,{adapters,readPolicy:async()=>({disabled:await contracts.digest(await loadConfiguration(filename))!==originalDigest}),
    verifyConsent:async()=>true, // Only allowlisted enrolled native callers; browser worker owns the one-click sealed approval.
    authorizeOperation:controls.authorizeOperation,verifyWrite:async()=>true,
    verifyResultProof:controls.verifyResultProof,requireResultProof:true,
    // Measure the explicitly configured browser storage volume, not an
    // unrelated helper/config disk. No profile contents are opened or read.
    availableBytes:async()=>{const disk=await statfs(config.browserStoragePath);const bytes=disk.bavail*disk.bsize;return Number.isSafeInteger(bytes)?bytes:null;}});
  return serveNative(input,output,helper);
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  try {await launch(process.argv.slice(2));}
  catch {process.stderr.write('CaptionKeep BYOMCP helper could not verify local configuration or native caller.\n');process.exitCode=1;}
}
