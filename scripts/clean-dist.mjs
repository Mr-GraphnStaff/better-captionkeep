import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {assertBuildLaneCanReset} from './build-lane-guard.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = process.env.CAPTIONKEEP_TEST_DIST ? path.resolve(process.env.CAPTIONKEEP_TEST_DIST) : projectRoot;

// Development cleanup must never erase the retained released Production files.
// Both lanes must be disposable before either lane is changed.
for(const name of ['Dev','QA']) await assertBuildLaneCanReset(buildRoot,path.join(buildRoot,name));
for (const name of ['Dev', 'QA']) {
  const directory = path.join(buildRoot, name);
  if (path.dirname(directory) !== buildRoot) throw new Error('Build directory escapes project root.');
  await assertBuildLaneCanReset(buildRoot,directory);
  await rm(directory, {recursive:true, force:true});
  await mkdir(directory, {recursive:true});
}
await mkdir(path.join(buildRoot, 'Production'), {recursive:true});
console.log('Reset Dev and QA. Preserved Production.');
