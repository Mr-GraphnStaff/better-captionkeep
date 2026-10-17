const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const contracts = require('../teams-captions-saver/evidenceActionContracts.js');
const {create,KEY,LIMITS} = require('../teams-captions-saver/evidenceActionJobs.js');
const clone = value => structuredClone(value);
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise,resolve};};
function fixture() {
    const source = {sessionId:'2026-10-14T10:00:00.000Z',sourceDigest:'a'.repeat(64),revision:'1',captions:[
        {key:'one',evidenceId:'C0001',text:'Synthetic selected caption',observedAt:'2026-10-14T10:00:00.000Z'}]};
    const profile = {id:'synthetic-profile',revision:1,transport:'stdio',profileDigest:'b'.repeat(64),tools:[
        {name:'synthetic_read',operation:'read',readOnly:true,schemaDigest:'c'.repeat(64)}]};
    const data = {unrelated:{preserved:true}};
    let revision = 0, clock = Date.parse('2026-10-14T10:01:00.000Z'), calls = 0;
    const policy = {disabled:false,disableSessionHistory:false,requireScrubbed:true};
    const storage = {get:async key => clone({[key]:data[key]}),set:async values => {Object.assign(data,clone(values));}};
    const result = approval => ({version:1,jobId:approval.payload.jobId,approvalDigest:approval.approvalDigest,
        sessionId:approval.payload.source.sessionId,sourceDigest:approval.payload.source.sourceDigest,status:'received',answer:'Synthetic reviewed answer',citations:['one']});
    const options = {contracts,storage,now:()=>clock,createId:randomUUID,getAuthorityRevision:()=>revision,
        getSource:async id => id === source.sessionId ? clone(source) : null,getReviewedProfile:async id => id === profile.id ? clone(profile) : null,
        getPolicy:async()=>clone(policy),prepareRelease:async value=>({source:value.source,arguments:value.arguments,privacyMode:'scrubbed'}),
        verifyOperation:async()=>true,verifyApproveIntent:async()=>true,verifyPinIntent:async()=>true,
        verifyResultProof:async approval=>({verified:true,jobId:approval.payload.jobId,approvalDigest:approval.approvalDigest,
            sourceDigest:approval.payload.source.sourceDigest,receiptDigest:'d'.repeat(64)}),getCapacity:async()=>64 * 1024 * 1024,
        transport:{invoke:async (_profile,approval,_signal,{assertDispatch})=>{await assertDispatch(); calls++;return result(approval);}}};
    const request = {sourceId:source.sessionId,profileId:profile.id,tool:'synthetic_read',operation:'read',arguments:{query:'Synthetic'},captionKeys:['one'],privacyMode:'scrubbed'};
    const jobs = create(options);
    const approve = preview => ({jobId:preview.jobId,expectedRevision:preview.revision,approvalDigest:preview.approvalDigest});
    return {source,profile,data,policy,storage,options,request,jobs,approve,result,calls:()=>calls,bump(){revision++;},advance(ms){clock+=ms;}};
}

test('authoritative preview is immutable to callers; attempt persists before I/O; explicit proof and pin',async()=>{
    const f=fixture();
    f.options.transport.invoke=async (_profile,approval,_signal,{assertDispatch})=>{
        assert.equal(f.data[KEY].jobs[approval.payload.jobId].state,'running');
        assert.equal(f.data[KEY].jobs[approval.payload.jobId].attempts,1);
        await assertDispatch();return f.result(approval);
    };
    const jobs=create(f.options), preview=await jobs.prepare(f.request);
    preview.preview.arguments.query='Caller substitution';
    assert.equal((await jobs.getStatus(preview.jobId)).preview.arguments.query,'Synthetic');
    const verified=await jobs.approveAndDispatch(f.approve(preview));
    assert.equal(verified.state,'verified');
    assert.equal(verified.result.answer,'Synthetic reviewed answer');
    assert.equal(verified.proof.verified,true);
    assert.equal((await jobs.pin({jobId:verified.jobId,expectedRevision:verified.revision})).state,'pinned');
    assert.deepEqual(f.data.unrelated,{preserved:true});
});

test('unknown authority, profile, release, consent, proof and capacity are denied by default',async()=>{
    const f=fixture();
    await assert.rejects(create({storage:f.storage,contracts}).prepare(f.request),/authority/);
    for(const override of [{getReviewedProfile:async()=>null},{prepareRelease:async()=>null},{getCapacity:async()=>null}]) {
        await assert.rejects(create({...f.options,...override}).prepare(f.request));
    }
    const consent=create({...f.options,verifyApproveIntent:async()=>false}), preview=await consent.prepare(f.request);
    await assert.rejects(consent.approveAndDispatch(f.approve(preview)),/consent/);
    assert.equal(f.calls(),0);
    const unverified=create({...f.options,verifyResultProof:async()=>null}), another=await unverified.prepare(f.request);
    assert.equal((await unverified.approveAndDispatch(f.approve(another))).state,'outcome-unknown');
});

