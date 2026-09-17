const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
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

test('Chrome Intune bundle uses the Chrome store and Chrome managed-policy path', async () => {
  const { buildIntuneBundle, CHROME_STORE_UPDATE_URL } = await import('../scripts/build-intune-bundle.mjs');
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'captionkeep-chrome-intune-'));
  try {
    const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
    await buildIntuneBundle({
      browser: 'chrome',
      extensionId,
      profilePath: path.join(__dirname, '..', 'deployment', 'intune', 'profile.chrome.json'),
      outputDir
    });
    const settings = JSON.parse(fs.readFileSync(path.join(outputDir, 'chrome-extension-settings.json'), 'utf8'));
    assert.equal(settings[extensionId].update_url, CHROME_STORE_UPDATE_URL);
    assert.equal(settings[extensionId].installation_mode, 'force_installed');
    const remediation = fs.readFileSync(path.join(outputDir, 'remediate-managed-policy.ps1'), 'utf8');
    assert.match(remediation, /Policies\\Google\\Chrome\\3rdparty\\extensions/);
    assert.doesNotMatch(remediation, /Policies\\Microsoft\\Edge/);
    assert.match(remediation, /Remove-Item -LiteralPath \$policyPath -Recurse -Force/);
    assert.ok(remediation.indexOf('Remove-Item -LiteralPath $policyPath') < remediation.indexOf('New-Item -Path $policyPath'));
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
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
