const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('MCP container is a non-root production build with no embedded environment or evidence', () => {
  const dockerfile = read('packages/captionkeep-mcp/Dockerfile');
  const ignore = read('packages/captionkeep-mcp/.dockerignore');
  assert.match(dockerfile, /RUN npm ci/);
  assert.match(dockerfile, /npm prune --omit=dev/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /ENTRYPOINT \["node", "dist\/src\/http\.js"\]/);
  assert.match(ignore, /\.env\*/);
  assert.match(ignore, /\*\.pem/);
  assert.doesNotMatch(dockerfile, /COPY\s+\.\s+\./);
});

test('Azure MCP reference terminates insecure ingress and mounts customer evidence separately', () => {
  const bicep = read('deployment/azure/captionkeep-mcp-container-app.bicep');
  for (const setting of [
    'CAPTIONKEEP_MCP_PUBLIC_ORIGIN', 'CAPTIONKEEP_MCP_ISSUER',
    'CAPTIONKEEP_MCP_AUDIENCE', 'CAPTIONKEEP_MCP_TENANT_ID',
    'CAPTIONKEEP_MCP_JWKS_URI', 'CAPTIONKEEP_MCP_ALLOWED_CLIENT_IDS',
    'CAPTIONKEEP_MCP_REQUIRED_SCOPES'
  ]) assert(bicep.includes(setting), setting);
  assert.match(bicep, /allowInsecure:\s*false/);
  assert.match(bicep, /storageType:\s*'AzureFile'/);
  assert.match(bicep, /mountPath:\s*'\/evidence'/);
  assert.doesNotMatch(bicep, /secretRef|clientSecret|apiKey/i);
});

test('release candidate executes the MCP contract and deployment runbook records live limits', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['release:candidate'], /npm run test:mcp/);
  assert.match(pkg.scripts['release:candidate'], /npm run package:evidence-actions/);
  assert.match(pkg.scripts['release:candidate'], /npm run test:evidence-bundle/);
  const runbook = read('docs/CAPTIONKEEP-MCP-DEPLOYMENT.md');
  assert.match(runbook, /container runtime is not installed/i);
  assert.match(runbook, /real image build, scan, registry push/i);
});

test('Evidence Actions bundle is allowlisted, hashed, and documents customer connector ownership', () => {
  const packager = read('scripts/package-evidence-actions.mjs');
  const verifier = read('scripts/verify-release.mjs');
  const runbook = read('docs/ASSISTANT-BRIDGE-DEPLOYMENT.md');
  const launcher = read('packages/captionkeep-assistant-bridge/native-host/windows-launcher/Program.cs');
  const launcherProject = read('packages/captionkeep-assistant-bridge/native-host/windows-launcher/CaptionKeep.NativeHostLauncher.csproj');
  const launcherConfig = read('packages/captionkeep-assistant-bridge/native-host/windows-launcher/captionkeep-assistant-host.json.example');
  assert.match(packager, /captionKeepProvidesConnectors:false/);
  assert.match(packager, /package-lock\.json/);
  assert.match(packager, /BUNDLE-MANIFEST\.json/);
  assert.match(packager, /No LLM, customer connector, connector credential/);
  assert.match(verifier, /Evidence Actions artifact does not match its recorded digest and size/);
  assert.match(verifier, /Evidence Actions dependency-lock digest drifted/);
  assert.match(verifier, /Evidence Actions clean-install evidence is missing, stale, or incomplete/);
  assert.match(runbook, /does \*\*not\*\* provide an LLM, Jira, Azure DevOps/);
  assert.match(runbook, /User confirms/);
  assert.match(runbook, /User denies/);
  assert.match(runbook, /Connector missing/);
  assert.match(launcher, /CAPTIONKEEP_ASSISTANT_ADAPTER/);
  assert.match(launcher, /FileAttributes\.ReparsePoint/);
  assert.match(launcherProject, /PublishSingleFile/);
  assert.match(launcherConfig, /"adapterPath"/);
  assert.doesNotMatch(launcherConfig, /(?:token|secret)/i);
});
