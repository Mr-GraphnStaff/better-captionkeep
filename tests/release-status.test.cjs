const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const loadRecord = () => JSON.parse(fs.readFileSync(path.join(root, 'docs/release-state/6.0.json'), 'utf8'));
const load = () => import('../scripts/release-status.mjs');

test('one release status record matches the manifest and every published local view', async () => {
  const api = await load(), record = loadRecord();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'teams-captions-saver/manifest.json'), 'utf8'));
  api.validateReleaseStatus(record, manifest.version);
  for (const file of api.statusDocuments) api.reconcileStatusDocument(fs.readFileSync(path.join(root, file), 'utf8'), record);
});
test('contradictory status views fail and regeneration preserves unrelated historical text', async () => {
  const api = await load(), record = loadRecord();
  const text = 'historical 5.4 evidence\n' + api.renderReleaseStatus(record).replace('development on', 'released on') + '\nold release hash';
  assert.throws(() => api.reconcileStatusDocument(text, record), /contradicts/);
  const repaired = api.reconcileStatusDocument(text, record, true);
  assert(repaired.startsWith('historical 5.4 evidence\n'));
  assert(repaired.endsWith('\nold release hash'));
  assert.doesNotThrow(() => api.reconcileStatusDocument(repaired, record));
});
test('candidate and release labels cannot hide unverified browsers or open gates', async () => {
  const api = await load(), record = loadRecord();
  record.state = 'candidate';
  assert.throws(() => api.validateReleaseStatus(record, '6.0.0'), /Frozen candidate/);
  record.candidate = {frozen:true, commit:'a'.repeat(40), hashes:{chrome:'b'.repeat(64)}};
  assert.throws(() => api.validateReleaseStatus(record, '6.0.0'), /all browser/);
  for (const key of ['chrome','edge','brave','firefox','opera','chrome-store','edge-store','sbom']) record.candidate.hashes[key] = 'b'.repeat(64);
  assert.throws(() => api.validateReleaseStatus(record, '6.0.0'), /BYOMCP helper/);
  for (const key of ['byomcp-helper','byomcp-sbom','byomcp-hashes']) record.candidate.hashes[key] = 'b'.repeat(64);
  assert.throws(() => api.validateReleaseStatus(record, '6.0.0'), /acceptance\/certification/);
  record.requiredBrowsers.pop();
  assert.throws(() => api.validateReleaseStatus(record, '6.0.0'), /Five-browser/);
});
test('missing, duplicate boundaries and malformed gate fields fail closed', async () => {
  const api = await load(), record = loadRecord();
  assert.throws(() => api.reconcileStatusDocument('unmarked document', record), /boundary/);
  assert.throws(() => api.reconcileStatusDocument(api.renderReleaseStatus(record).repeat(2), record), /boundary/);
  delete record.releaseGates.installedUpgrade;
  assert.throws(() => api.validateReleaseStatus(record, '6.0.0'), /Missing release gate/);
});
test('source branch identity cannot be blank or malformed', async () => {
  const api = await load(), record = loadRecord();
  for (const branch of ['', 'codex/../master', 'codex/6.0 ', 'codex/']) {
    record.branch = branch;
    assert.throws(() => api.validateReleaseStatus(record, '6.0.0'), /branch identity/);
  }
});

test('6.0 requires exactly five browsers and cannot silently reintroduce archived Safari', async () => {
  const api = await load(), record = loadRecord();
  assert.deepEqual(record.requiredBrowsers, ['chrome','edge','brave','firefox','opera']);
  assert.equal(Object.hasOwn(record.liveCertification, 'safari'), false);
  record.requiredBrowsers.push('safari');
  assert.throws(() => api.validateReleaseStatus(record, '6.0.0'), /Five-browser/);
});

function promotionFixture() {
  const bytes = Buffer.from('synthetic immutable candidate');
  const digest = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  const hashes = Object.fromEntries(['chrome','edge','brave','firefox','opera','chrome-store','edge-store','sbom','byomcp-helper','byomcp-sbom','byomcp-hashes'].map(key=>[key,digest]));
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

test('Store promotion binds approval, UAT, permission delta, real unchanged time, source and package', async () => {
  const {verifyStorePromotion} = await load();
  const good = promotionFixture();
  const result = await verifyStorePromotion({...good,channel:'chrome',action:'upload-only'});
  assert.deepEqual(result.bytes, good.bytes);
  for (const [name, mutate] of [
    ['development', f=>{f.record.state='development';f.record.candidate.frozen=false;}],
    ['unfrozen', f=>{f.record.candidate.frozen=false;}],
    ['missing browser',f=>{f.record.liveCertification.firefox='pending';}],
    ['open gate',f=>{f.record.releaseGates.unchangedWindow=false;}],
    ['missing approval', f=>{delete f.record.candidate.promotion;}],
    ['stale approval',f=>{f.record.candidate.promotion.commit='b'.repeat(40);}],
    ['stale UAT',f=>{f.record.candidate.promotion.uat.hashes.chrome='b'.repeat(64);}],
    ['missing UAT',f=>{delete f.record.candidate.promotion.uat;}],
    ['wrong target',f=>{f.record.candidate.promotion.targets.chrome='different';}],
    ['missing report',f=>{delete f.record.candidate.promotion.uat.report;}],
    ['changed report',f=>{f.record.candidate.promotion.uat.report.sha256='b'.repeat(64);}],
    ['escaping report',f=>{f.record.candidate.promotion.uat.report.path='../private.txt';}],
    ['unapproved delta',f=>{f.record.candidate.promotion.permissionDelta.approved=false;}],
    ['recent freeze',f=>{f.now-=1;}],
    ['future freeze',f=>{f.record.candidate.promotion.unchangedSince='2026-10-17T12:00:00Z';}],
    ['invalid clock',f=>{f.now=NaN;}],
    ['changed HEAD',f=>{f.identity=async()=>({commit:'b'.repeat(40),changes:[]});}],
    ['dirty source',f=>{f.identity=async()=>({commit:f.record.candidate.commit,changes:[' M teams-captions-saver/popup.html']});}],
    ['wrong bytes',f=>{const read=f.read;f.read=async(filename,...args)=>filename.endsWith('.zip')?Buffer.from('changed'):read(filename,...args);}],
    ['missing bytes',f=>{const read=f.read;f.read=async(filename,...args)=>{if(filename.endsWith('.zip'))throw Error('missing package');return read(filename,...args);};}]
  ]) {
    const fixture=promotionFixture();mutate(fixture);
    await assert.rejects(verifyStorePromotion({...fixture,channel:'chrome',action:'upload-only'}),undefined,name);
  }
});

test('local receipts cannot authorize existing-draft or staged publication actions',async()=>{
  const {verifyStorePromotion}=await load();
  for(const [channel,action] of [['chrome','submit-existing-auto'],['chrome','submit-existing-staged'],['chrome','publish-staged'],['edge','submit-existing']]){
    const f=promotionFixture();let reads=0;const read=f.read;f.read=async(...args)=>{reads++;return read(...args);};
    await assert.rejects(verifyStorePromotion({...f,channel,action}),/Existing Store drafts cannot be verified/);
    assert.equal(reads,0);
  }
});