test('repeated approval never resends a running or uncertain job',async()=>{
    const f=fixture(), waiting=deferred(), started=deferred();
    let calls=0;
    const jobs=create({...f.options,transport:{invoke:async(_profile,approval)=>{calls++;started.resolve();await waiting.promise;return f.result(approval);}}});
    const preview=await jobs.prepare(f.request), first=jobs.approveAndDispatch(f.approve(preview));
    await started.promise;
    assert.equal((await jobs.approveAndDispatch(f.approve(preview))).state,'running');
    waiting.resolve();await first;
    await jobs.approveAndDispatch(f.approve(preview));assert.equal(calls,1);
});

test('worker recreation marks running attempt unknown and stale old reply cannot restore it',async()=>{
    const f=fixture(), waiting=deferred(), started=deferred();
    const jobs=create({...f.options,transport:{invoke:async(_profile,approval)=>{started.resolve();await waiting.promise;return f.result(approval);}}});
    const preview=await jobs.prepare(f.request), pending=jobs.approveAndDispatch(f.approve(preview));await started.promise;
    const resumed=create(f.options);
    assert.equal((await resumed.recover())[0].state,'outcome-unknown');
    waiting.resolve();assert.equal((await pending).state,'outcome-unknown');
    assert.equal((await resumed.approveAndDispatch(f.approve(preview))).state,'outcome-unknown');assert.equal(f.calls(),0);
});

test('source deletion while request is in flight removes owned excerpts and rejects its late reply',async()=>{
    const f=fixture(), waiting=deferred(), started=deferred();
    const jobs=create({...f.options,transport:{invoke:async(_profile,approval)=>{started.resolve();await waiting.promise;return f.result(approval);}}});
    const preview=await jobs.prepare(f.request), pending=jobs.approveAndDispatch(f.approve(preview));await started.promise;
    assert.equal((await jobs.removeSource(f.source.sessionId)).removed,1);
    waiting.resolve();assert.equal((await pending).state,'deleted');
    assert.equal(JSON.stringify(f.data).includes('Synthetic selected caption'),false);
    assert.deepEqual(f.data.unrelated,{preserved:true});
});

test('cancel during trusted verification never exposes candidate result and does not hold queue',async()=>{
    const f=fixture(), waiting=deferred(), started=deferred();
    const jobs=create({...f.options,verifyResultProof:async approval=>{started.resolve();await waiting.promise;return f.options.verifyResultProof(approval);}});
    const preview=await jobs.prepare(f.request), pending=jobs.approveAndDispatch(f.approve(preview));await started.promise;
    const running=await jobs.getStatus(preview.jobId);
    const cancelled=await jobs.cancel({jobId:running.jobId,expectedRevision:running.revision});
    assert.equal(cancelled.result,null);assert.equal(cancelled.state,'cancelled');
    waiting.resolve();assert.equal((await pending).state,'cancelled');
});

test('source/profile/policy revocation during guard awaits prevents dispatch',async()=>{
    for(const kind of ['source','profile','policy']) {
        const f=fixture(), preview=await f.jobs.prepare(f.request);
        let reads=0;
        const jobs=create({...f.options,getPolicy:async()=>{if(++reads===1){
            if(kind==='source')f.source.captions[0].text='Corrected';
            if(kind==='profile')f.profile.revision++;
            if(kind==='policy')f.policy.disabled=true;
            f.bump();
        }return clone(f.policy);}});
        await assert.rejects(jobs.approveAndDispatch(f.approve(preview)),/authority/);assert.equal(f.calls(),0);
    }
});

test('quota or failed attempt persistence prevents transport; aggregate reservations are bounded',async()=>{
    const f=fixture();
    await assert.rejects(create({...f.options,getCapacity:async()=>LIMITS.coreReserve}).prepare(f.request),/capacity/);
    const preview=await f.jobs.prepare(f.request);
    f.storage.set=async values=>{if(Object.values(values[KEY].jobs).some(job=>job.state==='running'))throw Error('Synthetic storage denial');Object.assign(f.data,clone(values));};
    await assert.rejects(f.jobs.approveAndDispatch(f.approve(preview)),/storage/);assert.equal(f.calls(),0);
    const g=fixture();let admitted=0;
    while(true){try{await g.jobs.prepare(g.request);admitted++;}catch(error){assert.match(error.message,/capacity/);break;}assert(admitted<50);}
    assert(admitted>0);assert(JSON.stringify(g.data[KEY]).length<LIMITS.bytes);
});

