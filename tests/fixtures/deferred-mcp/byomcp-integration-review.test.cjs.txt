const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,webcrypto}=require('node:crypto');
const vm=require('node:vm');
const fs=require('node:fs');
const contracts=require('../teams-captions-saver/evidenceActionContracts.js');
const runtime=require('../teams-captions-saver/byomcpRuntimeAdapter.js');
const jobsModule=require('../teams-captions-saver/evidenceActionJobs.js');
const derivatives=require('../teams-captions-saver/derivedArtifacts.js');
const scrubber=require('../teams-captions-saver/privacyScrubber.js');
require('../teams-captions-saver/correctionManager.js');
const bridge=require('../teams-captions-saver/byomcpWorkerBridge.js');
async function fixture(){
    const caller=`chrome-extension://${'a'.repeat(32)}/`,tenantId=randomUUID(),personId=randomUUID();
    const identity={id:'synthetic-owner',label:'Synthetic',revision:1,transport:'remote',resource:'https://synthetic.invalid/mcp',credentialReference:'SYNTHETIC_ENV',
        tools:[{name:'lookup',operation:'read',readOnly:true,schemaDigest:'b'.repeat(64)}]};
    const profile={...identity,profileDigest:await contracts.digest(identity)},action={kind:'directory-lookup',tool:'lookup',tenantId,allowedFields:['displayName']};
    const config={version:1,hostName:'com.daftech.captionkeep.byomcp',allowedCallers:[{browser:'chrome',caller}],profiles:[{profile,actions:[action]}]};
    const transcript=[{key:'one',Name:'Synthetic',Text:'Synthetic work request',capturedAt:new Date().toISOString()}];
    const sourceId='2026-10-14T10:00:00.000Z',source=await bridge.describeSource(sourceId,transcript,sourceId);
    const policy={disabled:false,disableSessionHistory:false,allowWrites:true,requireScrubbed:true};
    const status={protocolVersion:1,enrollmentVerified:true,enabled:false,profiles:[{id:profile.id,revision:1,profileDigest:profile.profileDigest,transport:'streamable-http'}]};
    let suppliedProof;
    const native={localStatus:async()=>structuredClone(status),inventory:async()=>({profileId:profile.id,revision:1,tools:[{name:'lookup',effect:'read',schemaDigest:'b'.repeat(64),compatible:true,approved:true,profileGrantId:'synthetic'}]}),
        getCapacity:async()=>64*1024*1024,takeResultProof:()=>{const value=suppliedProof;suppliedProof=null;return value;},
        transport:{invoke:async(_profile,approval,_signal,{assertDispatch})=>{await assertDispatch();
            const result={version:1,jobId:approval.payload.jobId,approvalDigest:approval.approvalDigest,sessionId:sourceId,sourceDigest:source.sourceDigest,status:'received',answer:'Synthetic work directory result',citations:['one']};
            const receipt={version:1,jobId:approval.payload.jobId,approvalDigest:approval.approvalDigest,sourceDigest:source.sourceDigest,profileDigest:profile.profileDigest,
                actionKind:'directory-lookup',resultDigest:await contracts.digest(result),observedAt:new Date().toISOString(),observation:{tenantId,personId,fields:{displayName:'Synthetic Person'}}};
            suppliedProof={...receipt,receiptDigest:await contracts.digest(receipt)};return result;}}};
    const adapter=runtime.create({contracts,chrome:{runtime:{id:'a'.repeat(32),getURL:()=>caller}},browserTarget:'chrome',nativeClient:native,
        readTrustedConfiguration:async()=>structuredClone(config),readPolicy:async()=>structuredClone(policy)});
    await adapter.verifyEnrollment({enrollment:{status}});await adapter.inventory(profile.id,1,{});
    const data={},storage={get:async key=>({[key]:structuredClone(data[key])}),set:async values=>Object.assign(data,structuredClone(values))};
    const jobs=jobsModule.create({contracts,storage,getAuthorityRevision:()=>0,getSource:async()=>source,getReviewedProfile:adapter.getReviewedProfile,
        getPolicy:async()=>policy,getCapacity:adapter.getCapacity,prepareRelease:async value=>({source:value.source,arguments:value.arguments,privacyMode:'scrubbed'}),
        verifyOperation:adapter.verifyOperation,verifyApproveIntent:async()=>true,verifyPinIntent:async()=>true,transport:adapter.transport,verifyResultProof:adapter.verifyResultProof});
    const preview=await jobs.prepare({sourceId,profileId:profile.id,tool:'lookup',operation:'read',arguments:{tenantId,matchedPersonId:personId,workFields:['displayName'],purpose:'Synthetic work'},captionKeys:['one'],privacyMode:'scrubbed'});
    const verified=await jobs.approveAndDispatch({jobId:preview.jobId,expectedRevision:preview.revision,approvalDigest:preview.approvalDigest});
    assert.equal(verified.state,'verified');
    const worker=fs.readFileSync('teams-captions-saver/service_worker.js','utf8');
    const start=worker.indexOf('async function retainByomcpReceipt('),end=worker.indexOf('\nasync function correctionAuthority(',start);
    const context=vm.createContext({historyQueue:Promise.resolve(),readByomcpPolicy:async()=>policy,chrome:{storage:{local:storage}},
        CaptionKeepEvidenceActionJobs:jobsModule,CaptionKeepEvidenceActionContracts:{...contracts,digest:value=>contracts.digest(structuredClone(value))},CaptionKeepByomcpWorkerBridge:bridge,CaptionKeepDerivedArtifacts:derivatives,
        CaptionKeepPrivacyScrubber:scrubber,byomcpAdapter:adapter,findCorrectionSource:async()=>({transcript,recordedAt:sourceId}),crypto:webcrypto});
    const validationStart=worker.indexOf('function validateDerivedSource('),validationEnd=worker.indexOf('\nasync function prepareManagedExport(',validationStart);
    vm.runInContext(worker.slice(validationStart,validationEnd),context);
    vm.runInContext(worker.slice(start,end),context);
    return {config,caller,profile,adapter,jobs,verified,source,transcript,data,context,storage,policy};
}
test('actual worker receipt callback can materialize a genuinely verified job after initial proof consumption',async()=>{
    const f=await fixture();const pinned=await f.jobs.pin({jobId:f.verified.jobId,expectedRevision:f.verified.revision});
    f.context.status=pinned;
    const materialized=await vm.runInContext('retainByomcpReceipt(status)',f.context);
    assert.equal(materialized.artifactId,`action-${pinned.jobId}`);
    const artifact=f.data[derivatives.storageKey(f.source.sessionId)][0];
    assert.equal(artifact.kind,'action-result');assert.equal(artifact.sessionId,f.source.sessionId);
    assert.equal(artifact.payload.receipt.jobId,pinned.jobId);assert.equal(f.transcript[0].Text,'Synthetic work request');
});
test('browser configuration rejects unknown secret-bearing profile and caller fields even with a recomputed digest',async()=>{
    const f=await fixture();
    for(const mutate of [configuration=>{configuration.profiles[0].profile.authorization='Bearer SYNTHETIC_SECRET_SHOULD_NOT_PERSIST';},
        configuration=>{configuration.allowedCallers.push({browser:'edge',caller:f.caller,token:'SYNTHETIC_SECRET'});},
        configuration=>{configuration.profiles[0].profile.tools[0].token='SYNTHETIC_SECRET';},
        configuration=>{configuration.profiles[0].profile.resource='https://synthetic.invalid/mcp?token=SYNTHETIC_SECRET';}]) {
        const configuration=structuredClone(f.config);mutate(configuration);
        const {profileDigest,...identity}=configuration.profiles[0].profile;configuration.profiles[0].profile.profileDigest=await contracts.digest(identity);
        await assert.rejects(runtime.validateConfiguration(configuration,{contracts,browserTarget:'chrome',caller:f.caller}));
    }
});
test('actual receipt persistence rolls back owned artifact if managed retention is revoked during write',async()=>{
    const f=await fixture(),pinned=await f.jobs.pin({jobId:f.verified.jobId,expectedRevision:f.verified.revision});
    const key=derivatives.storageKey(f.source.sessionId),original=f.storage.set;
    f.storage.set=async values=>{await original(values);if(values[key]){f.policy.disabled=true;f.policy.disableSessionHistory=true;}};
    f.context.status=pinned;
    await assert.rejects(vm.runInContext('retainByomcpReceipt(status)',f.context));
    assert(!f.data[key]?.some(item=>item.id===`action-${pinned.jobId}`));
});
test('repeat pin does not resurrect its previous receipt when retention is revoked during replacement',async()=>{
    const f=await fixture(),pinned=await f.jobs.pin({jobId:f.verified.jobId,expectedRevision:f.verified.revision});
    f.context.status=pinned;await vm.runInContext('retainByomcpReceipt(status)',f.context);
    const key=derivatives.storageKey(f.source.sessionId),original=f.storage.set;
    f.storage.set=async values=>{await original(values);if(values[key]){f.policy.disabled=true;f.policy.disableSessionHistory=true;}};
    await assert.rejects(vm.runInContext('retainByomcpReceipt(status)',f.context));
    assert(!f.data[key]?.some(item=>item.id===`action-${pinned.jobId}`));
});
test('source deletion during receipt write denies completion and removes only its owned artifact',async()=>{
    const f=await fixture(),pinned=await f.jobs.pin({jobId:f.verified.jobId,expectedRevision:f.verified.revision});
    const key=derivatives.storageKey(f.source.sessionId),original=f.storage.set;
    f.data.unrelated={preserved:true};
    f.storage.set=async values=>{await original(values);if(values[key])f.context.findCorrectionSource=async()=>null;};
    f.context.status=pinned;
    await assert.rejects(vm.runInContext('retainByomcpReceipt(status)',f.context));
    assert(!f.data[key]?.some(item=>item.id===`action-${pinned.jobId}`));assert.deepEqual(f.data.unrelated,{preserved:true});
});
