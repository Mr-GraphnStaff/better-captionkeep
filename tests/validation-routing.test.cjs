const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const load = () => import('../scripts/validation-routing.mjs');

function repository(t) {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporaryRoot, 'captionkeep-validation-routing-'));
  const git = args => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`,
    '-c', 'core.autocrlf=false', ...args], {cwd:root, encoding:'utf8', windowsHide:true, stdio:['ignore','pipe','pipe']});
  const write = (file, content = 'synthetic fixture\n') => {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), {recursive:true});
    fs.writeFileSync(destination, content);
  };
  const commit = label => {
    git(['add', '--all']);
    git(['commit', '-m', label]);
    return git(['rev-parse', 'HEAD']).trim();
  };
  t.after(() => {
    // Validate the actual removal target under the fixture's named temp root.
    const real = fs.realpathSync(root);
    const relative = path.relative(temporaryRoot, real);
    assert(relative && !path.isAbsolute(relative) && !relative.startsWith('..'));
    assert(path.basename(real).startsWith('captionkeep-validation-routing-'));
    fs.rmSync(real, {recursive:true, force:true});
  });
  git(['init', '--initial-branch=master']);
  git(['config', 'user.name', 'Synthetic Routing Test']);
  git(['config', 'user.email', 'routing@example.invalid']);
  write('teams-captions-saver/runtime.js', 'original runtime\n');
  write('readme.md', 'original readme\n');
  const base = commit('baseline');
  git(['update-ref', 'refs/remotes/origin/master', base]);
  return {root, git, write, commit, base};
}

const pullRequest = (base, headRef = 'codex/research', baseRef = 'master') => ({
  eventName:'pull_request', ref:'refs/pull/184/merge',
  event:{pull_request:{base:{sha:base, ref:baseRef}, head:{ref:headRef}}}
});
const push = (ref, before, after) => ({eventName:'push', ref, event:{ref, before, after}});

test('the nonshipping boundary permits only the two scoped trees and three explicit control files', async () => {
  const {isNonshippingPath, classifyChangedPaths, NONSHIPPING_CONTROL_FILES} = await load();
  assert.deepEqual(NONSHIPPING_CONTROL_FILES, [
    '.github/workflows/validate.yml', 'scripts/validation-routing.mjs', 'tests/validation-routing.test.cjs'
  ]);
  const permitted = [...NONSHIPPING_CONTROL_FILES, '.agents/skills/software-team/SKILL.md',
    '.agents/skills/software-team/references/people-operations.md', 'docs/software-team/research.md'];
  assert(permitted.every(isNonshippingPath));
  assert.equal(classifyChangedPaths(permitted), 'nonshipping');
  for (const file of ['teams-captions-saver/runtime.js', 'manifests/manifest.chrome.json',
    'package.json', 'package-lock.json', 'scripts/verify-release.mjs', 'scripts/release-status.mjs',
    'tests/release-status.test.cjs', '.github/workflows/release.yml', 'azure-pipelines.yml',
    'docs/release-state/6.0.json', 'docs/RELEASE-6.0.md', 'readme.md', 'AGENTS.md',
    '.agents/skills/another-skill/SKILL.md', 'docs/software-team-other/research.md']) {
    assert.equal(isNonshippingPath(file), false, file);
    assert.equal(classifyChangedPaths([...permitted, file]), 'candidate', file);
  }
  assert.equal(classifyChangedPaths([]), 'candidate');
  assert.equal(classifyChangedPaths(null), 'candidate');
});

test('path traversal, absolute paths and control characters never qualify as nonshipping', async () => {
  const {isNonshippingPath} = await load();
  for (const file of ['../docs/software-team/a.md', '/docs/software-team/a.md',
    'C:/docs/software-team/a.md', 'docs/software-team/../release-state/6.0.json',
    'docs/software-team/./a.md', 'docs/software-team//a.md', 'docs\\software-team\\a.md',
    'docs/software-team/a.md\nmode=nonshipping', 'docs/software-team/a\0.md',
    '.agents/skills/software-team/../../runtime.js', '.github/workflows/validate.yml/other',
    'docs/software-team/', 'docs/software-team', '', null, 1]) {
    assert.equal(isNonshippingPath(file), false, String(file));
  }
});

test('release push, PR head and PR base always force the complete candidate gate', async () => {
  const {determineValidationMode} = await load();
  let reads = 0;
  const readGit = () => { reads += 1; throw new Error('must not inspect paths'); };
  for (const input of [push('refs/heads/release/6.0', 'a'.repeat(40), 'b'.repeat(40)),
    pullRequest('a'.repeat(40), 'release/6.0'),
    pullRequest('a'.repeat(40), 'codex/research', 'release/6.0')]) {
    assert.equal(determineValidationMode({...input, readGit}), 'candidate');
  }
  assert.equal(reads, 0);
});

test('a PR compares its pinned base with HEAD and supports the exact control-plane bootstrap', async t => {
  const {determineValidationMode, NONSHIPPING_CONTROL_FILES} = await load();
  const fixture = repository(t);
  for (const file of NONSHIPPING_CONTROL_FILES) fixture.write(file);
  fixture.write('docs/software-team/proposal.md');
  const head = fixture.commit('nonshipping control-plane bootstrap');
  assert.notEqual(head, fixture.base);
  assert.equal(determineValidationMode({...pullRequest(fixture.base), root:fixture.root}), 'nonshipping');
  fixture.write('teams-captions-saver/runtime.js', 'changed runtime\n');
  fixture.commit('mixed runtime change');
  assert.equal(determineValidationMode({...pullRequest(fixture.base), root:fixture.root}), 'candidate');
});

test('a codex push checks the whole branch so a later docs commit cannot launder runtime changes', async t => {
  const {determineValidationMode} = await load();
  const fixture = repository(t);
  fixture.git(['checkout', '-b', 'codex/research']);
  fixture.write('teams-captions-saver/runtime.js', 'changed runtime\n');
  const runtimeCommit = fixture.commit('earlier runtime change');
  fixture.write('docs/software-team/proposal.md');
  const head = fixture.commit('last commit only changes docs');
  assert.equal(determineValidationMode({...push('refs/heads/codex/research', runtimeCommit, head),
    root:fixture.root}), 'candidate');
  // The narrow last-commit diff is demonstrably harmless, which is why using it
  // instead of the complete branch would have missed the earlier runtime change.
  assert.equal(determineValidationMode({...pullRequest(runtimeCommit), root:fixture.root}), 'nonshipping');
});

test('a docs-only codex branch compares against the master merge base', async t => {
  const {determineValidationMode} = await load();
  const fixture = repository(t);
  fixture.git(['checkout', '-b', 'codex/research']);
  fixture.write('.agents/skills/software-team/SKILL.md');
  const head = fixture.commit('skill update');
  assert.equal(determineValidationMode({...push('refs/heads/codex/research', fixture.base, head),
    root:fixture.root}), 'nonshipping');
});

test('master pushes use event.before and reject a new or missing baseline', async t => {
  const {determineValidationMode} = await load();
  const fixture = repository(t);
  fixture.write('docs/software-team/proposal.md');
  const head = fixture.commit('docs on master');
  const classify = before => determineValidationMode({...push('refs/heads/master', before, head), root:fixture.root});
  assert.equal(classify(fixture.base), 'nonshipping');
  assert.equal(classify('0'.repeat(40)), 'candidate');
  assert.equal(classify(undefined), 'candidate');
  assert.equal(classify('f'.repeat(40)), 'candidate');
});

test('renaming runtime into an allowed documentation tree cannot hide the removed runtime path', async t => {
  const {determineValidationMode} = await load();
  const fixture = repository(t);
  fixture.write('docs/software-team/placeholder.md');
  fs.renameSync(path.join(fixture.root, 'teams-captions-saver/runtime.js'),
    path.join(fixture.root, 'docs/software-team/moved-runtime.md'));
  fixture.commit('move runtime into docs');
  assert.equal(determineValidationMode({...pullRequest(fixture.base), root:fixture.root}), 'candidate');
});

test('missing history, unknown events and mismatched pushed HEAD fail closed', async t => {
  const {determineValidationMode} = await load();
  const fixture = repository(t);
  fixture.write('docs/software-team/proposal.md');
  const head = fixture.commit('docs');
  for (const base of [undefined, '', '0'.repeat(40), 'bad', 'f'.repeat(40), `${fixture.base};echo unsafe`]) {
    assert.equal(determineValidationMode({...pullRequest(base), root:fixture.root}), 'candidate');
  }
  const invalid = [
    {eventName:'workflow_dispatch', ref:'refs/heads/master', event:{}},
    {...pullRequest(fixture.base), event:{}},
    {...push('refs/heads/master', fixture.base, head), event:{ref:'refs/heads/other', before:fixture.base, after:head}},
    push('refs/heads/master', fixture.base, fixture.base),
    push('refs/heads/feature/research', fixture.base, head)
  ];
  for (const input of invalid) assert.equal(determineValidationMode({...input, root:fixture.root}), 'candidate');
  fixture.git(['update-ref', '-d', 'refs/remotes/origin/master']);
  assert.equal(determineValidationMode({...push('refs/heads/codex/research', fixture.base, head),
    root:fixture.root}), 'candidate');
});

test('malformed diff output and Git errors cannot emit a reduced-validation route', async () => {
  const {determineValidationMode} = await load();
  for (const diff of ['', 'docs/software-team/a.md', 'docs/software-team/a.md\0\0',
    'docs/software-team/a.md\0teams-captions-saver/runtime.js\0']) {
    const readGit = args => args[0] === 'rev-parse' ? 'b'.repeat(40)
      : args[0] === 'diff' ? diff : '';
    assert.equal(determineValidationMode({...pullRequest('a'.repeat(40)), readGit}), 'candidate');
  }
  assert.equal(determineValidationMode({...pullRequest('a'.repeat(40)),
    readGit:() => { throw new Error('missing history'); }}), 'candidate');
});

test('the CLI writes only a safe mode enum and missing event data falls back to candidate', async t => {
  const fixture = repository(t);
  fixture.write('scripts/validation-routing.mjs', fs.readFileSync(path.join(__dirname, '../scripts/validation-routing.mjs'), 'utf8'));
  fixture.write('docs/software-team/proposal.md');
  const head = fixture.commit('classifier and docs');
  const eventPath = path.join(fixture.root, 'synthetic-event.json');
  const outputPath = path.join(fixture.root, 'synthetic-output.txt');
  fs.writeFileSync(eventPath, JSON.stringify(push('refs/heads/master', fixture.base, head).event));
  const env = {...process.env, GITHUB_EVENT_PATH:eventPath, GITHUB_OUTPUT:outputPath,
    GITHUB_EVENT_NAME:'push', GITHUB_REF:'refs/heads/master'};
  const run = () => execFileSync(process.execPath, ['scripts/validation-routing.mjs'],
    {cwd:fixture.root, encoding:'utf8', env, windowsHide:true});
  assert.equal(run(), 'mode=nonshipping\n');
  fs.writeFileSync(eventPath, '{malformed event');
  assert.equal(run(), 'mode=candidate\n');
  fs.unlinkSync(eventPath);
  assert.equal(run(), 'mode=candidate\n');
  assert.equal(fs.readFileSync(outputPath, 'utf8'), 'mode=nonshipping\nmode=candidate\nmode=candidate\n');
});
