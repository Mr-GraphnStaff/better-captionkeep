import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex').toUpperCase();
}

export async function verifyReleaseAssets(directory, releaseTag) {
  const match = /^v(\d+\.\d+\.\d+(?:\.\d+)?)$/.exec(String(releaseTag || ''));
  if (!match) throw new Error('Release tag must be v<manifest version>');
  const version = match[1];
  const root = path.resolve(directory);
  const provenance = JSON.parse(await readFile(path.join(root, 'release-provenance.json'), 'utf8'));
  if (provenance.version !== version) throw new Error(`Release provenance version ${provenance.version} does not match ${releaseTag}`);

  const checksumLines = (await readFile(path.join(root, 'SHA256SUMS.txt'), 'utf8')).split(/\r?\n/).filter(Boolean);
  const checksums = new Map();
  for (const line of checksumLines) {
    const parsed = /^([a-f0-9]{64})\s+\*?([^/\\]+)$/i.exec(line.trim());
    if (!parsed) throw new Error(`Invalid checksum entry: ${line}`);
    if (checksums.has(parsed[2])) throw new Error(`Duplicate checksum entry: ${parsed[2]}`);
    checksums.set(parsed[2], parsed[1].toUpperCase());
  }

  const zipArtifacts = (provenance.artifacts || []).filter(artifact =>
    ['edge-store', 'chrome-store'].includes(artifact.target) && String(artifact.path || '').endsWith('.zip'));
  const provenanceByName = new Map(zipArtifacts.map(artifact => [path.basename(artifact.path), artifact]));
  if (provenanceByName.size !== 2) throw new Error('Release provenance must contain exactly the Edge and Chrome Store ZIP artifacts');
  for (const [name, artifact] of provenanceByName) {
    if (!name.includes(`-${version}.zip`)) throw new Error(`Artifact ${name} does not match release version ${version}`);
    const expected = checksums.get(name);
    if (!expected) throw new Error(`Checksum missing for ${name}`);
    const actual = await sha256(path.join(root, name));
    if (actual !== expected) throw new Error(`Checksum mismatch for ${name}`);
    if (String(artifact.sha256 || '').toUpperCase() !== actual) throw new Error(`Provenance hash mismatch for ${name}`);
  }
  for (const name of checksums.keys()) {
    if (!provenanceByName.has(name)) throw new Error(`Checksum has no matching provenance artifact: ${name}`);
  }
  return Object.freeze({version, commit: provenance.commit, artifacts: [...provenanceByName.keys()].sort()});
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  verifyReleaseAssets(process.argv[2] || 'dist/release', process.argv[3] || process.env.RELEASE_TAG)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
