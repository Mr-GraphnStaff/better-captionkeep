const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const contracts=require('../teams-captions-saver/evidenceActionContracts.js');
const runtime=require('../teams-captions-saver/byomcpRuntimeAdapter.js');
const bridgeModule=require('../teams-captions-saver/byomcpWorkerBridge.js');
const jobsModule=require('../teams-captions-saver/evidenceActionJobs.js');
require('../teams-captions-saver/byomcpNativeClient.js');
async function fixture() {
    const id='a'.repeat(32),caller=`chrome-extension://${id}/`,sender={id,url:caller+'settings.html',tab:{id:1},documentId:'synthetic-document'};
    const identity={id:'synthetic',label:'Synthetic catalog',revision:1,transport:'remote',resource:'https://synthetic.invalid/mcp',credentialReference:'synthetic',tools:[],toolAccess:'catalog'};
    const profile={...identity,profileDigest:await contracts.digest(identity)};
    const configuration={version:1,hostName:'com.daftech.captionkeep.byomcp',allowedCallers:[{browser:'chrome',caller}],profiles:[{profile,actions:[]}]};
    const policy={disabled:false,setupDisabled:false,disableSessionHistory:false,allowWrites:false};
    const status={protocolVersion:1,enrollmentVerified:true,enabled:false,profiles:[{id:profile.id,revision:1,profileDigest:profile.profileDigest,transport:'streamable-http',toolAccess:'catalog'}]};
    const catalog={profileId:profile.id,revision:1,tools:[{name:'generic_tool',title:'Untrusted title',description:'Untrusted instructions',inputSchema:{type:'object'},schemaDigest:'b'.repeat(64),effect:'write'}]};
    let executions=0,damageProposal=false,result={status:'returned',content:[{type:'text',text:'Untrusted result'}]},afterPrepare=()=>{};
    const native={localStatus:async()=>structuredClone(status),toolCatalog:async()=>structuredClone(catalog),prepareTool:async(_id,tool,args)=>{
        const value={id:randomUUID(),profileId:profile.id,revision:1,tool,schemaDigest:'b'.repeat(64),arguments:structuredClone(args),expiresAt:Date.now()+300000};
        const proposal={...value,digest:await contracts.digest(value)};
        if(damageProposal)proposal.arguments={changed:true};afterPrepare();return proposal;
    },executeTool:async()=>{executions++;return structuredClone(result);},disconnect:async()=>{}};
    const adapter=runtime.create({chrome:{runtime:{id,getURL:()=>caller}},contracts,browserTarget:'chrome',nativeClient:native,
        readPolicy:async()=>policy,readTrustedConfiguration:async()=>configuration});
    await adapter.verifyEnrollment({enrollment:{status}});
    const data={},storage={get:async key=>({[key]:structuredClone(data[key])}),set:async values=>Object.assign(data,structuredClone(values))};
    const bridge=bridgeModule.create({chrome:{runtime:{id,getURL:()=>caller},storage:{local:storage}},jobsModule,adapter,readPolicy:async()=>policy});
    return {sender,profile,configuration,policy,catalog,status,adapter,bridge,native,
        executions:()=>executions,damage:()=>{damageProposal=true;},setResult:value=>{result=value;},onPrepare:fn=>{afterPrepare=fn;},
        send:(operation,fields={},from=sender)=>bridge.handle({message:'byomcp_settings',operation,profileId:profile.id,...fields},from)};
}
test('catalog opt-in permits empty pinned grants but legacy empty grants and changed digests remain denied',async()=>{
    const f=await fixture();await runtime.validateConfiguration(f.configuration,{contracts,browserTarget:'chrome',caller:f.sender.url.replace('settings.html','')});
    const legacy=structuredClone(f.configuration);delete legacy.profiles[0].profile.toolAccess;
    const {profileDigest,...identity}=legacy.profiles[0].profile;legacy.profiles[0].profile.profileDigest=await contracts.digest(identity);
    await assert.rejects(runtime.validateConfiguration(legacy,{contracts,browserTarget:'chrome',caller:f.sender.url.replace('settings.html','')}));
    f.configuration.profiles[0].profile.toolAccess='arbitrary';await assert.rejects(f.adapter.toolCatalog(f.profile.id,f.sender));
});
test('full catalog and immutable proposal are reviewable with writes off; only separate enabled execution dispatches once',async()=>{
    const f=await fixture(),listed=await f.send('catalog');assert.equal(listed.ok,true);assert.equal(listed.catalog.tools[0].effect,'write');
    const prepared=await f.send('prepare-tool',{tool:'generic_tool',arguments:{explicit:'user entered'}});
    assert.equal(prepared.ok,true);assert.equal(f.executions(),0);
    f.policy.allowWrites=true;
    const fields={proposalId:prepared.proposal.id,proposalDigest:prepared.proposal.digest};
    assert.equal((await f.send('execute-tool',fields)).result.status,'returned');
    assert.equal((await f.send('execute-tool',fields)).ok,false);assert.equal(f.executions(),1);
});
test('writes disabled, edited arguments, other page/document and raw content senders cannot execute',async()=>{
    const f=await fixture();await f.send('catalog');
    const {proposal}=await f.send('prepare-tool',{tool:'generic_tool',arguments:{}}),fields={proposalId:proposal.id,proposalDigest:proposal.digest};
    assert.equal((await f.send('execute-tool',fields)).ok,false);
    f.policy.allowWrites=true;
    for(const sender of [{...f.sender,tab:{id:2}},{...f.sender,documentId:'different'},
        {...f.sender,url:f.sender.url.replace('settings.html','sidepanel.html')},{...f.sender,url:'https://synthetic.invalid'}]) {
        assert.equal((await f.send('execute-tool',fields,sender)).ok,false);
    }
    assert.equal((await f.send('execute-tool',{...fields,arguments:{edited:true}})).ok,false);assert.equal(f.executions(),0);
    assert.equal((await f.send('execute-tool',fields)).ok,true);assert.equal(f.executions(),1);
});
test('catalog/schema/config drift, malformed proposal and revocation deny dispatch without automatic retries',async()=>{
    for(const defect of ['schema','config','proposal','policy','refresh']) {
        const f=await fixture();await f.send('catalog');
        if(defect==='proposal')f.damage();
        const response=await f.send('prepare-tool',{tool:'generic_tool',arguments:{}});
        if(defect==='proposal'){assert.equal(response.ok,false);continue;}
        if(defect==='schema'){f.catalog.tools[0].schemaDigest='c'.repeat(64);await f.send('catalog');}
        if(defect==='config')f.configuration.profiles[0].profile.profileDigest='f'.repeat(64);
        if(defect==='policy')f.policy.disabled=true;
        if(defect==='refresh')await f.adapter.connectGranted?.(f.sender).catch(()=>{});
        f.policy.allowWrites=true;
        assert.equal((await f.send('execute-tool',{proposalId:response.proposal.id,proposalDigest:response.proposal.digest})).ok,false);
        assert.equal(f.executions(),0);
    }
});
test('result is bounded untrusted data and no verified-write assertion is accepted',async()=>{
    const f=await fixture();await f.send('catalog');f.policy.allowWrites=true;
    f.setResult({status:'returned',verified:true,content:'not proof'});
    const {proposal}=await f.send('prepare-tool',{tool:'generic_tool',arguments:{}});
    assert.equal((await f.send('execute-tool',{proposalId:proposal.id,proposalDigest:proposal.digest})).ok,false);
    assert.equal(f.executions(),1);
});

