import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(projectRoot, 'dist', 'prod', 'evidence-actions');
const rootPackage = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const artifactName = `better-captionkeep-evidence-actions-${rootPackage.version}-dev.zip`;
const artifactPath = path.join(outputDir, artifactName);
const temporaryPath = `${artifactPath}.partial`;
const provenancePath = path.join(outputDir, 'evidence-actions-provenance.json');

const staticEntries = [
  ['LICENSE', 'LICENSE'],
  ['docs/EVIDENCE-ACTIONS.md', 'docs/EVIDENCE-ACTIONS.md'],
  ['docs/ASSISTANT-BRIDGE-PROTOCOL.md', 'docs/ASSISTANT-BRIDGE-PROTOCOL.md'],
  ['docs/ASSISTANT-BRIDGE-DEPLOYMENT.md', 'docs/ASSISTANT-BRIDGE-DEPLOYMENT.md'],
  ['docs/CAPTIONKEEP-MCP-DEPLOYMENT.md', 'docs/CAPTIONKEEP-MCP-DEPLOYMENT.md'],
  ['deployment/azure/captionkeep-mcp-container-app.bicep', 'deployment/azure/captionkeep-mcp-container-app.bicep'],
  ['packages/captionkeep-assistant-bridge/package.json', 'assistant-bridge/package.json'],
  ['packages/captionkeep-assistant-bridge/package-lock.json', 'assistant-bridge/package-lock.json'],
  ['packages/captionkeep-assistant-bridge/README.md', 'assistant-bridge/README.md'],
  ['packages/captionkeep-mcp/package.json', 'mcp-server/package.json'],
  ['packages/captionkeep-mcp/package-lock.json', 'mcp-server/package-lock.json'],
  ['packages/captionkeep-mcp/README.md', 'mcp-server/README.md'],
  ['packages/captionkeep-mcp/Dockerfile', 'mcp-server/Dockerfile'],
  ['packages/captionkeep-mcp/.dockerignore', 'mcp-server/.dockerignore']
];

async function filesUnder(relativeRoot, destinationRoot, accept) {
  const absoluteRoot = path.join(projectRoot, relativeRoot);
  const output = [];
  async function walk(relative = '') {
    for (const entry of await readdir(path.join(absoluteRoot, relative), {withFileTypes:true})) {
      const next = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile() && accept(next.replaceAll('\\', '/'))) {
        output.push([path.join(relativeRoot, next), path.join(destinationRoot, next).replaceAll('\\', '/')]);
      }
    }
  }
  await walk();
  return output;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

const entries = [
  ...staticEntries,
  ...await filesUnder('packages/captionkeep-assistant-bridge/dist/src', 'assistant-bridge/dist/src', file => /\.(?:js|d\.ts)$/.test(file)),
  ...await filesUnder('packages/captionkeep-assistant-bridge/examples', 'assistant-bridge/examples', file => file.endsWith('.mjs')),
  ...await filesUnder('packages/captionkeep-assistant-bridge/native-host', 'assistant-bridge/native-host', file =>
    !/(?:^|\/)(?:bin|obj)\//.test(file)
      && (/\.(?:json|ps1|cs|csproj|exe)$/.test(file) || file.endsWith('.json.example'))),
  ...await filesUnder('packages/captionkeep-mcp/dist/src', 'mcp-server/dist/src', file => /\.(?:js|d\.ts)$/.test(file))
];

const destinations = entries.map(([, destination]) => destination);
if (new Set(destinations).size !== destinations.length) throw new Error('Evidence Actions bundle contains duplicate destinations.');
if (destinations.some(value => /(?:^|\/)(?:node_modules|test|src|bin|obj)(?:\/|$)|\.env|\.pem$/i.test(value)
  && !value.includes('/dist/src/'))) {
  throw new Error('Evidence Actions bundle allowlist contains a forbidden path.');
}

const contentManifest = {
  format:'better-captionkeep-evidence-actions-bundle',
  version:1,
  productVersion:rootPackage.version,
  connectorOwnership:'customer',
  captionKeepProvidesConnectors:false,
  contents:destinations.sort()
};

await mkdir(outputDir, {recursive:true});
await rm(temporaryPath, {force:true});
await new Promise((resolve, reject) => {
  const output = createWriteStream(temporaryPath, {flags:'wx'});
  const archive = new ZipArchive({zlib:{level:9}});
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('warning', reject);
  archive.on('error', reject);
  archive.pipe(output);
  for (const [source, destination] of entries) archive.file(path.join(projectRoot, source), {name:destination});
  archive.append(`${JSON.stringify(contentManifest, null, 2)}\n`, {name:'BUNDLE-MANIFEST.json'});
  archive.finalize().catch(reject);
});
await rm(artifactPath, {force:true});
await rename(temporaryPath, artifactPath);

const artifactBytes = await readFile(artifactPath);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:projectRoot, encoding:'utf8', windowsHide:true}).trim();
const provenance = {
  format:'better-captionkeep-evidence-actions-provenance',
  version:1,
  productVersion:rootPackage.version,
  commit,
  createdAt:new Date().toISOString(),
  artifact:{
    path:path.relative(projectRoot, artifactPath).replaceAll('\\', '/'),
    bytes:(await stat(artifactPath)).size,
    sha256:digest(artifactBytes)
  },
  dependencyLocks:{
    assistantBridgeSha256:digest(await readFile(path.join(projectRoot, 'packages/captionkeep-assistant-bridge/package-lock.json'))),
    mcpServerSha256:digest(await readFile(path.join(projectRoot, 'packages/captionkeep-mcp/package-lock.json')))
  },
  limitations:[
    'No LLM, customer connector, connector credential, tenant identity, or meeting evidence is included.',
    'Live customer deployment and Chrome/Edge UAT remain separate release evidence.'
  ]
};
await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(provenance, null, 2));
