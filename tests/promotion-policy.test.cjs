const test = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');

const policy = import(pathToFileURL(path.join(__dirname, '../scripts/check-promotion.mjs')));
const sha = digit => digit.repeat(40);

function fixture(base = 'master', head = 'qa') {
  const repository = 'Example/CaptionKeep';
  const event = {number:12, pull_request:{number:12, state:'open',
    base:{ref:base, sha:sha('a'), repo:{full_name:repository}},
    head:{ref:head, sha:sha('b'), repo:{full_name:repository}}}};
  const replies = new Map([
    [`rev-parse --verify refs/remotes/origin/${base}^{commit}`, sha('a')],
    [`rev-parse --verify refs/remotes/origin/${head}^{commit}`, sha('b')],
    ['rev-parse --verify refs/pull/12/merge^{commit}', sha('c')],
    [`rev-list --parents -n 1 ${sha('c')}`, `${sha('c')} ${sha('a')} ${sha('b')}`],
    [`rev-parse --verify ${sha('b')}^{tree}`, sha('d')],
    [`rev-parse --verify ${sha('c')}^{tree}`, sha('d')]
  ]);
  if (base === 'qa') {
    replies.set('rev-parse --verify refs/remotes/origin/master^{commit}', sha('e'));
    replies.set(`merge-base --is-ancestor ${sha('e')} ${sha('b')}`, '');
  }
  const calls = [];
  return {eventName:'pull_request_target', repository, event, replies, calls,
    readGit(args) {
      const key = args.join(' ');
      calls.push(key);
      if (!replies.has(key)) throw new Error(`Missing Git evidence: ${key}`);
      return replies.get(key);
    }};
}

test('allowed routes verify current fetched branch identities', async () => {
  const {validatePromotion} = await policy;
  for (const [base, head] of [['dev','codex/fix-one'], ['dev','feature/new'],
    ['dev','fix/bug'], ['qa','dev'], ['master','qa']]) {
    const f = fixture(base, head);
    assert.deepEqual(validatePromotion(f), {base, head, baseSha:sha('a'), headSha:sha('b'), mergeSha:sha('c')});
  }
});

test('development and QA also require a merge preview bound to both current branches', async () => {
  const {validatePromotion} = await policy;
  for (const [base, head] of [['dev','codex/fix-one'], ['qa','dev']]) {
    const missing = fixture(base, head);
    missing.replies.delete('rev-parse --verify refs/pull/12/merge^{commit}');
    assert.throws(() => validatePromotion(missing), /Missing Git evidence/);
    const stale = fixture(base, head);
    stale.replies.set(`rev-list --parents -n 1 ${sha('c')}`, `${sha('c')} ${sha('e')} ${sha('b')}`);
    assert.throws(() => validatePromotion(stale), /merge preview/);
  }
});

test('rejects skipped stages and lane back-merges into development', async () => {
  const {validatePromotion} = await policy;
  for (const [base, head] of [['master','dev'], ['master','fix/urgent'],
    ['qa','codex/work'], ['dev','qa'], ['dev','master'], ['dev','dev']]) {
    const f = fixture(base, head);
    assert.throws(() => validatePromotion(f), /Invalid promotion route/);
    assert.equal(f.calls.length, 0);
  }
});

test('rejects fork branches even with identical owner names or SHAs', async () => {
  const {validatePromotion} = await policy;
  for (const side of ['head','base']) {
    const f = fixture();
    f.event.pull_request[side].repo.full_name = 'Fork/CaptionKeep';
    assert.throws(() => validatePromotion(f), /this repository/);
  }
});

test('rejects stale events when either fetched branch moved', async () => {
  const {validatePromotion} = await policy;
  for (const branch of ['qa','master']) {
    const f = fixture();
    f.replies.set(`rev-parse --verify refs/remotes/origin/${branch}^{commit}`, sha('f'));
    assert.throws(() => validatePromotion(f), /event is stale/);
  }
});

test('rejects missing or malformed fetched branch evidence', async () => {
  const {validatePromotion} = await policy;
  const f = fixture();
  f.replies.delete('rev-parse --verify refs/remotes/origin/qa^{commit}');
  assert.throws(() => validatePromotion(f), /Missing Git evidence/);
  f.replies.set('rev-parse --verify refs/remotes/origin/qa^{commit}', 'not-a-sha');
  assert.throws(() => validatePromotion(f), /Invalid or missing fetched commit/);
});

test('QA rejects development that does not include current production', async () => {
  const {validatePromotion} = await policy;
  const f = fixture('qa', 'dev');
  f.replies.delete(`merge-base --is-ancestor ${sha('e')} ${sha('b')}`);
  assert.throws(() => validatePromotion(f), /include current production/);
});

test('production rejects an absent or stale merge preview', async () => {
  const {validatePromotion} = await policy;
  const absent = fixture();
  absent.replies.delete('rev-parse --verify refs/pull/12/merge^{commit}');
  assert.throws(() => validatePromotion(absent), /Missing Git evidence/);
  for (const parents of [`${sha('c')} ${sha('e')} ${sha('b')}`,
    `${sha('c')} ${sha('a')} ${sha('e')}`, `${sha('c')} ${sha('a')}`]) {
    const f = fixture();
    f.replies.set(`rev-list --parents -n 1 ${sha('c')}`, parents);
    assert.throws(() => validatePromotion(f), /merge preview/);
  }
});

test('production rejects merge conflict resolution or other tree drift', async () => {
  const {validatePromotion} = await policy;
  const f = fixture();
  f.replies.set(`rev-parse --verify ${sha('c')}^{tree}`, sha('e'));
  assert.throws(() => validatePromotion(f), /differ from the QA candidate/);
});

test('production rejects malformed or absent tree identities', async () => {
  const {validatePromotion} = await policy;
  const f = fixture();
  f.replies.set(`rev-parse --verify ${sha('b')}^{tree}`, '');
  f.replies.set(`rev-parse --verify ${sha('c')}^{tree}`, '');
  assert.throws(() => validatePromotion(f), /differ from the QA candidate/);
});

test('untrusted events and malformed PR identities fail closed', async () => {
  const {validatePromotion} = await policy;
  for (const change of [f => {f.eventName = 'pull_request';},
    f => {f.event = {};}, f => {f.event.number = '12';},
    f => {f.event.pull_request.number = 13;}, f => {f.event.pull_request.state = 'closed';},
    f => {f.event.pull_request.head.sha = 'b';}, f => {f.event.pull_request.base.ref = 'unknown';}]) {
    const f = fixture();
    change(f);
    assert.throws(() => validatePromotion(f));
    assert.equal(f.calls.length, 0);
  }
});

test('unsafe source ref names are refused before Git is called', async () => {
  const {validatePromotion} = await policy;
  for (const head of ['codex/a..b', 'codex/a//b', 'codex/a.lock', 'codex/a/',
    'codex/a;echo', 'codex/a\n', 'codex/a@{1}', '--help']) {
    const f = fixture('dev', head);
    assert.throws(() => validatePromotion(f), /Invalid promotion route/);
    assert.equal(f.calls.length, 0);
  }
});
