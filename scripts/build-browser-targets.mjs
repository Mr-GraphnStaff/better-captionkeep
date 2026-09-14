import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const sourceDir = path.join(projectRoot, 'teams-captions-saver');
const manifestsDir = path.join(projectRoot, 'manifests');
const distDir = path.join(projectRoot, 'dist');
const supportedTargets = new Set(['chrome', 'edge']);

function selectTargets(requestedTarget) {
  if (!requestedTarget) return [...supportedTargets];
  if (!supportedTargets.has(requestedTarget)) {
    throw new Error(`Unsupported browser target: ${requestedTarget}`);
  }
  return [requestedTarget];
}

async function stageTarget(target) {
  const targetDir = path.join(distDir, `${target}-unpacked`);
  const manifestPath = path.join(manifestsDir, `manifest.${target}.json`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, targetDir, {
    recursive: true,
    filter(sourcePath) {
      return path.basename(sourcePath).toLowerCase() !== 'manifest.json';
    }
  });
  await writeFile(
    path.join(targetDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  console.log(`Staged ${target} test extension at ${targetDir}`);
}

const targets = selectTargets(process.argv[2]?.toLowerCase());
for (const target of targets) {
  await stageTarget(target);
}
