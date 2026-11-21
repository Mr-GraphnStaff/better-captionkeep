const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');

test('development cleanup resets Dev and QA while preserving the released Production tree', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'captionkeep-layout-'));
  try {
    for (const name of ['Dev','QA','Production']) await fs.mkdir(path.join(root,name));
    await fs.writeFile(path.join(root,'Production','released.zip'),'frozen release bytes');
    await fs.writeFile(path.join(root,'Dev','old.js'),'old development');
    await fs.writeFile(path.join(root,'QA','old.js'),'old QA');
    execFileSync(process.execPath,[path.resolve(__dirname,'../scripts/clean-dist.mjs')],{env:{...process.env,CAPTIONKEEP_TEST_DIST:root},stdio:'pipe'});
    assert.equal(await fs.readFile(path.join(root,'Production','released.zip'),'utf8'),'frozen release bytes');
    assert.deepEqual(await fs.readdir(path.join(root,'Dev')),[]);
    assert.deepEqual(await fs.readdir(path.join(root,'QA')),[]);
    assert.deepEqual((await fs.readdir(root)).sort(),['Dev','Production','QA']);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));
    await fs.rm(root,{recursive:true,force:true});
  }
});

async function withLaneFixture(run) {
  const temporaryRoot=await fs.realpath(os.tmpdir());
  const root=await fs.mkdtemp(path.join(temporaryRoot,'captionkeep-protected-lanes-'));
  try {
    for(const name of ['Dev','QA','Production']) await fs.mkdir(path.join(root,name));
    await run(root);
  } finally {
    const actual=await fs.realpath(root),relative=path.relative(temporaryRoot,actual);
    assert(relative&&!path.isAbsolute(relative)&&!relative.startsWith('..'));
    await fs.rm(actual,{recursive:true,force:true});
  }
}

function invokeBuild(root,script,...args) {
  const result=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts',script),...args],
    {env:{...process.env,CAPTIONKEEP_TEST_DIST:root},encoding:'utf8',windowsHide:true});
  assert.equal(result.error,undefined);
  return result;
}

async function inventory(root) {
  const entries={};
  async function collect(directory) {
    for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
      const full=path.join(directory,entry.name);
      if(entry.isDirectory()) await collect(full);
      else if(entry.isFile()) entries[path.relative(root,full)]=createHash('sha256').update(await fs.readFile(full)).digest('hex');
      else throw new Error('Unexpected fixture entry');
    }
  }
  await collect(root);return entries;
}

test('extension staging refuses mixed administrator packages and recovery state without changing any bytes',async()=>withLaneFixture(async root=>{
  const files={
    'Dev/administrator-setup/BetterCaptionKeep.AdminSetup.exe':'synthetic installed administrator executable',
    'Dev/administrator-setup/operations/synthetic/receipt.json':'synthetic recovery receipt',
    'Dev/admin-browser-integration/synthetic/registry-before.json':'synthetic registry recovery before-image',
    'Dev/administrator-setup.zip':'preserved administrator archive',
    'Dev/old.js':'ordinary extension output',
    'QA/graphRuntimeConfig.js':'synthetic private QA Graph overlay',
    'Production/released.zip':'retained published package'
  };
  for(const [name,content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),content);
  }
  const before=await inventory(root);
  for(const command of [['build-browser-targets.mjs','dev'],['clean-dist.mjs']]) {
    const result=invokeBuild(root,...command);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/administrator or recovery material|private Graph overlay/);
    assert.match(result.stderr,/empty staging directory inside working/);
    assert.deepEqual(await inventory(root),before);
  }
}));

test('every selected staging lane is checked before ordinary Development files are replaced',async()=>withLaneFixture(async root=>{
  await fs.writeFile(path.join(root,'Dev/old.js'),'preserve until every target is safe');
  await fs.writeFile(path.join(root,'QA/graphRuntimeConfig.js'),'synthetic private overlay');
  const before=await inventory(root);
  const stage=invokeBuild(root,'build-browser-targets.mjs');
  assert.notEqual(stage.status,0);assert.match(stage.stderr,/private Graph overlay/);
  assert.deepEqual(await inventory(root),before);
  const clean=invokeBuild(root,'clean-dist.mjs');
  assert.notEqual(clean.status,0);assert.match(clean.stderr,/private Graph overlay/);
  assert.deepEqual(await inventory(root),before);
}));

