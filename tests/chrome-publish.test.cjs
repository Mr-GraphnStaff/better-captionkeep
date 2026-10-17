const test = require('node:test');
const assert = require('node:assert/strict');

test('Chrome Store package name follows the reviewed release version', async () => {
  const { packageNameForVersion } = await import('../scripts/chrome-publish.mjs');
  assert.equal(packageNameForVersion('5.1.0'), 'better_captionkeep-chrome-5.1.0.zip');
  assert.throws(() => packageNameForVersion('../5.1.0'), /Invalid extension version/);
});

test('Chrome upload states accept documented and legacy-prefixed forms', async () => {
  const { normalizeUploadState } = await import('../scripts/chrome-publish.mjs');
  assert.equal(normalizeUploadState('SUCCEEDED'), 'SUCCEEDED');
  assert.equal(normalizeUploadState('UPLOAD_IN_PROGRESS'), 'IN_PROGRESS');
  assert.equal(normalizeUploadState(), '');
});

test('Chrome resource name validates the extension identity', async () => {
  const { itemResourceName } = await import('../scripts/chrome-publish.mjs');
  assert.equal(
    itemResourceName('publisher-123', 'nabjdlnkkaonnbnimnmnhjcbigceebml'),
    'publishers/publisher-123/items/nabjdlnkkaonnbnimnmnhjcbigceebml',
  );
  assert.throws(() => itemResourceName('', 'nabjdlnkkaonnbnimnmnhjcbigceebml'), /CHROME_PUBLISHER_ID/);
  assert.throws(() => itemResourceName('publisher-123', 'not-an-extension-id'), /CHROME_EXTENSION_ID/);
});

test('Chrome actions map staged and immediate publishing explicitly', async () => {
  const { publishTypeForAction } = await import('../scripts/chrome-publish.mjs');
  assert.equal(publishTypeForAction('submit-auto'), 'DEFAULT_PUBLISH');
  assert.equal(publishTypeForAction('submit-existing-auto'), 'DEFAULT_PUBLISH');
  assert.equal(publishTypeForAction('submit-staged'), 'STAGED_PUBLISH');
  assert.equal(publishTypeForAction('submit-existing-staged'), 'STAGED_PUBLISH');
  assert.equal(publishTypeForAction('publish-staged'), 'STAGED_PUBLISH');
  assert.equal(publishTypeForAction('upload-only'), null);
});

test('Chrome status summary separates published and submitted revisions', async () => {
  const { summarizeChromeStatus } = await import('../scripts/chrome-publish.mjs');
  assert.deepEqual(summarizeChromeStatus({
    itemId: 'nabjdlnkkaonnbnimnmnhjcbigceebml',
    publishedItemRevisionStatus: {
      state: 'PUBLISHED',
      distributionChannels: [{ crxVersion: '5.0.0' }],
    },
    submittedItemRevisionStatus: {
      state: 'PENDING_REVIEW',
      distributionChannels: [{ crxVersion: '5.1.0' }],
    },
    lastAsyncUploadState: 'SUCCEEDED',
  }), {
    itemId: 'nabjdlnkkaonnbnimnmnhjcbigceebml',
    publishedState: 'PUBLISHED',
    publishedVersion: '5.0.0',
    submittedState: 'PENDING_REVIEW',
    submittedVersion: '5.1.0',
    uploadState: 'SUCCEEDED',
    takenDown: false,
    warned: false,
  });
});

test('Chrome blocks only active submitted revisions and permits terminal cancelled or rejected revisions', async () => {
  const { isActiveSubmission } = await import('../scripts/chrome-publish.mjs');
  assert.equal(isActiveSubmission({ submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } }), true);
  assert.equal(isActiveSubmission({ submittedItemRevisionStatus: { state: 'STAGED' } }), true);
  assert.equal(isActiveSubmission({ submittedItemRevisionStatus: { state: 'CANCELLED' } }), false);
  assert.equal(isActiveSubmission({ submittedItemRevisionStatus: { state: 'REJECTED' } }), false);
  assert.equal(isActiveSubmission({}), false);
});

