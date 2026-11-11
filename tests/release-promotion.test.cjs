const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const policy = import(pathToFileURL(path.join(__dirname, '../scripts/check-release-promotion.mjs')));
const sha = digit => digit.repeat(40);

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
