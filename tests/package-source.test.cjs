const test = require('node:test');
const assert = require('node:assert/strict');
const {mkdtemp, mkdir, writeFile, readFile, rm} = require('node:fs/promises');
const {execFileSync} = require('node:child_process');
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

test('browser-specific runtime identity is verified exactly rather than excluded from source parity', async () => {
  const source = await mkdtemp(path.join(os.tmpdir(),'captionkeep-browser-source-'));
  const staged = await mkdtemp(path.join(os.tmpdir(),'captionkeep-browser-stage-'));
  try {
    const {verifyPackageSource} = await import('../scripts/verify-package-source.mjs');
    await writeFile(path.join(source,'browserRuntimeConfig.js'), 'source Chrome default');
    await writeFile(path.join(staged,'browserRuntimeConfig.js'), 'globalThis.CaptionKeepBrowserRuntime = Object.freeze({"target":"edge"});\n');
    assert.equal((await verifyPackageSource(source,{directory:staged,browserTarget:'edge',allowedDifferences:[]})).checkedFiles,1);
    await assert.rejects(verifyPackageSource(source,{directory:staged,browserTarget:'brave'}), /source mismatch/);
    await writeFile(path.join(staged,'browserRuntimeConfig.js'), 'globalThis.CaptionKeepBrowserRuntime = {target:"edge",malicious:true};');
    await assert.rejects(verifyPackageSource(source,{directory:staged,browserTarget:'edge'}), /source mismatch/);
  } finally {await rm(source,{recursive:true,force:true});await rm(staged,{recursive:true,force:true});}
});

test('actual Edge Store staging preserves Store manifest and packages exact Edge native-host identity',async()=>{
  const dist=await mkdtemp(path.join(os.tmpdir(),'captionkeep-edge-store-'));
  const root=path.resolve(__dirname,'..'),source=path.join(root,'teams-captions-saver');
  try {
    execFileSync(process.execPath,[path.join(root,'scripts/build-browser-targets.mjs'),'edge-store'],
      {cwd:root,env:{...process.env,CAPTIONKEEP_TEST_DIST:dist},stdio:'pipe'});
    const staged=path.join(dist,'prod/edge-store-unpacked'),output=path.join(dist,'packages');
    const {packageExtension}=await import('../scripts/package-extension.mjs');
    const {verifyPackageSource,zipEntries}=await import('../scripts/verify-package-source.mjs');
    const expectedManifest=path.join(source,'manifest.json');
    const zipPath=await packageExtension(staged,output,'better_captionkeep','edge');
    const checked=await verifyPackageSource(source,{zipPath,browserTarget:'edge',expectedManifest});
    assert(checked.checkedFiles>100);
    const entries=zipEntries(await readFile(zipPath));
    assert.equal(entries.get('browserRuntimeConfig.js').toString(), 'globalThis.CaptionKeepBrowserRuntime = Object.freeze({"target":"edge"});\n');
    assert.deepEqual(JSON.parse(entries.get('manifest.json')),JSON.parse(await readFile(expectedManifest,'utf8')));
    await assert.rejects(verifyPackageSource(source,{zipPath,browserTarget:'brave',expectedManifest}),/source mismatch/);
    await assert.rejects(packageExtension(source,output,'wrong_identity','edge'),/runtime identity mismatch/);
    const otherManifest=path.join(dist,'wrong-manifest.json');
    await writeFile(otherManifest,JSON.stringify({...JSON.parse(await readFile(expectedManifest,'utf8')),name:'Wrong Store identity'}));
    await assert.rejects(verifyPackageSource(source,{zipPath,browserTarget:'edge',expectedManifest:otherManifest}),/manifest identity mismatch/);
  } finally {await rm(dist,{recursive:true,force:true});}
});
