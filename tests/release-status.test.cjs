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
