import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const BROWSERS = ['chrome', 'edge', 'brave', 'firefox', 'opera'];
const ARTIFACTS = [...BROWSERS, 'chrome-store', 'edge-store', 'sbom'];
const GATES = ['fullScopeAcceptance', 'accessibilityAndFailureUat', 'artworkApproved',
  'unchangedWindow', 'storeApproval', 'publicParity', 'installedUpgrade'];
const START = '<!-- captionkeep-6.0-status:start -->';
const END = '<!-- captionkeep-6.0-status:end -->';
export const statusDocuments = ['readme.md', 'docs/RELEASE-6.0.md', 'docs/wiki/Release-Status.md'];
const candidateMetadataDocuments = new Set(['docs/release-state/6.0.json', ...statusDocuments]);

export function inspectCandidateIdentity({root, candidateCommit} = {}) {
  if (!/^[a-f0-9]{40}$/i.test(candidateCommit || '')) throw new Error('Invalid frozen candidate source commit');
  const run = args => execFileSync('git', args, {cwd:root, encoding:'utf8', windowsHide:true}).trim();
  const head = run(['rev-parse','HEAD']);
  if (head !== candidateCommit) {
    try {
      execFileSync('git', ['merge-base','--is-ancestor',candidateCommit,head], {cwd:root,stdio:'ignore',windowsHide:true});
    } catch {
      throw new Error('Frozen candidate source is not an ancestor of the release metadata commit');
    }
  }
  const committed = head === candidateCommit ? [] : run(['diff','--name-only',`${candidateCommit}..${head}`])
    .split(/\r?\n/).filter(Boolean).filter(file => !candidateMetadataDocuments.has(file));
  const working = run(['status','--porcelain','--untracked-files=normal'])
    .split(/\r?\n/).filter(Boolean).filter(line => !candidateMetadataDocuments.has(line.slice(3)));
  return {commit:candidateCommit, head, changes:[...committed, ...working]};
}

export function validateReleaseStatus(record, version) {
  if (record.product !== 'Better CaptionKeep' || record.version !== version) throw new Error('Release identity mismatch');
  if (typeof record.branch !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.\/-]*$/.test(record.branch)
      || record.branch.includes('..') || record.branch.endsWith('/')) throw new Error('Invalid source branch identity');
  if (!['development', 'candidate', 'released'].includes(record.state)) throw new Error('Unknown release state');
  if (!Array.isArray(record.requiredBrowsers) || record.requiredBrowsers.length !== BROWSERS.length
      || !BROWSERS.every(browser => record.requiredBrowsers.includes(browser))) throw new Error('Five-browser commitment is incomplete');
  for (const browser of BROWSERS) {
    if (!['pending', 'passed', 'failed', 'blocked'].includes(record.liveCertification?.[browser])) throw new Error(`Missing live certification: ${browser}`);
  }
  for (const gate of GATES) if (typeof record.releaseGates?.[gate] !== 'boolean') throw new Error(`Missing release gate: ${gate}`);
  if (!Number.isInteger(record.boardEpic) || record.boardEpic <= 0) throw new Error('Missing authoritative Board epic');
  if (!record.candidate || typeof record.candidate.frozen !== 'boolean') throw new Error('Missing candidate state');
  if (record.state === 'development' && record.candidate.frozen) throw new Error('Development cannot claim a frozen candidate');
  if (Object.keys(record.candidate.hashes || {}).some(name => /byomcp/i.test(name))) {
    throw new Error('Deferred MCP artifacts cannot be promoted with 6.0');
  }
  if (record.state !== 'development') {
    if (!record.candidate.frozen || !/^[a-f0-9]{40}$/i.test(record.candidate.commit || '')
        || !record.candidate.hashes || ARTIFACTS.some(name => !/^[a-f0-9]{64}$/i.test(record.candidate.hashes[name] || ''))) throw new Error('Frozen candidate requires exact commit and artifact hashes for all browser/Store packages and SBOM');
    if (!BROWSERS.every(browser => record.liveCertification[browser] === 'passed')
        || !record.releaseGates.fullScopeAcceptance || !record.releaseGates.accessibilityAndFailureUat
        || !record.releaseGates.artworkApproved) throw new Error('Candidate acceptance/certification remains open');
  }
  if (record.state === 'released' && GATES.some(gate => !record.releaseGates[gate])) throw new Error('Release still has open gates');
  return record;
}

export function requireFrozenCandidate(record) {
  if (record.state !== 'candidate' || !record.candidate?.frozen) {
    throw new Error('Release packaging requires an explicitly frozen candidate');
  }
  return record;
}

export function verifyCandidateArtifacts(record, {commit, hashes, workingTreeDirty = false} = {}) {
  if (record.state === 'development') return {verified:false, reason:'development'};
  requireFrozenCandidate(record);
  if (commit !== record.candidate.commit) throw new Error('Built source commit differs from the frozen candidate');
  if (workingTreeDirty) throw new Error('Frozen candidate build contains unreviewed working-tree changes');
  for (const name of ARTIFACTS) {
    const actual = hashes?.[name];
    if (!/^[a-f0-9]{64}$/i.test(actual || '')
        || actual.toLowerCase() !== record.candidate.hashes[name].toLowerCase()) {
      throw new Error(`Built artifact differs from frozen candidate: ${name}`);
    }
  }
  return {verified:true};
}

