import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readEnglishMessages, resolvedManifest } from './manifest-localization.mjs';

const EXPECTED_GRAPH_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'Calendars.ReadBasic',
  'OnlineMeetings.Read',
  'OnlineMeetingTranscript.Read.All',
];

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim().length < 20) {
    throw new Error(`${label} must contain a meaningful Store disclosure`);
  }
}

function requireSameSet(actual, expected, label) {
  const actualSorted = sorted(actual);
  const expectedSorted = sorted(expected);
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(
      `${label} drifted. Manifest: ${JSON.stringify(actualSorted)}; metadata: ${JSON.stringify(expectedSorted)}`,
    );
  }
}

export function validateChromeStoreMetadata(manifest, metadata) {
  if (metadata.manifestVersion !== manifest.version) {
    throw new Error(
      `Chrome Store metadata version ${metadata.manifestVersion || '(missing)'} does not match manifest ${manifest.version}`,
    );
  }

  requireText(metadata.singlePurpose, 'singlePurpose');
  requireText(metadata.hostPermissionJustification, 'hostPermissionJustification');

  const manifestPermissions = manifest.permissions || [];
  const justifiedPermissions = Object.keys(metadata.permissionJustifications || {});
  requireSameSet(manifestPermissions, justifiedPermissions, 'Chrome permission justifications');
  for (const permission of manifestPermissions) {
    requireText(metadata.permissionJustifications[permission], `${permission} justification`);
  }

  requireSameSet(
    manifest.host_permissions || [],
    metadata.hostPermissions || [],
    'Chrome host-permission disclosures',
  );
  requireSameSet(
    manifest.optional_host_permissions || [],
    metadata.optionalHostPermissions || [],
    'Chrome optional host-permission disclosures',
  );

  const declaredHosts = new Set([
    ...(manifest.host_permissions || []),
    ...(manifest.optional_host_permissions || []),
  ]);
  if (declaredHosts.has('https://graph.microsoft.com/*')) {
    const disclosedScopes = Object.keys(metadata.oauthScopeJustifications || {});
    requireSameSet(EXPECTED_GRAPH_SCOPES, disclosedScopes, 'Microsoft delegated-scope disclosures');
    for (const scope of EXPECTED_GRAPH_SCOPES) {
      requireText(metadata.oauthScopeJustifications[scope], `${scope} justification`);
    }
  }
  for (const contentScript of manifest.content_scripts || []) {
    for (const match of contentScript.matches || []) {
      const covered = [...declaredHosts].some(host => {
        const prefix = host.endsWith('*') ? host.slice(0, -1) : host;
        return match.startsWith(prefix) || host.startsWith(match.endsWith('*') ? match.slice(0, -1) : match);
      });
      if (!covered) {
        throw new Error(`Content-script match ${match} is missing from hostPermissions`);
      }
    }
  }

  const providerText = [
    manifest.description || '',
    metadata.singlePurpose,
    metadata.hostPermissionJustification,
  ].join('\n');
  for (const provider of metadata.providers || []) {
    if (!providerText.includes(provider)) {
      throw new Error(`Provider ${provider} is missing from the manifest or Store disclosures`);
    }
  }
  if (!Array.isArray(metadata.providers) || metadata.providers.length === 0) {
    throw new Error('Chrome Store metadata must declare at least one supported provider');
  }

  if (metadata.usesRemoteCode !== false) {
    throw new Error('Chrome Store metadata must explicitly record usesRemoteCode as false');
  }
  if (!/^https:\/\//.test(metadata.privacyPolicyUrl || '')) {
    throw new Error('Chrome Store metadata must include an HTTPS privacyPolicyUrl');
  }

  return {
    version: manifest.version,
    permissions: manifestPermissions.length,
    hostPermissions: (manifest.host_permissions || []).length,
    optionalHostPermissions: (manifest.optional_host_permissions || []).length,
    providers: metadata.providers.length,
  };
}

export function validateChromeWebStoreDossier(manifest, metadata, dossier) {
  requireText(dossier, 'CHROMEWEBSTORE.md');
  const requiredValues = [
    manifest.name,
    manifest.version,
    manifest.description,
    metadata.singlePurpose,
    metadata.privacyPolicyUrl,
    ...(manifest.permissions || []).map(permission => `\`${permission}\``),
    ...(manifest.host_permissions || []).map(host => `\`${host}\``),
    ...(manifest.optional_host_permissions || []).map(host => `\`${host}\``),
    ...Object.keys(metadata.oauthScopeJustifications || {}).map(scope => `\`${scope}\``),
  ];
  for (const value of requiredValues) {
    if (!dossier.includes(value)) {
      throw new Error(`CHROMEWEBSTORE.md is missing current Store value: ${value}`);
    }
  }
  for (const asset of [
    'teams-captions-saver/icons/scribble-128.png',
    'store-assets/5.4/01-three-meeting-platforms.png',
    'store-assets/5.4/02-explicit-meeting-controls.png',
    'store-assets/5.4/03-on-the-fly-research.png',
    'store-assets/5.4/04-cited-live-chat-reply.png',
    'store-assets/5.4/05-enterprise-controls.png',
    'store-assets/5.4/small-promotional-tile.png',
    'store-assets/5.4/large-promotional-tile.png',
  ]) {
    if (!dossier.includes(asset)) throw new Error(`CHROMEWEBSTORE.md is missing Store asset: ${asset}`);
  }
  if (!dossier.includes('GitHub release retained for audit, but withdrawn from Store promotion after post-release defects; replacement not yet approved')) {
    throw new Error('CHROMEWEBSTORE.md must preserve the 5.3 Store-submission boundary');
  }
  return {version:manifest.version, synchronized:true};
}

export async function main() {
  const rawManifest = JSON.parse(await readFile(new URL('../manifests/manifest.chrome-store.json', import.meta.url)));
  const extensionRoot = new URL('../teams-captions-saver/', import.meta.url);
  const manifest = resolvedManifest(rawManifest, await readEnglishMessages(extensionRoot));
  const metadata = JSON.parse(await readFile(new URL('../store-metadata/chrome.json', import.meta.url)));
  const dossier = await readFile(new URL('../CHROMEWEBSTORE.md', import.meta.url), 'utf8');
  const result = validateChromeStoreMetadata(manifest, metadata);
  validateChromeWebStoreDossier(manifest, metadata, dossier);
  console.log(
    `Chrome Store metadata matches ${result.version}: ${result.permissions} permissions, ` +
    `${result.hostPermissions} hosts, ${result.providers} providers; publication dossier synchronized.`,
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
