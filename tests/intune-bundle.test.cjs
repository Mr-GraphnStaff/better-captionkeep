const assert = require('node:assert/strict');
const test = require('node:test');

test('Intune bundle validates Edge IDs and managed policy against the extension schema', async () => {
  const { validateExtensionId, validateManagedPolicy } = await import('../scripts/build-intune-bundle.mjs');
  assert.equal(validateExtensionId('edefcbdhahfolgkoamkbknjppojpaffk'), 'edefcbdhahfolgkoamkbknjppojpaffk');
  assert.throws(() => validateExtensionId('not-an-extension-id'), /32 lowercase letters/);
  const schema = { properties: { forcePrivacyScrubber: { type: 'boolean' }, allowedAiProviders: { type: 'array', items: { type: 'string' } } } };
  assert.deepEqual(validateManagedPolicy({ forcePrivacyScrubber: true, allowedAiProviders: ['copilot'] }, schema), { forcePrivacyScrubber: true, allowedAiProviders: ['copilot'] });
  assert.throws(() => validateManagedPolicy({ forcePrivacyScrubber: 'yes' }, schema), /must be a boolean/);
  assert.throws(() => validateManagedPolicy({ unrelatedSetting: true }, schema), /Unknown managed policy/);
});