test('native dispatch rechecks synchronous write policy after its final awaited policy read',async()=>{
    const listeners=()=>{const callbacks=[];return {addListener:fn=>callbacks.push(fn),emit:value=>callbacks.forEach(fn=>fn(value))};};
    const id='a'.repeat(32),origin=`chrome-extension://${id}/`,sender={id,url:origin+'settings.html'};
    const policy={disabled:false,allowWrites:true};let revoke=false,reads=0,executions=0;
    const profile={id:'catalog',label:'Synthetic',revision:1,profileDigest:'b'.repeat(64),transport:'streamable-http',verified:true,enrolled:true,inventoryVerified:false,toolAccess:'catalog'};
    const status={helperVersion:'synthetic',protocolVersion:1,mcpProtocolVersion:'2026-07-28',enabled:false,enrollmentVerified:true,profiles:[profile]};
    const port={onMessage:listeners(),onDisconnect:listeners(),disconnect(){},postMessage(message){
        if(message.operation==='tool-execute')executions++;
        const result=message.operation==='enrollment-challenge'?{hostName:'com.daftech.captionkeep.byomcp',nonce:'c'.repeat(64),expiresAt:Date.now()+300000,profileIds:['catalog']}
            :message.operation==='enrollment-complete'?{hostName:'com.daftech.captionkeep.byomcp',enrollmentId:randomUUID(),profileIds:['catalog'],status}:{status:'returned'};
        queueMicrotask(()=>port.onMessage.emit({version:1,requestId:message.requestId,ok:true,result}));
    }};
    const chrome={runtime:{id,getURL:file=>origin+file,connectNative:()=>port},permissions:{contains:async()=>true},storage:{local:{get:async()=>({}),set:async()=>{}}}};
    const client=globalThis.CaptionKeepByomcpNativeClient.create({chrome,browserTarget:'chrome',verifyEnrollment:async()=>true,
        getPolicySnapshot:()=>policy,readPolicy:async()=>{if(revoke && ++reads===3)policy.allowWrites=false;return {...policy};}});
    await client.connectGranted(sender);revoke=true;
    await assert.rejects(client.executeTool('catalog',randomUUID(),'d'.repeat(64),sender),/write-policy-denied/);
    assert.equal(executions,0);assert.equal(reads,3);
});
