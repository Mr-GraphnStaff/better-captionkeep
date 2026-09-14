import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(projectRoot, 'dist');
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

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase();
}

const sourceManifest = JSON.parse(await readFile(path.join(projectRoot, 'teams-captions-saver', 'manifest.json'), 'utf8'));
const artifacts = [];
const sourceFiles = await filesUnder(path.join(projectRoot, 'teams-captions-saver'));
const forbiddenSource = sourceFiles.filter(file => file.split('/').some(part => forbidden.test(part)));
if (forbiddenSource.length) throw new Error(`Store source contains forbidden files: ${forbiddenSource.join(', ')}`);
for (const target of ['chrome', 'edge']) {
  const root = path.join(distDir, `${target}-unpacked`);
  const files = await filesUnder(root);
  const bad = files.filter(file => file.split('/').some(part => forbidden.test(part)));
  if (bad.length) throw new Error(`${target} package contains forbidden files: ${bad.join(', ')}`);
  if (files.filter(file => file === 'manifest.json').length !== 1) throw new Error(`${target} package must have one root manifest`);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  for (const key of ['version', 'permissions', 'host_permissions', 'background', 'content_scripts', 'storage']) {
    if (JSON.stringify(manifest[key]) !== JSON.stringify(sourceManifest[key])) throw new Error(`${target} manifest differs at ${key}`);
  }
  const zips = (await readdir(distDir)).filter(name => name.endsWith('.zip') && name.includes(`${target}_test`));
  if (zips.length !== 1) throw new Error(`Expected one ${target} test ZIP, found ${zips.length}`);
  const zipPath = path.join(distDir, zips[0]);
  artifacts.push({ target, path: zips[0], bytes: (await stat(zipPath)).size, sha256: await sha256(zipPath) });
}

const storeZipName = `better_captionkeep-${sourceManifest.version}.zip`;
const storeZipPath = path.join(distDir, storeZipName);
artifacts.push({ target: 'edge-store', path: storeZipName, bytes: (await stat(storeZipPath)).size, sha256: await sha256(storeZipPath) });

const commit = execFileSync('git', ['-c', 'safe.directory=P:/Projects/better-captionkeep', 'rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
const provenance = { product: 'Better CaptionKeep', version: sourceManifest.version, commit, createdAt: new Date().toISOString(), artifacts };
await writeFile(path.join(distDir, 'release-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(provenance, null, 2));
