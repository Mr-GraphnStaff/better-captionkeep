import {randomBytes,randomUUID} from 'node:crypto';
import path from 'node:path';
import {contracts,createHelper} from './helper.mjs';

const IDENTIFIER=/^[a-zA-Z0-9._-]{1,100}$/;
const HOST=/^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/;
const HASH=/^[a-f0-9]{64}$/;
const CHROMIUM=new Set(['chrome','edge','brave','opera']);
export const NATIVE_HOST_NAME='com.daftech.captionkeep.byomcp';

function exact(value,required,optional=[]) {
  if (!value || typeof value!=='object' || Array.isArray(value)
      || required.some(key=>!(key in value)) || Object.keys(value).some(key=>![...required,...optional].includes(key))) throw Error('invalid-config');
}
export async function validateConfiguredProfiles(profiles) {
  if (!Array.isArray(profiles) || !profiles.length || profiles.length>20) throw Error('invalid-profiles');
  const ids=new Set(),validated=[];
  for(const original of profiles) {
    const profile=structuredClone(original);
    exact(profile,['id','label','revision','transport','tools','profileDigest'],['executable','executableDigest','cwd','args','resource','credentialReference','toolAccess']);
    if (!IDENTIFIER.test(profile.id) || ids.has(profile.id) || typeof profile.label!=='string' || !profile.label
        || profile.label.length>120 || /[\u0000-\u001f\u007f]/.test(profile.label)
        || !Number.isSafeInteger(profile.revision) || profile.revision<1 || !['stdio','remote'].includes(profile.transport)
        || profile.toolAccess!==undefined && profile.toolAccess!=='catalog'
        || !Array.isArray(profile.tools) || !profile.tools.length && profile.toolAccess!=='catalog' || profile.tools.length>100 || !HASH.test(profile.profileDigest)) throw Error('invalid-profile');
    ids.add(profile.id);const names=new Set();
    for(const tool of profile.tools) {
      exact(tool,['name','operation','schemaDigest'],['readOnly','reviewedWrite']);
      if (!IDENTIFIER.test(tool.name) || names.has(tool.name) || !HASH.test(tool.schemaDigest)
          || !['read','write'].includes(tool.operation) || (tool.operation==='read' && tool.readOnly!==true)
          || (tool.operation==='write' && tool.reviewedWrite!==true)) throw Error('invalid-tool-grant');
      names.add(tool.name);
    }
    if (profile.transport==='stdio') {
      if (!path.isAbsolute(profile.executable || '') || !path.isAbsolute(profile.cwd || '') || !HASH.test(profile.executableDigest || '')
          || !Array.isArray(profile.args) || profile.args.length>32 || profile.args.some(arg=>typeof arg!=='string' || arg.length>1024 || arg.includes('\0'))
          || profile.resource || profile.credentialReference) throw Error('invalid-stdio-profile');
    } else {
      const resource=new URL(profile.resource);
      if (resource.protocol!=='https:' || resource.username || resource.password || resource.search || resource.hash
          || !IDENTIFIER.test(profile.credentialReference || '') || profile.executable || profile.args || profile.cwd || profile.executableDigest) throw Error('invalid-remote-profile');
    }
    const {profileDigest,...identity}=profile;
    if (await contracts.digest(identity)!==profileDigest) throw Error('profile-digest-mismatch');
    validated.push(profile);
  }
  return validated;
}

