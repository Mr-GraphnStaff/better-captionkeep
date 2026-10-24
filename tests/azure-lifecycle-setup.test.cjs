const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFile} = require('node:fs/promises');
const path = require('node:path');

function requireDevelopmentDependencyOrder(source) {
  const development = source.split('  - stage: Development')[1]?.split('  - stage: ReleaseCandidate')[0];
  assert(development,'Development validation stage is missing');
  const commands = [...development.matchAll(/^\s+- bash: (.+)$/gm)].map(match => match[1].trim());
  const install = commands.indexOf('npm ci');
  const helper = commands.indexOf('npm run setup:helper');
  const tests = commands.indexOf('npm test');
  assert(install >= 0 && helper > install && tests > helper,
    'Development must install both root and locked helper dependencies before npm test');
}

test('Azure Development installs locked helper dependencies before tests that import/package the SDK', async () => {
  const source = await readFile(path.resolve(__dirname,'../azure-pipelines-lifecycle.yml'),'utf8');
  requireDevelopmentDependencyOrder(source);
  assert.throws(() => requireDevelopmentDependencyOrder(source.replace(/^.*- bash: npm run setup:helper\r?\n/m,'')),
    /must install both root and locked helper dependencies/);
  const pkg = JSON.parse(await readFile(path.resolve(__dirname,'../package.json'),'utf8'));
  assert.match(pkg.scripts['setup:helper'],/^npm ci --prefix companion\/byomcp\b/);
  assert(pkg.scripts['setup:helper'].includes('--ignore-scripts'));
});

test('Azure candidate and production promotion boundaries remain separate from development setup', async () => {
  const lifecycle = await readFile(path.resolve(__dirname,'../azure-pipelines-lifecycle.yml'),'utf8');
  const candidate = lifecycle.split('  - stage: ReleaseCandidate')[1];
  assert(candidate.includes("startsWith(variables['Build.SourceBranch'], 'refs/heads/release/')"));
  assert(candidate.includes('- bash: npm run release:candidate'));
  const production = await readFile(path.resolve(__dirname,'../azure-pipelines.yml'),'utf8');
  assert(production.includes('trigger: none'));
  assert(production.includes('pr: none'));
  assert(production.includes('bck-store-production'));
  assert(!lifecycle.includes('npm run publish:'));
});
