// Standalone deferred-module unit coverage only. Removed-UI rendered case preserved in fixtures/deferred-mcp/byomcp-workspace.test.cjs.txt.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createWorkflow,runtimeBackend}=require('../teams-captions-saver/byomcpWorkspace.js');
const hash='a'.repeat(64), schema='b'.repeat(64), digest='c'.repeat(64);
function request(){return {source:{sessionId:'synthetic-meeting',sourceDigest:hash,revision:'1',captions:[{key:'one',evidenceId:'C0001',text:'Synthetic proposed DNS change'}]},
    profile:{id:'approved-dns',revision:1,tool:'reviewed_dns_change',schemaDigest:schema,profileGrantId:'grant-one',compatible:true,approved:true,effect:'write',kind:'dns-change'}};}
function fixture(){const calls=[];let current=true;const backend={
    async prepare(input){calls.push(['prepare',input]);return {jobId:'job-one',revision:1,state:'draft',approvalDigest:digest,preview:{jobId:'job-one',
        connection:{id:input.profileId,revision:1,tools:[{name:input.tool,schemaDigest:schema}]},tool:input.tool,operation:input.operation,arguments:input.arguments,
        source:{sourceDigest:hash,sessionId:input.sourceId,revision:'1',captions:input.captionKeys.map(key=>({key}))}}};},
    async approveAndDispatch(input){calls.push(['dispatch',input]);return {jobId:'job-one',revision:2,state:'running'};},
    async cancel(input){calls.push(['cancel',input]);return {jobId:'job-one',revision:3,state:'cancelled'};},
    async pin(input){calls.push(['pin',input]);return {jobId:'job-one',revision:4,state:'pinned',artifactId:'receipt-one'};}
};return {calls,backend,workflow:createWorkflow({backend,stillCurrent:()=>current}),change:()=>{current=false;}};}
test('missing backend is truthfully unavailable and never executes meeting words',async()=>{
    const workflow=createWorkflow();assert.equal(workflow.open(request()).phase,'unavailable');
    await assert.rejects(workflow.prepare({}),/unavailable/);await assert.rejects(workflow.execute({confirmed:true}));
});
test('opening deep-clones source and preparation submits references, not caller evidence as authority',async()=>{
    const f=fixture(), input=request();f.workflow.open(input);input.source.captions[0].text='Changed';
    const state=await f.workflow.prepare({zoneId:'synthetic-zone',proposedValue:'192.0.2.2'});
    assert.equal(state.selection.source.captions[0].text,'Synthetic proposed DNS change');
    assert.deepEqual(Object.keys(f.calls[0][1]).sort(),['arguments','captionKeys','operation','privacyMode','profileId','sourceId','tool']);
    assert.equal(f.calls.some(([name])=>name==='dispatch'),false);
});
test('execution needs separate confirmation and a second click cannot dispatch twice',async()=>{
    const f=fixture();f.workflow.open(request());await f.workflow.prepare({proposedValue:'192.0.2.2'});
    await assert.rejects(f.workflow.execute());await f.workflow.execute({confirmed:true});
    await assert.rejects(f.workflow.execute({confirmed:true}));assert.equal(f.calls.filter(([name])=>name==='dispatch').length,1);
});
test('argument editing invalidates previous exact preview',async()=>{
    const f=fixture();f.workflow.open(request());await f.workflow.prepare({});f.workflow.edit();
    await assert.rejects(f.workflow.execute({confirmed:true}));assert.equal(f.calls.length,1);
});
test('source change during preparation prevents later operation approval',async()=>{
    const f=fixture();const original=f.backend.prepare;f.backend.prepare=async input=>{const response=await original(input);f.change();return response;};
    f.workflow.open(request());await assert.rejects(f.workflow.prepare({}));assert.equal(f.workflow.getState().phase,'unavailable');
    assert.equal(f.calls.some(([name])=>name==='dispatch'),false);
});
test('cancellation during dispatch never accepts a late success or claims undo',async()=>{
    const f=fixture();let finish;f.backend.approveAndDispatch=()=>new Promise(resolve=>{finish=resolve;});
    f.workflow.open(request());await f.workflow.prepare({});const dispatched=f.workflow.execute({confirmed:true});
    await f.workflow.cancel();finish({jobId:'job-one',revision:2,state:'running'});await dispatched;
    assert.equal(f.workflow.getState().phase,'canceled');assert.match(f.workflow.getState().message,/does not undo/);
});
test('a service success without trusted job proof remains unverified and cannot be pinned',async()=>{
    const f=fixture();f.workflow.open(request());await f.workflow.prepare({});await f.workflow.execute({confirmed:true});
    assert.equal(f.workflow.acceptResult({jobId:'job-one',approvalDigest:digest,sourceDigest:hash,status:'success',answer:'Done'}).phase,'unverified');
    await assert.rejects(f.workflow.pin({confirmed:true}));assert.equal(f.calls.some(([name])=>name==='pin'),false);
});
test('trusted source-bound receipt verification and explicit review retain a separate artifact with current revision',async()=>{
    const f=fixture();f.workflow.open(request());await f.workflow.prepare({});await f.workflow.execute({confirmed:true});
    f.workflow.acceptStatus({jobId:'job-one',revision:3,state:'verified',result:{jobId:'job-one',approvalDigest:digest,sourceDigest:hash,status:'received',answer:'Synthetic result [C0001]',citations:['one']},
        proof:{verified:true,jobId:'job-one',approvalDigest:digest,sourceDigest:hash,receiptDigest:'e'.repeat(64)}});
    await assert.rejects(f.workflow.pin());assert.equal((await f.workflow.pin({confirmed:true})).phase,'pinned');
    assert.deepEqual(f.calls.at(-1),['pin',{jobId:'job-one',expectedRevision:3}]);
});
test('a proof embedded in remote output does not authorize pinning',async()=>{
    const f=fixture();f.workflow.open(request());await f.workflow.prepare({});await f.workflow.execute({confirmed:true});
    const remote={jobId:'job-one',approvalDigest:digest,sourceDigest:hash,status:'received',answer:'Done',citations:['one'],
        proof:{verified:true,jobId:'job-one',approvalDigest:digest,sourceDigest:hash,receiptDigest:'e'.repeat(64)}};
    assert.equal(f.workflow.acceptResult(remote).phase,'unverified');await assert.rejects(f.workflow.pin({confirmed:true}));
});
test('late verified status after source change is not displayed as verified',async()=>{
    const f=fixture();f.workflow.open(request());await f.workflow.prepare({});await f.workflow.execute({confirmed:true});f.change();
    assert.throws(()=>f.workflow.acceptStatus({jobId:'job-one',revision:3,state:'verified',result:{}}),/source changed/);
    assert.equal(f.workflow.getState().phase,'unavailable');
});
test('a final blocked dispatch response is displayed honestly rather than reported complete',async()=>{
    const f=fixture();f.backend.approveAndDispatch=async()=>({jobId:'job-one',revision:2,state:'blocked'});
    f.workflow.open(request());await f.workflow.prepare({});assert.equal((await f.workflow.execute({confirmed:true})).phase,'blocked');
});
test('final verified dispatch is accepted, but missing materialized artifact never claims a retained Receipt',async()=>{
    const f=fixture();f.backend.approveAndDispatch=async()=>({jobId:'job-one',revision:3,state:'verified',result:{jobId:'job-one',approvalDigest:digest,sourceDigest:hash,status:'received',answer:'Synthetic result',citations:['one']},
        proof:{verified:true,jobId:'job-one',approvalDigest:digest,sourceDigest:hash,receiptDigest:'e'.repeat(64)}});
    f.backend.pin=async()=>({jobId:'job-one',revision:3,state:'unmaterialized'});
    f.workflow.open(request());await f.workflow.prepare({});assert.equal((await f.workflow.execute({confirmed:true})).phase,'verified');
    assert.equal((await f.workflow.pin({confirmed:true})).phase,'unmaterialized');assert.match(f.workflow.getState().message,/not been pinned/);
});
test('runtime prepare sends only authoritative worker references and exact user arguments',async()=>{
    const calls=[];const backend=runtimeBackend({sendMessage:async message=>{calls.push(message);return {ok:true};}});
    await backend.prepare({sourceId:'synthetic',profileId:'profile',tool:'named',operation:'read',arguments:{purpose:'Synthetic'},captionKeys:['one'],privacyMode:'scrubbed'});
    assert.deepEqual(calls[0],{message:'byomcp_action',operation:'prepare',request:{sourceSessionRef:'synthetic',profileId:'profile',tool:'named',operation:'read',arguments:{purpose:'Synthetic'},captionKeys:['one'],privacyMode:'scrubbed'}});
    assert(!JSON.stringify(calls).includes('sourceDigest'));assert(!JSON.stringify(calls).includes('profileGrantId'));
});
test('preview cannot substitute source session, caption keys or tool schema',async()=>{
    for (const mutate of [preview=>{preview.source.sessionId='another-meeting';},preview=>{preview.source.captions=[{key:'another'}];},preview=>{preview.connection.tools[0].schemaDigest='d'.repeat(64);}]) {
        const f=fixture(), original=f.backend.prepare;f.backend.prepare=async input=>{const response=await original(input);mutate(response.preview);return response;};
        f.workflow.open(request());await assert.rejects(f.workflow.prepare({}));assert.equal(f.workflow.getState().phase,'unavailable');
    }
});
