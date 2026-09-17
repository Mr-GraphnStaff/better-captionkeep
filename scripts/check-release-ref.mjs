import { readFile } from 'node:fs/promises';

const tag = process.argv[2];
if (!tag) throw new Error('Usage: node scripts/check-release-ref.mjs <vX.Y.Z tag>');

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('../teams-captions-saver/manifest.json', import.meta.url), 'utf8'));
const expectedTag = `v${packageJson.version}`;

if (tag !== expectedTag) {
  throw new Error(`Release tag ${tag} does not match package version ${expectedTag}`);
}
if (manifest.version !== packageJson.version) {
  throw new Error(`Manifest version ${manifest.version} does not match package version ${packageJson.version}`);
}

console.log(`Release identity verified: ${tag}`);
