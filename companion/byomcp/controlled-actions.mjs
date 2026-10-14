import {createRequire} from 'node:module';
import {contracts} from './helper.mjs';
const require=createRequire(import.meta.url);
const {operationAllowed,verifyObservation}=require('../../teams-captions-saver/byomcpRuntimeAdapter.js');

// readState is a separately configured read-only SDK call, never a value from
// the mutation response. A reported "success" cannot generate this receipt.
export function createControlledActions({entries,readState,now=()=>Date.now()}) {
  const before=new Map();
  const actionFor=(profile,approval)=>entries.find(entry=>entry.profile.id===profile.id && entry.profile.profileDigest===profile.profileDigest)
    ?.actions.find(action=>action.tool===approval.payload.tool);
  async function authorizeOperation(profile,approval) {
    const action=actionFor(profile,approval),args=approval.payload.arguments;
    if(!operationAllowed(action,args)) return false;
    if(action.kind==='dns-change') {
      const state=await readState(profile,action,args);
      const observation={before:state,after:{...state,content:args.proposedValue,ttl:args.ttl,proxied:args.proxied},
        preconditionCheckedAt:new Date(now()).toISOString(),atomicPrecondition:false,
        limitation:'Read/write race remains; independent readback is not compare-and-swap.'};
      if(!verifyObservation(action,args,observation)) return false;
      if(before.size>=50 && !before.has(approval.payload.jobId)) return false;
      before.set(approval.payload.jobId,observation);
    }
    return true;
  }
  async function verifyResultProof(approval,result,profile) {
    const action=actionFor(profile,approval),args=approval.payload.arguments;
    if(!operationAllowed(action,args)) return null;
    const observed=await readState(profile,action,args);
    const prior=before.get(approval.payload.jobId);before.delete(approval.payload.jobId);
    const observation=action.kind==='dns-change' ? prior && {...prior,after:observed} : observed;
    if(!verifyObservation(action,args,observation)) return null;
    const receipt={version:1,jobId:approval.payload.jobId,approvalDigest:approval.approvalDigest,
      sourceDigest:approval.payload.source.sourceDigest,profileDigest:profile.profileDigest,actionKind:action.kind,
      resultDigest:await contracts.digest(result),observedAt:new Date(now()).toISOString(),observation};
    return {...receipt,receiptDigest:await contracts.digest(receipt)};
  }
  return Object.freeze({authorizeOperation,verifyResultProof});
}
