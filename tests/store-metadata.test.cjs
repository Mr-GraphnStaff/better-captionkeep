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
    optionalPermissions: 0,
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

test('Chrome Store metadata requires exact optional-permission justification coverage', async () => {
  const {validateChromeStoreMetadata} = await import('../scripts/check-store-metadata.mjs');
  const {manifest,metadata} = fixture();
  manifest.optional_permissions = ['nativeMessaging'];
  assert.throws(() => validateChromeStoreMetadata(manifest,metadata),/optional permission justifications drifted/i);
  metadata.optionalPermissionJustifications = {nativeMessaging:'Required'};
  assert.throws(() => validateChromeStoreMetadata(manifest,metadata),/nativeMessaging optional justification must contain a meaningful/);
  metadata.optionalPermissionJustifications.nativeMessaging = 'Explicit Connect grants access to a separately installed user-owned helper; local capture does not require it.';
  assert.equal(validateChromeStoreMetadata(manifest,metadata).optionalPermissions,1);
  metadata.optionalPermissionJustifications.debugger = 'This undeclared optional permission must not be accepted by the gate.';
  assert.throws(() => validateChromeStoreMetadata(manifest,metadata),/optional permission justifications drifted/i);
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
  const { resolvedManifest } = await import('../scripts/manifest-localization.mjs');
  const rawManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifests', 'manifest.chrome-store.json')));
  const englishMessages = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'teams-captions-saver', '_locales', 'en', 'messages.json')));
  const manifest = resolvedManifest(rawManifest, englishMessages);
  const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'store-metadata', 'chrome.json')));
  const dossier = fs.readFileSync(path.join(__dirname, '..', 'CHROMEWEBSTORE.md'), 'utf8');
  assert.deepEqual(validateChromeWebStoreDossier(manifest, metadata, dossier), {
    version:'6.0.0', synchronized:true
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
  assert.throws(
    () => validateChromeWebStoreDossier(manifest, metadata, dossier.replaceAll('`nativeMessaging`', '`removed-native-messaging`')),
    /missing current Store value: `nativeMessaging`/
  );
});

test('retained 5.4 Store artwork has the exact Chrome listing dimensions', () => {
  for (const screenshot of [
    '01-three-meeting-platforms.png',
    '02-explicit-meeting-controls.png',
    '03-on-the-fly-research.png',
    '04-reviewed-ai-handoff.png',
    '05-enterprise-controls.png',
  ]) {
    assert.deepEqual(pngDimensions(`store-assets/5.4/${screenshot}`), [1280, 800]);
  }
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'store-assets/5.4/04-cited-live-chat-reply.png')), false);
  assert.deepEqual(pngDimensions('store-assets/5.4/small-promotional-tile.png'), [440, 280]);
  assert.deepEqual(pngDimensions('store-assets/5.4/large-promotional-tile.png'), [1400, 560]);
});

test('6.0 Store artwork has exact listing dimensions and pending owner approval', () => {
  for (const screenshot of [
    '01-one-button-meeting.png',
    '02-rolling-live-notes.png',
    '03-capture-moment.png',
    '04-meeting-receipt.png',
    '05-advanced-settings.png',
  ]) {
    assert.deepEqual(pngDimensions(`store-assets/6.0/${screenshot}`), [1280, 800]);
  }
  assert.deepEqual(pngDimensions('store-assets/6.0/small-promotional-tile.png'), [440, 280]);
  assert.deepEqual(pngDimensions('store-assets/6.0/marquee-promotional-tile.png'), [1400, 560]);
  const assetManifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'store-assets/6.0/manifest.json'), 'utf8'));
  assert.equal(assetManifest.version, '6.0.0');
  assert.equal(assetManifest.approval, 'pending release-owner review');
  assert.equal(assetManifest.artifacts.length, 7);
});
