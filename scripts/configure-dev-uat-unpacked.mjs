import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = String(process.argv[2] || '').toLowerCase();
if (!['dev', 'uat', 'prod'].includes(target)) throw new Error('Target must be dev, uat, or prod.');

const tenantId = String(process.env.BCK_DEV_UAT_GRAPH_TENANT_ID || '').trim();
const clientId = String(process.env.BCK_DEV_UAT_GRAPH_CLIENT_ID || '').trim();
const guid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
if (!guid.test(tenantId) || !guid.test(clientId)) throw new Error('Valid local tenant and client GUIDs are required.');

const targetDir = path.join(projectRoot, 'dist', target);
const manifest = JSON.parse(await readFile(path.join(targetDir, 'manifest.json'), 'utf8'));
const expectedName = target === 'dev'
  ? 'Better CaptionKeep - Development'
  : target === 'uat'
    ? 'Better CaptionKeep - UAT Release Candidate'
    : 'Better CaptionKeep';
const expectedVersionLabel = target === 'dev'
  ? /\bdevelopment\b/i
  : target === 'uat'
    ? /\buat release candidate\b/i
    : /^$/;
if (manifest.name !== expectedName || !expectedVersionLabel.test(manifest.version_name || '')) {
  throw new Error(`Refusing to configure a non-canonical ${target} build.`);
}

const source = `globalThis.CaptionKeepGraphRuntimeConfig = Object.freeze(${JSON.stringify({
  enableGraphTranscriptImport: true,
  graphTenantId: tenantId,
  graphClientId: clientId
})});\n`;
await writeFile(path.join(targetDir, 'graphRuntimeConfig.js'), source, {encoding:'utf8', mode:0o600});
console.log(`Configured the canonical ${target} unpacked Graph connection without changing a Store package.`);
