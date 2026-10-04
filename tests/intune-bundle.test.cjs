const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('Intune bundle validates Edge IDs and managed policy against the extension schema', async () => {
  const { validateExtensionId, validateManagedPolicy } = await import('../scripts/build-intune-bundle.mjs');
  assert.equal(validateExtensionId('edefcbdhahfolgkoamkbknjppojpaffk'), 'edefcbdhahfolgkoamkbknjppojpaffk');
  assert.throws(() => validateExtensionId('not-an-extension-id'), /32 lowercase letters/);
  const schema = { properties: { forcePrivacyScrubber: { type: 'boolean' }, allowedAiProviders: { type: 'array', items: { type: 'string' } }, sessionRetentionDays: {type:'integer', minimum:1, maximum:365} } };
  assert.deepEqual(validateManagedPolicy({ forcePrivacyScrubber: true, allowedAiProviders: ['copilot'], sessionRetentionDays:30 }, schema), { forcePrivacyScrubber: true, allowedAiProviders: ['copilot'], sessionRetentionDays:30 });
  assert.throws(() => validateManagedPolicy({ forcePrivacyScrubber: 'yes' }, schema), /must be a boolean/);
  assert.throws(() => validateManagedPolicy({ sessionRetentionDays: 0 }, schema), /integer between 1 and 365/);
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
  assert.equal(localOnly.managedPolicy.forceScrubbedExport, true);
  assert.equal(localOnly.managedPolicy.disableClipboard, true);
  assert.equal(localOnly.managedPolicy.disableEvidenceEmail, true);
  assert.equal(localOnly.managedPolicy.disableAttendeeCapture, true);
  assert.equal(localOnly.managedPolicy.maxStoredSessions, 5);
  assert.equal(localOnly.managedPolicy.sessionRetentionDays, 30);
});

test('Intune bundle supports an explicitly reviewed minimum extension version', async () => {
  const { buildIntuneBundle } = await import('../scripts/build-intune-bundle.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'captionkeep-min-version-'));
  try {
    const source = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'deployment', 'intune', 'profile.json'), 'utf8'));
    source.minimumVersionRequired = '5.1.1';
    const profilePath = path.join(root, 'profile.json');
    const outputDir = path.join(root, 'output');
    fs.writeFileSync(profilePath, JSON.stringify(source));
    await buildIntuneBundle({profilePath, outputDir});
    const settings = JSON.parse(fs.readFileSync(path.join(outputDir, 'edge-extension-settings.json'), 'utf8'));
    assert.equal(settings[source.extensionId].minimum_version_required, '5.1.1');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
