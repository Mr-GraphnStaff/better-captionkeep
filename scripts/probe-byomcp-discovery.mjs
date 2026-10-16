import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {installedBrowsers} from './browser-platform.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ID='pjpibiimicedkckleehljlklmblkacph';
const HOST='com.daftech.captionkeep.byomcp';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function discoveryManifest(key) {
  if(typeof key!=='string' || key.length>4096) throw Error('probe-key-invalid');
  const id=createHash('sha256').update(Buffer.from(key,'base64')).digest('hex').slice(0,32)
    .replace(/[0-9a-f]/g,digit=>String.fromCharCode(97+parseInt(digit,16)));
  if(id!==ID) throw Error('probe-key-identity-mismatch');
  return {manifest_version:3,name:'CaptionKeep native discovery diagnostic',version:'1.0.0',key,
    permissions:['nativeMessaging'],content_security_policy:{extension_pages:"script-src 'self'; object-src 'none'; connect-src 'none'"}};
}

// Runs only in the generated diagnostic page. No production extension code,
// enrollment completion, configuration, provider authentication or tool calls.
export function discoveryPage() {
  const expectedId='pjpibiimicedkckleehljlklmblkacph',host='com.daftech.captionkeep.byomcp';
  const outcome=code=>{document.body.textContent=JSON.stringify({code});};
  const codes=new Map([
    ['Specified native messaging host not found.','host-not-found'],
    ['Failed to start native messaging host.','host-start-failed'],
    ['Access to the specified native messaging host is forbidden.','host-forbidden'],
    ['Native host has exited.','host-exited'],
    ['Error when communicating with the native messaging host.','communication-failed']]);
  if(chrome.runtime.id!==expectedId || location.protocol!=='chrome-extension:' || location.hostname!==expectedId) {
    outcome('identity-mismatch');return;
  }
  let port,finished=false;
  const requestId=crypto.randomUUID();
  const finish=code=>{if(finished)return;finished=true;clearTimeout(timer);try{port?.disconnect();}catch{}outcome(code);};
  const timer=setTimeout(()=>finish('challenge-timeout'),10000);
  try {
    port=chrome.runtime.connectNative(host);
    port.onDisconnect.addListener(()=>finish(codes.get(chrome.runtime.lastError?.message) || 'native-error-other'));
    port.onMessage.addListener(reply=>{
      const valid=reply?.version===1 && reply.requestId===requestId && reply.ok===true
        && reply.result?.hostName===host && /^[a-f0-9]{64}$/.test(reply.result?.nonce || '')
        && Number.isFinite(reply.result?.expiresAt) && reply.result.expiresAt>Date.now()
        && Array.isArray(reply.result?.profileIds) && reply.result.profileIds.length>0 && reply.result.profileIds.length<=20;
      finish(valid?'challenge-ok':'invalid-challenge');
    });
    port.postMessage({version:1,requestId,operation:'enrollment-challenge'});
  } catch(error) {finish(codes.get(error?.message) || 'native-error-other');}
}

export async function productionWrapperPage() {
  const id='pjpibiimicedkckleehljlklmblkacph',host='com.daftech.captionkeep.byomcp';
  const output=code=>{document.body.textContent=JSON.stringify({code});};
  if(chrome.runtime.id!==id || location.protocol!=='chrome-extension:' || location.hostname!==id
      || location.pathname!=='/popup.html' || !globalThis.CaptionKeepByomcpNativeClient){output('identity-mismatch');return;}
  let policyChecks=0,blockedOperation=false,challengeSent=false,lastStage='';
  const client=globalThis.CaptionKeepByomcpNativeClient.create({browserTarget:'chrome',
    chrome:{runtime:{id,getURL:value=>chrome.runtime.getURL(value),
      connectNative:name=>{
        if(name!==host)throw Error('diagnostic-host-denied');
        const port=chrome.runtime.connectNative(host);
        return {onMessage:port.onMessage,onDisconnect:port.onDisconnect,disconnect:()=>port.disconnect(),
          postMessage:message=>{
            // Independent boundary: no future wrapper change may complete
            // enrollment or send any second request in this diagnostic.
            if(challengeSent || message?.operation!=='enrollment-challenge'){
              blockedOperation=true;throw Error('diagnostic-operation-denied');
            }
            challengeSent=true;port.postMessage(message);
          }};
      },get lastError(){return chrome.runtime.lastError;}},
      permissions:{contains:value=>chrome.permissions.contains(value)}},
    storage:{get:async()=>({}),set:async()=>{throw Error('diagnostic-storage-denied');}},
    getPolicySnapshot:()=>({disabled:false}),
    readPolicy:async()=>({disabled:++policyChecks>=3}),
    verifyConfiguration:async()=>{},
    verifyEnrollment:async()=>{throw Error('diagnostic-enrollment-denied');}});
  try {
    await client.connectGranted({id,url:location.href},stage=>{lastStage=stage;});
    output('wrapper-guard-failed');
  } catch(error) {
    if(policyChecks===3 && challengeSent && !blockedOperation && lastStage==='challenge'){
      output('wrapper-challenge-ok');return;
    }
    const codes=new Map([['native-host-not-found','host-not-found'],['native-host-start-failed','host-start-failed'],
      ['native-host-forbidden','host-forbidden'],['native-host-exited','host-exited'],
      ['native-communication-error','communication-failed'],['native-timeout','challenge-timeout']]);
    output(blockedOperation?'wrapper-guard-failed':codes.get(error?.code) || 'native-error-other');
  }
}

