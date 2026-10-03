import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const sourceDir = path.join(projectRoot, 'teams-captions-saver');
const manifestsDir = path.join(projectRoot, 'manifests');
const canonicalDist = path.join(projectRoot, 'dist');
const devDir = path.join(canonicalDist, 'dev');
const uatDir = path.join(canonicalDist, 'uat');
const prodDir = path.join(canonicalDist, 'prod');
const DEV_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAos0GuSScxwgzbTlJj4+zX7kkKq13nZpSIHP3FBm73Mjgjj1wYlmyAyb+bPi2sV9H3VPRGpja2Nn/4ACJ5YemK0rEvyqLEDbRl4cbIT4P+9B2LFnKMHMLTGba9pVI6t6nGG50CDhVLdHQj1Bn2hygi9EAmygFTK4BXap8qtPmd//vXlOUY2Emt1Qb1IusZY3q7WXxn5Zklx5S8gDcDPbi4XLmB9qmDuKA7lGsQYannLOQTKS/H6WpJvNMYR/abTmfxmhiEYD53ZwCTTaYJ7t747dm2M15T7hNTsvLLiEQV+3iY+6mKGFbBKHeUTqL/LjDIDpj3VAt+jQhTO8Fd24epQIDAQAB';
const UAT_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmSxpyAJ/mAN0vL+TWksWy3QEdjWiO7F440uqHoPX7tYFX0kVNMMp9Xgl6juMKX47ANPBZjwWhSRc8uZlaneF/lYooxKV3vee/uH5YaBLzQ60ejLr1XZb4jOsOhM3Xz+aaKDPfSDx4epZHZKGZ92XgSNjEuafdkT/4TMCqyYjQm/eeqCjLBA4ktHTXG5R313nrEh+DzEqX+tXArlDYmXPnxDsycqVjZmqfXTfMBzsmaDFgmu7zbp04wZToHIGKg4u/KPYrhe3cmn5Na29V/rbl1LoRl0r/fskAa6aP6srVQeSUd8K9c6OoSNyElhWv0HsWAut9QCVaEa5PjiqQUy0ZwIDAQAB';
const defaultTargets = ['dev', 'uat'];
const targetManifests = new Map([
  ['dev', path.join(sourceDir, 'manifest.json')],
  ['uat', path.join(sourceDir, 'manifest.json')],
  ['chrome-store', path.join(manifestsDir, 'manifest.chrome-store.json')]
]);

function selectTargets(requestedTarget) {
  if (!requestedTarget) return defaultTargets;
  if (!targetManifests.has(requestedTarget)) {
    throw new Error(`Unsupported browser target: ${requestedTarget}`);
  }
  return [requestedTarget];
}

async function stageTarget(target) {
  const targetDir = target === 'dev'
    ? devDir
    : target === 'uat'
      ? uatDir
      : path.join(prodDir, 'chrome-store-unpacked');
  const manifestPath = targetManifests.get(target);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  await rm(targetDir, { recursive: true, force: true });
  if (target === 'chrome-store') {
    await rm(path.join(prodDir, 'chrome-store'), { recursive: true, force: true });
  }
  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, targetDir, {
    recursive: true,
    filter(sourcePath) {
      return path.basename(sourcePath).toLowerCase() !== 'manifest.json';
    }
  });
  if (target === 'dev' || target === 'uat') {
    const isUat = target === 'uat';
    manifest.name = isUat ? 'Better CaptionKeep - UAT Release Candidate' : 'Better CaptionKeep - Development';
    manifest.version_name = `${manifest.version} ${isUat ? 'uat release candidate' : 'development'} - Verified Teams transcript`;
    manifest.action.default_title = manifest.name;
    manifest.key = isUat ? UAT_KEY : DEV_KEY;
    const popupPath = path.join(targetDir, 'popup.html');
    const popup = await readFile(popupPath, 'utf8');
    const testPopup = popup
      .replace('id="graphTranscriptSection" hidden open', 'id="graphTranscriptSection" open');
    if (testPopup === popup) throw new Error(`Could not expose the ${target} controls.`);
    await writeFile(popupPath, testPopup, 'utf8');
  }
  await writeFile(
    path.join(targetDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
  console.log(`Staged ${target} extension at ${targetDir}`);
}

const targets = selectTargets(process.argv[2]?.toLowerCase());
for (const target of targets) {
  await stageTarget(target);
}
