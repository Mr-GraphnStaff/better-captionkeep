import path from 'node:path';
import {mkdir,readFile,writeFile,copyFile,lstat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';

export const CONTENT_PREP_SHA256='c1ba45b5cb939e84af064bb7ff4b38fb3dfe33c8dc1078fd9b157672eae671f6';
export const ENDPOINT_PUBLISHER='DAVID ANTHONY FARRIS';
const digest=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
export async function buildEndpointWin32Package(enterpriseDirectory,{toolPath=process.env.BCK_INTUNE_CONTENT_PREP}={}){
  if(!process.env.AGENT_WORKING_DIR)throw Error('Managed package run required.');
  if(!toolPath||await digest(toolPath)!==CONTENT_PREP_SHA256)throw Error('Use the pinned official Microsoft Win32 Content Prep Tool.');
  const enterprise=path.resolve(enterpriseDirectory),worker=path.join(enterprise,'EndpointWorker.exe');
  if((await lstat(worker)).isSymbolicLink())throw Error('Linked endpoint executable.');
  const work=path.join(process.env.AGENT_WORKING_DIR,'endpoint-win32-'+randomUUID());
  const source=path.join(work,'source'),output=path.join(work,'output');
  await mkdir(source,{recursive:true});await mkdir(output,{recursive:true});
  await copyFile(worker,path.join(source,'EndpointWorker.exe'));
  await new Promise((resolve,reject)=>{const child=spawn(toolPath,['-c',source,'-s','EndpointWorker.exe','-o',output,'-q'],{env:process.env,windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`Microsoft content preparation exited ${code}`)));});
  const bundle=path.join(enterprise,'endpoint-worker.intunewin');
  await copyFile(path.join(output,'EndpointWorker.intunewin'),bundle);
  const metadata={schemaVersion:1,setupFile:'EndpointWorker.exe',publisher:ENDPOINT_PUBLISHER,workerSha256:await digest(worker),bundleSha256:await digest(bundle),contentPrepSha256:CONTENT_PREP_SHA256};
  await writeFile(path.join(enterprise,'endpoint-worker-package.json'),JSON.stringify(metadata,null,2)+'\n');
  return metadata;
}
