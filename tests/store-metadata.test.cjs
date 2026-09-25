const assert = require('node:assert/strict');
const test = require('node:test');

function fixture() {
  return {
    manifest: {
      version: '5.2.0',
      description: 'Microsoft Teams, Google Meet, and Zoom Web captions.',
      permissions: ['downloads', 'storage', 'sidePanel'],
      host_permissions: ['https://meet.google.com/*'],
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
