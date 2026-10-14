const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const contracts = require('../teams-captions-saver/evidenceActionContracts.js');
function input(operation = 'read') {
  return {jobId:randomUUID(), connection:{id:'user-owned',revision:1,transport:'stdio',profileDigest:'a'.repeat(64),
    tools:[{name:'lookup',operation,readOnly:operation === 'read',reviewedWrite:operation === 'write',schemaDigest:'b'.repeat(64)}]},
    tool:'lookup',operation,arguments:{query:'synthetic'},privacyMode:'scrubbed',
    source:{sessionId:randomUUID(),sourceDigest:'c'.repeat(64),revision:'1',captions:[{key:'caption-1',evidenceId:'C0001',text:'Synthetic selected words',observedAt:new Date().toISOString()}]},
    createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};
}
test('sealed approvals are canonical, immutable and isolated before first await', async () => {
  const value=input(); const pending=contracts.sealApproval(value); value.arguments.query='changed';
  const sealed=await pending; assert.equal(sealed.payload.arguments.query,'synthetic');
  assert(Object.isFrozen(sealed.payload.source.captions[0]));
  assert.equal(await contracts.digest({b:2,a:1}),await contracts.digest({a:1,b:2}));
});
test('live provider ISO and archive identities retain their exact existing source IDs', async () => {
  require('../teams-captions-saver/captureCoordinator.js');
  const liveIds=['google-meet','zoom'].map(providerId => global.CaptionKeepCaptureCoordinator.create({
    providerId,surfaceId:'synthetic-surface',normalizeCaption:caption=>caption,
    storage:{async get(){return {};},async set(){},async remove(){}},sendMessage:async()=>({ok:true}),
    now:()=>new Date('2026-10-14T18:23:45.678Z')
  }).getState().recordingStartTime);
  for (const sessionId of [...liveIds,`session_${randomUUID()}`]) {
    const value=input();value.source.sessionId=sessionId;
    const sealed=await contracts.sealApproval(value);assert.equal(sealed.payload.source.sessionId,sessionId);
    assert.equal(contracts.sourceIdentityKind(sessionId),sessionId.startsWith('session_')?'archive-id':'recording-start');
  }
  for(const invalid of ['2026-02-30T18:23:45.678Z','session_../other','2026-10-14','']) assert.throws(()=>contracts.sourceIdentityKind(invalid),/identity/);
});
test('tamper, policy, expiry and connection/tool revision changes fail closed', async () => {
  const value=input(), sealed=await contracts.sealApproval(value);
  await contracts.verifyApproval(sealed,value.connection);
  const tampered=structuredClone(sealed); tampered.payload.arguments.query='wrong';
  await assert.rejects(contracts.verifyApproval(tampered,value.connection),/tampered/);
  await assert.rejects(contracts.verifyApproval(sealed,{...value.connection,revision:2}),/changed/);
  await assert.rejects(contracts.verifyApproval(sealed,value.connection,{disabled:true}),/denied/);
  await assert.rejects(contracts.verifyApproval(sealed,value.connection,{now:Date.parse(value.expiresAt)}),/expired/);
});
test('unknown tools, unreviewed writes, oversized/deep JSON and duplicate sources reject', async () => {
  const unknown=input(); unknown.tool='run_arbitrary_code'; await assert.rejects(contracts.sealApproval(unknown),/tool/);
  const write=input('write'); write.connection.tools[0].reviewedWrite=false; await assert.rejects(contracts.sealApproval(write),/tool/);
  const oversized=input(); oversized.arguments.query='x'.repeat(70000); await assert.rejects(contracts.sealApproval(oversized),/limit/);
  const duplicate=input(); duplicate.source.captions.push({...duplicate.source.captions[0]}); await assert.rejects(contracts.sealApproval(duplicate),/caption/);
  let nested={}; for(let i=0;i<15;i++) nested={nested}; assert.throws(()=>contracts.canonical(nested),/depth/);
});
test('results require exact approval/session/source binding and supplied caption citations', async () => {
  const sealed=await contracts.sealApproval(input());
  const result={version:1,jobId:sealed.payload.jobId,approvalDigest:sealed.approvalDigest,sessionId:sealed.payload.source.sessionId,
    sourceDigest:sealed.payload.source.sourceDigest,status:'received',answer:'Synthetic answer',citations:['caption-1']};
  assert.equal(contracts.validateResult(sealed,result).answer,'Synthetic answer');
  assert.throws(()=>contracts.validateResult(sealed,{...result,sessionId:randomUUID()}),/binding/);
  assert.throws(()=>contracts.validateResult(sealed,{...result,citations:['foreign-caption']}),/citations/);
  assert.throws(()=>contracts.validateResult(sealed,{...result,citations:[]}),/citations/);
});
module.exports={input};
