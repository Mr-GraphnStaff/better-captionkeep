import {execFileSync} from 'node:child_process';
import {appendFile, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// This is a Development-validation boundary, not a publishing or frozen-source
// allowlist. The release workflow and candidate/Store identity guards stay intact.
export const NONSHIPPING_CONTROL_FILES = Object.freeze([
  '.github/workflows/validate.yml',
  'scripts/validation-routing.mjs',
  'tests/validation-routing.test.cjs'
]);

const controlFiles = new Set(NONSHIPPING_CONTROL_FILES);
const SHA = /^[a-f0-9]{40}$/i;
const validCommit = value => typeof value === 'string' && SHA.test(value) && !/^0+$/.test(value);
const releaseBranch = value => typeof value === 'string'
  && value.replace(/^refs\/heads\//, '').startsWith('release/');
const branchName = value => typeof value === 'string' && value.length > 0
  && !/[\s\u0000-\u001f\u007f]/.test(value) && !value.includes('..');

export function isNonshippingPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes(':')
      || /[\u0000-\u001f\u007f]/.test(value)) return false;
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return false;
  return controlFiles.has(value) || value.startsWith('.agents/skills/software-team/')
    || value.startsWith('docs/software-team/');
}

export function classifyChangedPaths(paths) {
  return Array.isArray(paths) && paths.length > 0 && paths.every(isNonshippingPath)
    ? 'nonshipping' : 'candidate';
}

function gitReader(root) {
  return args => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args],
    {cwd:root, encoding:'utf8', windowsHide:true, timeout:10000, maxBuffer:16 * 1024 * 1024});
}

export function determineValidationMode({eventName, ref, event, root,
  readGit = root ? gitReader(root) : undefined} = {}) {
  try {
    if (!event || typeof event !== 'object' || typeof readGit !== 'function') return 'candidate';
    const pr = event.pull_request;
    if ([ref, pr?.head?.ref, pr?.base?.ref].some(releaseBranch)) return 'candidate';
    const head = readGit(['rev-parse', '--verify', 'HEAD^{commit}']).trim();
    if (!validCommit(head)) return 'candidate';
    let base;
    if (eventName === 'pull_request') {
      if (!branchName(pr?.head?.ref) || !branchName(pr?.base?.ref)
          || !validCommit(pr?.base?.sha)) return 'candidate';
      base = pr.base.sha;
    } else if (eventName === 'push') {
      if (event.ref !== ref || !validCommit(event.after) || event.after !== head) return 'candidate';
      if (ref === 'refs/heads/master') {
        if (!validCommit(event.before)) return 'candidate';
        base = event.before;
      } else if (typeof ref === 'string' && ref.startsWith('refs/heads/codex/')) {
        // Compare the complete branch, not only event.before: a final docs commit
        // must not hide an earlier runtime commit on the same branch.
        const bases = readGit(['merge-base', '--all', 'refs/remotes/origin/master', head])
          .trim().split(/\r?\n/);
        if (bases.length !== 1 || !validCommit(bases[0])) return 'candidate';
        [base] = bases;
      } else return 'candidate';
    } else return 'candidate';

    readGit(['cat-file', '-e', `${base}^{commit}`]);
    readGit(['merge-base', '--is-ancestor', base, head]);
    const diff = readGit(['diff', '--name-only', '-z', '--no-renames', '--no-ext-diff',
      '--no-textconv', base, head, '--']);
    if (!diff || !diff.endsWith('\0')) return 'candidate';
    return classifyChangedPaths(diff.slice(0, -1).split('\0'));
  } catch {
    // Unknown events, unavailable history and Git failures never reduce checks.
    return 'candidate';
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  let mode = 'candidate';
  try {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    mode = determineValidationMode({eventName:process.env.GITHUB_EVENT_NAME,
      ref:process.env.GITHUB_REF, event, root:path.resolve(path.dirname(scriptPath), '..')});
  } catch {
    // Malformed/missing event data has the same full-validation fallback.
  }
  const output = `mode=${mode === 'nonshipping' ? 'nonshipping' : 'candidate'}\n`;
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output);
  process.stdout.write(output);
}
