import {readFile} from 'node:fs/promises';
import path from 'node:path';

export const releaseBrowsers=Object.freeze(['chrome','edge','brave','firefox','opera']);
export const releaseGates=Object.freeze(['fullScopeAcceptance','accessibilityAndFailureUat','artworkApproved',
  'unchangedWindow','storeApproval','publicParity','installedUpgrade']);

export function releaseStatePaths(version) {
  if(typeof version!=='string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
      || version.split('.').some(part=>Number(part)>65535)) throw new Error('Invalid release version');
  // The published 6.0.0 record and historical marker names are immutable compatibility routes.
  const key=version==='6.0.0'?'6.0':version;
  return {version,key,record:`docs/release-state/${key}.json`,
    documents:['readme.md',`docs/RELEASE-${key}.md`,'docs/wiki/Release-Status.md'],
    start:`<!-- captionkeep-${key}-status:start -->`,end:`<!-- captionkeep-${key}-status:end -->`};
}

export async function readReleaseState(root,{version,read=readFile}={}) {
  const selected=version ?? JSON.parse(await read(path.join(root,'teams-captions-saver/manifest.json'),'utf8')).version;
  const routes=releaseStatePaths(selected);
  const record=JSON.parse(await read(path.join(root,routes.record),'utf8'));
  if(record.version!==selected) throw new Error('Release record version does not match its selected identity');
  return {record,routes};
}

export function createDevelopmentRelease(version,{boardEpic,branch='dev'}={}) {
  releaseStatePaths(version);
  if(!Number.isInteger(boardEpic)||boardEpic<=0) throw new Error('An authoritative Board epic is required');
  if(typeof branch!=='string'||!/^[A-Za-z0-9_][A-Za-z0-9_.\/-]*$/.test(branch)
      ||branch.includes('..')||branch.endsWith('/')) throw new Error('Invalid development source branch');
  return {product:'Better CaptionKeep',version,branch,state:'development',
    candidate:{frozen:false,commit:null,hashes:{}},requiredBrowsers:[...releaseBrowsers],
    liveCertification:Object.fromEntries(releaseBrowsers.map(browser=>[browser,'pending'])),
    releaseGates:Object.fromEntries(releaseGates.map(gate=>[gate,false])),boardEpic,deferredFeatures:['byomcp']};
}