export async function createEnrollmentAuthority({hostName=NATIVE_HOST_NAME,allowedCallers,profiles,
  confirmLocalUser=async()=>false,now=()=>Date.now(),nonce=()=>randomBytes(32).toString('hex')}) {
  if (!HOST.test(hostName) || !Array.isArray(allowedCallers) || !allowedCallers.length || allowedCallers.length>20) throw Error('invalid-host');
  const callers=structuredClone(allowedCallers),configured=await validateConfiguredProfiles(profiles);
  for(const entry of callers) {
    exact(entry,['browser','caller']);
    if (CHROMIUM.has(entry.browser)) {
      if (!/^chrome-extension:\/\/[a-p]{32}\/$/.test(entry.caller)) throw Error('invalid-caller');
    } else if (entry.browser==='firefox') {
      if (typeof entry.caller!=='string' || entry.caller.length>128 || !/^[a-zA-Z0-9@._{}-]+$/.test(entry.caller)) throw Error('invalid-caller');
    } else throw Error('unsupported-native-browser');
  }
  const challenges=new Map(),enrollments=new Map();
  function assertCaller(context) {
    if (!context || context.hostName!==hostName || !callers.some(entry=>entry.browser===context.browser && entry.caller===context.caller)) throw Error('caller-denied');
    // Context must come from the OS/native launcher, never a browser message field.
    return `${context.browser}:${context.caller}`;
  }
  function challenge(context,profileIds) {
    const caller=assertCaller(context);
    if (!Array.isArray(profileIds) || !profileIds.length || new Set(profileIds).size!==profileIds.length
        || profileIds.some(id=>!configured.some(profile=>profile.id===id))) throw Error('profile-denied');
    for(const [id,value] of challenges) if(now()>=value.expiresAt) challenges.delete(id);
    if(challenges.size>=20) throw Error('challenge-limit');
    const token=nonce();if(!/^[a-f0-9]{64}$/.test(token) || challenges.has(token)) throw Error('invalid-nonce');
    const value={caller,profileIds:[...profileIds],expiresAt:now()+300000};challenges.set(token,value);
    return Object.freeze({nonce:token,hostName,profileIds:[...profileIds],expiresAt:value.expiresAt});
  }
  async function complete(context,token) {
    const caller=assertCaller(context),pending=challenges.get(token);
    if (!pending || pending.caller!==caller || now()>=pending.expiresAt) throw Error('challenge-denied');
    challenges.delete(token); // consume before the confirmation await: replay/parallel completion fails.
    if (!await confirmLocalUser(Object.freeze({hostName,caller,profileIds:[...pending.profileIds]})) || now()>=pending.expiresAt) throw Error('confirmation-denied');
    if(enrollments.size>=50) throw Error('enrollment-limit');
    const enrollment={id:randomUUID(),hostName,caller,profileIds:[...pending.profileIds],createdAt:now(),revoked:false,helpers:new Set()};
    enrollments.set(enrollment.id,enrollment);return Object.freeze({enrollmentId:enrollment.id,hostName,profileIds:[...enrollment.profileIds]});
  }
  function resolve(context,enrollmentId) {
    const caller=assertCaller(context),enrollment=enrollments.get(enrollmentId);
    if(!enrollment || enrollment.revoked || enrollment.caller!==caller) throw Error('not-enrolled');
    return {caller,enrollmentId,profiles:configured.filter(profile=>enrollment.profileIds.includes(profile.id)).map(profile=>structuredClone(profile))};
  }
  async function revoke(context,enrollmentId) {
    const binding=resolve(context,enrollmentId),enrollment=enrollments.get(binding.enrollmentId);enrollment.revoked=true;
    await Promise.allSettled([...enrollment.helpers].map(instance=>instance.handle({version:1,requestId:randomUUID(),enrollmentId,operation:'disconnect'})));
    enrollment.helpers.clear();
  }
  function helper(context,enrollmentId,options={}) {
    const binding=resolve(context,enrollmentId);
    const enrollment=enrollments.get(enrollmentId);if(enrollment.helpers.size>=4) throw Error('helper-limit');
    const instance=createHelper({...options,...binding,allowedCallers:[binding.caller],readPolicy:async()=>{
      resolve(context,enrollmentId);
      const policy=await (options.readPolicy || (async()=>({disabled:true})))();
      resolve(context,enrollmentId);return policy;
    }});
    enrollment.helpers.add(instance);
    return Object.freeze({close:()=>revoke(context,enrollmentId),async handle(message) {resolve(context,enrollmentId);const result=await instance.handle(message);resolve(context,enrollmentId);return result;}});
  }
  function configuredProfileIds(context) {assertCaller(context);return configured.map(profile=>profile.id);}
  return Object.freeze({challenge,complete,resolve,revoke,helper,configuredProfileIds});
}

export function createNativeSession(authority,launchContext,helperOptions={}) {
  let current=null,instance=null,closed=false;
  async function close() {
    if(closed) return;
    closed=true;
    if(current) await authority.revoke(launchContext,current.enrollmentId);
  }
  return Object.freeze({close,async handle(message) {
    if(closed) throw Error('disconnected');
    message=structuredClone(message);
    if(!message || message.version!==1 || typeof message.requestId!=='string' || message.requestId.length>64
        || Object.keys(message).some(key=>!['version','requestId','operation','nonce','enrollmentId','profileId','approval','jobId','tool','arguments','proposalId','proposalDigest'].includes(key))) throw Error('invalid-message');
    if(message.operation==='enrollment-challenge') {
      return authority.challenge(launchContext,authority.configuredProfileIds(launchContext));
    }
    if(message.operation==='enrollment-complete') {
      if(current) await authority.revoke(launchContext,current.enrollmentId);
      current=await authority.complete(launchContext,message.nonce);
      if(closed) {await authority.revoke(launchContext,current.enrollmentId);throw Error('disconnected');}
      instance=authority.helper(launchContext,current.enrollmentId,helperOptions);
      return {...current,status:await instance.handle({version:1,requestId:message.requestId,operation:'status',enrollmentId:current.enrollmentId})};
    }
    if(!current || message.enrollmentId!==current.enrollmentId || !instance) throw Error('not-enrolled');
    const result=await instance.handle(message);
    if(message.operation==='disconnect') {await authority.revoke(launchContext,current.enrollmentId);current=null;instance=null;}
    return result;
  }});
}
