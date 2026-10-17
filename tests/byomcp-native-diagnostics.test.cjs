const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const contracts=require('../teams-captions-saver/evidenceActionContracts.js');
const adapterModule=require('../teams-captions-saver/byomcpRuntimeAdapter.js');
require('../teams-captions-saver/byomcpNativeClient.js');
const bridgeModule=require('../teams-captions-saver/byomcpWorkerBridge.js');
const jobsModule=require('../teams-captions-saver/evidenceActionJobs.js');
const HOST='com.daftech.captionkeep.byomcp';
function event(){const listeners=[];return {addListener(fn){listeners.push(fn);},emit(value){for(const fn of listeners)fn(value);}};}
// Synthetic browser Port/permission boundary only. These tests do not launch a
// browser/native process, grant real permissions, authenticate or contact MCP.
async function fixture({browserError,throwAtOpen=false,timeout=false,invalidChallenge=false,invalidEnrollment=false,granted=true,mutateConfiguration,missingConfiguration=false}={}){
    const id='a'.repeat(32),caller=`chrome-extension://${id}/`,data={};
    const policy={disabled:false,setupDisabled:false,disableSessionHistory:false};
    const identity={id:'synthetic',label:'Synthetic',revision:1,transport:'remote',resource:'https://synthetic.invalid/mcp',credentialReference:'synthetic',
        tools:[{name:'inspect',operation:'read',readOnly:true,schemaDigest:'b'.repeat(64)}]};
    const profile={...identity,profileDigest:await contracts.digest(identity)};
    const configuration={version:1,hostName:HOST,allowedCallers:[{browser:'brave',caller}],profiles:[{profile,actions:[]}]};
    mutateConfiguration?.(configuration);
    let connections=0,requests=0,disconnects=0;
    const chrome={runtime:{id,getURL:file=>caller+file,lastError:null,connectNative(host){
        assert.equal(host,HOST);connections++;
        if(throwAtOpen)throw Error(browserError);
        const port={onMessage:event(),onDisconnect:event(),disconnect(){disconnects++;},postMessage(message){
            requests++;
            if(timeout)return;
            queueMicrotask(()=>{
                if(browserError){chrome.runtime.lastError={message:browserError};port.onDisconnect.emit();chrome.runtime.lastError=null;return;}
                const status={helperVersion:'synthetic',protocolVersion:1,mcpProtocolVersion:'2026-07-28',enabled:false,enrollmentVerified:true,
                    profiles:[{id:profile.id,label:profile.label,revision:1,profileDigest:invalidEnrollment?'c'.repeat(64):profile.profileDigest,
                        transport:'streamable-http',verified:true,enrolled:true,inventoryVerified:false}]};
                const result=message.operation==='enrollment-challenge'
                    ? {hostName:HOST,nonce:invalidChallenge?'invalid':'d'.repeat(64),expiresAt:Date.now()+300000,profileIds:[profile.id]}
                    : {hostName:HOST,enrollmentId:randomUUID(),profileIds:[profile.id],status};
                port.onMessage.emit({version:1,requestId:message.requestId,ok:true,result});
            });
        }};
        return port;
    }},permissions:{contains:async()=>granted,onRemoved:event()},storage:{local:{
        get:async key=>({[key]:structuredClone(data[key])}),set:async values=>Object.assign(data,structuredClone(values)),remove:async key=>{delete data[key];}
    }}};
    const adapter=adapterModule.create({chrome,contracts,browserTarget:'brave',timeoutMs:timeout?5:1000,
        readPolicy:async()=>policy,getPolicySnapshot:()=>policy,readTrustedConfiguration:async()=>missingConfiguration?null:configuration});
    const bridge=bridgeModule.create({chrome,jobsModule,adapter,readPolicy:async()=>policy,setEnabled:async enabled=>{policy.disabled=!enabled;}});
    const sender={id,url:caller+'settings.html'};
    return {bridge,adapter,policy,sender,counts:()=>({connections,requests,disconnects}),
        connect:()=>bridge.handle({message:'byomcp_settings',operation:'connect'},sender)};
}
function assertFailure(response,code,stage) {
    const {diagnostic,...outcome}=response;
    assert.deepEqual(outcome,{ok:false,error:'operation-not-verified',code});
    assert.deepEqual(Object.keys(diagnostic).sort(),['at','code','stage']);
    assert.equal(diagnostic.code,code);
    assert(Number.isSafeInteger(diagnostic.at) && diagnostic.at>0 && diagnostic.at<=Date.now());
    if(stage)assert.equal(diagnostic.stage,stage);
}
const cases=[
    ['Specified native messaging host not found.','native-host-not-found'],
    ['Failed to start native messaging host.','native-host-start-failed'],
    ['Access to the specified native messaging host is forbidden.','native-host-forbidden'],
    ['Native host has exited.','native-host-exited'],
    ['Error when communicating with the native messaging host.','native-communication-error'],
    ['C:\\PRIVATE\\credential.json Bearer SYNTHETIC_SECRET tenant@example.invalid','native-connection-failed']
];
for(const [browserError,code] of cases)test(`production NativeClient/RuntimeAdapter/WorkerBridge classifies ${code} without raw disclosure`,async()=>{
    const f=await fixture({browserError});
    const response=await f.connect();
    assertFailure(response,code,'challenge');
    assert.equal(f.policy.disabled,true);
    assert.equal((await f.adapter.localStatus()).enrollmentVerified,false);
    assert.equal(JSON.stringify(response).includes(browserError),false);
    assert.equal(f.counts().connections,1);
});
test('synchronous native launch failure is sanitized through the same production chain',async()=>{
    for(const [browserError,code] of [cases[1],cases.at(-1)]){
        const f=await fixture({browserError,throwAtOpen:true});
        assertFailure(await f.connect(),code,'native-opening');
        assert.equal(f.counts().requests,0);
    }
});
test('bounded timeout and invalid or mismatched enrollment return fixed diagnostic codes',async()=>{
    for(const [options,code] of [[{timeout:true},'native-timeout'],[{invalidChallenge:true},'enrollment-mismatch'],[{invalidEnrollment:true},'enrollment-mismatch']]){
        const f=await fixture(options);
        assertFailure(await f.connect(),code,options.invalidEnrollment?'enrollment':'challenge');
        assert.equal(f.policy.disabled,true);
        assert.equal((await f.adapter.localStatus()).enrollmentVerified,false);
    }
});
test('permission denial does not open a native port; valid synthetic enrollment still succeeds',async()=>{
    const denied=await fixture({granted:false});
    assertFailure(await denied.connect(),'permission-denied','permission-check');
    assert.equal(denied.counts().connections,0);
    const valid=await fixture(),response=await valid.connect();
    assert.equal(response.ok,true);assert.equal(response.status.enrollmentVerified,true);assert.equal(response.status.enabled,false);
    assert.equal(response.diagnostic.stage,'connected');assert.equal(response.diagnostic.code,'connected');
    await valid.adapter.disconnect(valid.sender);
});

