const assert = require('node:assert/strict');
const test = require('node:test');

test('operationIdFromLocation accepts an operation ID or URL', async () => {
  const { operationIdFromLocation } = await import('../scripts/edge-publish.mjs');
  assert.equal(operationIdFromLocation('abc-123'), 'abc-123');
  assert.equal(operationIdFromLocation('https://example.test/operations/abc-123/'), 'abc-123');
});

test('operationIdFromLocation rejects a missing location', async () => {
  const { operationIdFromLocation } = await import('../scripts/edge-publish.mjs');
  assert.throws(() => operationIdFromLocation(''), /Location operation ID/);
});

test('packageNameForVersion validates the extension version', async () => {
  const { packageNameForVersion } = await import('../scripts/edge-publish.mjs');
  assert.equal(packageNameForVersion('5.0.1'), 'better_captionkeep-5.0.1.zip');
  assert.equal(packageNameForVersion('5.0.1.2'), 'better_captionkeep-5.0.1.2.zip');
  assert.throws(() => packageNameForVersion('v5.0.1'), /Invalid extension version/);
});

test('submit preflight rejects missing certification notes before any network mutation', async () => {
  const { main } = await import('../scripts/edge-publish.mjs');
  let networkCalls = 0;
  await assert.rejects(main({
    env: {EDGE_ACTION: 'submit'},
    fetchImpl: async () => { networkCalls += 1; throw new Error('network must not run'); },
  }), /EDGE_CERTIFICATION_NOTES/);
  assert.equal(networkCalls, 0);
});

test('Edge configuration preflight is non-mutating and explicit about configured identity', async () => {
  const { main } = await import('../scripts/edge-publish.mjs');
  let networkCalls = 0;
  const result = await main({
    env: {
      EDGE_ACTION: 'preflight',
      EDGE_CLIENT_ID: 'client-id',
      EDGE_API_KEY: 'api-key',
      EDGE_PRODUCT_ID: 'product-id',
    },
    fetchImpl: async () => { networkCalls += 1; throw new Error('network must not run'); },
  });
  assert.deepEqual(result, {
    clientIdConfigured: true,
    apiKeyConfigured: true,
    productId: 'product-id',
  });
  assert.equal(networkCalls, 0);
});

function promotionFixture() {
  const bytes = Buffer.from('synthetic immutable candidate');
  const digest = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  const hashes = Object.fromEntries(['chrome','edge','brave','firefox','opera','chrome-store','edge-store','sbom'].map(key=>[key,digest]));
  const commit = 'a'.repeat(40), now = Date.parse('2026-10-16T12:00:00Z');
  const bound = {commit,hashes:{...hashes}};
  const record = {product:'Better CaptionKeep',version:'6.0.0',branch:'codex/6.0',state:'candidate',
    requiredBrowsers:['chrome','edge','brave','firefox','opera'],
    liveCertification:Object.fromEntries(['chrome','edge','brave','firefox','opera'].map(key=>[key,'passed'])),
    releaseGates:{fullScopeAcceptance:true,accessibilityAndFailureUat:true,artworkApproved:true,unchangedWindow:true,storeApproval:true,publicParity:false,installedUpgrade:false},boardEpic:335,
    candidate:{frozen:true,commit,hashes,promotion:{...bound,approvedBy:'Synthetic reviewer',targets:{chrome:'nabjdlnkkaonnbnimnmnhjcbigceebml',edge:'product-id'},unchangedSince:'2026-10-14T12:00:00Z',
      uat:{...bound,passed:true,report:{path:'docs/uat.txt',sha256:digest}},permissionDelta:{...bound,approved:true,report:{path:'docs/permissions.txt',sha256:digest}},uploads:{
        chrome:{commit,sha256:digest,version:'6.0.0',target:'nabjdlnkkaonnbnimnmnhjcbigceebml'},
        edge:{commit,sha256:digest,version:'6.0.0',target:'product-id'}}}}};
  return {record,bytes,now,target:'nabjdlnkkaonnbnimnmnhjcbigceebml',identity:async()=>({commit,changes:[]}),read:async filename=>{
    if(filename.endsWith('6.0.json'))return JSON.stringify(record);
    if(filename.endsWith('manifest.json'))return JSON.stringify({version:'6.0.0'});
    return bytes;
  }};
}

test('edge mutations fail closed before credentials or any Store network request', async()=>{
  const {main}=await import('../scripts/edge-publish.mjs');
  for(const action of ["upload-only","submit","submit-existing"]) {
    let calls=0;
    const env={EDGE_ACTION:action,EDGE_CERTIFICATION_NOTES:'Synthetic notes',CHROME_EXTENSION_ID:'nabjdlnkkaonnbnimnmnhjcbigceebml',EDGE_PRODUCT_ID:'product-id'};
    await assert.rejects(main({env,fetchImpl:async()=>{calls++;throw Error('network forbidden');}}),/frozen candidate|Existing Store drafts cannot be verified/);
    assert.equal(calls,0,action);
    for(const corrupt of [
      f=>{delete f.record.candidate.promotion.uat;},
      f=>{f.record.candidate.promotion.permissionDelta.commit='b'.repeat(40);},
      f=>{f.now-=1;},
      f=>{f.identity=async()=>({commit:'b'.repeat(40),changes:[]});},
      f=>{const read=f.read;f.read=async(filename,...args)=>filename.endsWith('.zip')?Buffer.from('changed'):read(filename,...args);}
    ]) {
      const promotion=promotionFixture();corrupt(promotion);
      await assert.rejects(main({env,promotion,fetchImpl:async()=>{calls++;throw Error('network forbidden');}}));
      assert.equal(calls,0,action);
    }
  }
});

test('Edge upload uses only the approved immutable bytes and target',async()=>{
  const {main}=await import('../scripts/edge-publish.mjs');const promotion=promotionFixture();let uploaded;const requests=[];
  await main({promotion,env:{EDGE_ACTION:'upload-only',EDGE_CLIENT_ID:'test',EDGE_API_KEY:'test',EDGE_PRODUCT_ID:'product-id'},fetchImpl:async(url,options={})=>{
    requests.push(String(url));
    if(options.method==='POST'){uploaded=options.body;return new Response(null,{status:202,headers:{Location:'synthetic-operation'}});}
    return Response.json({status:'Succeeded'});
  }});
  assert.deepEqual(uploaded,promotion.bytes);assert.equal(requests.length,2);
  assert(requests.every(url=>url.includes('/products/product-id/')));
});

test('Edge refuses an unverifiable existing draft even with local upload receipts',async()=>{
  const {main}=await import('../scripts/edge-publish.mjs');let calls=0;
  await assert.rejects(main({promotion:promotionFixture(),env:{EDGE_ACTION:'submit-existing',EDGE_CERTIFICATION_NOTES:'Synthetic notes'},fetchImpl:async()=>{calls++;throw Error('network forbidden');}}),/Existing Store drafts cannot be verified/);
  assert.equal(calls,0);
});
