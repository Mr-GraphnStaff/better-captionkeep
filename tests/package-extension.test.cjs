const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

async function createSource(root) {
  const source = path.join(root, 'source');
  await mkdir(path.join(source, '_locales', 'en'), { recursive: true });
  await writeFile(path.join(source, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: '__MSG_extensionName__',
    version: '1.0.0',
    default_locale: 'en',
  }));
  await writeFile(path.join(source, '_locales', 'en', 'messages.json'), JSON.stringify({
    extensionName: { message: 'Package Test' },
  }));
  await writeFile(path.join(source, 'service_worker.js'), '');
  return source;
}

test('package builder permits Chromium _locales and rejects Store-reserved _metadata', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'captionkeep-package-'));
  try {
    const source = await createSource(root);
    const destination = path.join(root, 'dist');
    const { packageExtension } = await import('../scripts/package-extension.mjs');

    const artifact = await packageExtension(source, destination);
    assert.equal(path.basename(artifact), 'package_test-1.0.0.zip');
    assert((await readFile(artifact)).length > 0);

    await mkdir(path.join(source, '_metadata'));
    await writeFile(path.join(source, '_metadata', 'verified_contents.json'), '{}');
    await assert.rejects(
      packageExtension(source, destination),
      /reserved path: _metadata/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
