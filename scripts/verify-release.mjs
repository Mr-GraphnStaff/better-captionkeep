import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readEnglishMessages, resolveManifestMessage } from './manifest-localization.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(projectRoot, 'dist');
const prodDir = path.join(distDir, 'prod');
const forbidden = /(?:\.captionkeeper|public[ _-]?key|\.pem$|\.env$|^_|^tmp$)/i;

function hasForbiddenPathPart(file) {
  return file.split('/').some((part, index) =>
    forbidden.test(part) && !(index === 0 && part === '_locales')
  );
}
const expectedLifecycleIds = new Map([
  ['dev', 'pjpibiimicedkckleehljlklmblkacph'],
  ['uat', 'ecpjboeanaehianibdbgijldbikdgkhm'],
  ['prod', 'nffdfdkkbbbmngcibbeindpjlfkcnikg']
]);

function extensionIdFromKey(key) {
  const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest().subarray(0, 16);
  return [...digest]
    .map(byte => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15)))
    .join('');
}

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
const storeGraphConfig = await readFile(path.join(projectRoot, 'teams-captions-saver', 'graphRuntimeConfig.js'), 'utf8');
if (!storeGraphConfig.includes('Object.freeze({})')) {
  throw new Error('Store Microsoft 365 runtime configuration must be inert.');
}
if (/graphTenantId\s*:|graphClientId\s*:|enableGraphTranscriptImport\s*:\s*true/.test(storeGraphConfig)) {
  throw new Error('Store Microsoft 365 runtime configuration contains an organization identity.');
}
const artifacts = [];
const sourceFiles = await filesUnder(path.join(projectRoot, 'teams-captions-saver'));
const forbiddenSource = sourceFiles.filter(hasForbiddenPathPart);
if (forbiddenSource.length) throw new Error(`Store source contains forbidden files: ${forbiddenSource.join(', ')}`);
for (const target of ['dev', 'uat', 'prod']) {
  const root = path.join(distDir, target);
  const files = await filesUnder(root);
  const bad = files.filter(hasForbiddenPathPart);
  if (bad.length) throw new Error(`${target} package contains forbidden files: ${bad.join(', ')}`);
  if (files.filter(file => file === 'manifest.json').length !== 1) throw new Error(`${target} package must have one root manifest`);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  for (const key of ['version', 'permissions', 'host_permissions', 'optional_host_permissions', 'background', 'content_scripts', 'storage', 'side_panel']) {
    if (JSON.stringify(manifest[key]) !== JSON.stringify(sourceManifest[key])) throw new Error(`${target} manifest differs at ${key}`);
  }
  const expectedName = target === 'dev'
    ? 'Better CaptionKeep - Development'
    : target === 'uat'
      ? 'Better CaptionKeep - UAT Release Candidate'
      : 'Better CaptionKeep';
  const resolvedName = resolveManifestMessage(manifest.name, await readEnglishMessages(root));
  if (resolvedName !== expectedName) throw new Error(`${target} manifest has the wrong lifecycle identity`);
  if (!manifest.key) throw new Error(`${target} manifest must have a stable unpacked identity key`);
  const extensionId = extensionIdFromKey(manifest.key);
  if (extensionId !== expectedLifecycleIds.get(target)) {
    throw new Error(`${target} unpacked identity drifted: expected ${expectedLifecycleIds.get(target)}, received ${extensionId}`);
  }
  if (target === 'prod' && /test|development|release candidate/i.test(`${manifest.name} ${manifest.version_name ?? ''} ${manifest.action?.default_title ?? ''}`)) {
    throw new Error('prod manifest contains non-production lifecycle labeling');
  }
  const graphConfig = await readFile(path.join(root, 'graphRuntimeConfig.js'), 'utf8');
  if (target === 'prod' && graphConfig !== storeGraphConfig) {
    throw new Error('prod Microsoft 365 configuration differs from the Store source');
  }
}

const lifecycleKeys = await Promise.all(['dev', 'uat', 'prod'].map(async target => {
  const manifest = JSON.parse(await readFile(path.join(distDir, target, 'manifest.json'), 'utf8'));
  return manifest.key;
}));
if (new Set(lifecycleKeys).size !== lifecycleKeys.length) {
  throw new Error('Dev, UAT, and Prod must have separate stable unpacked identity keys');
}

const storeZipName = `better_captionkeep-${sourceManifest.version}.zip`;
const storeZipPath = path.join(prodDir, storeZipName);
artifacts.push({ target: 'edge-store', path: storeZipName, bytes: (await stat(storeZipPath)).size, sha256: await sha256(storeZipPath) });

const chromeStoreZipName = `better_captionkeep-chrome-${sourceManifest.version}.zip`;
const chromeStoreZipPath = path.join(prodDir, chromeStoreZipName);
artifacts.push({ target: 'chrome-store', path: chromeStoreZipName, bytes: (await stat(chromeStoreZipPath)).size, sha256: await sha256(chromeStoreZipPath) });

