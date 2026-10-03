import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = String(process.argv[2] || '').toLowerCase();
if (target !== 'uat') throw new Error('Target must be uat.');

const tenantId = String(process.env.BCK_DEV_UAT_GRAPH_TENANT_ID || '').trim();
const clientId = String(process.env.BCK_DEV_UAT_GRAPH_CLIENT_ID || '').trim();
const guid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
if (!guid.test(tenantId) || !guid.test(clientId)) throw new Error('Valid dev/UAT tenant and client GUIDs are required.');

const targetDir = path.join(projectRoot, 'dist', 'uat');
const manifest = JSON.parse(await readFile(path.join(targetDir, 'manifest.json'), 'utf8'));
if (manifest.name !== 'Better CaptionKeep - UAT Release Candidate'
  || !/\buat release candidate\b/i.test(manifest.version_name || '')) {
  throw new Error('Refusing to configure anything except the canonical UAT release candidate.');
}

const source = `globalThis.CaptionKeepDevUatLocalConfig = Object.freeze(${JSON.stringify({
  enableGraphTranscriptImport: true,
  graphTenantId: tenantId,
  graphClientId: clientId
})});\n`;
await writeFile(path.join(targetDir, 'devUatLocalConfig.js'), source, {encoding:'utf8', mode:0o600});
console.log('Configured the canonical UAT release-candidate Graph overlay without changing a production package.');