function browserPipe(child) {
  let sequence=0,buffer='';const pending=new Map();
  function fail(){for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(Error('probe-browser-failed'));}pending.clear();}
  child.once('error',fail);child.once('exit',fail);
  child.stdio[4].on('data',chunk=>{
    buffer+=chunk.toString('utf8');
    if(Buffer.byteLength(buffer)>1048576){buffer='';fail();return;}
    let index;
    while((index=buffer.indexOf('\0'))>=0){
      const raw=buffer.slice(0,index);buffer=buffer.slice(index+1);if(!raw)continue;
      let value;try{value=JSON.parse(raw);}catch{fail();continue;}
      const entry=pending.get(value.id);if(!entry)continue;
      pending.delete(value.id);clearTimeout(entry.timer);
      if(value.error)entry.reject(Error('probe-browser-command-failed'));else entry.resolve(value.result);
    }
  });
  return {send(method,params={},sessionId){return new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('probe-browser-timeout'));},15000);
    pending.set(id,{resolve,reject,timer});
    child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');
  });},close:fail};
}

export async function runNativeDiscovery({root=ROOT,binary,productionWrapper=false}={}) {
  const result={scope:productionWrapper?'Isolated production native-client wrapper with forced post-challenge policy denial; not installed UI acceptance.'
      :'Isolated minimal extension, native enrollment challenge only; not browser certification.',productionWrapper:productionWrapper===true,
    registrationChanged:false,providerRequests:false,enrollmentCompleted:false,challengeVerified:false,stage:'prepare',code:'not-run'};
  let temporary,child,connection,ready=false;
  try {
    binary ||= (await installedBrowsers()).find(browser=>browser.browser==='brave')?.binary;
    if(process.platform!=='win32' || !path.isAbsolute(binary || ''))throw Error('probe-platform-unsupported');
    const source=JSON.parse(await readFile(path.join(root,'dist/dev/manifest.json'),'utf8'));
    const manifest=discoveryManifest(source.key);
    temporary=await mkdtemp(path.join(os.tmpdir(),'captionkeep-native-discovery-'));
    const extension=path.join(temporary,'extension'),profile=path.join(temporary,'profile');
    await mkdir(extension);await mkdir(profile);
    await writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest));
    const page=productionWrapper?'popup.html':'probe.html';
    if(productionWrapper)await writeFile(path.join(extension,'byomcpNativeClient.js'),await readFile(path.join(root,'dist/dev/byomcpNativeClient.js')));
    await writeFile(path.join(extension,page),`<!doctype html><html><head><meta charset="utf-8"><title>Native discovery diagnostic</title></head><body>${productionWrapper?'<script src="byomcpNativeClient.js"></script>':''}<script src="probe.js"></script></body></html>`);
    await writeFile(path.join(extension,'probe.js'),`(${(productionWrapper?productionWrapperPage:discoveryPage).toString()})();`);
    result.stage='browser-start';
    child=spawn(binary,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
      '--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],
      {windowsHide:true,stdio:['ignore','ignore','ignore','pipe','pipe']});
    connection=browserPipe(child);
    await connection.send('Browser.getVersion');ready=true;
    result.stage='extension-load';
    const loaded=await connection.send('Extensions.loadUnpacked',{path:extension});
    if(loaded.id!==ID)throw Error('probe-key-identity-mismatch');
    const target=await connection.send('Target.createTarget',{url:`chrome-extension://${ID}/${page}`});
    const {sessionId}=await connection.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    result.stage='native-challenge';
    const allowed=new Set(['challenge-ok','host-not-found','host-start-failed','host-forbidden','host-exited',
      'communication-failed','identity-mismatch','challenge-timeout','native-error-other','invalid-challenge',
      'wrapper-challenge-ok','wrapper-guard-failed']);
    for(let attempt=0;attempt<70;attempt++){
      const value=await connection.send('Runtime.evaluate',{expression:'document.body?.textContent || ""',returnByValue:true},sessionId);
      let response;try{response=JSON.parse(value.result?.value);}catch{}
      if(allowed.has(response?.code)){
        result.code=response.code;result.challengeVerified=response.code===(productionWrapper?'wrapper-challenge-ok':'challenge-ok');return result;
      }
      await pause(200);
    }
    result.code='probe-result-timeout';return result;
  } catch(error) {
    result.code=new Set(['probe-key-invalid','probe-key-identity-mismatch','probe-platform-unsupported',
      'probe-browser-failed','probe-browser-command-failed','probe-browser-timeout']).has(error?.message)?error.message:'probe-failed';
    return result;
  } finally {
    if(child && child.exitCode===null && !child.signalCode){
      if(ready){try{await connection.send('Browser.close');}catch{}}
      if(child.exitCode===null && !child.signalCode){
        const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await Promise.race([exited,pause(3000)]);
      }
    }
    connection?.close();
    if(temporary){
      const resolved=path.resolve(temporary),parent=path.resolve(os.tmpdir());
      if(path.dirname(resolved)===parent && path.basename(resolved).startsWith('captionkeep-native-discovery-')){
        try{await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:250});result.temporaryFilesRemoved=true;}
        catch{result.temporaryFilesRemoved=false;}
      }
    }
  }
}

if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  if(process.argv.length>3 || process.argv[2] && process.argv[2]!=='--production-wrapper')throw Error('Only --production-wrapper is accepted; isolated challenge-only diagnostic.');
  const result=await runNativeDiscovery({productionWrapper:process.argv[2]==='--production-wrapper'});console.log(JSON.stringify(result));
  if(!result.challengeVerified)process.exitCode=1;
}
