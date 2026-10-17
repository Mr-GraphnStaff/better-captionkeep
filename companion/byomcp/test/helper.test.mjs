import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createHelper, contracts} from '../helper.mjs';
import {encodeNative, NativeDecoder, MAX_NATIVE_BYTES, MAX_NATIVE_RESPONSE_BYTES} from '../framing.mjs';
import {publicIPv4, secureFetch} from '../transports.mjs';

async function setup(transport='stdio', operation='read', overrides={}) {
  const profile={id:'synthetic-owner',revision:1,transport,profileDigest:'a'.repeat(64),tools:[
    {name:'controlled_tool',operation,readOnly:operation==='read',reviewedWrite:operation==='write',schemaDigest:'b'.repeat(64)}]};
  const approval=await contracts.sealApproval({jobId:randomUUID(),connection:profile,tool:'controlled_tool',operation,arguments:{exact:'synthetic'},
    privacyMode:'scrubbed',source:{sessionId:randomUUID(),sourceDigest:'c'.repeat(64),revision:'1',captions:[
      {key:'source-1',evidenceId:'C0001',text:'Synthetic caption',observedAt:new Date().toISOString()}]},
    createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()});
  let calls=0;
  const result={version:1,jobId:approval.payload.jobId,approvalDigest:approval.approvalDigest,sessionId:approval.payload.source.sessionId,
    sourceDigest:approval.payload.source.sourceDigest,status:'received',answer:'Synthetic controlled result',citations:['source-1']};
  const adapter={inspect:async()=>[{name:'controlled_tool',schemaDigest:'b'.repeat(64)},{name:'untrusted-write',schemaDigest:'b'.repeat(64)}],
    invoke:async()=>{calls++;return result;}};
  const helper=createHelper({caller:'synthetic-extension',allowedCallers:['synthetic-extension'],enrollmentId:'synthetic-enrollment',profiles:[profile],
    adapters:{[transport]:adapter},readPolicy:async()=>({disabled:false}),verifyConsent:async()=>true,
    authorizeOperation:async()=>true,availableBytes:async()=>64*1024*1024,...overrides});
  const message=operationName=>({version:1,requestId:randomUUID(),enrollmentId:'synthetic-enrollment',operation:operationName,profileId:profile.id});
  return {helper,approval,profile,message,result,calls:()=>calls};
}
for(const transport of ['stdio','remote']) test(`${transport} shared contract executes one approved synthetic call, never inventory tools`,async()=>{
  const fixture=await setup(transport);
  const inventory=await fixture.helper.handle(fixture.message('inventory')); assert.equal(inventory.tools.length,1);assert.equal(fixture.calls(),0);
  const message={...fixture.message('invoke'),approval:fixture.approval};
  const result=await fixture.helper.handle(message);assert.equal(result.state,'verified');
  const duplicate=await fixture.helper.handle(message);assert.equal(duplicate.state,'verified');assert.equal(fixture.calls(),1);
});
test('wrong caller/enrollment, message executable, absent consent and policy deny',async()=>{
  assert.throws(()=>createHelper({caller:'rogue',allowedCallers:[],enrollmentId:'x'}),/enrolled/);
  const fixture=await setup();
  await assert.rejects(fixture.helper.handle({...fixture.message('status'),enrollmentId:'wrong'}),/message/);
  await assert.rejects(fixture.helper.handle({...fixture.message('status'),executable:'evil.exe'}),/fields/);
  const denied=await setup('stdio','read',{verifyConsent:async()=>false});
  await assert.rejects(denied.helper.handle({...denied.message('invoke'),approval:denied.approval}),/consent/);
  const disabled=await setup('stdio','read',{readPolicy:async()=>({disabled:true})});
  await assert.rejects(disabled.helper.handle({...disabled.message('invoke'),approval:disabled.approval}),/policy/);
  const unapproved=await setup('remote','write',{authorizeOperation:async()=>false});
  await assert.rejects(unapproved.helper.handle({...unapproved.message('invoke'),approval:unapproved.approval}),/operation/);
  assert.equal(unapproved.calls(),0);
});
test('unknown/low capacity prevents optional dispatch',async()=>{
  for(const capacity of [null,0,16*1024*1024]) {
    const fixture=await setup('stdio','read',{availableBytes:async()=>capacity});
    await assert.rejects(fixture.helper.handle({...fixture.message('invoke'),approval:fixture.approval}),/capacity/);assert.equal(fixture.calls(),0);
  }
});
test('approval expiry during admission rejects before the adapter is invoked',async()=>{
  let time=Date.now();
  const fixture=await setup('remote','read',{now:()=>time,availableBytes:async()=>{time+=120000;return 64*1024*1024;}});
  time=Date.parse(fixture.approval.payload.createdAt);
  const result=await fixture.helper.handle({...fixture.message('invoke'),approval:fixture.approval});
  assert.equal(fixture.calls(),0);assert.notEqual(result.state,'verified');assert.equal(result.result,null);
});
test('policy denial during final operation authorization blocks dispatch before adapter entry',async()=>{
  let disabled=false,authorizations=0;
  const fixture=await setup('remote','read',{readPolicy:async()=>({disabled}),authorizeOperation:async()=>{
    if(++authorizations===2) disabled=true;return true;
  }});
  const result=await fixture.helper.handle({...fixture.message('invoke'),approval:fixture.approval});
  assert.equal(fixture.calls(),0);assert.notEqual(result.state,'verified');assert.equal(result.result,null);
});
test('reviewed write does not become verified without independent postcondition verification',async()=>{
  const fixture=await setup('remote','write');
  const result=await fixture.helper.handle({...fixture.message('invoke'),approval:fixture.approval});assert.equal(result.state,'outcome-unknown');assert.equal(result.result,null);
  const verified=await setup('remote','write',{verifyWrite:async()=>true});
  assert.equal((await verified.helper.handle({...verified.message('invoke'),approval:verified.approval})).state,'verified');
});
for(const change of ['cancel','policy']) test(`${change} during independent write verification never returns or retains candidate result`,async()=>{
  let entered,release,disabled=false;const started=new Promise(resolve=>entered=resolve),waiting=new Promise(resolve=>release=resolve);
  const fixture=await setup('remote','write',{readPolicy:async()=>({disabled}),verifyWrite:async()=>{entered();await waiting;return true;}});
  const invocation=fixture.helper.handle({...fixture.message('invoke'),approval:fixture.approval});await started;
  if(change==='cancel') {
    const cancelled=await fixture.helper.handle({...fixture.message('cancel'),jobId:fixture.approval.payload.jobId});
    assert.equal(cancelled.result,null);assert.equal(cancelled.state,'cancelled');
  } else disabled=true;
  release();const result=await invocation;assert.equal(result.result,null);assert.notEqual(result.state,'verified');
});
test('aggregate result reservations cap uncertain jobs before optional budget overflow',async()=>{
  const fixture=await setup();
  const capacity=Math.floor(8*1024*1024/(contracts.bytes(fixture.approval)+contracts.LIMITS.resultBytes));
  for(let i=0;i<capacity;i++) {
    const payload=structuredClone(fixture.approval.payload);payload.jobId=randomUUID();
    const approval=await contracts.sealApproval(payload);
    assert.equal((await fixture.helper.handle({...fixture.message('invoke'),approval})).state,'outcome-unknown');
  }
  const payload=structuredClone(fixture.approval.payload);payload.jobId=randomUUID();
  await assert.rejects(fixture.helper.handle({...fixture.message('invoke'),approval:await contracts.sealApproval(payload)}),/capacity/);
  assert.equal(fixture.calls(),capacity);
});
test('cancellation rejects late returned results and prevents resend',async()=>{
  let release;const pending=new Promise(resolve=>release=resolve);
  let acknowledge;const started=new Promise(resolve=>acknowledge=resolve);
  const fixture=await setup('stdio','read',{adapters:{stdio:{invoke:()=>{acknowledge();return pending;}}}});
  const invocation=fixture.helper.handle({...fixture.message('invoke'),approval:fixture.approval});
  await started;
  const cancelled=await fixture.helper.handle({...fixture.message('cancel'),jobId:fixture.approval.payload.jobId});assert.equal(cancelled.state,'cancelled');
  release(fixture.result);assert.equal((await invocation).state,'cancelled');
});
test('bounded native framing handles split frames, malformed size and truncated EOF',()=>{
  const decoder=new NativeDecoder(),message={version:1,operation:'status'};const frame=encodeNative(message);
  assert.deepEqual(decoder.push(frame.subarray(0,2)),[]);assert.deepEqual(decoder.push(frame.subarray(2)),[message]);decoder.end();
  const oversized=Buffer.alloc(4);oversized.writeUInt32LE(MAX_NATIVE_BYTES+1);assert.throws(()=>new NativeDecoder().push(oversized),/limit/);
  const partial=new NativeDecoder();partial.push(frame.subarray(0,5));assert.throws(()=>partial.end(),/truncated/);
});
test('exact application result boundary fits native status envelope; one byte over rejects',async()=>{
  const fixture=await setup();const result=structuredClone(fixture.result);
  result.answer='';result.answer='x'.repeat(contracts.LIMITS.resultBytes-contracts.bytes(result));
  assert.equal(contracts.bytes(result),contracts.LIMITS.resultBytes);
  contracts.validateResult(fixture.approval,result);
  const reply={version:1,requestId:'x'.repeat(64),ok:true,result:{jobId:fixture.approval.payload.jobId,state:'verified',result}};
  assert(encodeNative(reply).length-4<=MAX_NATIVE_RESPONSE_BYTES);
  assert.throws(()=>contracts.validateResult(fixture.approval,{...result,answer:result.answer+'x'}),/limit/);
  assert.throws(()=>encodeNative({answer:'x'.repeat(MAX_NATIVE_RESPONSE_BYTES)}),/native-limit/);
});
test('remote adapter rejects changed resource/path and private/IPv6 addresses before network',async()=>{
  for(const address of ['127.0.0.1','10.0.0.1','169.254.1.1','172.16.0.1','192.168.0.1','::1','::ffff:8.8.8.8']) assert.equal(publicIPv4(address),false,address);
  assert.equal(publicIPv4('8.8.8.8'),true);
  for(const resource of ['https://127.0.0.1/mcp','https://[::1]/mcp','https://10.0.0.1/mcp']) {
    assert.throws(()=>secureFetch(resource,async()=> 'Bearer synthetic'),/network/);
  }
  let calls=0;const fetch=secureFetch('https://synthetic.invalid/mcp',async()=> 'Bearer synthetic',{send(){calls++;throw Error('must not send');}});
  await assert.rejects(fetch('https://synthetic.invalid/other',{method:'POST'}),/resource/);assert.equal(calls,0);
});
