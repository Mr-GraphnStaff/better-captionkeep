const test = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

const policy = import(pathToFileURL(path.join(__dirname, '../scripts/check-promotion.mjs')));
const sha = digit => digit.repeat(40);

test('actual audit binding command publishes nothing when trusted validation rejects a stale event', t => {
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/promotion.yml'), 'utf8').replaceAll('\r\n', '\n');
  const section = workflow.split('      - name: Bind the pending decision to the exact merge candidate\n')[1]?.split('\n  qa-approval:')[0];
  assert(section, 'Binding step must exist');
  const script = section.split('        run: |\n')[1]?.split('\n').map(line => line.startsWith('          ') ? line.slice(10) : line).join('\n');
  assert(script, 'Actual binding shell command must exist');
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporaryRoot, 'captionkeep-audit-binding-'));
  t.after(() => {
    const real = fs.realpathSync(root);
    const relative = path.relative(temporaryRoot, real);
    assert(relative && !path.isAbsolute(relative) && !relative.startsWith('..'));
    assert(path.basename(real).startsWith('captionkeep-audit-binding-'));
    fs.rmSync(real, {recursive:true, force:true});
  });
  const commands = `
git() { if [[ "$1" == fetch ]]; then return 0; fi; printf '%s\\n' '${sha('c')}'; }
node() { if [[ "$VALIDATION_RC" != 0 ]]; then return 1; fi; validated=yes; }
gh() { [[ "$validated" == yes ]] || return 9; printf 'PUBLISHED\\n'; }
`;
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const run = validation => spawnSync(bash, ['--noprofile', '--norc', '-e', '-c', commands + script], {
    cwd:root, encoding:'utf8', windowsHide:true, timeout:10000,
    env:{...process.env, BASH_ENV:'', ENV:'', PR_NUMBER:'12', BASE_BRANCH:'dev',
      GITHUB_OUTPUT:'github-output', GITHUB_REPOSITORY:'Example/CaptionKeep', VALIDATION_RC:String(validation)}
  });
  const stale = run(1);
  assert.equal(stale.error, undefined);
  assert.notEqual(stale.status, 0);
  assert(!stale.stdout.includes('PUBLISHED'), 'A stale event must never publish an external status');
  assert(!fs.existsSync(path.join(root, 'github-output')), 'A stale event must not bind candidate outputs');
  const current = run(0);
  assert.equal(current.error, undefined);
  assert.equal(current.status, 0, current.stderr);
  assert(current.stdout.includes('PUBLISHED'), 'The accepted event must reach status publication');
  assert(fs.readFileSync(path.join(root, 'github-output'), 'utf8').includes(`merge=${sha('c')}`));
});

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
