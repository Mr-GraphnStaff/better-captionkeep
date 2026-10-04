import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(projectRoot, 'dist');

if (path.dirname(distDir) !== projectRoot || path.basename(distDir) !== 'dist') {
  throw new Error('Refusing to clean anything except the project dist directory.');
}

await rm(distDir, { recursive: true, force: true });
await Promise.all(['dev', 'uat', 'prod'].map(name => mkdir(path.join(distDir, name), { recursive: true })));
console.log('Reset dist to the three lifecycle environments: dev, uat, prod.');
