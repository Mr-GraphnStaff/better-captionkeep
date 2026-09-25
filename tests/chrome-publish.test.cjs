const test = require('node:test');
const assert = require('node:assert/strict');

test('Chrome Store package name follows the reviewed release version', async () => {
  const { packageNameForVersion } = await import('../scripts/chrome-publish.mjs');
  assert.equal(packageNameForVersion('5.1.0'), 'better_captionkeep-chrome-5.1.0.zip');
  assert.throws(() => packageNameForVersion('../5.1.0'), /Invalid extension version/);
});

test('Chrome upload states accept documented and legacy-prefixed forms', async () => {
  const { normalizeUploadState } = await import('../scripts/chrome-publish.mjs');
  assert.equal(normalizeUploadState('SUCCEEDED'), 'SUCCEEDED');
  assert.equal(normalizeUploadState('UPLOAD_IN_PROGRESS'), 'IN_PROGRESS');
  assert.equal(normalizeUploadState(), '');
});

test('Chrome resource name validates the extension identity', async () => {
  const { itemResourceName } = await import('../scripts/chrome-publish.mjs');
  assert.equal(
    itemResourceName('publisher-123', 'nabjdlnkkaonnbnimnmnhjcbigceebml'),
    'publishers/publisher-123/items/nabjdlnkkaonnbnimnmnhjcbigceebml',
  );
  assert.throws(() => itemResourceName('', 'nabjdlnkkaonnbnimnmnhjcbigceebml'), /CHROME_PUBLISHER_ID/);
  assert.throws(() => itemResourceName('publisher-123', 'not-an-extension-id'), /CHROME_EXTENSION_ID/);
});
