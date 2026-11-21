const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');

const project=path.resolve(__dirname,'..');
async function fixture(t,version='6.0.3') {
  const temporaryRoot=await fs.realpath(os.tmpdir());
  const root=await fs.mkdtemp(path.join(temporaryRoot,'captionkeep-build-guard-'));
  t.after(async()=>{
    const actual=await fs.realpath(root),relative=path.relative(temporaryRoot,actual);
    assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));
    assert(path.basename(actual).startsWith('captionkeep-build-guard-'));
    await fs.rm(actual,{recursive:true,force:true});
  });
  for(const name of ['scripts','teams-captions-saver','manifests','Dev','QA','Production','working'])
    await fs.mkdir(path.join(root,name));
  for(const name of ['build-lane-guard.mjs','build-browser-targets.mjs','shipping-boundary.mjs'])
    await fs.copyFile(path.join(project,'scripts',name),path.join(root,'scripts',name));
  const manifest={manifest_version:3,name:'Synthetic build fixture',version,permissions:['storage'],action:{default_title:'Synthetic'},background:{service_worker:'service_worker.js'}};
  for(const name of ['teams-captions-saver/manifest.json','manifests/manifest.chrome-store.json'])
    await fs.writeFile(path.join(root,name),JSON.stringify(manifest));
  await fs.writeFile(path.join(root,'teams-captions-saver/service_worker.js'),'globalThis.syntheticFixture = true;\n');
  await fs.writeFile(path.join(root,'teams-captions-saver/graphRuntimeConfig.js'),'globalThis.syntheticGraph = null;\n');
  await fs.writeFile(path.join(root,'.gitignore'),'/Dev/\n/QA/\n/Production/\n/working/\n');
  const git=(...args)=>execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args],{cwd:root,stdio:'pipe',windowsHide:true});
  git('init');git('config','user.name','Synthetic Guard Test');git('config','user.email','guard@example.invalid');
  git('add','.');git('commit','-m','synthetic reviewed source');
  return {root,git};
}

async function lane(root,name,version='6.0.3') {
  const directory=path.join(root,name);
  await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify({manifest_version:3,version}));
  await fs.writeFile(path.join(directory,'sentinel.txt'),`retained ${name}`);
}

async function inventory(root) {
  const result={};
  async function scan(directory) {
    for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
      const filename=path.join(directory,entry.name);
      if(entry.isDirectory()) await scan(filename);
      else if(entry.isFile()) result[path.relative(root,filename)]=createHash('sha256').update(await fs.readFile(filename)).digest('hex');
      else throw new Error('Unexpected fixture link');
    }
  }
  for(const name of ['Dev','QA','Production']) await scan(path.join(root,name));
  return result;
}

function build(root,target,isolated) {
  const env={...process.env};
  delete env.CAPTIONKEEP_TEST_DIST;
  if(isolated) env.CAPTIONKEEP_TEST_DIST=isolated;
  const args=[path.join(root,'scripts/build-browser-targets.mjs')];
  if(target) args.push(target);
  const result=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',windowsHide:true});
  assert.equal(result.error,undefined);
  return result;
}

test('a clean older source cannot replace a newer canonical lane',async t=>{
  const {root}=await fixture(t,'6.0.1');
  await lane(root,'Dev','6.0.3');
  const before=await inventory(root),result=build(root,'dev');
  assert.notEqual(result.status,0);assert.match(result.stderr,/version downgrade/);
  assert.deepEqual(await inventory(root),before);
});

test('a later selected lane downgrade refuses the whole build before an earlier lane changes',async t=>{
  const {root}=await fixture(t,'6.0.3');
  await lane(root,'Dev','6.0.2');await lane(root,'QA','6.0.4');await lane(root,'Production','6.0.3');
  const before=await inventory(root),result=build(root);
  assert.notEqual(result.status,0);assert.match(result.stderr,/version downgrade/);
  assert.deepEqual(await inventory(root),before);
});

