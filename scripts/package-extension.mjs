import {assertShippingDirectory} from './shipping-boundary.mjs';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';
import { readEnglishMessages, resolveManifestMessage } from './manifest-localization.mjs';

const ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');

async function packageFiles(root, relative = '') {
  const entries = await readdir(path.join(root, relative), {withFileTypes:true});
  const files = [];
  for (const entry of entries) {
    const next = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Extension package source cannot contain a symbolic link: ${next.replaceAll('\\', '/')}`);
    if (entry.isDirectory()) files.push(...await packageFiles(root, next));
    else if (entry.isFile()) files.push(next);
    else throw new Error(`Extension package source contains an unsupported entry: ${next.replaceAll('\\', '/')}`);
  }
  return files.map(file => file.replaceAll('\\', '/')).sort();
}

function artifactStem(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/\s/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
}

export async function assertNoReservedPackagePaths(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    const next = path.join(relative, entry.name);
    const parts = next.split(path.sep);
    const reserved = parts.find((part, index) =>
      part.startsWith('_') && !(index === 0 && part === '_locales')
    );
    if (reserved) {
      throw new Error(`Extension package source contains reserved path: ${next.replaceAll('\\', '/')}`);
    }
    if (entry.isDirectory()) await assertNoReservedPackagePaths(root, next);
  }
}

export async function packageExtension(source, destination, artifactBaseName = null, browserTarget = null) {
  const sourceDir = path.resolve(source);
  const destinationDir = path.resolve(destination);
  await assertNoReservedPackagePaths(sourceDir);
  await assertShippingDirectory(sourceDir);
  const files = await packageFiles(sourceDir);
  const packageEntries = await Promise.all(files.map(async relative => ({
    relative,
    bytes: await readFile(path.join(sourceDir, relative)),
  })));
  if (browserTarget) {
    if (!['edge','brave','opera','firefox'].includes(browserTarget)) throw new Error('Unsupported explicit package browser target');
    const expected = `globalThis.CaptionKeepBrowserRuntime = Object.freeze(${JSON.stringify({target:browserTarget})});\n`;
    if (await readFile(path.join(sourceDir,'browserRuntimeConfig.js'),'utf8') !== expected) throw new Error(`Package browser runtime identity mismatch: expected ${browserTarget}`);
  }
  const manifest = JSON.parse(await readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));
  const messages = await readEnglishMessages(sourceDir);
  const resolvedArtifactName = artifactBaseName || resolveManifestMessage(manifest.name, messages);
  const artifactName = `${artifactStem(resolvedArtifactName)}-${manifest.version}.zip`;
  const artifactPath = path.join(destinationDir, artifactName);
  const temporaryPath = `${artifactPath}.partial`;

  await mkdir(destinationDir, { recursive: true });
  await rm(temporaryPath, { force: true });

  await new Promise((resolve, reject) => {
    const output = createWriteStream(temporaryPath, { flags: 'wx' });
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('warning', reject);
    archive.on('error', reject);
    archive.pipe(output);
    for (const entry of packageEntries) {
      archive.append(entry.bytes, {
        name: entry.relative,
        date: ZIP_DATE,
        mode: 0o100644,
      });
    }
    archive.finalize().catch(reject);
  });

  await rm(artifactPath, { force: true });
  await rename(temporaryPath, artifactPath);
  console.log(`Packaged ${path.relative(process.cwd(), artifactPath)} from ${path.relative(process.cwd(), sourceDir)}`);
  return artifactPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, destination, artifactBaseName, browserTarget] = process.argv.slice(2);
  if (!source || !destination) throw new Error('Usage: node scripts/package-extension.mjs <source-dir> <destination-dir> [artifact-base-name]');
  await packageExtension(source, destination, artifactBaseName, browserTarget);
}
