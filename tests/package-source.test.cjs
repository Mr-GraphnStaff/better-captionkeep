const test = require('node:test');
const assert = require('node:assert/strict');
const {mkdtemp, mkdir, writeFile, rm} = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('release provenance cannot bind current sources to a stale staged package', async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), 'captionkeep-source-'));
  const staged = await mkdtemp(path.join(os.tmpdir(), 'captionkeep-stage-'));
  try {
    await writeFile(path.join(source, 'manifest.json'), '{"version":"6.0.0"}');
    await writeFile(path.join(staged, 'manifest.json'), '{"version":"6.0.0","name":"Different lane"}');
    await writeFile(path.join(source, 'runtime.js'), 'const revision = "current";');
    await writeFile(path.join(staged, 'runtime.js'), 'const revision = "old";');
    const {verifyPackageSource} = await import('../scripts/verify-package-source.mjs');
    await assert.rejects(verifyPackageSource(source, {directory:staged}), /Package source mismatch: runtime.js/);
    await writeFile(path.join(staged, 'runtime.js'), 'const revision = "current";');
    assert.equal((await verifyPackageSource(source, {directory:staged})).checkedFiles, 1);
  } finally {await rm(source,{recursive:true,force:true}); await rm(staged,{recursive:true,force:true});}
});

test('compressed package verification binds actual ZIP script contents to the current source', async () => {
  const source = await mkdtemp(path.join(os.tmpdir(), 'captionkeep-zip-source-'));
  const output = await mkdtemp(path.join(os.tmpdir(), 'captionkeep-zip-output-'));
  try {
    await mkdir(path.join(source, '_locales/en'), {recursive:true});
    await writeFile(path.join(source, '_locales/en/messages.json'), '{}');
    await writeFile(path.join(source, 'manifest.json'), '{"manifest_version":3,"name":"Synthetic","version":"6.0.0"}');
    await writeFile(path.join(source, 'runtime.js'), 'const revision = "original";');
    const {packageExtension} = await import('../scripts/package-extension.mjs');
    const {verifyPackageSource} = await import('../scripts/verify-package-source.mjs');
    const zipPath = await packageExtension(source, output, 'synthetic');
    assert.equal((await verifyPackageSource(source, {zipPath})).checkedFiles, 2);
    await writeFile(path.join(source, 'runtime.js'), 'const revision = "newer";');
    await assert.rejects(verifyPackageSource(source, {zipPath}), /Package source mismatch: runtime.js/);
  } finally {await rm(source,{recursive:true,force:true}); await rm(output,{recursive:true,force:true});}
});