const intuneDir = path.join(prodDir, 'intune-edge');
for (const name of ['edge-extension-settings.json', 'edge-extension-force-install.txt', 'managed-policy.json', 'detect-managed-policy.ps1', 'remediate-managed-policy.ps1']) {
  const filePath = path.join(intuneDir, name);
  artifacts.push({ target: 'intune', path: `intune-edge/${name}`, bytes: (await stat(filePath)).size, sha256: await sha256(filePath) });
}

const safeProjectRoot = projectRoot.replaceAll('\\', '/');
const commit = execFileSync('git', ['-c', `safe.directory=${safeProjectRoot}`, 'rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
const evidenceActionsDir = path.join(prodDir, 'evidence-actions');
const evidenceActionsProvenancePath = path.join(evidenceActionsDir, 'evidence-actions-provenance.json');
const evidenceActionsProvenance = JSON.parse(await readFile(evidenceActionsProvenancePath, 'utf8'));
if (evidenceActionsProvenance.format !== 'better-captionkeep-evidence-actions-provenance'
  || evidenceActionsProvenance.version !== 1
  || evidenceActionsProvenance.productVersion !== sourceManifest.version
  || evidenceActionsProvenance.commit !== commit) {
  throw new Error('Evidence Actions provenance does not match this release candidate.');
}
const evidenceArtifactPath = path.join(projectRoot, evidenceActionsProvenance.artifact?.path || '');
if (path.dirname(evidenceArtifactPath) !== evidenceActionsDir) {
  throw new Error('Evidence Actions artifact is outside the release evidence directory.');
}
const evidenceArtifactSha256 = await sha256(evidenceArtifactPath);
if (evidenceArtifactSha256 !== evidenceActionsProvenance.artifact.sha256
  || (await stat(evidenceArtifactPath)).size !== evidenceActionsProvenance.artifact.bytes) {
  throw new Error('Evidence Actions artifact does not match its recorded digest and size.');
}
const assistantLockSha256 = await sha256(path.join(projectRoot, 'packages', 'captionkeep-assistant-bridge', 'package-lock.json'));
const mcpLockSha256 = await sha256(path.join(projectRoot, 'packages', 'captionkeep-mcp', 'package-lock.json'));
if (assistantLockSha256 !== evidenceActionsProvenance.dependencyLocks?.assistantBridgeSha256
  || mcpLockSha256 !== evidenceActionsProvenance.dependencyLocks?.mcpServerSha256) {
  throw new Error('Evidence Actions dependency-lock digest drifted after packaging.');
}
artifacts.push({
  target:'evidence-actions',
  path:path.relative(prodDir, evidenceArtifactPath).replaceAll('\\', '/'),
  bytes:(await stat(evidenceArtifactPath)).size,
  sha256:evidenceArtifactSha256
});
const cleanInstallPath = path.join(evidenceActionsDir, 'clean-install-evidence.json');
const cleanInstall = JSON.parse(await readFile(cleanInstallPath, 'utf8'));
const expectedMcpTools = [
  'captionkeep_get_active_selection',
  'captionkeep_get_caption_sources',
  'captionkeep_get_decisions_and_actions',
  'captionkeep_get_meeting_evidence',
  'captionkeep_search_captions',
  'captionkeep_search_meetings',
  'captionkeep_verify_evidence_bundle'
];
const nativeLauncherEvidenceIsValid = cleanInstall.nativeLauncher?.status === 'passed'
  || (process.platform !== 'win32'
    && cleanInstall.platform?.os === process.platform
    && cleanInstall.nativeLauncher?.status === 'artifact_validated'
    && cleanInstall.nativeLauncher?.runtime === 'not_run');
if (cleanInstall.format !== 'better-captionkeep-evidence-actions-clean-install'
  || cleanInstall.version !== 1
  || cleanInstall.productVersion !== sourceManifest.version
  || cleanInstall.commit !== commit
  || cleanInstall.artifactSha256 !== evidenceArtifactSha256
  || cleanInstall.archive?.unsafeEntries !== 0
  || cleanInstall.archive?.forbiddenEntries !== 0
  || cleanInstall.archive?.manifestMatched !== true
  || cleanInstall.productionInstall?.assistantBridge !== 'passed'
  || cleanInstall.productionInstall?.mcpServer !== 'passed'
  || cleanInstall.mcp?.stdioNegotiation !== 'passed'
  || !nativeLauncherEvidenceIsValid
  || JSON.stringify(cleanInstall.mcp?.readOnlyTools) !== JSON.stringify(expectedMcpTools)) {
  throw new Error('Evidence Actions clean-install evidence is missing, stale, or incomplete.');
}
artifacts.push({
  target:'evidence-actions-clean-install',
  path:path.relative(prodDir, cleanInstallPath).replaceAll('\\', '/'),
  bytes:(await stat(cleanInstallPath)).size,
  sha256:await sha256(cleanInstallPath)
});
const provenance = { product: 'Better CaptionKeep', version: sourceManifest.version, commit, createdAt: new Date().toISOString(), artifacts };
await writeFile(path.join(prodDir, 'release-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(provenance, null, 2));
