import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';
import { readEnglishMessages, resolveManifestMessage } from './manifest-localization.mjs';

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

export async function packageExtension(source, destination) {
  const sourceDir = path.resolve(source);
  const destinationDir = path.resolve(destination);
  await assertNoReservedPackagePaths(sourceDir);
  const manifest = JSON.parse(await readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));
  const messages = await readEnglishMessages(sourceDir);
  const artifactName = `${artifactStem(resolveManifestMessage(manifest.name, messages))}-${manifest.version}.zip`;
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
    archive.directory(sourceDir, false);
    archive.finalize().catch(reject);
  });

  await rm(artifactPath, { force: true });
  await rename(temporaryPath, artifactPath);
  console.log(`Packaged ${path.relative(process.cwd(), artifactPath)} from ${path.relative(process.cwd(), sourceDir)}`);
  return artifactPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination) throw new Error('Usage: node scripts/package-extension.mjs <source-dir> <destination-dir>');
  await packageExtension(source, destination);
}
