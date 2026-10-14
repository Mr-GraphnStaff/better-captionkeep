import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL, fileURLToPath} from 'node:url';
import path from 'node:path';

const BROWSERS = ['chrome', 'edge', 'brave', 'firefox', 'opera', 'safari'];
const ARTIFACTS = [...BROWSERS, 'chrome-store', 'edge-store', 'sbom'];
const GATES = ['fullScopeAcceptance', 'accessibilityAndFailureUat', 'artworkApproved',
  'unchangedWindow', 'storeApproval', 'publicParity', 'installedUpgrade'];
const START = '<!-- captionkeep-6.0-status:start -->';
const END = '<!-- captionkeep-6.0-status:end -->';
export const statusDocuments = ['readme.md', 'docs/RELEASE-6.0.md', 'docs/wiki/Release-Status.md'];

export function validateReleaseStatus(record, version) {
  if (record.product !== 'Better CaptionKeep' || record.version !== version) throw new Error('Release identity mismatch');
  if (typeof record.branch !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.\/-]*$/.test(record.branch)
      || record.branch.includes('..') || record.branch.endsWith('/')) throw new Error('Invalid source branch identity');
  if (!['development', 'candidate', 'released'].includes(record.state)) throw new Error('Unknown release state');
  if (!Array.isArray(record.requiredBrowsers) || record.requiredBrowsers.length !== BROWSERS.length
      || !BROWSERS.every(browser => record.requiredBrowsers.includes(browser))) throw new Error('Six-browser commitment is incomplete');
  for (const browser of BROWSERS) {
    if (!['pending', 'passed', 'failed', 'blocked'].includes(record.liveCertification?.[browser])) throw new Error(`Missing live certification: ${browser}`);
  }
  for (const gate of GATES) if (typeof record.releaseGates?.[gate] !== 'boolean') throw new Error(`Missing release gate: ${gate}`);
  if (!Number.isInteger(record.boardEpic) || record.boardEpic <= 0) throw new Error('Missing authoritative Board epic');
  if (!record.candidate || typeof record.candidate.frozen !== 'boolean') throw new Error('Missing candidate state');
  if (record.state === 'development' && record.candidate.frozen) throw new Error('Development cannot claim a frozen candidate');
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
  for (const file of statusDocuments) {
    const absolute = path.join(root, file);
    const text = await readFile(absolute, 'utf8');
    const updated = reconcileStatusDocument(text, record, process.argv.includes('--write'));
    if (process.argv.includes('--write')) await writeFile(absolute, updated, 'utf8');
  }
  console.log(`Verified ${record.version} release status across ${statusDocuments.length} views; state=${record.state}.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
