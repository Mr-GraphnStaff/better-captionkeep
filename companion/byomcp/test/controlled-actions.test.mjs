import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {contracts,createHelper} from '../helper.mjs';
import {createControlledActions} from '../controlled-actions.mjs';
import {parseLaunch} from '../cli.mjs';
import {createInstallPlan} from '../install-plan.mjs';
test('actual helper requires fresh typed before state and independent readback proof',async()=>{
  const profile={id:'synthetic',revision:1,transport:'stdio',profileDigest:'a'.repeat(64),tools:[{name:'dns_update',operation:'write',reviewedWrite:true,schemaDigest:'b'.repeat(64)}]};
  const action={kind:'dns-change',tool:'dns_update',accountId:'1'.repeat(32),zoneIds:['2'.repeat(32)]};
  const args={accountId:action.accountId,zoneId:action.zoneIds[0],recordId:'3'.repeat(32),recordType:'TXT',recordName:'test.example.invalid',expectedCurrentValue:'before',proposedValue:'after',ttl:300,proxied:false};
  const state={accountId:args.accountId,zoneId:args.zoneId,recordId:args.recordId,type:'TXT',name:args.recordName,content:'before',ttl:300,proxied:false};
  let reads=0;
  const controls=createControlledActions({entries:[{profile,actions:[action]}],readState:async()=>{reads++;return structuredClone(state);}});
  const approval=await contracts.sealApproval({jobId:randomUUID(),connection:profile,tool:action.tool,operation:'write',arguments:args,privacyMode:'scrubbed',
    source:{sessionId:randomUUID(),sourceDigest:'c'.repeat(64),revision:'1',captions:[{key:'one',evidenceId:'C0001',text:'Synthetic request',observedAt:new Date().toISOString()}]},
    createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()});
  const helper=createHelper({caller:'synthetic',allowedCallers:['synthetic'],enrollmentId:'synthetic',profiles:[profile],readPolicy:async()=>({disabled:false}),
    availableBytes:async()=>64*1024*1024,verifyConsent:async()=>true,...controls,verifyWrite:async()=>true,requireResultProof:true,
    adapters:{stdio:{invoke:async(_profile,a,_signal,{assertDispatch})=>{await assertDispatch();state.content='after';return {version:1,jobId:a.payload.jobId,approvalDigest:a.approvalDigest,sessionId:a.payload.source.sessionId,sourceDigest:a.payload.source.sourceDigest,status:'received',answer:'Synthetic DNS update',citations:['one']};}}}});
  const result=await helper.handle({version:1,requestId:randomUUID(),enrollmentId:'synthetic',operation:'invoke',profileId:profile.id,approval});
  assert.equal(result.state,'verified');assert(reads>=3);assert.equal(result.proof.observation.after.content,'after');
  assert.equal(result.proof.observation.before.content,'before');assert.equal(result.proof.observation.atomicPrecondition,false);
  const {receiptDigest,...receipt}=result.proof;assert.equal(receiptDigest,await contracts.digest(receipt));
});
test('native caller comes from exact documented process arguments, never suffix matching',()=>{
  const caller=`chrome-extension://${'a'.repeat(32)}/`,allowed=[{browser:'chrome',caller}];
  const filename=process.platform==='win32'?'C:\\synthetic\\config.json':'/synthetic/config.json';
  assert.equal(parseLaunch(['--config',filename,caller],allowed).browser,'chrome');
  assert.throws(()=>parseLaunch(['--config',filename,caller+'attacker'],allowed),/caller/);
  assert.throws(()=>parseLaunch(['--config',filename],allowed),/caller/);
});
test('install plan produces reviewable content only and rejects shell metacharacters',()=>{
  const args={browser:'chrome',os:'windows',extensionId:'a'.repeat(32),nodePath:'C:\\Tools\\node.exe',cliPath:'C:\\Tools\\cli.mjs',
    configurationPath:'C:\\Tools\\config.json',launcherPath:'C:\\Tools\\host.cmd',manifestPath:'C:\\Tools\\host.json'};
  const result=createInstallPlan(args);assert.equal(result.dryRunOnly,true);assert(result.launcher.includes('--config'));
  assert.equal(result.manifest.allowed_origins[0],`chrome-extension://${'a'.repeat(32)}/`);
  assert.throws(()=>createInstallPlan({...args,nodePath:'C:\\Tools\\%EVIL%\\node.exe'}),/unsafe/);
});
