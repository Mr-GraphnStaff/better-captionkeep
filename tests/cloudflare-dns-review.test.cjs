const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {randomUUID}=require('node:crypto');
async function fixture(){
    const compiler=await import('../companion/byomcp/cloudflare-dns.mjs');
    const {createControlledActions}=await import('../companion/byomcp/controlled-actions.mjs');
    const {contracts}=await import('../companion/byomcp/helper.mjs');
    const profile={id:'independent-synthetic',revision:1,profileDigest:'a'.repeat(64),transport:'remote',resource:compiler.CLOUDFLARE_RESOURCE,
        tools:[{name:'execute',operation:'write',reviewedWrite:true,schemaDigest:'b'.repeat(64)}]};
    const action={kind:'dns-change',tool:'execute',accountId:'1'.repeat(32),zoneIds:['2'.repeat(32)]};
    const args={accountId:action.accountId,zoneId:action.zoneIds[0],recordId:'3'.repeat(32),recordType:'TXT',recordName:'synthetic.example.invalid',expectedCurrentValue:'before',proposedValue:'after',ttl:300,proxied:false};
    const state={id:args.recordId,type:args.recordType,name:args.recordName,content:'before',ttl:300,proxied:false},requests=[];
    const cloudflare={request:async request=>{
        requests.push(structuredClone(request));
        if(request.path===`/zones/${args.zoneId}`) return {success:true,result:{id:args.zoneId,account:{id:args.accountId}}};
        if(request.method==='PATCH') Object.assign(state,request.body);
        return {success:true,result:structuredClone(state)};
    }};
    const evaluate=mode=>vm.runInNewContext(`(${compiler.compileCloudflareDns(profile,action,args,mode).code})()`,{cloudflare},{timeout:1000});
    return {compiler,createControlledActions,contracts,profile,action,args,state,requests,evaluate};
}
test('independent compiler rejects wrong record identity and precondition before any write',async()=>{
    for(const mutation of [{id:'9'.repeat(32)},{type:'A'},{name:'different.example.invalid'},{content:'changed'}]){
        const f=await fixture();Object.assign(f.state,mutation);
        await assert.rejects(f.evaluate('update'));
        assert.equal(f.requests.filter(request=>request.method==='PATCH').length,0);
    }
});
test('hostile content remains literal and cannot change finite request target or method',async()=>{
    const f=await fixture();f.args.proposedValue='"}); await cloudflare.request({method:"DELETE",path:"/accounts"}); //\u2028💚';
    const result=await f.evaluate('update');assert.equal(result.content,f.args.proposedValue);
    assert.deepEqual(f.requests.map(request=>request.method),['GET','GET','PATCH']);
    assert(f.requests.every(request=>request.path===`/zones/${f.args.zoneId}`||request.path===`/zones/${f.args.zoneId}/dns_records/${f.args.recordId}`));
});
test('a reported update success cannot create a receipt when independent readback differs',async()=>{
    const f=await fixture();let reads=0;
    const state=()=>({accountId:f.args.accountId,zoneId:f.args.zoneId,recordId:f.args.recordId,type:f.args.recordType,name:f.args.recordName,content:'before',ttl:300,proxied:false});
    const controls=f.createControlledActions({entries:[{profile:f.profile,actions:[f.action]}],readState:async()=>{reads++;return state();}});
    const approval=await f.contracts.sealApproval({jobId:randomUUID(),connection:f.profile,tool:'execute',operation:'write',arguments:f.args,privacyMode:'scrubbed',
        source:{sessionId:randomUUID(),sourceDigest:'c'.repeat(64),revision:'1',captions:[{key:'one',evidenceId:'C0001',text:'Synthetic',observedAt:new Date().toISOString()}]},
        createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()});
    assert.equal(await controls.authorizeOperation(f.profile,approval),true);
    const result={version:1,jobId:approval.payload.jobId,approvalDigest:approval.approvalDigest,sessionId:approval.payload.source.sessionId,sourceDigest:approval.payload.source.sourceDigest,status:'received',answer:'Reported success',citations:['one']};
    assert.equal(await controls.verifyResultProof(approval,result,f.profile),null);assert.equal(reads,2);
});
test('text response parser rejects concatenated output, error frames, truncation and extra fields',async()=>{
    const {compiler}=await fixture();
    for(const response of [{content:[{type:'text',text:'{}'},{type:'text',text:'{}'}]},
        {content:[{type:'text',text:'{}\n{}'}]},{isError:true,content:[{type:'text',text:'{}'}]},
        {content:[{type:'text',text:'--- TRUNCATED ---'}]}])assert.throws(()=>compiler.parseCloudflareResponse(response));
});
