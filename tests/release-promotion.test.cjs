const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const fs = require('node:fs');
const os = require('node:os');
const {execFileSync} = require('node:child_process');

const policy = import(pathToFileURL(path.join(__dirname, '../scripts/check-release-promotion.mjs')));
const sha = digit => digit.repeat(40);

function scratchFixture() {
  // Managed launcher directs os.tmpdir() inside this run's working/ area.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-isolation-'));
  const git = (args, cwd=root) => execFileSync('git', args, {cwd, encoding:'utf8', windowsHide:true, stdio:['ignore','pipe','pipe']}).trim();
  git(['init']);git(['config','user.name','Synthetic release test']);git(['config','user.email','synthetic@example.invalid']);
  fs.writeFileSync(path.join(root,'source.txt'),'reviewed source\n');fs.mkdirSync(path.join(root,'scripts'));fs.writeFileSync(path.join(root,'scripts','check-release-promotion.mjs'),'// synthetic protected checker\n');git(['add','source.txt','scripts/check-release-promotion.mjs']);git(['commit','-m','synthetic fixture']);
  git(['update-ref','refs/remotes/origin/master',git(['rev-parse','HEAD'])]);
  const policyRoot=path.join(root,'working','release-policy');fs.mkdirSync(path.dirname(policyRoot),{recursive:true});git(['clone','--no-local',root,policyRoot]);
  return {root:fs.realpathSync(root),policyRoot:fs.realpathSync(policyRoot),git};
}

