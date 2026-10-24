const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const vm=require('node:vm');

test('minimal manifest keeps exact development caller and only nativeMessaging permission',async()=>{
  const {discoveryManifest}=await import('../scripts/probe-byomcp-discovery.mjs');
  const build=await readFile(path.join(__dirname,'../scripts/build-browser-targets.mjs'),'utf8');
  const key=/const DEV_KEY = '([^']+)';/.exec(build)?.[1];
  const manifest=discoveryManifest(key);
  assert.deepEqual(manifest.permissions,['nativeMessaging']);
  assert.equal(manifest.background,undefined);assert.equal(manifest.host_permissions,undefined);
  assert.equal(manifest.content_scripts,undefined);
  assert.throws(()=>discoveryManifest('wrong'),/identity-mismatch/);
});

async function probe(reply,error) {
  const {discoveryPage}=await import('../scripts/probe-byomcp-discovery.mjs');
  const posted=[];let onMessage,onDisconnect,disconnected=0;
  const chrome={runtime:{id:'pjpibiimicedkckleehljlklmblkacph',lastError:error?{message:error}:undefined,
    connectNative:host=>{assert.equal(host,'com.daftech.captionkeep.byomcp');return {
      onDisconnect:{addListener:listener=>{onDisconnect=listener;}},onMessage:{addListener:listener=>{onMessage=listener;}},
      disconnect:()=>{disconnected++;},postMessage:message=>{posted.push(message);queueMicrotask(()=>{
        if(error)onDisconnect();else onMessage(reply(message));
      });}};}}};
  const document={body:{textContent:''}};
  vm.runInNewContext(`(${discoveryPage.toString()})();`,{chrome,document,location:{protocol:'chrome-extension:',hostname:chrome.runtime.id},
    crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,Date,queueMicrotask});
  await new Promise(resolve=>setImmediate(resolve));
  return {result:JSON.parse(document.body.textContent),posted,disconnected};
}

test('page sends only enrollment challenge then disconnects without exposing nonce or profiles',async()=>{
  const value=await probe(message=>({version:1,requestId:message.requestId,ok:true,result:{hostName:'com.daftech.captionkeep.byomcp',
    nonce:'a'.repeat(64),profileIds:['PRIVATE_PROFILE'],expiresAt:Date.now()+30000}}));
  assert.deepEqual(value.result,{code:'challenge-ok'});assert.equal(value.posted.length,1);
  assert.equal(value.posted[0].operation,'enrollment-challenge');assert.equal(value.disconnected,1);
  assert(!JSON.stringify(value.result).includes('PRIVATE_PROFILE'));
});

test('page maps native browser errors and suppresses unrecognized private error text',async()=>{
  for(const [error,code] of [['Specified native messaging host not found.','host-not-found'],['PRIVATE_PATH_OR_TOKEN','native-error-other']]){
    const value=await probe(null,error);assert.deepEqual(value.result,{code});assert.equal(value.disconnected,1);
  }
});

test('invalid or stale challenge cannot count as verified',async()=>{
  const value=await probe(message=>({version:1,requestId:message.requestId,ok:true,result:{hostName:'com.daftech.captionkeep.byomcp',
    nonce:'a'.repeat(64),profileIds:['PRIVATE_PROFILE'],expiresAt:1}}));
  assert.deepEqual(value.result,{code:'invalid-challenge'});
});

async function wrapperProbe({invalid=false,error,unsafeClient=false}={}) {
  const {productionWrapperPage}=await import('../scripts/probe-byomcp-discovery.mjs');
  const posted=[];let onMessage,onDisconnect,disconnected=0;
  const id='pjpibiimicedkckleehljlklmblkacph';
  const chrome={runtime:{id,getURL:value=>`chrome-extension://${id}/${value}`,
    lastError:error?{message:error}:undefined,connectNative:()=>({
      onDisconnect:{addListener:listener=>{onDisconnect=listener;}},onMessage:{addListener:listener=>{onMessage=listener;}},
      disconnect:()=>{disconnected++;},postMessage:message=>{
        posted.push(message);queueMicrotask(()=>{
          if(error)onDisconnect();else onMessage({version:1,requestId:message.requestId,ok:true,result:{
            hostName:'com.daftech.captionkeep.byomcp',nonce:'a'.repeat(64),expiresAt:invalid?1:Date.now()+30000,profileIds:['PRIVATE_PROFILE']}});
        });
      }})},permissions:{contains:async()=>true}};
  const document={body:{textContent:''}},context=vm.createContext({chrome,document,
    location:{protocol:'chrome-extension:',hostname:id,pathname:'/popup.html',href:`chrome-extension://${id}/popup.html`},
    crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,Date,queueMicrotask,structuredClone,TextEncoder,URL});
  if(unsafeClient)context.CaptionKeepByomcpNativeClient={create:options=>({connectGranted:async()=>{
    const port=options.chrome.runtime.connectNative('com.daftech.captionkeep.byomcp');
    port.postMessage({operation:'enrollment-complete'});
  }})};
  else vm.runInContext(await readFile(path.join(__dirname,'../teams-captions-saver/byomcpNativeClient.js'),'utf8'),context);
  await vm.runInContext(`(${productionWrapperPage.toString()})();`,context);
  return {result:JSON.parse(document.body.textContent),posted,disconnected};
}

test('real production wrapper validates challenge then policy blocks before enrollment completion',async()=>{
  const value=await wrapperProbe();assert.deepEqual(value.result,{code:'wrapper-challenge-ok'});
  assert.equal(value.posted.length,1);assert.equal(value.posted[0].operation,'enrollment-challenge');
  assert(value.disconnected>=1);assert(!JSON.stringify(value.result).includes('PRIVATE_PROFILE'));
});

test('production wrapper discovery rejects native failure and invalid challenge without completing enrollment',async()=>{
  for(const options of [{invalid:true},{error:'Specified native messaging host not found.'}]){
    const value=await wrapperProbe(options);
    assert.notEqual(value.result.code,'wrapper-challenge-ok');
    assert(value.posted.every(message=>message.operation==='enrollment-challenge'));
  }
});

test('independent operation boundary blocks completion even if future client skips policy guard',async()=>{
  const value=await wrapperProbe({unsafeClient:true});
  assert.deepEqual(value.result,{code:'wrapper-guard-failed'});assert.equal(value.posted.length,0);
});
