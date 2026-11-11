import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;

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
    console.log(`Release promotion verified: ${result.commit}, QA ${result.qaCommit}, PR #${result.pullRequest}`);
  } catch (error) {
    console.error(`Release packaging refused: ${error.message}`);
    process.exitCode = 1;
  }
}
