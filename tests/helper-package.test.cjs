const {test} = require('node:test');
const assert = require('node:assert/strict');
const {mkdtemp,mkdir,readFile,writeFile,rm} = require('node:fs/promises');
const {createWriteStream} = require('node:fs');
const {createHash} = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

async function fixture(run) {
  const prefix = path.join(os.tmpdir(),'captionkeep-helper-package-');
  const root = await mkdtemp(prefix);
  const api = await import('../scripts/package-byomcp-helper.mjs');
  try {
    const write = async (name,value) => {
      const target = path.join(root,name); await mkdir(path.dirname(target),{recursive:true});
      await writeFile(target,typeof value === 'string' ? value : JSON.stringify(value));
    };
    for (const name of api.HELPER_PUBLIC_FILES) await write(`companion/byomcp/${name}`,`// Synthetic ${name}\n`);
    const helper = {name:'synthetic-helper',version:'0.1.0',dependencies:{'synthetic-sdk':'1.0.0'}};
    await write('companion/byomcp/package.json',helper);
    await write('companion/byomcp/package-lock.json',{name:helper.name,version:helper.version,lockfileVersion:3,
      packages:{'':helper,'node_modules/synthetic-sdk':{version:'1.0.0',integrity:'sha512-synthetic'}}});
    await write('companion/byomcp/node_modules/synthetic-sdk/package.json',{name:'synthetic-sdk',version:'1.0.0'});
    await write('companion/byomcp/node_modules/synthetic-sdk/LICENSE','Synthetic test license');
    await write('companion/byomcp/node_modules/synthetic-sdk/index.js','export const synthetic = true;');
    await write('teams-captions-saver/manifest.json',{version:'6.0.0'});
    await write('teams-captions-saver/evidenceActionContracts.js','module.exports = {synthetic:true};');
    await write('teams-captions-saver/byomcpRuntimeAdapter.js','module.exports = {synthetic:true};');
    await write('LICENSE','Synthetic root test license');
    const sbom = {bomFormat:'CycloneDX',specVersion:'1.6',version:1,
      metadata:{component:{name:helper.name,version:helper.version,purl:'pkg:npm/synthetic-helper@0.1.0'}},
      components:[{name:'synthetic-sdk',version:'1.0.0'}]};
    await run({root,write,api,sbom,sbomText:JSON.stringify(sbom)});
  } finally {
    assert(path.resolve(root).startsWith(path.resolve(prefix)),'Temporary helper fixture escaped its named test directory');
    await rm(root,{recursive:true,force:true});
  }
}

test('helper package includes offline dependencies, licenses and exact runtime layout but excludes private/test material', async () => {
  await fixture(async ({root,write,api,sbomText}) => {
    for (const name of ['.env','private-config.json','test/private-fixture.json']) await write(`companion/byomcp/${name}`,'Do not distribute');
    await write('companion/byomcp/node_modules/synthetic-sdk/.env','Do not distribute');
    await write('companion/byomcp/node_modules/synthetic-sdk/test/data.json','Do not distribute');
    await write('companion/byomcp/node_modules/unlocked/index.js','Do not distribute');
    const {names,record} = await api.packageByomcpHelper({root,sbomText});
    const {zipEntries} = await import('../scripts/verify-package-source.mjs');
    const entries = zipEntries(await readFile(path.join(root,'dist/prod',names.zip)));
    assert(entries.has('companion/byomcp/cli.mjs'));
    assert(entries.has('teams-captions-saver/byomcpRuntimeAdapter.js'));
    assert(entries.has('teams-captions-saver/evidenceActionContracts.js'));
    assert(entries.has('companion/byomcp/node_modules/synthetic-sdk/index.js'));
    assert(entries.has('companion/byomcp/node_modules/synthetic-sdk/LICENSE'));
    assert(entries.has('LICENSE'));
    assert(entries.get('START-HERE.md').toString().includes('Install Node.js 22 or newer separately'));
    assert(![...entries.keys()].some(name => /\.env|private-config|\/test\/|unlocked/.test(name)));
    assert.equal(record.releaseVersion,'6.0.0'); assert.equal(record.helperVersion,'0.1.0');
    assert.deepEqual((await api.verifyByomcpHelper(root)).map(item => item.target),['byomcp-helper','byomcp-sbom','byomcp-hashes']);
  });
});

