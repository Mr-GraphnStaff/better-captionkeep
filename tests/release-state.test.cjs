const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');

test('release paths preserve 6.0 history and reject ambiguous version paths',async()=>{
  const {releaseStatePaths}=await import('../scripts/release-state.mjs');
  assert.equal(releaseStatePaths('6.0.0').record,'docs/release-state/6.0.json');
  assert.equal(releaseStatePaths('6.0.1').record,'docs/release-state/6.0.1.json');
  for(const version of ['../6.0','6.00.1','6.0.1/other','6.0','6.0.65536']) assert.throws(()=>releaseStatePaths(version));
});

test('new releases begin without candidate hashes, approval or passed acceptance',async()=>{
  const {createDevelopmentRelease}=await import('../scripts/release-state.mjs');
  const {validateReleaseStatus,requireFrozenCandidate}=await import('../scripts/release-status.mjs');
  const record=createDevelopmentRelease('6.0.1',{boardEpic:395});
  validateReleaseStatus(record,'6.0.1');
  assert.equal(record.state,'development');assert.equal(record.candidate.frozen,false);
  assert.deepEqual(record.candidate.hashes,{});assert.equal(record.candidate.ownerException,undefined);
  assert.equal(record.candidate.promotion,undefined);
  assert(Object.values(record.releaseGates).every(value=>value===false));
  assert(Object.values(record.liveCertification).every(value=>value==='pending'));
  assert.throws(()=>requireFrozenCandidate(record));
  assert.throws(()=>validateReleaseStatus({...record,state:'candidate'},'6.0.1'),/Frozen candidate/);
  assert.throws(()=>createDevelopmentRelease('6.0.1',{}),/Board epic/);
});

test('the active manifest selects its own record and never falls back to an older approval',async()=>{
  const {readReleaseState,createDevelopmentRelease}=await import('../scripts/release-state.mjs');
  const {verifyStorePromotion}=await import('../scripts/release-status.mjs');
  const record=createDevelopmentRelease('6.0.1',{boardEpic:395});
  const reads=[];
  const read=async filename=>{
    reads.push(filename);
    if(filename.endsWith('manifest.json')) return JSON.stringify({version:'6.0.1'});
    if(filename.endsWith('6.0.1.json')) return JSON.stringify(record);
    throw new Error('No older release approval may be used');
  };
  assert.deepEqual((await readReleaseState('P:/synthetic',{read})).record,record);
  await assert.rejects(verifyStorePromotion({root:'P:/synthetic',read,channel:'chrome',action:'upload-only'}),/frozen candidate/);
  assert(!reads.some(filename=>filename.endsWith('6.0.json')));
  await assert.rejects(readReleaseState('P:/synthetic',{version:'6.0.1',read:async()=>JSON.stringify({...record,version:'6.0.0'})}),/selected identity/);
});

async function fixture(run) {
  const temporaryRoot=await fs.realpath(os.tmpdir());
  const root=await fs.mkdtemp(path.join(temporaryRoot,'captionkeep-next-release-'));
  try {
    const put=async(filename,value)=>{
      const absolute=path.join(root,filename);await fs.mkdir(path.dirname(absolute),{recursive:true});
      await fs.writeFile(absolute,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');
    };
    await put('package.json',{name:'synthetic',version:'6.0.0',ownerChange:'preserved'});
    await put('package-lock.json',{version:'6.0.0',packages:{'':{version:'6.0.0'},'node_modules/example':{version:'6.0.0'}}});
    for(const filename of ['teams-captions-saver/manifest.json','manifests/manifest.chrome-store.json'])
      await put(filename,{version:'6.0.0',optional_permissions:['nativeMessaging'],ownerChange:'preserved'});
    await put('store-metadata/chrome.json',{manifestVersion:'6.0.0',ownerChange:'preserved'});
    await put('docs/release-state/6.0.json','{ "historical":true }\r\n');
    await put('docs/release-state/6.0-owner-exception.md','Historical owner exception\r\n');
    await put('docs/RELEASE-6.0.md','Historical published release\r\n');
    await put('readme.md','Owner administrator block and historical status\n');
    await put('docs/wiki/Release-Status.md','Historical status retained\n');
    await put('CHROMEWEBSTORE.md','Historical Store preparation and approval retained\n');
    await run(root);
  } finally {
    const relative=path.relative(temporaryRoot,await fs.realpath(root));
    assert(relative&&!path.isAbsolute(relative)&&!relative.startsWith('..'));
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('initialization preserves historical bytes and unrelated source while synchronizing only root release versions',async()=>fixture(async root=>{
  const {initializeRelease}=await import('../scripts/release-lifecycle.mjs');
  const {readReleaseState}=await import('../scripts/release-state.mjs');
  const {validateReleaseStatus,reconcileStatusDocument}=await import('../scripts/release-status.mjs');
  const historical=['docs/release-state/6.0.json','docs/release-state/6.0-owner-exception.md','docs/RELEASE-6.0.md'];
  const before=await Promise.all(historical.map(name=>fs.readFile(path.join(root,name))));
  await initializeRelease({root,version:'6.0.1',boardEpic:395,activate:true});
  const {record,routes}=await readReleaseState(root);
  validateReleaseStatus(record,'6.0.1');assert.equal(record.boardEpic,395);
  for(const [index,name] of historical.entries()) assert.deepEqual(await fs.readFile(path.join(root,name)),before[index]);
  for(const filename of routes.documents) reconcileStatusDocument(await fs.readFile(path.join(root,filename),'utf8'),record);
  const read=async filename=>JSON.parse(await fs.readFile(path.join(root,filename),'utf8'));
  assert.equal((await read('package.json')).ownerChange,'preserved');
  assert.equal((await read('package.json')).version,'6.0.1');
  const lock=await read('package-lock.json');
  assert.equal(lock.version,'6.0.1');assert.equal(lock.packages[''].version,'6.0.1');
  assert.equal(lock.packages['node_modules/example'].version,'6.0.0');
  assert.equal((await read('store-metadata/chrome.json')).manifestVersion,'6.0.1');
  assert.equal((await read('teams-captions-saver/manifest.json')).ownerChange,'preserved');
  assert((await fs.readFile(path.join(root,'readme.md'),'utf8')).startsWith('Owner administrator block'));
  const snapshot=await fs.readFile(path.join(root,routes.record));
  await assert.rejects(initializeRelease({root,version:'6.0.1',boardEpic:395,activate:true}),/never overwrites/);
  assert.deepEqual(await fs.readFile(path.join(root,routes.record)),snapshot);
}));

test('activation fails before writes if version-bearing source disagrees',async()=>fixture(async root=>{
  const {initializeRelease}=await import('../scripts/release-lifecycle.mjs');
  await fs.writeFile(path.join(root,'store-metadata/chrome.json'),JSON.stringify({manifestVersion:'different'}));
  await assert.rejects(initializeRelease({root,version:'6.0.1',boardEpic:395,activate:true}),/differs before activation/);
  await assert.rejects(fs.access(path.join(root,'docs/release-state/6.0.1.json')));
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version,'6.0.0');
}));

test('current source and its generated status select the same active release',async()=>{
  const root=path.resolve(__dirname,'..');
  const {readReleaseState}=await import('../scripts/release-state.mjs');
  const {validateReleaseStatus,reconcileStatusDocument}=await import('../scripts/release-status.mjs');
  const {record,routes}=await readReleaseState(root);
  validateReleaseStatus(record,routes.version);
  for(const filename of routes.documents) reconcileStatusDocument(await fs.readFile(path.join(root,filename),'utf8'),record);
});
