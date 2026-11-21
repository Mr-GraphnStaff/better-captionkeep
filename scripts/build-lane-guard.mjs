import {lstat,readdir,readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const sourceGraph=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../teams-captions-saver/graphRuntimeConfig.js');
const protectedName=/^(?:administrator-setup(?:[-.].*)?|administratorsetup|admin-browser-integration|operations|receipts|native-host-registration|recovery|preserved|receipt\.json|registry-before\.json|registration-receipt\.json)$/i;
const safeAlternative='Use an empty staging directory inside working/ through CAPTIONKEEP_TEST_DIST; preserve existing packages, private configuration and recovery records.';

function versionParts(value,description) {
  if(typeof value!=='string'||!/^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,3}$/.test(value))
    throw new Error(`Build version is unknown or invalid for ${description}. ${safeAlternative}`);
  const parts=value.split('.').map(Number);
  if(parts.some(part=>!Number.isInteger(part)||part>65535))
    throw new Error(`Build version is unknown or invalid for ${description}. ${safeAlternative}`);
  return [...parts,...Array(4-parts.length).fill(0)];
}

function isOlderVersion(candidate,current) {
  for(let index=0;index<candidate.length;index++) {
    if(candidate[index]!==current[index]) return candidate[index]<current[index];
  }
  return false;
}

async function assertLaneVersion(directory,candidate,requireManifest=true) {
  const stat=await statIfPresent(directory);
  if(!stat) return;
  const entries=await readdir(directory,{withFileTypes:true});
  const manifest=entries.find(entry=>entry.name==='manifest.json');
  if(requireManifest&&entries.length&&!manifest) throw new Error(`Existing lane version is unknown: ${directory}. ${safeAlternative}`);
  if(manifest) {
    let current;
    try { current=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8')).version; }
    catch { throw new Error(`Existing lane version is unknown: ${directory}. ${safeAlternative}`); }
    if(isOlderVersion(candidate,versionParts(current,directory)))
      throw new Error(`Build refuses a version downgrade of ${directory} from ${current}. ${safeAlternative}`);
  }
  // Replacing Production also replaces any browser sub-lanes it contains.
  for(const entry of entries) if(entry.isDirectory()) {
    const nested=path.join(directory,entry.name);
    await assertLaneVersion(nested,candidate,false);
  }
}

// Check the entire build plan before the first selected lane can be replaced.
// Isolated WIP builds remain available only inside this checkout's working area.
export async function assertBuildSourceCanStage(projectDirectory,buildDirectory,plans) {
  const project=path.resolve(projectDirectory),build=path.resolve(buildDirectory);
  await assertUnlinkedAncestors(build);
  let sourceVersion;
  try { sourceVersion=JSON.parse(await readFile(path.join(project,'teams-captions-saver/manifest.json'),'utf8')).version; }
  catch { throw new Error(`Build source version is unknown. ${safeAlternative}`); }
  versionParts(sourceVersion,'extension source');
  for(const plan of plans) {
    versionParts(plan.manifest?.version,plan.targetDirectory);
    if(plan.manifest.version!==sourceVersion)
      throw new Error(`Target manifest version does not match extension source version for ${plan.targetDirectory}. ${safeAlternative}`);
  }
  if(path.relative(project,build)) {
    const relative=path.relative(path.join(project,'working'),build);
    if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))
      throw new Error(`Isolated build output must remain inside this checkout's working/ directory. ${safeAlternative}`);
    return;
  }
  let status;
  try {
    const options={cwd:project,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']};
    const gitRoot=execFileSync('git',['rev-parse','--show-toplevel'],options).trim();
    if(path.relative(await realpath(project),await realpath(gitRoot))) throw new Error('Different Git root');
    status=execFileSync('git',['--no-optional-locks','-c','core.fsmonitor=false','status','--porcelain=v1','--untracked-files=normal'],options);
  } catch { throw new Error(`Canonical lane rebuild requires a verified source Git checkout. ${safeAlternative}`); }
  if(status.trim()) throw new Error(`Canonical lane rebuild refuses dirty source. Preserve and checkpoint the source first. ${safeAlternative}`);
  for(const plan of plans) {
    await assertBuildLaneCanReset(build,plan.targetDirectory);
    await assertLaneVersion(plan.targetDirectory,versionParts(plan.manifest.version,plan.targetDirectory));
  }
}

async function statIfPresent(filename) {
  try { return await lstat(filename); } catch(error) { if(error.code==='ENOENT') return null;throw error; }
}

async function assertUnlinkedAncestors(filename) {
  let current=path.resolve(filename);
  while(true) {
    const stat=await statIfPresent(current);
    if(stat?.isSymbolicLink()) throw new Error(`Build deletion refuses a linked path: ${current}. ${safeAlternative}`);
    const parent=path.dirname(current);
    if(parent===current) break;
    current=parent;
  }
}

// This is a refusal guard, never a cleanup or migration tool. Read the complete target
// before any recursive deletion so an embedded administrator installation is not disposable.
export async function assertBuildLaneCanReset(buildRoot,targetDirectory) {
  const root=path.resolve(buildRoot),target=path.resolve(targetDirectory);
  const relative=path.relative(root,target);
  if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))
    throw new Error('Build deletion target escapes its selected output root.');
  await assertUnlinkedAncestors(target);
  const stat=await statIfPresent(target);
  if(!stat) return;
  if(!stat.isDirectory()) throw new Error(`Build output is not an ordinary directory: ${target}. ${safeAlternative}`);
  const actualRoot=await realpath(root),actualTarget=await realpath(target);
  const actualRelative=path.relative(actualRoot,actualTarget);
  if(!actualRelative||actualRelative==='..'||actualRelative.startsWith(`..${path.sep}`)||path.isAbsolute(actualRelative))
    throw new Error('Resolved build deletion target escapes its selected output root.');
  let defaultGraph;
  async function inspect(directory) {
    const entries=await readdir(directory,{withFileTypes:true});
    for(const entry of entries) {
      if(entry.isSymbolicLink()) throw new Error(`Build deletion refuses linked content: ${path.join(directory,entry.name)}. ${safeAlternative}`);
      if(protectedName.test(entry.name)) throw new Error(`Build deletion would discard administrator or recovery material: ${path.join(directory,entry.name)}. ${safeAlternative}`);
      if(entry.name.toLowerCase()==='graphruntimeconfig.js') {
        defaultGraph ??= await readFile(sourceGraph);
        if(!entry.isFile() || !(await readFile(path.join(directory,entry.name))).equals(defaultGraph))
          throw new Error(`Build deletion would discard a private Graph overlay: ${path.join(directory,entry.name)}. ${safeAlternative}`);
      }
    }
    for(const entry of entries) if(entry.isDirectory()) await inspect(path.join(directory,entry.name));
  }
  await inspect(target);
}
