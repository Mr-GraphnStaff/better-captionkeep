import {execFileSync} from 'node:child_process';
import {appendFile, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// This is a Development-validation boundary, not a publishing or frozen-source
// allowlist. The release workflow and candidate/Store identity guards stay intact.
export const NONSHIPPING_CONTROL_FILES = Object.freeze([
  '.github/workflows/validate.yml',
  '.github/workflows/promotion.yml',
  '.github/workflows/release.yml',
  'scripts/check-promotion.mjs',
  'scripts/check-release-promotion.mjs',
  'tests/promotion-policy.test.cjs',
  'tests/release-promotion.test.cjs',
  'tests/reliability.test.cjs',
  'scripts/validation-routing.mjs',
  'tests/validation-routing.test.cjs',
  'deployment/intune/Enterprise-Setup.ps1',
  'deployment/intune/Enterprise-Endpoint.ps1',
  'deployment/intune/Enterprise-Launcher.ps1',
  'scripts/build-enterprise-package.mjs',
  'tests/enterprise-setup.test.cjs',
  'tests/enterprise-launcher.test.cjs',
  'tests/enterprise-endpoint-verification.test.cjs',
  'tests/fixtures/enterprise-registry-harness.ps1',
  'docs/wiki/Deployment-Security-and-Permissions.md',
  'docs/wiki/Administrator-Deployment.md'
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

export function isAdminBuildCommandOnly(beforeText, afterText) {
  const before = JSON.parse(beforeText), after = JSON.parse(afterText);
  const command = 'node scripts/build-enterprise-package.mjs';
  if (!before.scripts || !after.scripts || after.scripts['build:enterprise-setup'] !== command
      || (before.scripts['build:enterprise-setup'] !== undefined && before.scripts['build:enterprise-setup'] !== command)) return false;
  delete before.scripts['build:enterprise-setup'];
  delete after.scripts['build:enterprise-setup'];
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(before)) === JSON.stringify(canonical(after));
}

export function isAdminReadmeOnly(beforeText, afterText) {
  const start='<!-- administrator-setup-pilot:start -->',end='<!-- administrator-setup-pilot:end -->';
  const split=text=>{
    const starts=text.split(start).length-1,ends=text.split(end).length-1;
    if (!starts&&!ends) return {outside:text.trimEnd(),block:''};
    if (starts!==1||ends!==1||text.indexOf(end)<text.indexOf(start)) throw new Error('Malformed administrator README block');
    const block=text.slice(text.indexOf(start),text.indexOf(end)+end.length);
    return {outside:text.replace(block,'').trimEnd(),block};
  };
  const before=split(beforeText),after=split(afterText);
  return before.outside===after.outside && /pilot/i.test(after.block) && after.block.includes('Start-Setup.cmd')
    && after.block.includes('docs/wiki/Administrator-Deployment.md')
    && after.block.includes('docs/wiki/Deployment-Security-and-Permissions.md');
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
      } else if (typeof ref === 'string' && (ref.startsWith('refs/heads/codex/')
          || ref === 'refs/heads/dev' || ref === 'refs/heads/qa')) {
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
    const paths = diff.slice(0, -1).split('\0');
    // Admin tooling has its own executed tests/package checks; this narrow npm
    // convenience command must not allow dependency or extension-build changes.
    if (paths.some(name=>name==='package.json'||name==='readme.md')
        && paths.every(name => name === 'package.json' || name === 'readme.md' || isNonshippingPath(name))
        && (!paths.includes('package.json') || isAdminBuildCommandOnly(readGit(['show', `${base}:package.json`]), readGit(['show', `${head}:package.json`])))
        && (!paths.includes('readme.md') || isAdminReadmeOnly(readGit(['show', `${base}:readme.md`]), readGit(['show', `${head}:readme.md`])))) return 'nonshipping';
    return classifyChangedPaths(paths);
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
