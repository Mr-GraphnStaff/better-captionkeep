import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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

  const declaredHosts = new Set(manifest.host_permissions || []);
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
    providers: metadata.providers.length,
  };
}

export async function main() {
  const manifest = JSON.parse(await readFile(new URL('../manifests/manifest.chrome-store.json', import.meta.url)));
  const metadata = JSON.parse(await readFile(new URL('../store-metadata/chrome.json', import.meta.url)));
  const result = validateChromeStoreMetadata(manifest, metadata);
  console.log(
    `Chrome Store metadata matches ${result.version}: ${result.permissions} permissions, ` +
    `${result.hostPermissions} hosts, ${result.providers} providers.`,
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