test('approval/record expiry and managed denial clean only owned jobs, unknown policy preserves recovery',async()=>{
    const f=fixture(), preview=await f.jobs.prepare(f.request);
    f.advance(900001);
    assert.equal((await f.jobs.recover())[0].state,'expired');assert.equal(f.calls(),0);
    const unknown=create({...f.options,getPolicy:async()=>null});await assert.rejects(unknown.recover(),/unavailable/);
    assert.equal((await f.jobs.getStatus(preview.jobId)).state,'expired');
    f.policy.disableSessionHistory=true;f.bump();await f.jobs.recover();
    assert.equal((await f.jobs.getStatus(preview.jobId)).state,'deleted');assert.deepEqual(f.data.unrelated,{preserved:true});
});

test('policy/source change during preview persistence rolls back its newly stored excerpt',async()=>{
    const f=fixture();const original=f.storage.set;
    let first=true;
    f.storage.set=async values=>{await original(values);if(first){first=false;f.policy.disabled=true;f.bump();}};
    await assert.rejects(f.jobs.prepare(f.request),/authority/);
    assert.equal(Object.keys(f.data[KEY].jobs).length,0);assert.deepEqual(f.data.unrelated,{preserved:true});
});

test('pin requires fresh explicit consent and surviving source with original proof',async()=>{
    const f=fixture(), preview=await f.jobs.prepare(f.request), verified=await f.jobs.approveAndDispatch(f.approve(preview));
    await assert.rejects(create({...f.options,verifyPinIntent:async()=>false}).pin({jobId:verified.jobId,expectedRevision:verified.revision}),/pin-consent/);
    f.source.captions.length=0;f.bump();
    await assert.rejects(f.jobs.pin({jobId:verified.jobId,expectedRevision:verified.revision}),/source/);
    assert.equal((await f.jobs.getStatus(verified.jobId)).state,'blocked');
});

test('retention denial during result verification removes the job payload and never retains result',async()=>{
    const f=fixture();
    const jobs=create({...f.options,verifyResultProof:async approval=>{f.policy.disableSessionHistory=true;f.bump();return f.options.verifyResultProof(approval);}});
    const preview=await jobs.prepare(f.request), outcome=await jobs.approveAndDispatch(f.approve(preview));
    assert.equal(outcome.state,'deleted');assert.equal(JSON.stringify(f.data).includes('Synthetic selected caption'),false);
});

test('revocation during result persistence removes verified exposure and history-denied payload',async()=>{
    const f=fixture();const original=f.storage.set;
    f.storage.set=async values=>{await original(values);if(Object.values(values[KEY].jobs).some(job=>job.state==='verified')){
        f.policy.disableSessionHistory=true;f.bump();
    }};
    const preview=await f.jobs.prepare(f.request), outcome=await f.jobs.approveAndDispatch(f.approve(preview));
    assert.equal(outcome.state,'deleted');assert.equal(outcome.result,null);assert.equal(JSON.stringify(f.data).includes('Synthetic selected caption'),false);
});

test('expiry after dispatch preparation and adapter preflight aborts before outbound call',async()=>{
    const f=fixture();let calls=0;
    const jobs=create({...f.options,transport:{invoke:async(_profile,_approval,_signal,{assertDispatch})=>{
        f.advance(900001);await assertDispatch();calls++;throw Error('must not reach outbound');
    }}});
    const preview=await jobs.prepare(f.request), outcome=await jobs.approveAndDispatch(f.approve(preview));
    assert.equal(outcome.state,'outcome-unknown');assert.equal(calls,0);
});

test('cancellation is available while pre-dispatch authorization awaits and requires revision',async()=>{
    const f=fixture(), waiting=deferred(), entered=deferred();let checks=0;
    const jobs=create({...f.options,verifyOperation:async()=>{if(++checks===2){entered.resolve();await waiting.promise;}return true;}});
    const preview=await jobs.prepare(f.request), pending=jobs.approveAndDispatch(f.approve(preview));await entered.promise;
    await assert.rejects(jobs.cancel({jobId:preview.jobId}),/revision/);
    await jobs.cancel({jobId:preview.jobId,expectedRevision:preview.revision});waiting.resolve();
    await assert.rejects(pending,/changed/);assert.equal(f.calls(),0);
});