test('verified policy scratch does not dirty a frozen source or conceal other changes',async()=>{
  const {isolateTrustedPolicyCheckout}=await policy;const f=scratchFixture();
  assert.match(f.git(['status','--porcelain','--untracked-files=all']),/working\/release-policy/);
  const exclude=path.resolve(f.root,f.git(['rev-parse','--git-path','info/exclude']));fs.appendFileSync(exclude,'\n# preserved owner rule\n/retained-scratch/\n');
  assert.deepEqual(isolateTrustedPolicyCheckout(f),{excluded:'/working/release-policy/'});
  assert.equal(f.git(['status','--porcelain','--untracked-files=all']),'');
  assert.equal(f.git(['status','--porcelain','--untracked-files=normal']),'');
  fs.appendFileSync(path.join(f.root,'source.txt'),'unreviewed change\n');fs.writeFileSync(path.join(f.root,'unexpected.txt'),'not scratch');fs.writeFileSync(path.join(f.root,'working','unexpected.txt'),'unexpected scratch');
  const status=f.git(['status','--porcelain','--untracked-files=all']);assert.match(status,/M source.txt/);assert.match(status,/\?\? unexpected.txt/);assert.match(status,/working\/unexpected.txt/);assert.doesNotMatch(status,/working\/release-policy/);
  const normal=f.git(['status','--porcelain','--untracked-files=normal']);assert.match(normal,/M source.txt/);assert.match(normal,/unexpected.txt/);assert.match(normal,/working\//);
  const once=fs.readFileSync(exclude,'utf8');isolateTrustedPolicyCheckout(f);assert.equal(fs.readFileSync(exclude,'utf8'),once);assert.match(once,/preserved owner rule/);
});

test('scratch isolation refuses wrong checkout identity',async()=>{
  const {isolateTrustedPolicyCheckout}=await policy;const f=scratchFixture();
  const exclude=path.resolve(f.root,f.git(['rev-parse','--git-path','info/exclude']));const before=fs.readFileSync(exclude,'utf8');
  assert.throws(()=>isolateTrustedPolicyCheckout({...f,policyRoot:f.root}),/Unexpected/);
  assert.equal(fs.readFileSync(exclude,'utf8'),before);
  assert.throws(()=>isolateTrustedPolicyCheckout({...f,checkerPath:path.join(f.policyRoot,'source.txt')}),/Unexpected/);
  assert.equal(fs.readFileSync(exclude,'utf8'),before);
  fs.writeFileSync(path.join(f.root,'new-policy.txt'),'new protected policy');f.git(['add','new-policy.txt']);f.git(['commit','-m','new protected fixture revision']);
  f.git(['update-ref','refs/remotes/origin/master',f.git(['rev-parse','HEAD'])]);
  assert.throws(()=>isolateTrustedPolicyCheckout(f),/protected production checkout/);
  assert.equal(fs.readFileSync(exclude,'utf8'),before);
});

test('dirty nested policy is never excluded even when its HEAD matches protected master',async()=>{
  const {isolateTrustedPolicyCheckout}=await policy;
  for(const state of ['modified','staged','untracked']){
    const f=scratchFixture();const exclude=path.resolve(f.root,f.git(['rev-parse','--git-path','info/exclude']));const before=fs.readFileSync(exclude,'utf8');
    fs.writeFileSync(path.join(f.policyRoot,state==='untracked'?'unexpected.txt':'source.txt'),'unreviewed child content');
    if(state==='staged')f.git(['add','source.txt'],f.policyRoot);
    assert.throws(()=>isolateTrustedPolicyCheckout(f),/unreviewed changes/);assert.equal(fs.readFileSync(exclude,'utf8'),before);
  }
});

function fixture() {
  const repository = 'Example/CaptionKeep';
  const replies = new Map([
    ['rev-parse --verify HEAD^{commit}', sha('a')],
    ['rev-list --first-parent refs/remotes/origin/master', `${sha('f')}\n${sha('a')}\n${sha('b')}`],
    [`rev-list --parents -n 1 ${sha('a')}`, `${sha('a')} ${sha('b')} ${sha('c')}`],
    [`rev-parse --verify ${sha('a')}^{tree}`, sha('d')],
    [`rev-parse --verify ${sha('c')}^{tree}`, sha('d')]
  ]);
  const prs = [{number:5, state:'closed', merged_at:'2026-11-11T12:00:00Z', merge_commit_sha:sha('a'),
    base:{ref:'master', repo:{full_name:repository}},
    head:{ref:'qa', sha:sha('c'), repo:{full_name:repository}}}];
  const apiCalls = [];
  return {repository, replies, prs, apiCalls,
    readGit:args => {
      const key = args.join(' ');
      if (!replies.has(key)) throw new Error(`Missing Git evidence: ${key}`);
      return replies.get(key);
    },
    readPullRequests(repo, commit) {
      apiCalls.push([repo, commit]);
      return prs;
    }};
}

test('accepts historical production merge with an exact merged QA PR', async () => {
  const {validateReleasePromotion} = await policy;
  const f = fixture();
  assert.deepEqual(validateReleasePromotion(f), {commit:sha('a'), qaCommit:sha('c'), pullRequest:5});
  assert.deepEqual(f.apiCalls, [[f.repository, sha('a')]]);
});

test('rejects interior merges merely reachable from production', async () => {
  const {validateReleasePromotion} = await policy;
  const f = fixture();
  f.replies.set('rev-list --first-parent refs/remotes/origin/master', `${sha('f')}\n${sha('b')}`);
  assert.throws(() => validateReleasePromotion(f), /first-parent history/);
  assert.equal(f.apiCalls.length, 0);
});

test('rejects squash, root and octopus commits before consulting PR evidence', async () => {
  const {validateReleasePromotion} = await policy;
  for (const parents of [`${sha('a')} ${sha('b')}`, sha('a'),
    `${sha('a')} ${sha('b')} ${sha('c')} ${sha('e')}`]) {
    const f = fixture();
    f.replies.set(`rev-list --parents -n 1 ${sha('a')}`, parents);
    assert.throws(() => validateReleasePromotion(f), /exact two-parent/);
    assert.equal(f.apiCalls.length, 0);
  }
});

test('rejects production merge content differing from QA source', async () => {
  const {validateReleasePromotion} = await policy;
  const f = fixture();
  f.replies.set(`rev-parse --verify ${sha('a')}^{tree}`, sha('e'));
  assert.throws(() => validateReleasePromotion(f), /differs from the merged QA/);
});

test('requires the exact merged commit, lane route, source SHA and same repository', async () => {
  const {validateReleasePromotion} = await policy;
  for (const mutate of [pr => {pr.merge_commit_sha = sha('e');},
    pr => {pr.base.ref = 'dev';}, pr => {pr.head.ref = 'dev';},
    pr => {pr.head.sha = sha('e');}, pr => {pr.base.repo.full_name = 'Fork/CaptionKeep';},
    pr => {pr.head.repo.full_name = 'Fork/CaptionKeep';},
    pr => {pr.merged_at = null;}, pr => {pr.merged_at = 'invalid';},
    pr => {pr.state = 'open';}, pr => {pr.number = 0;}]) {
    const f = fixture();
    mutate(f.prs[0]);
    assert.throws(() => validateReleasePromotion(f), /matching merged QA-to-production/);
  }
});

test('missing, malformed or failed GitHub evidence fails closed', async () => {
  const {validateReleasePromotion} = await policy;
  const f = fixture();
  f.prs.length = 0;
  assert.throws(() => validateReleasePromotion(f), /matching merged QA-to-production/);
  f.readPullRequests = () => ({message:'Not Found'});
  assert.throws(() => validateReleasePromotion(f), /evidence is unavailable/);
  f.readPullRequests = () => {throw new Error('GitHub unavailable');};
  assert.throws(() => validateReleasePromotion(f), /GitHub unavailable/);
});

test('missing or malformed Git identities fail closed', async () => {
  const {validateReleasePromotion} = await policy;
  for (const command of ['rev-parse --verify HEAD^{commit}',
    'rev-list --first-parent refs/remotes/origin/master',
    `rev-list --parents -n 1 ${sha('a')}`,
    `rev-parse --verify ${sha('a')}^{tree}`, `rev-parse --verify ${sha('c')}^{tree}`]) {
    const f = fixture();
    f.replies.delete(command);
    assert.throws(() => validateReleasePromotion(f), /Missing Git evidence/);
    f.replies.set(command, 'malformed');
    assert.throws(() => validateReleasePromotion(f));
  }
});

test('repository identity and evidence adapters are mandatory', async () => {
  const {validateReleasePromotion} = await policy;
  for (const repository of [undefined, '', '../escape', 'Example/CaptionKeep;command', {}]) {
    assert.throws(() => validateReleasePromotion({...fixture(), repository}), /trusted Git\/PR/);
  }
  assert.throws(() => validateReleasePromotion({...fixture(), readGit:undefined}), /trusted Git\/PR/);
  assert.throws(() => validateReleasePromotion({...fixture(), readPullRequests:undefined}), /trusted Git\/PR/);
});
