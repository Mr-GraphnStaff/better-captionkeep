import {readFile,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDevelopmentRelease,releaseStatePaths} from './release-state.mjs';
import {renderReleaseStatus,validateReleaseStatus} from './release-status.mjs';

const defaultRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const versionFiles=['package.json','package-lock.json','teams-captions-saver/manifest.json',
  'manifests/manifest.chrome-store.json','store-metadata/chrome.json'];

function replaceVersion(text,property,before,after) {
  const expression=new RegExp(`(^[ \\t]*"${property}"[ \\t]*:[ \\t]*")[^"]+("[ \\t]*[,}]?)`,'m');
  const match=expression.exec(text);
  if(!match || JSON.parse('"'+match[0].split('"')[3]+'"')!==before) throw new Error(`Unexpected ${property} field before version synchronization`);
  return text.replace(expression,(_,prefix,suffix)=>prefix+after+suffix);
}

async function assertAbsent(filename) {
  try { await access(filename); } catch(error) { if(error.code==='ENOENT') return;throw error; }
  throw new Error(`Release initialization never overwrites an existing record or document: ${filename}`);
}

export async function initializeRelease({root=defaultRoot,version,boardEpic,branch='dev',activate=false}={}) {
  const record=createDevelopmentRelease(version,{boardEpic,branch});
  validateReleaseStatus(record,version);
  const routes=releaseStatePaths(version);
  await assertAbsent(path.join(root,routes.record));
  await assertAbsent(path.join(root,routes.documents[1]));
  const active=JSON.parse(await readFile(path.join(root,'teams-captions-saver/manifest.json'),'utf8')).version;
  releaseStatePaths(active);
  const compare=(a,b)=>a.split('.').map(Number).reduce((result,value,index)=>result||Math.sign(value-Number(b.split('.')[index])),0);
  if(compare(version,active)<=0) throw new Error('A new release must advance the active source version');
  const updates=[];
  if(activate) for(const filename of versionFiles) {
    let text=await readFile(path.join(root,filename),'utf8');
    const value=JSON.parse(text),property=filename==='store-metadata/chrome.json'?'manifestVersion':'version';
    if(value[property]!==active) throw new Error(`Version source differs before activation: ${filename}`);
    text=replaceVersion(text,property,active,version);
    if(filename==='package-lock.json') {
      if(value.packages?.['']?.version!==active) throw new Error('Lockfile root package version differs before activation');
      const match=/("packages"\s*:\s*\{\s*""\s*:\s*\{[\s\S]*?"version"\s*:\s*")[^"]+("[\s,])/.exec(text);
      if(!match) throw new Error('Missing lockfile root package version');
      text=text.replace(match[0],match[1]+version+match[2]);
    }
    updates.push([filename,text]);
  }
  const status=renderReleaseStatus(record);
  for(const filename of [routes.documents[0],routes.documents[2]]) {
    const text=await readFile(path.join(root,filename),'utf8');
    if(text.includes(routes.start)||text.includes(routes.end)) throw new Error(`New release status already exists: ${filename}`);
    updates.push([filename,text.trimEnd()+`\n\n${status}\n`]);
  }
  const dossier=await readFile(path.join(root,'CHROMEWEBSTORE.md'),'utf8');
  updates.push(['CHROMEWEBSTORE.md',dossier.trimEnd()+`\n\n**${version} Development preparation:** Microsoft 365 administrator setup is being prepared through the protected Dev, QA and Production lanes. This source version is not a frozen candidate or a Store submission. Earlier release approvals and owner exceptions do not apply; acceptance, artwork, publication and upgrade gates remain pending in [the ${version} release record](${routes.record}).\n`]);
  // All source identities and destinations are checked before the first write. Historical
  // records are never opened for writing; no hashes, acceptance or owner exception are copied.
  await writeFile(path.join(root,routes.record),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
  await writeFile(path.join(root,routes.documents[1]),`# Better CaptionKeep ${version}\n\nDevelopment scope: Microsoft 365 administrator setup. This is not a frozen candidate or publication approval.\n\n${status}\n`,{flag:'wx'});
  for(const [filename,text] of updates) await writeFile(path.join(root,filename),text,'utf8');
  return {version,boardEpic,record:routes.record,activated:activate,updated:updates.map(([filename])=>filename)};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [command,version,...args]=process.argv.slice(2);
  const value=flag=>{const index=args.indexOf(flag);return index<0?undefined:args[index+1];};
  if(command!=='init'||!version||args.some((argument,index)=>argument.startsWith('--')
      &&!['--board-epic','--branch','--activate'].includes(argument)))
    throw new Error('Usage: node scripts/release-lifecycle.mjs init X.Y.Z --board-epic ID [--branch dev] [--activate]');
  console.log(JSON.stringify(await initializeRelease({version,boardEpic:Number(value('--board-epic')),
    branch:value('--branch')||'dev',activate:args.includes('--activate')})));
}
