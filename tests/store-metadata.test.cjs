const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

function pngDimensions(relativePath) {
  const data = fs.readFileSync(path.join(__dirname, '..', relativePath));
  assert.equal(data.subarray(1, 4).toString(), 'PNG');
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

function fixture() {
  return {
    manifest: {
      version: '5.2.0',
      description: 'Microsoft Teams, Google Meet, and Zoom Web captions.',
      permissions: ['downloads', 'storage', 'sidePanel'],
      host_permissions: ['https://meet.google.com/*'],
      optional_host_permissions: [],
      content_scripts: [{ matches: ['https://meet.google.com/*'] }],
    },
    metadata: {
      manifestVersion: '5.2.0',
      singlePurpose: 'Capture Microsoft Teams, Google Meet, and Zoom Web captions locally.',
      providers: ['Microsoft Teams', 'Google Meet', 'Zoom Web'],
      permissionJustifications: {
        downloads: 'Save user-requested transcript exports to the browser Downloads folder.',
        storage: 'Store local preferences, recovery checkpoints, and transcript history.',
        sidePanel: 'Display the local live transcript beside the supported meeting page.',
      },
      hostPermissions: ['https://meet.google.com/*'],
      optionalHostPermissions: [],
      hostPermissionJustification: 'Read Microsoft Teams, Google Meet, and Zoom Web captions on declared meeting pages only.',
      usesRemoteCode: false,
      privacyPolicyUrl: 'https://example.test/privacy',
    },
  };
}

test('Chrome Store metadata contract accepts synchronized disclosures', async () => {
  const { validateChromeStoreMetadata } = await import('../scripts/check-store-metadata.mjs');
  const { manifest, metadata } = fixture();
  assert.deepEqual(validateChromeStoreMetadata(manifest, metadata), {
    version: '5.2.0',
    permissions: 3,
    hostPermissions: 1,
    optionalHostPermissions: 0,
    providers: 3,
  });
});

test('Chrome Store metadata contract rejects a permission without a justification', async () => {
  const { validateChromeStoreMetadata } = await import('../scripts/check-store-metadata.mjs');
  const { manifest, metadata } = fixture();
  delete metadata.permissionJustifications.sidePanel;
  assert.throws(
    () => validateChromeStoreMetadata(manifest, metadata),
    /permission justifications drifted/i,
  );
});

test('Chrome Store metadata contract rejects host and version drift', async () => {
  const { validateChromeStoreMetadata } = await import('../scripts/check-store-metadata.mjs');
  const first = fixture();
  first.metadata.manifestVersion = '5.1.0';
  assert.throws(() => validateChromeStoreMetadata(first.manifest, first.metadata), /does not match manifest/);

  const second = fixture();
  second.manifest.host_permissions.push('https://app.zoom.us/*');
  assert.throws(() => validateChromeStoreMetadata(second.manifest, second.metadata), /host-permission disclosures drifted/i);
});

test('Chrome Store metadata contract requires every Microsoft delegated scope', async () => {
  const { validateChromeStoreMetadata } = await import('../scripts/check-store-metadata.mjs');
  const { manifest, metadata } = fixture();
  manifest.optional_host_permissions.push('https://graph.microsoft.com/*');
  metadata.optionalHostPermissions.push('https://graph.microsoft.com/*');
  assert.throws(
    () => validateChromeStoreMetadata(manifest, metadata),
    /delegated-scope disclosures drifted/i,
  );
});

test('Chrome Store publication dossier stays synchronized with manifest and disclosure metadata', async () => {
  const { validateChromeWebStoreDossier } = await import('../scripts/check-store-metadata.mjs');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifests', 'manifest.chrome-store.json')));
  const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'store-metadata', 'chrome.json')));
  const dossier = fs.readFileSync(path.join(__dirname, '..', 'CHROMEWEBSTORE.md'), 'utf8');
  assert.deepEqual(validateChromeWebStoreDossier(manifest, metadata, dossier), {
    version:'5.4.0', synchronized:true
  });
  assert.throws(
    () => validateChromeWebStoreDossier(manifest, metadata, dossier.replace(
      'GitHub release retained for audit, but withdrawn from Store promotion after post-release defects; replacement not yet approved',
      'Published'
    )),
    /Store-submission boundary/
  );
  assert.throws(
    () => validateChromeWebStoreDossier(manifest, metadata, dossier.replace('`identity`', '`removed-identity`')),
    /missing current Store value: `identity`/
  );
});

test('5.3 Store artwork has the exact Chrome listing dimensions', () => {
  for (const screenshot of [
    '01-verified-teams-transcript.png',
    '02-local-evidence-board.png',
    '03-private-review-and-export.png',
    '04-three-meeting-platforms.png',
    '05-enterprise-controls.png',
  ]) {
    assert.deepEqual(pngDimensions(`store-assets/5.3/${screenshot}`), [1280, 800]);
  }
  assert.deepEqual(pngDimensions('store-assets/5.3/small-promotional-tile.png'), [440, 280]);
  assert.deepEqual(pngDimensions('store-assets/5.3/large-promotional-tile.png'), [1400, 560]);
});