test('private Graph overlays block targeted Dev and QA rebuilds while ordinary generated overlays can be replaced',async()=>withLaneFixture(async root=>{
  for(const [target,lane] of [['dev','Dev'],['uat','QA']]) {
    await fs.writeFile(path.join(root,lane,'graphRuntimeConfig.js'),'synthetic private overlay');
    const before=await inventory(root),blocked=invokeBuild(root,'build-browser-targets.mjs',target);
    assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/private Graph overlay/);
    assert.deepEqual(await inventory(root),before);
    await fs.copyFile(path.resolve(__dirname,'../teams-captions-saver/graphRuntimeConfig.js'),path.join(root,lane,'graphRuntimeConfig.js'));
    const allowed=invokeBuild(root,'build-browser-targets.mjs',target);
    assert.equal(allowed.status,0,allowed.stderr);
    assert.equal(JSON.parse(await fs.readFile(path.join(root,lane,'manifest.json'),'utf8')).manifest_version,3);
  }
}));

test('recovery-only QA directories stop cleanup before any Development deletion',async()=>withLaneFixture(async root=>{
  await fs.writeFile(path.join(root,'Dev/old.js'),'ordinary Dev must survive refused QA cleanup');
  await fs.mkdir(path.join(root,'QA/operations/synthetic'),{recursive:true});
  await fs.writeFile(path.join(root,'QA/operations/synthetic/receipt.json'),'preserved recovery');
  const before=await inventory(root),result=invokeBuild(root,'clean-dist.mjs');
  assert.notEqual(result.status,0);assert.deepEqual(await inventory(root),before);
}));

test('enclosing-lane rebuild rejects a private Graph overlay in a nested unpacked target before changing any lane',async()=>withLaneFixture(async root=>{
  await fs.writeFile(path.join(root,'Dev/old.js'),'preserve ordinary Dev until Production preflight passes');
  await fs.mkdir(path.join(root,'Production/nested-unpacked'),{recursive:true});
  await fs.writeFile(path.join(root,'Production/nested-unpacked/graphRuntimeConfig.js'),'synthetic private nested overlay');
  const before=await inventory(root),result=invokeBuild(root,'build-browser-targets.mjs');
  assert.notEqual(result.status,0);assert.match(result.stderr,/private Graph overlay/);
  assert.deepEqual(await inventory(root),before);
}));

test('build deletion rejects an escaped or root-wide target before touching any files',async()=>withLaneFixture(async root=>{
  const {assertBuildLaneCanReset}=await import('../scripts/build-lane-guard.mjs');
  await fs.writeFile(path.join(root,'Dev/old.js'),'preserved by path boundary');
  const before=await inventory(root);
  for(const target of [root,path.dirname(root),path.resolve(root,'../unrelated-lane')])
    await assert.rejects(assertBuildLaneCanReset(root,target),/escapes/);
  assert.deepEqual(await inventory(root),before);
}));

test('recursive build deletion refuses symlink targets, ancestors and nested links',async t=>withLaneFixture(async root=>{
  const outside=path.join(root,'preservation-target');await fs.mkdir(outside);
  await fs.writeFile(path.join(outside,'sentinel.txt'),'must remain untouched');
  const lane=path.join(root,'Dev');await fs.rmdir(lane);
  let kind;
  const unsupported=[];
  for(const candidate of process.platform==='win32'?['junction','dir']:['dir']) {
    try { await fs.symlink(outside,lane,candidate);kind=candidate;break; }
    catch(error) {
      if(!['EPERM','EACCES','EINVAL','ENOTSUP','EOPNOTSUPP','EISDIR'].includes(error.code)) throw error;
      unsupported.push(`${candidate}: ${error.code}`);
      // A failed native link request can leave an empty directory. Only remove that verified
      // empty fixture entry, never recursively traverse a partial link or change output drives.
      const leftover=await fs.lstat(lane).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
      if(leftover?.isSymbolicLink()) await fs.unlink(lane);
      else if(leftover?.isDirectory() && (await fs.readdir(lane)).length===0) await fs.rmdir(lane);
      else if(leftover) throw error;
    }
  }
  if(!kind) { t.skip(`Native directory links are unsupported in this managed fixture (${unsupported.join('; ')}); source link guards remain required.`);return; }
  try {
    const blocked=invokeBuild(root,'build-browser-targets.mjs','dev');
    assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/linked path/);
    assert.equal(await fs.readFile(path.join(outside,'sentinel.txt'),'utf8'),'must remain untouched');
  } finally { await fs.unlink(lane); }
  await fs.mkdir(lane);
  const nested=path.join(lane,'nested-link');await fs.symlink(outside,nested,kind);
  try {
    const blocked=invokeBuild(root,'clean-dist.mjs');
    assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/linked content/);
  } finally { await fs.unlink(nested); }
  const alias=path.join(root,'linked-output-root');await fs.symlink(path.join(root,'QA'),alias,kind);
  try {
    const blocked=invokeBuild(alias,'build-browser-targets.mjs','dev');
    assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/linked path/);
  } finally { await fs.unlink(alias); }
  assert.equal(await fs.readFile(path.join(outside,'sentinel.txt'),'utf8'),'must remain untouched');
}));
