const assert = require('node:assert/strict');
const test = require('node:test');

test('operationIdFromLocation accepts an operation ID or URL', async () => {
  const { operationIdFromLocation } = await import('../scripts/edge-publish.mjs');
  assert.equal(operationIdFromLocation('abc-123'), 'abc-123');
  assert.equal(operationIdFromLocation('https://example.test/operations/abc-123/'), 'abc-123');
});

test('operationIdFromLocation rejects a missing location', async () => {
  const { operationIdFromLocation } = await import('../scripts/edge-publish.mjs');
  assert.throws(() => operationIdFromLocation(''), /Location operation ID/);
});

test('packageNameForVersion validates the extension version', async () => {
  const { packageNameForVersion } = await import('../scripts/edge-publish.mjs');
  assert.equal(packageNameForVersion('5.0.1'), 'better_captionkeep-5.0.1.zip');
  assert.equal(packageNameForVersion('5.0.1.2'), 'better_captionkeep-5.0.1.2.zip');
  assert.throws(() => packageNameForVersion('v5.0.1'), /Invalid extension version/);
});
