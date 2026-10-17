const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../teams-captions-saver/evidenceActionContracts.js');
const jobs=require('../teams-captions-saver/evidenceActionJobs.js');
require('../teams-captions-saver/correctionManager.js');
require('../teams-captions-saver/privacyScrubber.js');
const {create,describeSource}=require('../teams-captions-saver/byomcpWorkerBridge.js');
const clone=value=>structuredClone(value);
function fixture() {
    const data={unrelated:true},policy={disabled:false,disableSessionHistory:false,requireScrubbed:true};
    const source={sessionId:'2026-10-14T10:00:00.000Z',sourceDigest:'a'.repeat(64),revision:'1',captions:[
        {key:'one',evidenceId:'C0001',text:'Email test@example.invalid',observedAt:'2026-10-14T10:00:00.000Z'}]};
    const profile={id:'test',revision:1,transport:'stdio',profileDigest:'b'.repeat(64),tools:[{name:'lookup',operation:'read',readOnly:true,schemaDigest:'c'.repeat(64)}]};
    let calls=0;
    const chrome={runtime:{id:'test',getURL:path=>`chrome-extension://test/${path}`},storage:{local:{
        get:async key=>clone({[key]:data[key]}),set:async values=>Object.assign(data,clone(values))}}};
    const sender={id:'test',url:'chrome-extension://test/sidepanel.html'};
    const adapter={localStatus:async()=>({protocolVersion:1,enrollmentVerified:true,enabled:true,profiles:[]}),
        getReviewedProfile:async()=>profile,verifyOperation:async()=>true,verifyResultProof:async approval=>({verified:true,
            jobId:approval.payload.jobId,approvalDigest:approval.approvalDigest,sourceDigest:approval.payload.source.sourceDigest,receiptDigest:'d'.repeat(64)}),
        transport:{invoke:async(_profile,approval,_signal,{assertDispatch})=>{await assertDispatch();calls++;return {version:1,
            jobId:approval.payload.jobId,approvalDigest:approval.approvalDigest,sessionId:source.sessionId,sourceDigest:source.sourceDigest,
            status:'received',answer:'Synthetic',citations:['one']};}}};
    const options={chrome,adapter,readPolicy:async()=>clone(policy),getSource:async id=>id===source.sessionId?clone(source):null,getCapacity:async()=>64*1024*1024};
    const bridge=create(options);
    const request={sourceSessionRef:source.sessionId,profileId:'test',tool:'lookup',operation:'read',arguments:{query:'test@example.invalid'},captionKeys:['one'],privacyMode:'scrubbed'};
    const send=(operation,request)=>bridge.handle({message:'byomcp_action',operation,request},sender);
    return {data,policy,source,chrome,sender,adapter,options,bridge,request,send,calls:()=>calls};
}
test('only exact packaged pages can operate jobs; content scripts and prefix lookalikes denied',async()=>{
    const f=fixture();
    for(const url of ['https://meet.google.com/','chrome-extension://test.evil/sidepanel.html','chrome-extension://test/unknown.html','chrome-extension://test/sidepanel.html/extra'])
        assert.equal((await f.bridge.handle({message:'byomcp_action',operation:'prepare',request:f.request},{...f.sender,url})).error,'sender-denied');
    assert.equal(f.calls(),0);assert.equal(f.data[jobs.KEY],undefined);
});
test('missing adapter or capacity and unknown policy deny without native activity',async()=>{
    const f=fixture();
    for(const overrides of [{adapter:{}},{getCapacity:async()=>null},{readPolicy:async()=>null}]) {
        const bridge=create({...f.options,...overrides});
        assert.equal((await bridge.handle({message:'byomcp_action',operation:'prepare',request:f.request},f.sender)).ok,false);
    }
    const status=await create({...f.options,adapter:{}}).handle({message:'byomcp_settings',operation:'status'},f.sender);
    assert.equal(status.code,'not-installed');assert.equal(f.calls(),0);
});
test('worker resolves and scrubs authority, refuses UI source/grant/proof substitution',async()=>{
    const f=fixture();
    for(const key of ['source','profile','proof','sourceId']) assert.equal((await f.send('prepare',{...f.request,[key]:{}})).ok,false);
    const preview=await f.send('prepare',f.request);
    assert.equal(preview.state,'draft');assert.equal(preview.preview.source.captions[0].text.includes('test@example.invalid'),false);
    assert.equal(preview.preview.arguments.query.includes('test@example.invalid'),false);
    const final=await f.send('approve',{jobId:preview.jobId,expectedRevision:preview.revision,approvalDigest:preview.approvalDigest});
    assert.equal(final.state,'verified');assert.equal(f.calls(),1);
    assert.equal((await f.send('pin',{jobId:final.jobId,expectedRevision:final.revision})).state,'unmaterialized');
});
test('revocation epoch before source deletion rejects late reply and cleanup preserves other keys',async()=>{
    const f=fixture();let release,entered;const waiting=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
    const old=f.adapter.transport.invoke;f.adapter.transport.invoke=async(...args)=>{entered();await waiting;return old(...args);};
    const preview=await f.send('prepare',f.request),pending=f.send('approve',{jobId:preview.jobId,expectedRevision:preview.revision,approvalDigest:preview.approvalDigest});
    await started;await f.bridge.removeSources([f.source.sessionId]);release();
    assert.equal((await pending).state,'deleted');assert.equal(f.data.unrelated,true);assert.equal(f.calls(),0);
});
test('restart recovery never resends and clear preserves only explicitly active source IDs',async()=>{
    const f=fixture(),preview=await f.send('prepare',f.request);
    f.data[jobs.KEY].jobs[preview.jobId].state='running';
    const recreated=create(f.options);assert.equal((await recreated.recover())[0].state,'outcome-unknown');assert.equal(f.calls(),0);
    await recreated.clearExcept(new Set([f.source.sessionId]));assert.equal(Object.keys(f.data[jobs.KEY].jobs).length,1);
    await recreated.clearExcept();assert.equal(Object.keys(f.data[jobs.KEY].jobs).length,0);
});
test('source descriptor preserves ISO/archive identity and full transcript hash without UI metadata',async()=>{
    const transcript=[{key:'one',Text:'Synthetic',capturedAt:'2026-10-14T10:00:01.000Z'}];
    const described=await describeSource('2026-10-14T10:00:00.000Z',transcript);
    assert.equal(described.captions[0].evidenceId,'C0001');assert.equal(described.revision,'1:one');
    transcript[0].Text='Changed';assert.notEqual((await describeSource(described.sessionId,transcript)).sourceDigest,described.sourceDigest);
    await assert.rejects(describeSource('session_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',[{Text:'No time'}]),/source-time/);
});