test('Chrome preflight proves credentials and item identity without uploading', async () => {
  const { main } = await import('../scripts/chrome-publish.mjs');
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || 'GET' });
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'access-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      itemId: 'nabjdlnkkaonnbnimnmnhjcbigceebml',
      publishedItemRevisionStatus: {
        state: 'PUBLISHED',
        distributionChannels: [{ crxVersion: '5.1.0' }],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await main({
    env: {
      CHROME_ACTION: 'preflight',
      CHROME_CLIENT_ID: 'client-id',
      CHROME_CLIENT_SECRET: 'client-secret',
      CHROME_REFRESH_TOKEN: 'refresh-token',
      CHROME_PUBLISHER_ID: 'publisher-id',
      CHROME_EXTENSION_ID: 'nabjdlnkkaonnbnimnmnhjcbigceebml',
    },
    fetchImpl,
  });

  assert.deepEqual(requests, [
    { url: 'https://oauth2.googleapis.com/token', method: 'POST' },
    {
      url: 'https://chromewebstore.googleapis.com/v2/publishers/publisher-id/items/nabjdlnkkaonnbnimnmnhjcbigceebml:fetchStatus',
      method: 'GET',
    },
  ]);
});

test('Chrome refuses unverifiable existing drafts before authentication', async () => {
  const {main}=await import('../scripts/chrome-publish.mjs');
  for(const action of ['submit-existing-staged','submit-existing-auto','publish-staged']) {
    let calls=0;
    await assert.rejects(main({promotion:promotionFixture(),env:{CHROME_ACTION:action},fetchImpl:async()=>{calls++;throw Error('network forbidden');}}),/Existing Store drafts cannot be verified/);
    assert.equal(calls,0);
  }
});

test('Chrome cancels an active review without uploading or publishing', async () => {
  const { main } = await import('../scripts/chrome-publish.mjs');
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || 'GET' });
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'access-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (String(url).endsWith(':fetchStatus')) {
      return new Response(JSON.stringify({
        itemId: 'nabjdlnkkaonnbnimnmnhjcbigceebml',
        submittedItemRevisionStatus: {
          state: 'PENDING_REVIEW',
          distributionChannels: [{ crxVersion: '5.4.0' }],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(null, { status: 200 });
  };

  await main({
    env: {
      CHROME_ACTION: 'cancel-submission',
      CHROME_CLIENT_ID: 'client-id',
      CHROME_CLIENT_SECRET: 'client-secret',
      CHROME_REFRESH_TOKEN: 'refresh-token',
      CHROME_PUBLISHER_ID: 'publisher-id',
      CHROME_EXTENSION_ID: 'nabjdlnkkaonnbnimnmnhjcbigceebml',
    },
    fetchImpl,
  });

  assert.deepEqual(requests.at(-1), {
    url: 'https://chromewebstore.googleapis.com/v2/publishers/publisher-id/items/nabjdlnkkaonnbnimnmnhjcbigceebml:cancelSubmission',
    method: 'POST',
  });
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

test('chrome mutations fail closed before credentials or any Store network request', async()=>{
  const {main}=await import('../scripts/chrome-publish.mjs');
  for(const action of ["upload-only","submit-staged","submit-auto","submit-existing-staged","submit-existing-auto","publish-staged"]) {
    let calls=0;
    const env={CHROME_ACTION:action,EDGE_CERTIFICATION_NOTES:'Synthetic notes',CHROME_EXTENSION_ID:'nabjdlnkkaonnbnimnmnhjcbigceebml',EDGE_PRODUCT_ID:'product-id'};
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

test('Chrome uploads the verified package snapshot even if disk changes during authentication',async()=>{
  const {main}=await import('../scripts/chrome-publish.mjs');
  const promotion=promotionFixture(),read=promotion.read;let authenticated=false,uploaded;
  promotion.read=async(filename,...args)=>filename.endsWith('.zip')&&authenticated?Buffer.from('changed after authentication'):read(filename,...args);
  await main({promotion,env:{CHROME_ACTION:'upload-only',CHROME_CLIENT_ID:'test',CHROME_CLIENT_SECRET:'test',CHROME_REFRESH_TOKEN:'test',
    CHROME_PUBLISHER_ID:'test',CHROME_EXTENSION_ID:'nabjdlnkkaonnbnimnmnhjcbigceebml'},fetchImpl:async(url,options={})=>{
      if(String(url).includes('oauth2.googleapis.com')){authenticated=true;return Response.json({access_token:'synthetic'});}
      if(String(url).endsWith(':fetchStatus'))return Response.json({});
      uploaded=options.body;return Response.json({uploadState:'SUCCEEDED',crxVersion:'6.0.0'});
    }});
  assert.deepEqual(uploaded,promotion.bytes);
});
