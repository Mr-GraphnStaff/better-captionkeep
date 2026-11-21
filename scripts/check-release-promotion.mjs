import {execFileSync} from 'node:child_process';
import {appendFileSync, existsSync, lstatSync, readFileSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;

// The tagged workflow intentionally checks out current protected policy inside
// the owner's working/ scratch boundary. Isolate only that verified checkout;
// the frozen-source dirty-tree check must still see every other change.
export function isolateTrustedPolicyCheckout({root, policyRoot, checkerPath} = {}) {
  root = realpathSync(root);
  const expected = path.join(root, 'working', 'release-policy');
  if (path.resolve(policyRoot) !== expected
      || ['working', 'working/release-policy', 'working/release-policy/scripts'].some(name => lstatSync(path.join(root, name)).isSymbolicLink())
      || realpathSync(policyRoot) !== expected) throw new Error('Unexpected or linked policy scratch path');
  const expectedChecker = path.join(expected, 'scripts', 'check-release-promotion.mjs');
  const checker = checkerPath || expectedChecker;
  if (path.resolve(checker) !== expectedChecker || !lstatSync(checker).isFile()
      || lstatSync(checker).isSymbolicLink() || realpathSync(checker) !== expectedChecker) {
    throw new Error('Unexpected or linked policy checker');
  }
  const git = (cwd, args) => execFileSync('git', args, {cwd, encoding:'utf8', windowsHide:true, timeout:10000}).trim();
  if (realpathSync(git(root, ['rev-parse', '--show-toplevel'])) !== root) throw new Error('Unexpected source Git toplevel');
  if (git(root, ['ls-files', '--', 'working/release-policy'])) throw new Error('Policy scratch contains tracked source');
  if (realpathSync(git(policyRoot, ['rev-parse', '--show-toplevel'])) !== expected
      || git(policyRoot, ['rev-parse', 'HEAD']) !== git(root, ['rev-parse', 'refs/remotes/origin/master'])) {
    throw new Error('Policy scratch is not the fetched protected production checkout');
  }
  if (git(policyRoot, ['status', '--porcelain', '--untracked-files=all'])) {
    throw new Error('Policy scratch contains unreviewed changes');
  }
  git(policyRoot, ['ls-files', '--error-unmatch', '--', 'scripts/check-release-promotion.mjs']);
  const exclude = path.resolve(root, git(root, ['rev-parse', '--git-path', 'info/exclude']));
  const parent = path.dirname(exclude), parentStat = lstatSync(parent);
  const fileStat = lstatSync(exclude, {throwIfNoEntry:false});
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || realpathSync(parent) !== parent
      || (fileStat && (!fileStat.isFile() || fileStat.isSymbolicLink()))) throw new Error('Linked or nonregular Git exclusion path');
  const before = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
  const rule = '/working/release-policy/';
  if (!before.split(/\r?\n/).includes(rule)) appendFileSync(exclude, `${before.endsWith('\n') || !before ? '' : '\n'}# Verified release-policy scratch checkout only\n${rule}\n`, 'utf8');
  return {excluded:rule};
}

export function validateReleasePromotion({repository, readGit, readPullRequests} = {}) {
  if (typeof repository !== 'string' || !REPOSITORY.test(repository)
      || typeof readGit !== 'function' || typeof readPullRequests !== 'function') {
    throw new Error('Repository and trusted Git/PR evidence readers are required');
  }
  const head = readGit(['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  if (!SHA.test(head)) throw new Error('Missing full release source commit');
  const firstParent = readGit(['rev-list', '--first-parent', 'refs/remotes/origin/master'])
    .trim().split(/\s+/);
  if (!firstParent.every(value => SHA.test(value)) || !firstParent.includes(head)) {
    throw new Error('Release source must be on the production first-parent history');
  }
  const parents = readGit(['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/);
  if (parents.length !== 3 || parents[0] !== head || !parents.every(value => SHA.test(value))) {
    throw new Error('Release source must be an exact two-parent production merge');
  }
  const qaSource = parents[2];
  const headTree = readGit(['rev-parse', '--verify', `${head}^{tree}`]).trim();
  const qaTree = readGit(['rev-parse', '--verify', `${qaSource}^{tree}`]).trim();
  if (!SHA.test(headTree) || !SHA.test(qaTree) || headTree !== qaTree) {
    throw new Error('Release source differs from the merged QA source tree');
  }
  const pullRequests = readPullRequests(repository, head);
  if (!Array.isArray(pullRequests)) throw new Error('Merged pull-request evidence is unavailable');
  const promotion = pullRequests.find(pr => pr?.state === 'closed'
    && typeof pr.merged_at === 'string' && Number.isFinite(Date.parse(pr.merged_at))
    && pr.merge_commit_sha === head
    && pr.base?.repo?.full_name === repository && pr.head?.repo?.full_name === repository
    && pr.base.ref === 'master' && pr.head.ref === 'qa' && pr.head.sha === qaSource
    && Number.isSafeInteger(pr.number) && pr.number > 0);
  if (!promotion) throw new Error('Release source lacks a matching merged QA-to-production pull request');
  return {commit:head, qaCommit:qaSource, pullRequest:promotion.number};
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const options = {encoding:'utf8', windowsHide:true, timeout:30000, maxBuffer:16 * 1024 * 1024};
    const result = validateReleasePromotion({repository:process.env.GH_REPO || process.env.GITHUB_REPOSITORY,
      readGit:args => execFileSync('git', args, options),
      readPullRequests:(repository, head) => {
        const pages = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp',
          `repos/${repository}/commits/${head}/pulls`], options));
        if (!Array.isArray(pages) || !pages.every(Array.isArray)) {
          throw new Error('Invalid GitHub pull-request response');
        }
        return pages.flat();
      }});
    const root = realpathSync(process.cwd());
    const policyRoot = path.resolve(path.dirname(scriptPath), '..');
    if (policyRoot === path.join(root, 'working', 'release-policy')) {
      isolateTrustedPolicyCheckout({root, policyRoot, checkerPath:scriptPath});
    }
    console.log(`Release promotion verified: ${result.commit}, QA ${result.qaCommit}, PR #${result.pullRequest}`);
  } catch (error) {
    console.error(`Release packaging refused: ${error.message}`);
    process.exitCode = 1;
  }
}
