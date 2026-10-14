const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {mkdtemp,mkdir,readFile,writeFile,rm} = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const workflowPath = path.resolve(__dirname,'../.github/workflows/release.yml');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
function step(workflow,name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  assert(start >= 0,`Missing workflow step: ${name}`);
  const end = workflow.indexOf('\n      - name:',start + 1);
  return workflow.slice(start,end < 0 ? undefined : end);
}
function checksumCommand(workflow) {
  const body = step(workflow,'Record package checksums').split('        run: |\n')[1];
  assert(body);
  return body.split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
}
async function fixture(run) {
  const prefix = path.join(os.tmpdir(),'captionkeep-workflow-assets-'), root = await mkdtemp(prefix);
  try {
    const version = '6.0.0';
    const files = [
      `better_captionkeep-${version}.zip`,`better_captionkeep-chrome-${version}.zip`,
      `better-captionkeep-byomcp-helper-${version}.zip`,`better-captionkeep-byomcp-helper-${version}.cdx.json`,
      'byomcp-helper-hashes.json',`better-captionkeep-${version}.cdx.json`,
      'browser-package-hashes.json','browser-certification.json','release-provenance.json','better-captionkeep-sbom.cdx.json',
      ...['chrome','edge','brave','firefox','opera'].map(browser => `browser-packages/better-captionkeep-${browser}-${version}.zip`)
    ];
    await mkdir(path.join(root,'teams-captions-saver'),{recursive:true});
    await writeFile(path.join(root,'teams-captions-saver/manifest.json'),JSON.stringify({version}));
    for (const name of files) {
      const file = path.join(root,'dist/prod',name); await mkdir(path.dirname(file),{recursive:true});
      await writeFile(file,`Synthetic release fixture: ${name}\n`);
    }
    const workflow = (await readFile(workflowPath,'utf8')).replaceAll('\r\n','\n');
    const execute = () => execFileSync(bash,['--noprofile','--norc','-c',checksumCommand(workflow)],{
      cwd:root,env:{...process.env,BASH_ENV:'',ENV:'',GITHUB_ENV:'github-env.txt'},windowsHide:true,stdio:'pipe'
    });
    await run({root,files,version,execute});
  } finally {
    assert(path.resolve(root).startsWith(path.resolve(prefix)),'Workflow fixture escaped its named temporary directory');
    await rm(root,{recursive:true,force:true});
  }
}

test('actual release checksum command covers helper, all five browsers and evidence while preserving Store-only contract', async () => {
  await fixture(async ({root,files,version,execute}) => {
    execute();
    const readChecksums = async name => new Map((await readFile(path.join(root,'dist/prod',name),'utf8')).trim().split('\n').map(line => {
      const match = /^([a-f0-9]{64})\s+\*?([^/\\]+)$/.exec(line); assert(match,`Invalid checksum: ${line}`);
      return [match[2],match[1]];
    }));
    const store = await readChecksums('SHA256SUMS.txt');
    assert.deepEqual([...store.keys()].sort(),[`better_captionkeep-${version}.zip`,`better_captionkeep-chrome-${version}.zip`].sort());
    const complete = await readChecksums('RELEASE-SHA256SUMS.txt');
    assert.equal(complete.size,files.length + 1);
    for (const name of [...files,'SHA256SUMS.txt']) {
      assert.equal(complete.get(path.basename(name)),hash(await readFile(path.join(root,'dist/prod',name))),`Wrong/missing hash: ${name}`);
    }
    assert.equal((await readFile(path.join(root,'github-env.txt'),'utf8')).trim(),`RELEASE_VERSION=${version}`);
  });
});

test('actual release checksum command fails when a required helper asset is missing', async () => {
  await fixture(async ({root,version,execute}) => {
    await rm(path.join(root,'dist/prod',`better-captionkeep-byomcp-helper-${version}.zip`));
    assert.throws(execute,error => error.status !== 0);
  });
});

test('attestation, workflow upload and future draft release include complete distribution artifacts', async () => {
  const workflow = (await readFile(workflowPath,'utf8')).replaceAll('\r\n','\n');
  const required = [
    'dist/prod/better-captionkeep-byomcp-helper-${{ env.RELEASE_VERSION }}.zip',
    'dist/prod/better-captionkeep-byomcp-helper-${{ env.RELEASE_VERSION }}.cdx.json',
    'dist/prod/byomcp-helper-hashes.json',
    'dist/prod/browser-packages/better-captionkeep-*-${{ env.RELEASE_VERSION }}.zip',
    'dist/prod/better-captionkeep-${{ env.RELEASE_VERSION }}.cdx.json',
    'dist/prod/browser-package-hashes.json','dist/prod/browser-certification.json',
    'dist/prod/release-provenance.json','dist/prod/SHA256SUMS.txt','dist/prod/RELEASE-SHA256SUMS.txt',
    'dist/prod/better-captionkeep-sbom.cdx.json','dist/prod/better_captionkeep-*.zip'
  ];
  for (const name of ['Attest release provenance','Upload workflow artifact']) {
    const block = step(workflow,name);
    for (const file of required) assert(block.includes(file),`${name} omits ${file}`);
  }
  const draft = step(workflow,'Create draft GitHub release');
  for (const file of required) assert(draft.includes(file.replaceAll('${{ env.RELEASE_VERSION }}','${RELEASE_VERSION}')),`Draft release omits ${file}`);
  assert(draft.includes('--draft --verify-tag'));
  assert(draft.includes("if: github.event_name == 'push'"));
  const validation = await readFile(path.resolve(__dirname,'../.github/workflows/validate.yml'),'utf8');
  assert(validation.includes('dist/prod/better-captionkeep-byomcp-helper-*.zip'));
  assert(validation.includes('dist/prod/byomcp-helper-hashes.json'));
  assert(validation.includes('dist/prod/*.cdx.json'));
  assert(validation.includes('dist/prod/browser-packages/'));
});
