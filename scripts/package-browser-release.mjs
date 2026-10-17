import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageExtension } from './package-extension.mjs';
import {canonicalizeSbomText} from './canonicalize-sbom.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prodDir = path.join(projectRoot, 'dist', 'prod');
const artifactDir = path.join(prodDir, 'browser-packages');
const browsers = ['chrome', 'edge', 'brave', 'opera', 'firefox'];

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase();
}

await mkdir(artifactDir, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(projectRoot, 'teams-captions-saver', 'manifest.json'), 'utf8'));
const artifacts = [];

for (const browser of browsers) {
  const sourceDir = path.join(prodDir, `${browser}-unpacked`);
  const artifactPath = await packageExtension(sourceDir, artifactDir, `better-captionkeep-${browser}`);
  artifacts.push({
    browser,
    file: path.basename(artifactPath),
    bytes: (await stat(artifactPath)).size,
    sha256: await sha256(artifactPath)
  });
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is required to generate the release SBOM. Run this through npm run package:browsers.');
const sbomText = execFileSync(
  process.execPath,
  [npmCli, 'sbom', '--package-lock-only', '--sbom-format', 'cyclonedx', '--sbom-type', 'application'],
  {cwd: projectRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 10 * 1024 * 1024}
);
const sbomPath = path.join(prodDir, `better-captionkeep-${manifest.version}.cdx.json`);
await writeFile(sbomPath, canonicalizeSbomText(sbomText), 'utf8');

const certification = {
  product: 'Better CaptionKeep',
  version: manifest.version,
  rule: 'A successful package build is not browser certification.',
  requiredProviders: ['Microsoft Teams', 'Google Meet', 'Zoom Web'],
  browsers: browsers.map(browser => ({
    browser,
    status: 'pending-live-validation',
    browserVersion: '',
    operatingSystem: '',
    testedAt: '',
    tester: '',
    providers: {
      'Microsoft Teams': 'pending',
      'Google Meet': 'pending',
      'Zoom Web': 'pending'
    },
    notes: ''
  }))
};
await writeFile(path.join(prodDir, 'browser-certification.json'), `${JSON.stringify(certification, null, 2)}\n`, 'utf8');
await writeFile(path.join(prodDir, 'browser-package-hashes.json'), `${JSON.stringify({version: manifest.version, artifacts}, null, 2)}\n`, 'utf8');

console.log(`Packaged ${artifacts.length} browser targets, wrote CycloneDX SBOM, and created the live-certification record.`);
