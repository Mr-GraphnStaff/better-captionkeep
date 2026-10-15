import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import {serveNative} from '../native.mjs';
import {encodeNative} from '../framing.mjs';
import {createHelper,contracts} from '../helper.mjs';
import {validateConfiguredProfiles,createEnrollmentAuthority,createNativeSession,NATIVE_HOST_NAME} from '../enrollment.mjs';
import {createSdkAdapters} from '../transports.mjs';
import {reply} from './fixtures/mcp-server.mjs';

async function setup(overrides={}) {
  let time=Date.now(),calls=0,disabled=false;
  const tools=[{name:'synthetic_write',description:'Untrusted <script>ignored</script>',inputSchema:{type:'object'},schemaDigest:'b'.repeat(64),effect:'write'}];
  const profile={id:'synthetic',label:'Synthetic',revision:1,transport:'remote',tools:[],toolAccess:'catalog',profileDigest:'a'.repeat(64)};
  const adapter={catalog:async()=>tools,catalogInvoke:async(_profile,proposal,_signal,{assertDispatch})=>{await assertDispatch();calls++;return {content:[{type:'text',text:JSON.stringify(proposal.arguments)}],structuredContent:{synthetic:true}};}};
  const helper=createHelper({caller:'synthetic',allowedCallers:['synthetic'],enrollmentId:'synthetic-enrollment',profiles:[profile],adapters:{remote:adapter},
    now:()=>time,readPolicy:async()=>({disabled}),verifyConsent:async()=>true,...overrides});
  const message=(operation,fields={})=>({version:1,requestId:randomUUID(),enrollmentId:'synthetic-enrollment',profileId:profile.id,operation,...fields});
  return {helper,message,tools,adapter,calls:()=>calls,time:value=>{time=value;},disable:()=>{disabled=true;}};
}
test('catalog is opt-in, conservative write metadata; prepare seals exact args and executes once without verified receipt',async()=>{
  const f=await setup();const listed=await f.helper.handle(f.message('tool-catalog'));
  assert.equal(listed.tools[0].effect,'write');assert.equal(f.calls(),0);
  const args={exact:'synthetic'},proposal=await f.helper.handle(f.message('tool-prepare',{tool:'synthetic_write',arguments:args}));
  args.exact='changed';const {digest,...payload}=proposal;assert.equal(digest,await contracts.digest(payload));
  assert.equal(proposal.arguments.exact,'synthetic');assert.equal(f.calls(),0);
  const execution=f.message('tool-execute',{proposalId:proposal.id,proposalDigest:proposal.digest});
  const result=await f.helper.handle(execution);assert.equal(result.status,'returned');assert.equal(result.verified,undefined);assert.equal(result.state,undefined);
  assert.equal(f.calls(),1);await assert.rejects(f.helper.handle(execution),/proposal/);
});
test('legacy profile cannot expose catalog or dispatch generic tools',async()=>{
  const f=await setup({profiles:[{id:'synthetic',transport:'remote',revision:1,profileDigest:'a'.repeat(64),tools:[]}]});
  for(const operation of ['tool-catalog','tool-prepare','tool-execute']) await assert.rejects(f.helper.handle(f.message(operation)),/catalog-denied/);
});
test('argument bounds, unknown tools, injected process config and malformed catalog reject',async()=>{
  const f=await setup();for(const args of [null,[],{large:'x'.repeat(65537)},{bad:NaN}]) await assert.rejects(f.helper.handle(f.message('tool-prepare',{tool:'synthetic_write',arguments:args})),/arguments|invalid-json/);
  await assert.rejects(f.helper.handle(f.message('tool-prepare',{tool:'missing',arguments:{}})),/tool/);
  await assert.rejects(f.helper.handle({...f.message('tool-catalog'),executable:'evil'}),/fields/);
  f.tools.push({...f.tools[0]});await assert.rejects(f.helper.handle(f.message('tool-catalog')),/catalog/);
});
test('expiry, digest mismatch, revoked policy and missing consent never dispatch',async()=>{
  for(const variant of ['expiry','digest','policy','consent']) {
    const f=await setup(variant==='consent'?{verifyConsent:async()=>false}:{});
    const p=await f.helper.handle(f.message('tool-prepare',{tool:'synthetic_write',arguments:{}}));
    if(variant==='expiry') f.time(p.expiresAt);if(variant==='policy') f.disable();
    const execute=f.helper.handle(f.message('tool-execute',{proposalId:p.id,proposalDigest:variant==='digest'?'c'.repeat(64):p.digest}));
    if(variant==='consent') assert.equal((await execute).status,'outcome-unknown');else await assert.rejects(execute);
    assert.equal(f.calls(),0);
  }
});
test('concurrent duplicate execution dispatches once; disconnect cancels and cannot create a verified result',async()=>{
  let entered,release;const waiting=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);let calls=0;
  const f=await setup({adapters:{remote:{catalog:async()=>[{name:'synthetic_write',inputSchema:{type:'object'},schemaDigest:'b'.repeat(64),effect:'write'}],
    catalogInvoke:async(_p,_proposal,signal,{assertDispatch})=>{await assertDispatch();calls++;entered();await waiting;assert.equal(signal.aborted,true);return {content:[]};}}}});
  const p=await f.helper.handle(f.message('tool-prepare',{tool:'synthetic_write',arguments:{}})),execute=f.message('tool-execute',{proposalId:p.id,proposalDigest:p.digest});
  const first=f.helper.handle(execute);await started;await assert.rejects(f.helper.handle(execute),/proposal/);
  await f.helper.handle(f.message('disconnect'));release();assert.deepEqual(await first,{status:'outcome-unknown'});assert.equal(calls,1);
});
test('catalog opt-in is part of profile digest, empty typed grants valid only in catalog mode',async()=>{
  const identity={id:'synthetic',label:'Synthetic',revision:1,transport:'remote',resource:'https://synthetic.invalid/mcp',credentialReference:'synthetic',tools:[],toolAccess:'catalog'};
  const profile={...identity,profileDigest:await contracts.digest(identity)};assert.equal((await validateConfiguredProfiles([profile]))[0].toolAccess,'catalog');
  await assert.rejects(validateConfiguredProfiles([{...profile,toolAccess:undefined}]),/profile/);
  await assert.rejects(validateConfiguredProfiles([{...profile,toolAccess:'everything'}]),/profile/);
});
test('proposal count, catalog metadata and nested argument budgets fail closed',async()=>{
  const f=await setup();
  for(let i=0;i<50;i++) await f.helper.handle(f.message('tool-prepare',{tool:'synthetic_write',arguments:{index:i}}));
  await assert.rejects(f.helper.handle(f.message('tool-prepare',{tool:'synthetic_write',arguments:{}})),/proposal-limit/);
  let deep={};for(let i=0;i<14;i++) deep={child:deep};
  await assert.rejects(f.helper.handle(f.message('tool-prepare',{tool:'synthetic_write',arguments:deep})),/arguments-limit|depth-limit/);
  f.tools[0].description='x'.repeat(8193);await assert.rejects(f.helper.handle(f.message('tool-catalog')),/invalid-catalog/);
});
test('policy revoked during consent await cannot dispatch and proposal remains consumed',async()=>{
  let entered,release;const started=new Promise(resolve=>entered=resolve),waiting=new Promise(resolve=>release=resolve);
  const f=await setup({verifyConsent:async()=>{entered();await waiting;return true;}});
  const p=await f.helper.handle(f.message('tool-prepare',{tool:'synthetic_write',arguments:{}})),request=f.message('tool-execute',{proposalId:p.id,proposalDigest:p.digest});
  const result=f.helper.handle(request);await started;f.disable();release();assert.deepEqual(await result,{status:'outcome-unknown'});assert.equal(f.calls(),0);
});
test('actual native session forwards catalog/prepare/execute only after caller-bound enrollment',async()=>{
  const f=await setup(),identity={id:'synthetic',label:'Synthetic',revision:1,transport:'remote',resource:'https://synthetic.invalid/mcp',credentialReference:'synthetic',tools:[],toolAccess:'catalog'};
  const profile={...identity,profileDigest:await contracts.digest(identity)},context={browser:'brave',caller:`chrome-extension://${'a'.repeat(32)}/`,hostName:NATIVE_HOST_NAME};
  const authority=await createEnrollmentAuthority({allowedCallers:[{browser:context.browser,caller:context.caller}],profiles:[profile],confirmLocalUser:async()=>true});
  const session=createNativeSession(authority,context,{adapters:{remote:f.adapter},readPolicy:async()=>({disabled:false}),verifyConsent:async()=>true});
  const challenge=await session.handle({version:1,requestId:randomUUID(),operation:'enrollment-challenge'});
  const enrolled=await session.handle({version:1,requestId:randomUUID(),operation:'enrollment-complete',nonce:challenge.nonce});
  assert.equal(enrolled.status.profiles[0].toolAccess,'catalog');
  const msg=(operation,fields={})=>({...f.message(operation,fields),enrollmentId:enrolled.enrollmentId});
  assert.equal((await session.handle(msg('tool-catalog'))).tools.length,1);
  const p=await session.handle(msg('tool-prepare',{tool:'synthetic_write',arguments:{synthetic:true}}));
  assert.equal((await session.handle(msg('tool-execute',{proposalId:p.id,proposalDigest:p.digest}))).status,'returned');
  await assert.rejects(session.handle({...msg('tool-catalog'),enrollmentId:'wrong'}),/enrolled/);
});
for(const transport of ['remote','stdio']) test(`official SDK ${transport} generic tool round trip uses immutable proposal and rejects changed schema`,async()=>{
  const fixture=fileURLToPath(new URL('./fixtures/mcp-server.mjs',import.meta.url));
  const profile=transport==='stdio'?{transport,executable:process.execPath,executableDigest:createHash('sha256').update(await readFile(process.execPath)).digest('hex'),cwd:path.dirname(fixture),args:[fixture,'--serve'],toolAccess:'catalog'}
    :{transport,resource:'https://synthetic.invalid/mcp',toolAccess:'catalog'};
  const adapters=createSdkAdapters({remoteFetchFactory:()=>async(_url,init)=>new Response(JSON.stringify(reply(JSON.parse(init.body))),{headers:{'content-type':'application/json'}})});
  const adapter=adapters[transport],tools=await adapter.catalog(profile);assert.equal(tools[0].effect,'write');
  const proposal={tool:tools[0].name,schemaDigest:tools[0].schemaDigest,arguments:{query:'synthetic'}};let approvals=0;
  const result=await adapter.catalogInvoke(profile,proposal,new AbortController().signal,{assertDispatch:async()=>{approvals++;}});
  assert.equal(approvals,1);assert.equal(result.structuredContent.answer,'Synthetic SDK reply');
  await assert.rejects(adapter.catalogInvoke(profile,{...proposal,schemaDigest:'c'.repeat(64)},new AbortController().signal,{assertDispatch:async()=>{throw Error('must-not-dispatch');}}),/schema/);
  await adapter.disconnect();
});
test('changed remote catalog with duplicate tool names is rejected before call dispatch',async()=>{
  let duplicate=false,calls=0;
  const adapters=createSdkAdapters({remoteFetchFactory:()=>async(_url,init)=>{
    const message=JSON.parse(init.body),response=reply(message);
    if(message.method==='tools/list' && duplicate) response.result.tools.push(structuredClone(response.result.tools[0]));
    if(message.method==='tools/call') calls++;
    return new Response(JSON.stringify(response),{headers:{'content-type':'application/json'}});
  }});
  const profile={transport:'remote',resource:'https://synthetic.invalid/mcp',toolAccess:'catalog'},adapter=adapters.remote;
  const tools=await adapter.catalog(profile);duplicate=true;
  await assert.rejects(adapter.catalogInvoke(profile,{tool:tools[0].name,schemaDigest:tools[0].schemaDigest,arguments:{}},new AbortController().signal,{assertDispatch:async()=>{}}),/invalid-catalog/);
  assert.equal(calls,0);await adapter.disconnect();
});
for(const ending of ['end','error','close']) test(`native input ${ending} revokes pending catalog dispatch before provider await resolves`,{timeout:5000},async()=>{
  let entered,release,calls=0;const started=new Promise(resolve=>entered=resolve),waiting=new Promise(resolve=>release=resolve);
  const f=await setup({adapters:{remote:{catalog:async()=>[{name:'synthetic_write',inputSchema:{type:'object'},schemaDigest:'b'.repeat(64),effect:'write'}],
    catalogInvoke:async(_profile,_proposal,_signal,{assertDispatch})=>{entered();await waiting;await assertDispatch();calls++;return {content:[]};}}}});
  const p=await f.helper.handle(f.message('tool-prepare',{tool:'synthetic_write',arguments:{}})),input=new PassThrough(),output=new PassThrough();
  output.resume();serveNative(input,output,f.helper);
  input.write(encodeNative(f.message('tool-execute',{proposalId:p.id,proposalDigest:p.digest})));await started;
  const closed=new Promise(resolve=>input.once('close',resolve));
  if(ending==='end') input.end();else if(ending==='error') input.destroy(new Error('synthetic'));else input.destroy();
  await closed;release();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,0);
});
test('native session close during enrollment confirmation cannot create a usable enrollment',async()=>{
  let entered,release;const waiting=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
  const identity={id:'synthetic',label:'Synthetic',revision:1,transport:'remote',resource:'https://synthetic.invalid/mcp',credentialReference:'synthetic',tools:[],toolAccess:'catalog'};
  const profile={...identity,profileDigest:await contracts.digest(identity)},context={browser:'brave',caller:`chrome-extension://${'a'.repeat(32)}/`,hostName:NATIVE_HOST_NAME};
  const authority=await createEnrollmentAuthority({allowedCallers:[{browser:context.browser,caller:context.caller}],profiles:[profile],confirmLocalUser:async()=>{entered();await waiting;return true;}});
  const session=createNativeSession(authority,context),challenge=await session.handle({version:1,requestId:randomUUID(),operation:'enrollment-challenge'});
  const completing=session.handle({version:1,requestId:randomUUID(),operation:'enrollment-complete',nonce:challenge.nonce});await started;
  await session.close();release();await assert.rejects(completing,/disconnected/);
  await assert.rejects(session.handle({version:1,requestId:randomUUID(),operation:'enrollment-challenge'}),/disconnected/);
});
