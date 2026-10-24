import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {compileCloudflareDns,parseCloudflareResponse} from '../cloudflare-dns.mjs';
import {createSdkAdapters} from '../transports.mjs';
import {createControlledActions} from '../controlled-actions.mjs';
import {contracts,createHelper} from '../helper.mjs';
const schema={type:'object',properties:{code:{type:'string'},account_id:{type:'string'}},required:['code'],additionalProperties:false};
async function fixture() {
  const profile={id:'cloudflare-synthetic',label:'Cloudflare synthetic',revision:1,transport:'remote',resource:'https://mcp.cloudflare.com/mcp',credentialReference:'SYNTHETIC_TOKEN',
    tools:[{name:'execute',operation:'write',reviewedWrite:true,schemaDigest:await contracts.digest({input:schema,output:null})}],profileDigest:'a'.repeat(64)};
  const action={kind:'dns-change',tool:'execute',accountId:'1'.repeat(32),zoneIds:['2'.repeat(32)]};
  const args={accountId:action.accountId,zoneId:action.zoneIds[0],recordId:'3'.repeat(32),recordType:'TXT',recordName:'fixture.example.invalid',
    expectedCurrentValue:'before',proposedValue:'after',ttl:300,proxied:false};
  const state={id:args.recordId,type:'TXT',name:args.recordName,content:'before',ttl:300,proxied:false},requests=[];
  let zoneAccount=args.accountId;
  const cloudflare={request:async request=>{
    requests.push(structuredClone(request));
    if(request.path===`/zones/${args.zoneId}` && request.method==='GET') return {success:true,result:{id:args.zoneId,account:{id:zoneAccount}}};
    assert.equal(request.path,`/zones/${args.zoneId}/dns_records/${args.recordId}`);
    if(request.method==='PATCH') Object.assign(state,structuredClone(request.body));
    else assert.equal(request.method,'GET');
    return {success:true,result:structuredClone(state)};
  }};
  const evaluate=parameters=>vm.runInNewContext(`(${parameters.code})()`,{cloudflare},{timeout:1000});
  return {profile,action,args,state,requests,evaluate,wrongAccount(){zoneAccount='9'.repeat(32);}};
}
test('finite compiler emits only exact scoped GET/GET/PATCH and treats supplied content as data',async()=>{
  const f=await fixture();f.args.proposedValue='";globalThis.unexpected=true;//';
  const parameters=compileCloudflareDns(f.profile,f.action,f.args,'update');
  assert.deepEqual(Object.keys(parameters).sort(),['account_id','code']);assert.equal(parameters.account_id,f.args.accountId);
  const result=await f.evaluate(parameters);
  assert.equal(result.content,f.args.proposedValue);assert.deepEqual(f.requests.map(value=>value.method),['GET','GET','PATCH']);
  assert.deepEqual(f.requests[2].body,{content:f.args.proposedValue,ttl:300,proxied:false});
  f.requests.length=0;await f.evaluate(compileCloudflareDns(f.profile,f.action,f.args,'observe'));
  assert.deepEqual(f.requests.map(value=>value.method),['GET','GET']);
});
test('wrong zone account and changed before-state cannot reach PATCH; user code/URL fields denied',async()=>{
  const f=await fixture();f.wrongAccount();await assert.rejects(f.evaluate(compileCloudflareDns(f.profile,f.action,f.args,'update')),/account-zone/);
  assert(!f.requests.some(value=>value.method==='PATCH'));
  const g=await fixture();g.state.content='someone else changed it';await assert.rejects(g.evaluate(compileCloudflareDns(g.profile,g.action,g.args,'update')),/precondition/);
  assert(!g.requests.some(value=>value.method==='PATCH'));
  assert.throws(()=>compileCloudflareDns(g.profile,g.action,{...g.args,code:'arbitrary'},'update'),/denied/);
  assert.throws(()=>compileCloudflareDns({...g.profile,resource:'https://attacker.invalid/mcp'},g.action,g.args,'update'),/denied/);
});
test('real SDK fixture executes helper precheck / compiled update / separate readback and produces typed proof',async()=>{
  const f=await fixture(),entries=[{profile:f.profile,actions:[f.action]}],seen=[];
  const adapters=createSdkAdapters({cloudflareActions:entries,remoteFetchFactory:()=>async(_url,options)=>{
    const message=JSON.parse(options.body);let result;
    if(message.method==='server/discover') result={supportedVersions:['2026-07-28'],capabilities:{tools:{}},_meta:{'io.modelcontextprotocol/serverInfo':{name:'synthetic-cloudflare',version:'1'}}};
    else if(message.method==='tools/list') result={tools:[{name:'execute',inputSchema:schema}],ttlMs:0,cacheScope:'private',resultType:'complete'};
    else if(message.method==='tools/call') {
      assert.equal(message.params.name,'execute');seen.push(message.params.arguments);
      const value=await f.evaluate(message.params.arguments);result={content:[{type:'text',text:JSON.stringify(value)}],resultType:'complete'};
    } else throw Error('unexpected-fixture-method');
    return new Response(JSON.stringify({jsonrpc:'2.0',id:message.id,result}),{headers:{'content-type':'application/json'}});
  }});
  const controls=createControlledActions({entries,readState:(profile,action,args)=>adapters.remote.observeCloudflareDns(profile,action,args)});
  const helper=createHelper({caller:'fixture',allowedCallers:['fixture'],enrollmentId:'fixture',profiles:[f.profile],adapters,...controls,
    requireResultProof:true,verifyWrite:async()=>true,verifyConsent:async()=>true,availableBytes:async()=>64*1024*1024,readPolicy:async()=>({disabled:false})});
  const approval=await contracts.sealApproval({jobId:randomUUID(),connection:f.profile,tool:'execute',operation:'write',arguments:f.args,privacyMode:'scrubbed',
    source:{sessionId:randomUUID(),sourceDigest:'c'.repeat(64),revision:'1',captions:[{key:'source',evidenceId:'C0001',text:'Synthetic DNS request',observedAt:new Date().toISOString()}]},
    createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()});
  const result=await helper.handle({version:1,requestId:randomUUID(),enrollmentId:'fixture',operation:'invoke',profileId:f.profile.id,approval});
  assert.equal(result.state,'verified');assert.equal(result.proof.observation.before.content,'before');assert.equal(result.proof.observation.after.content,'after');
  assert.equal(f.requests.filter(request=>request.method==='PATCH').length,1);assert(seen.length>=4);
  assert(!JSON.stringify(seen).includes('Synthetic DNS request')); // No transcript needed by this typed provider action.
  assert.equal(result.proof.observation.atomicPrecondition,false);await adapters.remote.disconnect();
});
test('official text-result format is bounded JSON; truncation/error/extra output is not evidence',()=>{
  for(const response of [{isError:true},{content:[{type:'text',text:'--- TRUNCATED ---'}]},
    {content:[{type:'text',text:'{"answer":"pretend success"}'}]},{content:[{type:'text',text:'x'.repeat(17000)}]}]) assert.throws(()=>parseCloudflareResponse(response));
});