// CAP-09/10/12: promotion consumes evidence for the same immutable candidate.
// The normal development/package gate intentionally does not invoke this guard.
export async function verifyStorePromotion({channel, action, target, packagePath, version,
  read = readFile, identity, now = Date.now(), root = fileURLToPath(new URL('../', import.meta.url))} = {}) {
  if (!['chrome', 'edge'].includes(channel)) throw new Error('Invalid Store promotion channel');
  assertVerifiableStoreAction(action);
  const record = JSON.parse(await read(path.join(root, 'docs/release-state/6.0.json'), 'utf8'));
  const manifest = JSON.parse(await read(path.join(root, 'teams-captions-saver/manifest.json'), 'utf8'));
  validateReleaseStatus(record, manifest.version);
  if (record.state !== 'candidate' || !record.candidate.frozen) throw new Error('Store promotion requires a frozen candidate');
  if (version && version !== record.version) throw new Error('Store promotion version mismatch');
  for (const gate of ['fullScopeAcceptance','accessibilityAndFailureUat','artworkApproved','unchangedWindow']) {
    if (!record.releaseGates[gate]) throw new Error(`Store promotion gate remains open: ${gate}`);
  }
  const candidate = record.candidate, evidence = candidate.promotion;
  const bound = value => value?.commit === candidate.commit && value.hashes
    && ARTIFACTS.every(name => value.hashes[name] === candidate.hashes[name]);
  if (!bound(evidence) || typeof evidence.approvedBy !== 'string' || !evidence.approvedBy.trim()
      || evidence.approvedBy.length > 200) throw new Error('Missing or stale candidate promotion approval');
  if (typeof target !== 'string' || !target || evidence.targets?.[channel] !== target) {
    throw new Error('Store target differs from candidate approval');
  }
  if (!bound(evidence.uat) || evidence.uat.passed !== true) throw new Error('Missing or stale candidate UAT evidence');
  if (!bound(evidence.permissionDelta) || evidence.permissionDelta.approved !== true) throw new Error('Missing or stale permission delta approval');
  for (const check of [evidence.uat, evidence.permissionDelta]) {
    const report = check.report;
    if (!report || typeof report.path !== 'string' || !report.path || report.path.includes('\\')
        || report.path.split('/').some(part => !part || part === '.' || part === '..')
        || path.isAbsolute(report.path) || /^[a-z]:/i.test(report.path)
        || !/^[a-f0-9]{64}$/i.test(report.sha256 || '')) throw new Error('Missing candidate acceptance report identity');
    if (createHash('sha256').update(await read(path.join(root, report.path))).digest('hex') !== report.sha256.toLowerCase()) {
      throw new Error('Candidate acceptance report changed');
    }
  }
  const started = Date.parse(evidence.unchangedSince);
  if (typeof evidence.unchangedSince !== 'string' || !Number.isFinite(started) || !Number.isFinite(now)
      || started > now || now - started < 48 * 60 * 60 * 1000) throw new Error('Candidate has not completed the 48-hour unchanged window');
  // candidate.commit identifies the reviewed source commit. A later metadata-only
  // commit records hashes and gates without creating an impossible self-reference.
  const observed = identity ? await identity() : inspectCandidateIdentity({root, candidateCommit:candidate.commit});
  if (observed?.commit !== candidate.commit || !Array.isArray(observed.changes) || observed.changes.length) {
    throw new Error('Candidate source commit changed or worktree contains unreviewed changes');
  }
  const filename = packagePath || path.join(root, 'dist', 'prod',
    channel === 'chrome' ? `better_captionkeep-chrome-${record.version}.zip` : `better_captionkeep-${record.version}.zip`);
  const bytes = await read(filename);
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== candidate.hashes[`${channel}-store`].toLowerCase()) throw new Error('Store package differs from frozen candidate hash');
  return {bytes, packagePath:filename, version:record.version, sha256:digest};
}

export function assertVerifiableStoreAction(action) {
  if (action === 'publish-staged' || action?.startsWith('submit-existing')) {
    throw new Error('Existing Store drafts cannot be verified against the candidate bytes. Use a fresh upload-and-submit action; staged publication requires independently verified immutable remote revision evidence and is disabled.');
  }
}

export function renderReleaseStatus(record) {
  const pending = BROWSERS.filter(browser => record.liveCertification[browser] !== 'passed');
  const open = GATES.filter(gate => !record.releaseGates[gate]);
  return `${START}\n> **6.0 delivery status:** ${record.version} is ${record.state} on \`${record.branch}\`. Candidate frozen: ${record.candidate.frozen ? 'yes' : 'no'}.\n> Live provider certification outstanding: ${pending.join(', ') || 'none'}.\n> Open release gates: ${open.join(', ') || 'none'}. Azure Boards epic: **#${record.boardEpic}**.\n> This status does not change historical 5.4 publication records.\n${END}`;
}

export function reconcileStatusDocument(text, record, write = false) {
  const start = text.indexOf(START), end = text.indexOf(END);
  if (start < 0 || end < start || text.indexOf(START, start + START.length) !== -1
      || text.indexOf(END, end + END.length) !== -1) throw new Error('Missing or duplicate generated status boundary');
  const expected = renderReleaseStatus(record);
  const actual = text.slice(start, end + END.length).replaceAll('\r\n', '\n');
  if (!write && actual !== expected) throw new Error('Release status contradicts the authoritative record; run release-status.mjs --write');
  return text.slice(0, start) + expected + text.slice(end + END.length);
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const record = JSON.parse(await readFile(path.join(root, 'docs/release-state/6.0.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(root, 'teams-captions-saver/manifest.json'), 'utf8'));
  validateReleaseStatus(record, manifest.version);
  if (process.argv.includes('--require-candidate')) requireFrozenCandidate(record);
  for (const file of statusDocuments) {
    const absolute = path.join(root, file);
    const text = await readFile(absolute, 'utf8');
    const updated = reconcileStatusDocument(text, record, process.argv.includes('--write'));
    if (process.argv.includes('--write')) await writeFile(absolute, updated, 'utf8');
  }
  console.log(`Verified ${record.version} release status across ${statusDocuments.length} views; state=${record.state}.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
