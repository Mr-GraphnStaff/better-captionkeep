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

test('Chrome actions map staged and immediate publishing explicitly', async () => {
  const { publishTypeForAction } = await import('../scripts/chrome-publish.mjs');
  assert.equal(publishTypeForAction('submit-auto'), 'DEFAULT_PUBLISH');
  assert.equal(publishTypeForAction('submit-staged'), 'STAGED_PUBLISH');
  assert.equal(publishTypeForAction('publish-staged'), 'STAGED_PUBLISH');
  assert.equal(publishTypeForAction('upload-only'), null);
});

test('Chrome status summary separates published and submitted revisions', async () => {
  const { summarizeChromeStatus } = await import('../scripts/chrome-publish.mjs');
  assert.deepEqual(summarizeChromeStatus({
    itemId: 'nabjdlnkkaonnbnimnmnhjcbigceebml',
    publishedItemRevisionStatus: {
      state: 'PUBLISHED',
      distributionChannels: [{ crxVersion: '5.0.0' }],
    },
    submittedItemRevisionStatus: {
      state: 'PENDING_REVIEW',
      distributionChannels: [{ crxVersion: '5.1.0' }],
    },
    lastAsyncUploadState: 'SUCCEEDED',
  }), {
    itemId: 'nabjdlnkkaonnbnimnmnhjcbigceebml',
    publishedState: 'PUBLISHED',
    publishedVersion: '5.0.0',
    submittedState: 'PENDING_REVIEW',
    submittedVersion: '5.1.0',
    uploadState: 'SUCCEEDED',
    takenDown: false,
    warned: false,
  });
});

test('Chrome preflight proves credentials and item identity without uploading', async () => {
  const { main } = await import('../scripts/chrome-publish.mjs');
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method || 'GET' });
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'access-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      itemId: 'nabjdlnkkaonnbnimnmnhjcbigceebml',
      publishedItemRevisionStatus: {
        state: 'PUBLISHED',
        distributionChannels: [{ crxVersion: '5.1.0' }],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await main({
    env: {
      CHROME_ACTION: 'preflight',
      CHROME_CLIENT_ID: 'client-id',
      CHROME_CLIENT_SECRET: 'client-secret',
      CHROME_REFRESH_TOKEN: 'refresh-token',
      CHROME_PUBLISHER_ID: 'publisher-id',
      CHROME_EXTENSION_ID: 'nabjdlnkkaonnbnimnmnhjcbigceebml',
    },
    fetchImpl,
  });

  assert.deepEqual(requests, [
    { url: 'https://oauth2.googleapis.com/token', method: 'POST' },
    {
      url: 'https://chromewebstore.googleapis.com/v2/publishers/publisher-id/items/nabjdlnkkaonnbnimnmnhjcbigceebml:fetchStatus',
      method: 'GET',
    },
  ]);
});
