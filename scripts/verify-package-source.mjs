import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';

async function sourceFiles(directory, relative = '') {
  const files = [];
  for (const entry of await readdir(path.join(directory, relative), {withFileTypes:true})) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(directory, next));
    else files.push(next.replaceAll('\\', '/'));
  }
  return files;
}

export function zipEntries(bytes) {
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {end = offset; break;}
  }
  if (end < 0) throw new Error('Package ZIP directory is missing.');
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid package ZIP directory.');
    const method = bytes.readUInt16LE(offset + 10);
    const size = bytes.readUInt32LE(offset + 20);
    const expandedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (entries.has(name)) throw new Error(`Duplicate package ZIP entry: ${name}`);
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid package ZIP file record.');
    const begin = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(begin, begin + size);
    if (method !== 0 && method !== 8) throw new Error(`Unsupported package ZIP compression: ${method}`);
    const contents = method === 8 ? inflateRawSync(compressed, {maxOutputLength:expandedSize + 1}) : compressed;
    if (contents.length !== expandedSize) throw new Error(`Package ZIP size mismatch: ${name}`);
    entries.set(name, contents);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export async function verifyPackageSource(source, {directory, zipPath, allowedDifferences = ['manifest.json'], browserTarget, expectedManifest} = {}) {
  if (!directory && !zipPath) throw new Error('A staged directory or ZIP is required.');
  const entries = zipPath ? zipEntries(await readFile(zipPath)) : null;
  if (browserTarget && !['chrome','edge','brave','opera','firefox'].includes(browserTarget)) throw new Error('Unsupported package browser target');
  if (expectedManifest) {
    const expected = JSON.parse(await readFile(expectedManifest,'utf8'));
    const actual = JSON.parse(entries ? entries.get('manifest.json')?.toString('utf8') : await readFile(path.join(directory,'manifest.json'),'utf8'));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Package manifest identity mismatch: ${zipPath || directory}`);
  }
  const allowed = new Set(allowedDifferences);
  const files = await sourceFiles(source);
  for (const name of files) {
    if (allowed.has(name)) continue;
    const expected = name === 'browserRuntimeConfig.js' && browserTarget && browserTarget !== 'chrome'
      ? Buffer.from(`globalThis.CaptionKeepBrowserRuntime = Object.freeze(${JSON.stringify({target:browserTarget})});\n`)
      : await readFile(path.join(source, name));
    const actual = entries ? entries.get(name) : await readFile(path.join(directory, name));
    if (!actual || !actual.equals(expected)) throw new Error(`Package source mismatch: ${name} in ${zipPath || directory}`);
  }
  if (entries) {
    const expectedNames = new Set(files);
    for (const name of entries.keys()) {
      if (!name.endsWith('/') && !expectedNames.has(name)) throw new Error(`Unexpected package source: ${name}`);
    }
  }
  return {checkedFiles:files.length - allowed.size};
}