test('managed denial during attempt persistence removes owned payload before any transport',async()=>{
    const f=fixture();const original=f.storage.set;
    f.storage.set=async values=>{await original(values);if(Object.values(values[KEY].jobs).some(job=>job.state==='running')){
        f.policy.disableSessionHistory=true;f.bump();
    }};
    const preview=await f.jobs.prepare(f.request);
    await assert.rejects(f.jobs.approveAndDispatch(f.approve(preview)),/authority/);
    assert.equal(f.calls(),0);assert.equal(Object.keys(f.data[KEY].jobs).length,0);
});

test('status never exposes verified receipt or preview after policy or source revocation',async()=>{
    const f=fixture(), preview=await f.jobs.prepare(f.request), verified=await f.jobs.approveAndDispatch(f.approve(preview));
    f.source.captions.length=0;f.bump();
    const status=await f.jobs.getStatus(verified.jobId);assert.equal(status.state,'blocked');assert.equal(status.result,null);
    f.policy.disableSessionHistory=true;f.bump();await f.jobs.getStatus(verified.jobId);
    assert.equal(Object.keys(f.data[KEY].jobs).length,0);
});

test('duplicate approval and restart recovery never return revoked-source results or proof',async()=>{
    const f=fixture(), preview=await f.jobs.prepare(f.request);
    await f.jobs.approveAndDispatch(f.approve(preview));
    f.source.captions.length=0;f.bump();
    for(const status of [await f.jobs.approveAndDispatch(f.approve(preview)),...(await create(f.options).recover())]) {
        assert.equal(status.state,'blocked');assert.equal(status.result,null);assert.equal(status.proof,null);
    }
});

test('history denial during pin persistence purges only owned job source and result',async()=>{
    const f=fixture(), preview=await f.jobs.prepare(f.request), verified=await f.jobs.approveAndDispatch(f.approve(preview));
    const original=f.storage.set;
    f.storage.set=async values=>{await original(values);if(Object.values(values[KEY].jobs).some(job=>job.state==='pinned')){
        f.policy.disableSessionHistory=true;f.bump();
    }};
    await assert.rejects(f.jobs.pin({jobId:verified.jobId,expectedRevision:verified.revision}),/authority/);
    assert.equal(Object.keys(f.data[KEY].jobs).length,0);assert.equal(JSON.stringify(f.data).includes('Synthetic selected caption'),false);
    assert.deepEqual(f.data.unrelated,{preserved:true});
});

test('read-time lifetime expiry blocks and cleans result without depending on recovery alarms',async()=>{
    for(const route of ['status','duplicate','recover']) {
        const f=fixture(), preview=await f.jobs.prepare(f.request);
        await f.jobs.approveAndDispatch(f.approve(preview));f.advance(LIMITS.lifetime+1);
        const statuses=route==='recover' ? await f.jobs.recover() : [route==='status'
            ? await f.jobs.getStatus(preview.jobId) : await f.jobs.approveAndDispatch(f.approve(preview))];
        for(const status of statuses) {assert.equal(status.state,'expired');assert.equal(status.result,null);assert.equal(status.proof,null);}
        assert.equal(Object.keys(f.data[KEY].jobs).length,0);
        assert.equal(JSON.stringify(f.data).includes('Synthetic selected caption'),false);
        assert.deepEqual(f.data.unrelated,{preserved:true});assert.equal(f.calls(),1);
    }
});

test('lifetime expiry during source validation or cleanup failure never exposes retained result',async()=>{
    for(const failingStorage of [false,true]) {
        const f=fixture(), preview=await f.jobs.prepare(f.request);
        await f.jobs.approveAndDispatch(f.approve(preview));
        const jobs=create({...f.options,getSource:async()=>{f.advance(LIMITS.lifetime+1);return f.source;}});
        if(failingStorage) f.storage.set=async()=>{throw Error('synthetic storage outage');};
        const status=await jobs.getStatus(preview.jobId);
        assert.equal(status.state,'expired');assert.equal(status.result,null);assert.equal(status.proof,null);
        assert.equal(Object.keys(f.data[KEY].jobs).length,failingStorage ? 1 : 0);
    }
});

test('pinning an expired result denies consent and cleans only its expired record',async()=>{
    const f=fixture(), preview=await f.jobs.prepare(f.request), verified=await f.jobs.approveAndDispatch(f.approve(preview));
    let consentCalls=0;
    const jobs=create({...f.options,verifyPinIntent:async()=>{consentCalls++;return true;}});
    f.advance(LIMITS.lifetime+1);
    await assert.rejects(jobs.pin({jobId:verified.jobId,expectedRevision:verified.revision}),/record-expired/);
    assert.equal(consentCalls,0);assert.equal(Object.keys(f.data[KEY].jobs).length,0);
    assert.deepEqual(f.data.unrelated,{preserved:true});
});
