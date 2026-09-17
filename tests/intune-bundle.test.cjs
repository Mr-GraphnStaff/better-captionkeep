const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('Intune bundle validates Edge IDs and managed policy against the extension schema', async () => {
  const { validateExtensionId, validateManagedPolicy } = await import('../scripts/build-intune-bundle.mjs');
  assert.equal(validateExtensionId('edefcbdhahfolgkoamkbknjppojpaffk'), 'edefcbdhahfolgkoamkbknjppojpaffk');
  assert.throws(() => validateExtensionId('not-an-extension-id'), /32 lowercase letters/);
  const schema = { properties: { forcePrivacyScrubber: { type: 'boolean' }, allowedAiProviders: { type: 'array', items: { type: 'string' } } } };
  assert.deepEqual(validateManagedPolicy({ forcePrivacyScrubber: true, allowedAiProviders: ['copilot'] }, schema), { forcePrivacyScrubber: true, allowedAiProviders: ['copilot'] });
  assert.throws(() => validateManagedPolicy({ forcePrivacyScrubber: 'yes' }, schema), /must be a boolean/);
  assert.throws(() => validateManagedPolicy({ unrelatedSetting: true }, schema), /Unknown managed policy/);
});

test('standard deployment preserves AI choice while local-only is explicit', () => {
  const deploymentRoot = path.join(__dirname, '..', 'deployment', 'intune');
  const standard = JSON.parse(fs.readFileSync(path.join(deploymentRoot, 'profile.json'), 'utf8'));
  const localOnly = JSON.parse(fs.readFileSync(path.join(deploymentRoot, 'profile.local-only.json'), 'utf8'));
  assert.equal(standard.managedPolicy.disableAiHandoff, false);
  assert.equal(localOnly.managedPolicy.disableAiHandoff, true);
  assert.equal(standard.managedPolicy.forcePrivacyScrubber, true);
  assert.equal(localOnly.managedPolicy.forcePrivacyScrubber, true);
});
