import {execFileSync} from 'node:child_process';
import {appendFile, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const FEATURE = /^(?:codex|feature|fix)\/[A-Za-z0-9_-][A-Za-z0-9_./-]*$/;
const validFeature = value => typeof value === 'string' && FEATURE.test(value)
  && !value.includes('..') && !value.includes('//') && !value.endsWith('/')
  && !value.endsWith('.') && !value.split('/').some(part => part.endsWith('.lock'));

function commit(readGit, ref) {
  const value = readGit(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  if (!SHA.test(value)) throw new Error(`Invalid or missing fetched commit: ${ref}`);
  return value;
}

// Run only from a trusted base checkout. Event fields select read-only Git refs;
// no candidate file, package command or candidate workflow is ever executed.
export function validatePromotion({eventName, repository, event, readGit} = {}) {
  if (eventName !== 'pull_request_target' || !REPOSITORY.test(repository || '')
      || typeof readGit !== 'function') throw new Error('Trusted pull-request promotion context is required');
  const pr = event?.pull_request;
  if (!Number.isSafeInteger(event?.number) || event.number <= 0 || !pr
      || pr.number !== event.number || pr.state !== 'open') {
    throw new Error('An open pull request with a valid number is required');
  }
  const base = pr.base?.ref;
  const head = pr.head?.ref;
  if (!['dev', 'qa', 'master'].includes(base)) throw new Error('Unknown promotion destination');
  if (pr.base?.repo?.full_name !== repository || pr.head?.repo?.full_name !== repository) {
    throw new Error('Promotions require branches from this repository');
  }
  if (!(base === 'dev' ? validFeature(head) : head === (base === 'qa' ? 'dev' : 'qa'))) {
    throw new Error(`Invalid promotion route into ${base}`);
  }
  if (!SHA.test(pr.base.sha || '') || !SHA.test(pr.head.sha || '')) {
    throw new Error('Full event source and destination commit identities are required');
  }
  const baseSha = commit(readGit, `refs/remotes/origin/${base}`);
  const headSha = commit(readGit, `refs/remotes/origin/${head}`);
  if (baseSha !== pr.base.sha || headSha !== pr.head.sha) {
    throw new Error('Pull-request event is stale: source or destination branch changed');
  }
  if (base === 'qa') {
    // A production fix must return to Development before the next candidate.
    const masterSha = commit(readGit, 'refs/remotes/origin/master');
    try {
      readGit(['merge-base', '--is-ancestor', masterSha, headSha]);
    } catch {
      throw new Error('Development must include current production before QA promotion');
    }
  }
  const mergeRef = `refs/pull/${event.number}/merge`;
  const mergeSha = commit(readGit, mergeRef);
    const parents = readGit(['rev-list', '--parents', '-n', '1', mergeSha]).trim().split(/\s+/);
    if (parents.length !== 3 || parents[0] !== mergeSha
        || parents[1] !== baseSha || parents[2] !== headSha) {
      throw new Error('Production merge preview does not match the current PR branches');
    }
  if (base === 'master') {
    const headTree = readGit(['rev-parse', '--verify', `${headSha}^{tree}`]).trim();
    const mergeTree = readGit(['rev-parse', '--verify', `${mergeSha}^{tree}`]).trim();
    if (!SHA.test(headTree) || !SHA.test(mergeTree) || headTree !== mergeTree) {
      throw new Error('Production would differ from the QA candidate; return the changes to QA');
    }
  }
  return {base, head, baseSha, headSha, mergeSha};
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const result = validatePromotion({eventName:process.env.GITHUB_EVENT_NAME,
      repository:process.env.GITHUB_REPOSITORY, event,
      readGit:args => execFileSync('git', args, {encoding:'utf8', windowsHide:true,
        timeout:10000, maxBuffer:1024 * 1024})});
    console.log(`Promotion route verified: ${result.head}@${result.headSha} -> ${result.base}@${result.baseSha}`);
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, `merge=${result.mergeSha}\nbase=${result.base}\n`);
    }
  } catch (error) {
    console.error(`Promotion refused: ${error.message}`);
    process.exitCode = 1;
  }
}
