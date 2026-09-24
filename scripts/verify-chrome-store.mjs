import { createHash } from 'node:crypto';
import { readdir, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceManifestPath = path.join(projectRoot, 'teams-captions-saver', 'manifest.json');
const stagedRoot = path.join(projectRoot, 'dist', 'chrome-store-unpacked');
const artifactRoot = path.join(projectRoot, 'dist', 'chrome-store');
const forbidden = /(?:\.captionkeeper|public[ _-]?key|\.pem$|\.env$|^tmp$)/i;

async function filesUnder(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, next));
    else files.push(next.replaceAll('\\', '/'));
  }
  return files;
}

const sourceManifest = JSON.parse(await readFile(sourceManifestPath, 'utf8'));
const storeManifest = JSON.parse(await readFile(path.join(stagedRoot, 'manifest.json'), 'utf8'));
const files = await filesUnder(stagedRoot);
const forbiddenFiles = files.filter(file => file.split('/').some(part => forbidden.test(part)));

if (forbiddenFiles.length) throw new Error(`Chrome Store package contains forbidden files: ${forbiddenFiles.join(', ')}`);
if (storeManifest.name !== 'Better CaptionKeep') throw new Error('Chrome Store name must be Better CaptionKeep.');
if (/test|development/i.test(`${storeManifest.name} ${storeManifest.version_name ?? ''} ${storeManifest.action?.default_title ?? ''}`)) {
  throw new Error('Chrome Store manifest contains test or development labeling.');
}
for (const key of ['version', 'permissions', 'host_permissions', 'background', 'content_scripts', 'storage']) {
  if (JSON.stringify(storeManifest[key]) !== JSON.stringify(sourceManifest[key])) {
    throw new Error(`Chrome Store manifest differs from the reviewed source manifest at ${key}.`);
  }
}

const zipNames = (await readdir(artifactRoot)).filter(name => name.endsWith('.zip'));
if (zipNames.length !== 1) throw new Error(`Expected one Chrome Store ZIP, found ${zipNames.length}.`);
const originalZipPath = path.join(artifactRoot, zipNames[0]);
const artifactName = `better_captionkeep-chrome-${storeManifest.version}.zip`;
const zipPath = path.join(artifactRoot, artifactName);
if (originalZipPath !== zipPath) await rename(originalZipPath, zipPath);
const hash = createHash('sha256').update(await readFile(zipPath)).digest('hex').toUpperCase();
console.log(JSON.stringify({
  product: storeManifest.name,
  version: storeManifest.version,
  artifact: path.relative(projectRoot, zipPath).replaceAll('\\', '/'),
  bytes: (await stat(zipPath)).size,
  sha256: hash
}, null, 2));