test('helper verification rejects a stale ZIP after source changes', async () => {
  await fixture(async ({root,write,api,sbomText}) => {
    await api.packageByomcpHelper({root,sbomText});
    await write('teams-captions-saver/byomcpRuntimeAdapter.js','module.exports = {newer:true};');
    await assert.rejects(api.verifyByomcpHelper(root),/Helper ZIP source mismatch/);
  });
});

test('helper verification rejects altered ZIP bytes even when the published checksum is replaced', async () => {
  await fixture(async ({root,api,sbomText}) => {
    const {names} = await api.packageByomcpHelper({root,sbomText});
    const directory = path.join(root,'dist/prod'), zipPath = path.join(directory,names.zip);
    const {zipEntries} = await import('../scripts/verify-package-source.mjs');
    const entries = zipEntries(await readFile(zipPath));
    entries.set('companion/byomcp/cli.mjs',Buffer.from('// synthetic altered payload'));
    const {ZipArchive} = await import('archiver');
    await new Promise((resolve,reject) => {
      const output = createWriteStream(zipPath), archive = new ZipArchive();
      output.on('close',resolve); output.on('error',reject); archive.on('error',reject);
      archive.pipe(output); for (const [name,bytes] of entries) archive.append(bytes,{name});
      archive.finalize().catch(reject);
    });
    const record = JSON.parse(await readFile(path.join(directory,names.hashes),'utf8'));
    record.zipSha256 = hash(await readFile(zipPath));
    await writeFile(path.join(directory,names.hashes),JSON.stringify(record));
    await assert.rejects(api.verifyByomcpHelper(root),/Helper ZIP source mismatch: companion\/byomcp\/cli.mjs/);
  });
});

test('helper packaging checks SBOM identity and every dependency against the lockfile', async () => {
  await fixture(async ({root,api,sbom}) => {
    await assert.rejects(api.packageByomcpHelper({root,sbomText:JSON.stringify({...sbom,components:[]})}),/SBOM dependency versions differ/);
    const wrong = structuredClone(sbom); wrong.metadata.component.version = '0.0.0';
    await assert.rejects(api.packageByomcpHelper({root,sbomText:JSON.stringify(wrong)}),/SBOM identity differs/);
  });
});

test('helper packaging refuses native dependency binaries and mismatched installed versions', async () => {
  await fixture(async ({root,write,api,sbomText}) => {
    await write('companion/byomcp/node_modules/synthetic-sdk/package.json',{name:'synthetic-sdk',version:'2.0.0'});
    await assert.rejects(api.packageByomcpHelper({root,sbomText}),/dependency version differs/);
    await write('companion/byomcp/node_modules/synthetic-sdk/package.json',{name:'synthetic-sdk',version:'1.0.0'});
    await write('companion/byomcp/node_modules/synthetic-sdk/addon.node','synthetic binary');
    await assert.rejects(api.packageByomcpHelper({root,sbomText}),/Unsupported helper dependency file/);
  });
});

test('6.0 release gate excludes helper work while preserving explicit development commands', async () => {
  const pkg = JSON.parse(await readFile(path.resolve(__dirname,'../package.json'),'utf8'));
  const command = pkg.scripts['release:candidate'];
  for (const name of ['setup:helper','test:helper','security:audit:helper','package:helper']) {
    assert(pkg.scripts[name]); assert(!command.includes(`npm run ${name}`));
  }
  assert(command.includes('npm run test:release'));
  assert(command.includes('node scripts/verify-release.mjs'));
  assert(!/publish:|native-host-install|reg add/i.test(command));
});
