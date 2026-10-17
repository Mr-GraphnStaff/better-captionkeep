const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdtemp,writeFile,readFile,rm}=require('node:fs/promises');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const os=require('node:os');

test('6.0 rejects deferred modules, native access, routes and dangling imports',async()=>{
  const {assertShippingEntries}=await import('../scripts/shipping-boundary.mjs');
  for(const [name,text] of [
    ['byomcpSetup.js',''],['byomcp-settings.css',''],['evidenceActionJobs.js',''],['evidenceActionContracts.js',''],
    ['better-captionkeep-byomcp-helper-6.0.0.zip',''],['byomcp-helper-hashes.json','{}'],
    ['manifest.json','{"optional_permissions":["nativeMessaging"]}'],
    ['worker.js','chrome.runtime.connectNative("host")'],['worker.js','browser.runtime.sendNativeMessage("host",{})'],
    ['worker.js','const route="byomcp_settings"'],['popup.html','<script src="byomcpSetup.js"></script>'],
    ['service_worker.js',"importScripts('absent.js');"],['popup.html','<link href="missing.css">']
  ]) assert.throws(()=>assertShippingEntries(new Map([[name,Buffer.from(text)]])),/forbidden|missing/);
  assert.doesNotThrow(()=>assertShippingEntries(new Map([['derivedArtifacts.js',Buffer.from('const historicalReceipt="action-result";')]])));
});

test('parity permits retained research source only when omitted and rejects extra staged files',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'captionkeep-boundary-'));
  try {
    const {mkdir}=require('node:fs/promises');
    const source=path.join(root,'source'),staged=path.join(root,'staged');await mkdir(source);await mkdir(staged);
    await writeFile(path.join(source,'core.js'),'const core=true;');await writeFile(path.join(staged,'core.js'),'const core=true;');
    await writeFile(path.join(source,'byomcpSetup.js'),'preserved future work');
    const {verifyPackageSource}=await import('../scripts/verify-package-source.mjs');
    await verifyPackageSource(source,{directory:staged,allowedDifferences:[]});
    await writeFile(path.join(staged,'byomcpSetup.js'),'preserved future work');
    await assert.rejects(verifyPackageSource(source,{directory:staged}),/Deferred MCP payload/);
    await rm(path.join(staged,'byomcpSetup.js'));await writeFile(path.join(staged,'stale.js'),'stale');
    await assert.rejects(verifyPackageSource(source,{directory:staged}),/Unexpected package source/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('all normal 6.0 targets and their ZIPs omit deferred implementation',async()=>{
  const dist=await mkdtemp(path.join(os.tmpdir(),'captionkeep-shipping-targets-'));
  const root=path.resolve(__dirname,'..');
  try {
    const {assertShippingDirectory,excludedShippingPath}=await import('../scripts/shipping-boundary.mjs');
    const {packageExtension}=await import('../scripts/package-extension.mjs');
    const {verifyPackageSource,zipEntries}=await import('../scripts/verify-package-source.mjs');
    for(const target of ['dev','uat','prod','chrome-store','edge-store','chrome','edge','brave','opera','firefox']) {
      execFileSync(process.execPath,['scripts/build-browser-targets.mjs',target],{cwd:root,env:{...process.env,CAPTIONKEEP_TEST_DIST:dist},stdio:'pipe'});
      const directory=['dev','uat','prod'].includes(target)?path.join(dist,target):path.join(dist,'prod',`${target}-unpacked`);
      await assertShippingDirectory(directory);
      const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json')));
      assert(!(manifest.permissions||[]).includes('nativeMessaging'));assert(!(manifest.optional_permissions||[]).includes('nativeMessaging'));
      const zip=await packageExtension(directory,path.join(dist,'zips'),target);
      const browserTarget=['chrome','edge','brave','opera','firefox'].includes(target)?target:target==='edge-store'?'edge':undefined;
      await verifyPackageSource(path.join(root,'teams-captions-saver'),{zipPath:zip,browserTarget});
      assert(![...zipEntries(await readFile(zip)).keys()].some(excludedShippingPath));
    }
  } finally {await rm(dist,{recursive:true,force:true});}
});
