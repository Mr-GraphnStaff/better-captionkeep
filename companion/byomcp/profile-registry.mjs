import {createRequire} from 'node:module';
import {contracts} from './helper.mjs';

const require=createRequire(import.meta.url);
const runtime=require('../../teams-captions-saver/byomcpRuntimeAdapter.js');
const HASH=/^[a-f0-9]{64}$/;
const ID=/^[a-zA-Z0-9._-]{1,100}$/;
const exact=(value,keys)=>value && typeof value==='object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|')===[...keys].sort().join('|');

// Pure transformation only. The caller must atomically compare the returned
// previousDigest with persisted state before saving; this module performs no I/O.
export async function changeProfileRegistry(configuration,change,{browserTarget,caller}={}) {
  const snapshot=structuredClone(configuration),request=structuredClone(change);
  const current=await runtime.validateConfiguration(snapshot,{contracts,browserTarget,caller});
  const previousDigest=await contracts.digest(current);
  if(!request || !HASH.test(request.expectedConfigurationDigest || '')
      || request.expectedConfigurationDigest!==previousDigest) throw Error('registry-changed');
  if(!['add','update','remove'].includes(request.operation)) throw Error('invalid-registry-operation');
  const adding=request.operation==='add';
  const keys=adding?['operation','expectedConfigurationDigest','entry']:
    ['operation','expectedConfigurationDigest','profileId','expectedRevision','expectedProfileDigest',
      ...(request.operation==='update'?['entry']:[])];
  if(!exact(request,keys)) throw Error('invalid-registry-operation');
  const next=structuredClone(current);
  if(adding) {
    const id=request.entry?.profile?.id;
    if(!ID.test(id || '') || current.profiles.some(entry=>entry.profile.id===id)) throw Error('profile-already-exists');
    next.profiles.push(request.entry);
  } else {
    if(!ID.test(request.profileId || '') || !Number.isSafeInteger(request.expectedRevision)
        || !HASH.test(request.expectedProfileDigest || '')) throw Error('invalid-profile-binding');
    const index=current.profiles.findIndex(entry=>entry.profile.id===request.profileId);
    const existing=current.profiles[index]?.profile;
    if(!existing || existing.revision!==request.expectedRevision
        || existing.profileDigest!==request.expectedProfileDigest) throw Error('profile-changed');
    if(request.operation==='remove') {
      // An empty enrollment is not valid under the current runtime contract.
      // Removing the final service needs an explicit disconnect/uninstall flow.
      if(current.profiles.length===1) throw Error('last-profile-removal-requires-disconnect');
      next.profiles.splice(index,1);
    } else {
      if(request.entry?.profile?.id!==request.profileId
          || request.entry.profile.revision!==existing.revision+1) throw Error('profile-update-identity');
      next.profiles[index]=request.entry;
    }
  }
  const validated=await runtime.validateConfiguration(next,{contracts,browserTarget,caller});
  return {configuration:validated,previousDigest,configurationDigest:await contracts.digest(validated)};
}
