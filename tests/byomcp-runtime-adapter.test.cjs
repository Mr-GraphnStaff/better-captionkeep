const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const contracts=require('../teams-captions-saver/evidenceActionContracts.js');
const runtime=require('../teams-captions-saver/byomcpRuntimeAdapter.js');
const jobsModule=require('../teams-captions-saver/evidenceActionJobs.js');
const caller=`chrome-extension://${'a'.repeat(32)}/`;
async function fixture(kind='directory-lookup',transport='remote') {
  const tool=kind==='directory-lookup'?'directory_lookup':'dns_update',operation=kind==='directory-lookup'?'read':'write';
  const accountId='1'.repeat(32),zoneId='2'.repeat(32),recordId='3'.repeat(32),tenantId=randomUUID(),personId=randomUUID();
  const action=kind==='directory-lookup'?{kind,tool,tenantId,allowedFields:['displayName','jobTitle']}:{kind,tool,accountId,zoneIds:[zoneId]};
  const identity={id:'synthetic-owner',label:'Synthetic owner',revision:1,transport,
    ...(transport==='remote'?{resource:'https://synthetic.invalid/mcp',credentialReference:'TEST_TOKEN'}:{executable:'C:\\synthetic\\server.exe',cwd:'C:\\synthetic',args:[],executableDigest:'f'.repeat(64)}),
    tools:[{name:tool,operation,schemaDigest:'b'.repeat(64),...(operation==='read'?{readOnly:true}:{reviewedWrite:true})}]};
  const profile={...identity,profileDigest:await contracts.digest(identity)};
  const config={version:1,hostName:'com.daftech.captionkeep.byomcp',allowedCallers:[{browser:'chrome',caller}],profiles:[{profile,actions:[action]}]};
  const args=kind==='directory-lookup'?{tenantId,matchedPersonId:personId,workFields:['displayName'],purpose:'Synthetic meeting follow-up'}
    :{accountId,zoneId,recordId,recordType:'TXT',recordName:'synthetic.example.invalid',expectedCurrentValue:'before',proposedValue:'after',ttl:300,proxied:false};
  const source={sessionId:randomUUID(),sourceDigest:'c'.repeat(64),revision:'1',captions:[{key:'one',evidenceId:'C0001',text:'Synthetic selected request',observedAt:new Date().toISOString()}]};
  const status={protocolVersion:1,enrollmentVerified:true,enabled:false,profiles:[{id:profile.id,revision:1,profileDigest:profile.profileDigest,transport:transport==='remote'?'streamable-http':'stdio'}]};
  let proof=null,calls=0,damageProof=false;
  const native={localStatus:async()=>structuredClone(status),inventory:async()=>({profileId:profile.id,revision:1,tools:[{name:tool,effect:operation,schemaDigest:'b'.repeat(64),compatible:true,approved:true,profileGrantId:'grant_synthetic'}]}),
    getCapacity:async()=>64*1024*1024,takeResultProof:()=>{const value=proof;proof=null;return value;},disconnect:async()=>{},
    transport:{invoke:async(_p,approval,_signal,context)=>{
      await context.assertDispatch();calls++;
      const result={version:1,jobId:approval.payload.jobId,approvalDigest:approval.approvalDigest,sessionId:source.sessionId,sourceDigest:source.sourceDigest,status:'received',answer:'Synthetic result',citations:['one']};
      const record={accountId,zoneId,recordId,type:'TXT',name:args.recordName,content:'before',ttl:300,proxied:false};
      const observation=kind==='directory-lookup'?{tenantId,personId,fields:{displayName:'Synthetic Person'}}
        :{before:record,after:{...record,content:'after'},preconditionCheckedAt:new Date().toISOString(),atomicPrecondition:false,limitation:'Read/write race remains; independent readback is not compare-and-swap.'};
      const receipt={version:1,jobId:approval.payload.jobId,approvalDigest:approval.approvalDigest,sourceDigest:source.sourceDigest,profileDigest:profile.profileDigest,
        actionKind:kind,resultDigest:await contracts.digest(result),observedAt:new Date().toISOString(),observation};
      proof={...receipt,receiptDigest:await contracts.digest(receipt)};
      if(damageProof) proof.observation={};
      return result;
    }}};
  const policy={disabled:false,disableSessionHistory:false,allowWrites:true,requireScrubbed:true};
  const adapter=runtime.create({contracts,chrome:{runtime:{id:'a'.repeat(32),getURL:()=>caller}},browserTarget:'chrome',nativeClient:native,
    readTrustedConfiguration:async()=>structuredClone(config),readPolicy:async()=>structuredClone(policy)});
  await adapter.verifyEnrollment({enrollment:{status}});await adapter.inventory(profile.id,1,{});
  const data={},storage={get:async key=>({[key]:structuredClone(data[key])}),set:async values=>Object.assign(data,structuredClone(values))};
  const jobs=jobsModule.create({contracts,storage,getAuthorityRevision:()=>0,getSource:async()=>structuredClone(source),getReviewedProfile:adapter.getReviewedProfile,
    getPolicy:async()=>policy,getCapacity:adapter.getCapacity,prepareRelease:async value=>({source:value.source,arguments:value.arguments,privacyMode:'scrubbed'}),
    verifyOperation:adapter.verifyOperation,verifyApproveIntent:async()=>true,verifyPinIntent:async()=>true,transport:adapter.transport,verifyResultProof:adapter.verifyResultProof});
  const request={sourceId:source.sessionId,profileId:profile.id,tool,operation,arguments:args,captionKeys:['one'],privacyMode:'scrubbed'};
  const approve=preview=>({jobId:preview.jobId,expectedRevision:preview.revision,approvalDigest:preview.approvalDigest});
  return {adapter,jobs,request,approve,config,profile,action,args,source,policy,calls:()=>calls,damage(){damageProof=true;}};
}
for(const kind of ['directory-lookup','dns-change']) for(const transport of ['stdio','remote']) test(`${transport} ${kind}: approved synthetic job verifies typed independent receipt and pins`,async()=>{
  const f=await fixture(kind,transport),preview=await f.jobs.prepare(f.request);
  assert.equal(f.calls(),0);assert.equal(preview.state,'draft');
  const result=await f.jobs.approveAndDispatch(f.approve(preview));
  assert.equal(result.state,'verified');assert.equal(result.proof.verified,true);assert.equal(f.calls(),1);
  assert.equal((await f.jobs.pin({jobId:result.jobId,expectedRevision:result.revision})).state,'pinned');
});
test('tampered proof is not a verified result and is never automatically resent',async()=>{
  const f=await fixture();f.damage();const preview=await f.jobs.prepare(f.request);
  const result=await f.jobs.approveAndDispatch(f.approve(preview));assert.equal(result.state,'outcome-unknown');assert.equal(result.result,null);
  await f.jobs.approveAndDispatch(f.approve(preview));assert.equal(f.calls(),1);
});
test('local registry changes and wrong native caller fail closed',async()=>{
  const f=await fixture(),preview=await f.jobs.prepare(f.request);
  f.config.profiles[0].actions[0].tenantId=randomUUID();
  assert.equal((await f.adapter.localStatus()).enabled,false);
  await assert.rejects(f.jobs.approveAndDispatch(f.approve(preview)));assert.equal(f.calls(),0);
  await assert.rejects(runtime.validateConfiguration(f.config,{contracts,browserTarget:'chrome',caller:caller.replace('aaaa','bbbb')}),/enrollment/);
});
test('extra fields, cross-tenant identity, generic execution and write policy do not release source',async()=>{
  const f=await fixture();await assert.rejects(f.jobs.prepare({...f.request,arguments:{...f.args,execute:'arbitrary'}}));
  await assert.rejects(f.jobs.prepare({...f.request,arguments:{...f.args,tenantId:randomUUID()}}));
  const dns=await fixture('dns-change');dns.policy.allowWrites=false;await assert.rejects(dns.jobs.prepare(dns.request));
  assert.equal(f.calls()+dns.calls(),0);
});
test('configuration digest is derived from complete local process/resource identity',async()=>{
  const f=await fixture();f.config.profiles[0].profile.resource='https://other.invalid/mcp';
  await assert.rejects(runtime.validateConfiguration(f.config,{contracts,browserTarget:'chrome',caller}),/digest/);
});
test('DNS arguments use normalized bounded typed record values, not URL/script text',async()=>{
  const f=await fixture('dns-change');
  for(const change of [{recordName:'https://test.invalid/'},{recordType:'A',proposedValue:'999.1.2.3'},
    {recordType:'AAAA',proposedValue:'not-ipv6'},{recordType:'MX'},{proxied:true}]) {
    assert.equal(runtime.operationAllowed(f.action,{...f.args,...change}),false);
  }
});