test('missing, wrong-browser, wrong-caller and damaged trusted bindings fail before any native launch',async()=>{
    for(const options of [{missingConfiguration:true},
        {mutateConfiguration:config=>{config.allowedCallers[0].browser='chrome';}},
        {mutateConfiguration:config=>{config.allowedCallers[0].caller=`chrome-extension://${'b'.repeat(32)}/`;}},
        {mutateConfiguration:config=>{config.profiles[0].profile.profileDigest='f'.repeat(64);}}]) {
        const f=await fixture(options);
        assertFailure(await f.connect(),'configuration-required','configuration-check');
        assert.deepEqual(f.counts(),{connections:0,requests:0,disconnects:0});
        assert.equal(f.policy.disabled,true);
    }
});

test('a new attempt reports its own stage rather than carrying forward an earlier native failure',async()=>{
    const f=await fixture({browserError:'Specified native messaging host not found.'});
    assertFailure(await f.connect(),'native-host-not-found','challenge');
    f.policy.setupDisabled=true;
    assertFailure(await f.connect(),'native-connection-failed','policy-check');
    assert.equal(f.counts().connections,1);
});
test('untrusted sender and action/provider errors never receive Connect diagnostics',async()=>{
    const f=await fixture();
    assert.deepEqual(await f.bridge.handle({message:'byomcp_settings',operation:'connect'},{...f.sender,url:'https://synthetic.invalid/'}),{ok:false,error:'sender-denied'});
    const response=await f.bridge.handle({message:'byomcp_action',operation:'unsupported',request:{}},f.sender);
    assert.deepEqual(response,{ok:false,error:'operation-not-verified'});
    assert.equal(f.counts().connections,0);
});