test('actual archive deletion forwards both archive and stable lineage to optional-job cleanup',async()=>{
    const SessionManager=require('../teams-captions-saver/sessionManager.js');
    const f=fixture(),removed=[],id='session_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    f.data.session_index=[{id,sourceSessionId:f.source.sessionId,chunkCount:1}];f.data[`${id}_chunk_0`]=[{Text:'Synthetic'}];
    const area=f.chrome.storage.local;
    area.get=async keys=>keys===null?clone(f.data):Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,clone(f.data[key])]));
    area.remove=async keys=>{for(const key of (Array.isArray(keys)?keys:[keys])) delete f.data[key];};
    global.chrome=f.chrome;global.CaptionKeepByomcpRetention={removeSources:async ids=>removed.push(...ids)};
    try {
        await new SessionManager(true).deleteSession(id);
        assert.deepEqual(removed,[id,f.source.sessionId]);assert.equal(f.data[`${id}_chunk_0`],undefined);
        assert.equal(f.data.unrelated,true);
    } finally {delete global.chrome;delete global.CaptionKeepByomcpRetention;}
});

test('settings status and inventory never disclose verified metadata after await-time revocation',async()=>{
    for(const operation of ['status','inventory']) for(const disabled of [true,false]) {
        const f=fixture();
        const result=operation==='status' ? {protocolVersion:1,enrollmentVerified:true,enabled:true,profiles:[{id:'test'}]}
            : {profileId:'test',revision:1,tools:[{name:'synthetic'}]};
        const method=operation==='status'?'localStatus':'inventory';
        f.adapter[method]=async()=>{f.policy.disabled=disabled;f.bridge.bump();return result;};
        const response=await f.bridge.handle({message:'byomcp_settings',operation,...(operation==='inventory'?{profileId:'test',revision:1}:{})},f.sender);
        assert.equal(response.ok,false);assert.equal(response.status,undefined);assert.equal(response.inventory,undefined);
    }
});
