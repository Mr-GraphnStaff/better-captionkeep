const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
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
  const text = 'historical 5.4 evidence\n' + api.renderReleaseStatus(record).replace('Candidate frozen:', 'Contradictory candidate frozen:') + '\nold release hash';
  assert.throws(() => api.reconcileStatusDocument(text, record), /contradicts/);
  const repaired = api.reconcileStatusDocument(text, record, true);
  assert(repaired.startsWith('historical 5.4 evidence\n'));
  assert(repaired.endsWith('\nold release hash'));
  assert.doesNotThrow(() => api.reconcileStatusDocument(repaired, record));
});
test('candidate and release labels cannot hide unverified browsers or open gates', async () => {
  const api = await load(), record = loadRecord();
  record.state = 'candidate';
  record.candidate = {frozen:false, commit:null, hashes:null};
  assert.throws(() => api.validateReleaseStatus(record, '6.0.0'), /Frozen candidate/);
  record.candidate = {frozen:true, commit:'a'.repeat(40), hashes:{chrome:'b'.repeat(64)}};
  assert.throws(() => api.validateReleaseStatus(record, '6.0.0'), /all browser/);
  for (const key of ['chrome','edge','brave','firefox','opera','chrome-store','edge-store','sbom']) record.candidate.hashes[key] = 'b'.repeat(64);
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

test('6.0 refuses stale helper hashes in release evidence', async () => {
  const api = await load(), record = loadRecord();
  record.candidate.hashes = {'byomcp-helper':'b'.repeat(64)};
  assert.throws(() => api.validateReleaseStatus(record, '6.0.0'), /Deferred MCP/);
});

test('candidate artifact verification binds the frozen commit, clean tree and every shipping hash', async () => {
  const api = await load(), fixture = promotionFixture(), record = fixture.record;
  assert.deepEqual(api.verifyCandidateArtifacts(record, {commit:record.candidate.commit, hashes:record.candidate.hashes}), {verified:true});
  assert.throws(() => api.verifyCandidateArtifacts(record, {commit:'b'.repeat(40), hashes:record.candidate.hashes}), /source commit/);
  assert.throws(() => api.verifyCandidateArtifacts(record, {commit:record.candidate.commit, hashes:record.candidate.hashes, workingTreeDirty:true}), /working-tree/);
  const changed = {...record.candidate.hashes, chrome:'c'.repeat(64)};
  assert.throws(() => api.verifyCandidateArtifacts(record, {commit:record.candidate.commit, hashes:changed}), /chrome/);
  const development = loadRecord();
  development.state = 'development';
  development.candidate = {frozen:false, commit:null, hashes:null};
  assert.deepEqual(api.verifyCandidateArtifacts(development, {commit:'unbound', hashes:{}}), {verified:false, reason:'development'});
});

test('candidate source identity permits a later metadata-only freeze commit without self-reference', async () => {
  const api = await load(), repo = fs.mkdtempSync(path.join(os.tmpdir(), 'captionkeep-candidate-'));
  const git = args => execFileSync('git', args, {cwd:repo, encoding:'utf8', windowsHide:true}).trim();
  try {
    git(['init']); git(['config','user.name','Synthetic Test']); git(['config','user.email','test@example.invalid']);
    fs.mkdirSync(path.join(repo, 'teams-captions-saver'), {recursive:true});
    fs.writeFileSync(path.join(repo, 'teams-captions-saver', 'service_worker.js'), 'source');
    git(['add','.']); git(['commit','-m','candidate source']);
    const sourceCommit = git(['rev-parse','HEAD']);
    fs.mkdirSync(path.join(repo, 'docs', 'release-state'), {recursive:true});
    fs.writeFileSync(path.join(repo, 'docs', 'release-state', '6.0.json'), '{}');
    for (const file of api.statusDocuments) {
      const absolute = path.join(repo, file); fs.mkdirSync(path.dirname(absolute), {recursive:true}); fs.writeFileSync(absolute, 'status');
    }
    git(['add','.']); git(['commit','-m','freeze metadata']);
    const identity = api.inspectCandidateIdentity({root:repo, candidateCommit:sourceCommit});
    assert.equal(identity.commit, sourceCommit);
    assert.notEqual(identity.head, sourceCommit);
    assert.deepEqual(identity.changes, []);
    fs.writeFileSync(path.join(repo, 'teams-captions-saver', 'service_worker.js'), 'changed source');
    const dirtyIdentity = api.inspectCandidateIdentity({root:repo, candidateCommit:sourceCommit});
    assert(dirtyIdentity.changes.some(change => change.includes('service_worker.js')));
  } finally {
    fs.rmSync(repo, {recursive:true, force:true});
  }
});

function ownerExceptionFixture() {
  const f = promotionFixture(), candidate = f.record.candidate;
  f.record.liveCertification = Object.fromEntries(f.record.requiredBrowsers.map(browser => [browser, 'pending']));
  for (const gate of ['fullScopeAcceptance', 'accessibilityAndFailureUat', 'unchangedWindow']) f.record.releaseGates[gate] = false;
  candidate.promotion.uat.passed = false;
  candidate.promotion.unchangedSince = '2026-10-16T11:59:00Z';
  candidate.ownerException = {
    commit:candidate.commit, hashes:{...candidate.hashes}, approvedBy:'Synthetic owner',
    approvedAt:'2026-10-16T11:59:00Z', reason:'Explicit acceptance of unfinished live and accessibility testing and the short test window',
    waivedGates:['fullScopeAcceptance', 'accessibilityAndFailureUat', 'unchangedWindow'],
    waivedLiveCertification:[...f.record.requiredBrowsers],
    evidence:{path:'docs/owner-exception.txt', sha256:candidate.hashes.sbom},
  };
  return f;
}

test('explicit owner exception permits only bound unfinished acceptance without turning checks into passes', async () => {
  const api = await load(), f = ownerExceptionFixture();
  const before = structuredClone(f.record);
  api.validateReleaseStatus(f.record, '6.0.0');
  assert.deepEqual((await api.verifyStorePromotion({...f, channel:'chrome', action:'upload-only'})).bytes, f.bytes);
  assert.deepEqual(f.record, before, 'An exception must not mutate certification or gate results');
  const status = api.renderReleaseStatus(f.record);
  assert.match(status, /Owner publication exception: Synthetic owner/);
  assert.match(status, /These checks remain unpassed/);
  assert.match(status, /Live provider certification outstanding: chrome, edge, brave, firefox, opera/);
  const released = structuredClone(f.record);
  released.state = 'released';
  assert.throws(() => api.validateReleaseStatus(released, '6.0.0'), /open gates/);
  released.releaseGates.publicParity = true;
  released.releaseGates.installedUpgrade = true;
  assert.doesNotThrow(() => api.validateReleaseStatus(released, '6.0.0'));
});

test('owner exception rejects changed identity, unapproved scope and missing or altered evidence', async () => {
  const {verifyStorePromotion} = await load();
  for (const [name, mutate] of [
    ['missing owner', f=>{delete f.record.candidate.ownerException.approvedBy;}],
    ['missing rationale', f=>{f.record.candidate.ownerException.reason='';}],
    ['missing approval time', f=>{delete f.record.candidate.ownerException.approvedAt;}],
    ['future approval', f=>{f.record.candidate.ownerException.approvedAt='2026-10-17T12:00:00Z';}],
    ['unbound commit', f=>{f.record.candidate.ownerException.commit='b'.repeat(40);}],
    ['unbound artifact', f=>{f.record.candidate.ownerException.hashes.chrome='b'.repeat(64);}],
    ['missing artifact', f=>{delete f.record.candidate.ownerException.hashes.sbom;}],
    ['extra artifact', f=>{f.record.candidate.ownerException.hashes.other='b'.repeat(64);}],
    ['forbidden Store waiver', f=>{f.record.candidate.ownerException.waivedGates.push('storeApproval');}],
    ['forbidden artwork waiver', f=>{f.record.candidate.ownerException.waivedGates.push('artworkApproved');}],
    ['forbidden browser waiver', f=>{f.record.candidate.ownerException.waivedLiveCertification.push('safari');}],
    ['duplicate waiver', f=>{f.record.candidate.ownerException.waivedGates.push('unchangedWindow');}],
    ['unwaived browser', f=>{f.record.candidate.ownerException.waivedLiveCertification.pop();}],
    ['unwaived acceptance', f=>{f.record.candidate.ownerException.waivedGates.shift();}],
    ['unwaived window', f=>{f.record.candidate.ownerException.waivedGates.pop();}],
    ['failed live test', f=>{f.record.liveCertification.firefox='failed';}],
    ['missing report', f=>{delete f.record.candidate.ownerException.evidence;}],
    ['altered report', f=>{f.record.candidate.ownerException.evidence.sha256='b'.repeat(64);}],
    ['escaping report', f=>{f.record.candidate.ownerException.evidence.path='../owner.txt';}],
    ['missing actual UAT report', f=>{delete f.record.candidate.promotion.uat.report;}],
    ['missing UAT status', f=>{delete f.record.candidate.promotion.uat.passed;}],
    ['unapproved permission delta', f=>{f.record.candidate.promotion.permissionDelta.approved=false;}],
    ['wrong Store target', f=>{f.target='different';}],
    ['dirty source', f=>{f.identity=async()=>({commit:f.record.candidate.commit,changes:['scripts/release-status.mjs']});}],
    ['invalid window start', f=>{f.record.candidate.promotion.unchangedSince='invalid';}],
    ['future window start', f=>{f.record.candidate.promotion.unchangedSince='2026-10-17T12:00:00Z';}],
    ['changed package bytes', f=>{const read=f.read;f.read=async(filename,...args)=>filename.endsWith('.zip')?Buffer.from('changed'):read(filename,...args);}],
  ]) {
    const f = ownerExceptionFixture(); mutate(f);
    await assert.rejects(verifyStorePromotion({...f, channel:'chrome', action:'upload-only'}), undefined, name);
  }
});