test('a newer target manifest cannot relabel older source or partially replace earlier lanes',async t=>{
  const {root,git}=await fixture(t,'6.0.3');
  await lane(root,'Dev','6.0.2');await lane(root,'QA','6.0.2');await lane(root,'Production','6.0.3');
  const filename=path.join(root,'manifests/manifest.chrome-store.json');
  const manifest=JSON.parse(await fs.readFile(filename,'utf8'));
  manifest.version='6.0.4';
  await fs.writeFile(filename,JSON.stringify(manifest));
  git('add','manifests/manifest.chrome-store.json');git('commit','-m','synthetic mismatched target manifest');
  const before=await inventory(root),result=build(root);
  assert.notEqual(result.status,0);assert.match(result.stderr,/Target manifest version does not match extension source version/);
  assert.deepEqual(await inventory(root),before);
});

test('unknown existing or incoming versions fail before any canonical lane replacement',async t=>{
  for(const version of [undefined,'','6.0.x','06.0.3','65536.0.0']) {
    await t.test(String(version),async t=>{
      const {root,git}=await fixture(t);
      await lane(root,'Dev','6.0.2');await lane(root,'QA',version);
      if(version===undefined) await fs.writeFile(path.join(root,'QA/manifest.json'),'{}');
      const before=await inventory(root),result=build(root);
      assert.notEqual(result.status,0);assert.match(result.stderr,/version is unknown|version is unknown or invalid/);
      assert.deepEqual(await inventory(root),before);
      await fs.writeFile(path.join(root,'teams-captions-saver/manifest.json'),JSON.stringify({version}));
      git('add','teams-captions-saver/manifest.json');git('commit','-m','synthetic unknown source version');
      const incoming=build(root,'dev');
      assert.notEqual(incoming.status,0);assert.match(incoming.stderr,/version is unknown or invalid/);
      assert.deepEqual(await inventory(root),before);
    });
  }
});

test('nonempty canonical lanes without a manifest are never treated as safe initial output',async t=>{
  const {root}=await fixture(t);
  await fs.writeFile(path.join(root,'Dev/sentinel.txt'),'unknown existing lane');
  const before=await inventory(root),result=build(root,'dev');
  assert.notEqual(result.status,0);assert.match(result.stderr,/lane version is unknown/);
  assert.deepEqual(await inventory(root),before);
});

test('dirty canonical source cannot replace an active lane, while isolated WIP staging remains available',async t=>{
  const {root}=await fixture(t);
  await lane(root,'Dev');
  await fs.appendFile(path.join(root,'teams-captions-saver/service_worker.js'),'globalThis.unreviewed = true;\n');
  const before=await inventory(root),blocked=build(root,'dev');
  assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/refuses dirty source/);
  assert.deepEqual(await inventory(root),before);
  const isolated=path.join(root,'working/wip-staging');
  const allowed=build(root,'dev',isolated);
  assert.equal(allowed.status,0,allowed.stderr);
  assert.match(await fs.readFile(path.join(isolated,'Dev/service_worker.js'),'utf8'),/unreviewed/);
  assert.deepEqual(await inventory(root),before);
});

test('same and newer clean versions can replace ordinary canonical output',async t=>{
  for(const incoming of ['6.0.3','6.0.4','6.0.10']) await t.test(incoming,async t=>{
    const {root}=await fixture(t,incoming);
    await lane(root,'Dev','6.0.3');
    const result=build(root,'dev');
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(await fs.readFile(path.join(root,'Dev/manifest.json'),'utf8')).version,incoming);
    await assert.rejects(fs.stat(path.join(root,'Dev/sentinel.txt')),error=>error.code==='ENOENT');
  });
});

test('replacing Production refuses a downgrade of a nested browser lane',async t=>{
  const {root}=await fixture(t,'6.0.3');
  await lane(root,'Production','6.0.2');await lane(root,'Production/nested/firefox-unpacked','6.0.4');
  const before=await inventory(root),result=build(root,'prod');
  assert.notEqual(result.status,0);assert.match(result.stderr,/version downgrade/);
  assert.deepEqual(await inventory(root),before);
});

test('setting the test-dist environment to the canonical root does not bypass dirty-source refusal',async t=>{
  const {root}=await fixture(t);
  await lane(root,'Dev');
  await fs.writeFile(path.join(root,'untracked-source.js'),'unreviewed source');
  const before=await inventory(root),result=build(root,'dev',root);
  assert.notEqual(result.status,0);assert.match(result.stderr,/refuses dirty source/);
  assert.deepEqual(await inventory(root),before);
});
