const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {PassThrough} = require('node:stream');
const {webcrypto} = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname,'../teams-captions-saver/byomcpNativeClient.js'),'utf8');
const event = () => {const callbacks=[];return {addListener(callback){callbacks.push(callback);},emit(value){for(const callback of callbacks)callback(value);}};};
async function fixture(overrides={}) {
  const {createEnrollmentAuthority,createNativeSession,NATIVE_HOST_NAME} = await import('../companion/byomcp/enrollment.mjs');
  const {contracts} = await import('../companion/byomcp/helper.mjs');
  const {serveNative} = await import('../companion/byomcp/native.mjs');
  const {encodeNative,NativeDecoder} = await import('../companion/byomcp/framing.mjs');
  const id='a'.repeat(32),origin=`chrome-extension://${id}/`,localData={},permissionsRemoved=event();
  const sender={id,url:origin+'settings.html',tab:{id:1}};
  const configured={id:'synthetic-profile',label:'Synthetic',revision:1,transport:'remote',resource:'https://synthetic.invalid/mcp',credentialReference:'os-ref',
    tools:[{name:'synthetic_read',operation:'read',readOnly:true,schemaDigest:'b'.repeat(64)}]};
  const profile={...configured,profileDigest:await contracts.digest(configured)};
  const authority=await createEnrollmentAuthority({allowedCallers:[{browser:'chrome',caller:origin}],profiles:[profile],confirmLocalUser:async()=>true});
  const calls={permission:0,connections:0,inspect:0},ports=[];
  let granted=true,disabled=false;
  const storage={async get(key){return {[key]:structuredClone(localData[key])};},async set(values){Object.assign(localData,structuredClone(values));},async remove(key){delete localData[key];}};
  const chrome={runtime:{id,getURL:file=>origin+file,lastError:null,connectNative(host){
    assert.equal(host,NATIVE_HOST_NAME);calls.connections++;
    if(overrides.closedHost)throw Error('sensitive native location');
    const input=new PassThrough(),output=new PassThrough(),decoder=new NativeDecoder();
    const native=createNativeSession(authority,{browser:'chrome',caller:origin,hostName:host},{readPolicy:async()=>({disabled:false}),adapters:{remote:{inspect:async()=>{
      calls.inspect++;return [{name:'synthetic_read',schemaDigest:'b'.repeat(64)}];
    }}}});
    const port={onMessage:event(),onDisconnect:event(),postMessage(message){
      if(overrides.noReply)return;
      if(overrides.malformedReply){queueMicrotask(()=>port.onMessage.emit({version:9,requestId:message.requestId,ok:true,result:{}}));return;}
      const frame=encodeNative(message);input.write(frame.subarray(0,2));input.write(frame.subarray(2));
    },disconnect(){input.destroy();output.destroy();port.onDisconnect.emit();}};
    output.on('data',chunk=>{for(const reply of decoder.push(chunk))port.onMessage.emit(reply);});
    serveNative(input,output,native);ports.push(port);return port;
  }},permissions:{request(){calls.permission++;return Promise.resolve(granted);},contains:async()=>granted,onRemoved:permissionsRemoved},storage:{local:storage}};
  const context=vm.createContext({chrome,crypto:webcrypto,structuredClone,TextEncoder,URL,setTimeout,clearTimeout,AbortController});
  vm.runInContext(source,context);
  const client=context.CaptionKeepByomcpNativeClient.create({chrome,storage,browserTarget:overrides.browserTarget || 'chrome',timeoutMs:overrides.timeoutMs || 500,
    getPolicySnapshot:()=>({disabled}),readPolicy:async()=>({disabled}),verifyEnrollment:async()=>overrides.unverified!==true});
  return {client,calls,sender,profile,ports,localData,permissionsRemoved,context,disable(){disabled=true;},denyPermission(){granted=false;}};
}
test('startup/local status never launches native host or requests permission',async()=>{
  const f=await fixture();assert.equal((await f.client.localStatus()).enrollmentVerified,false);
  assert.equal(f.calls.connections,0);assert.equal(f.calls.permission,0);
});

test('enrolled workspace may read reviewed inventory but cannot connect or disconnect the helper',async()=>{
  const f=await fixture();await f.client.connectGranted(f.sender);
  const workspace={...f.sender,url:f.sender.url.replace('settings.html','sidepanel.html')};
  assert.equal((await f.client.inventory('synthetic-profile',1,workspace)).tools.length,1);
  await assert.rejects(f.client.connectGranted(workspace),/sender/);
  await assert.rejects(f.client.disconnect(workspace),/sender/);
  await f.client.disconnect(f.sender);
});
test('permission request occurs synchronously on trusted gesture; actual split-frame enrollment/inventory succeeds',async()=>{
  const f=await fixture();const connection=f.client.connectFromGesture(f.sender);
  assert.equal(f.calls.permission,1);assert.equal(f.calls.connections,0);
  const status=await connection;assert.equal(status.enrollmentVerified,true);assert.equal(status.profiles[0].inventoryVerified,false);
  assert.equal(f.calls.inspect,0);const inventory=await f.client.inventory('synthetic-profile',1,f.sender);
  assert.equal(inventory.tools.length,1);assert.equal(f.calls.inspect,1);
  assert(!JSON.stringify(f.localData).includes('nonce'));assert(!JSON.stringify(f.localData).includes('credential'));
  await f.client.disconnect(f.sender);assert.equal((await f.client.localStatus()).enrollmentVerified,false);
});
test('content-page sender, denied policy/permission, unverified enrollment and Safari fail closed',async()=>{
  const f=await fixture();await assert.rejects(f.client.connectFromGesture({...f.sender,url:'https://meet.google.com/abc-defg-hij'}),/sender/);
  assert.equal(f.calls.permission,0);f.disable();await assert.rejects(f.client.connectFromGesture(f.sender),/policy/);
  const denied=await fixture();denied.denyPermission();await assert.rejects(denied.client.connectFromGesture(denied.sender),/permission/);
  const unverified=await fixture({unverified:true});await assert.rejects(unverified.client.connectFromGesture(unverified.sender),/unverified/);
  const safari=await fixture({browserTarget:'safari'});await assert.rejects(safari.client.connectFromGesture(safari.sender),/unsupported/);assert.equal(safari.calls.permission,0);
});
test('closed host, malformed reply and timeout revoke without exposing upstream text',async()=>{
  for(const options of [{closedHost:true},{malformedReply:true},{noReply:true,timeoutMs:5}]) {
    const f=await fixture(options);await assert.rejects(f.client.connectFromGesture(f.sender),error=>!error.message.includes('sensitive'));
    assert.equal((await f.client.localStatus()).enrollmentVerified,false);
  }
});

test('worker connection rechecks granted permission and never requests it asynchronously',async()=>{
  const f=await fixture();await f.client.connectGranted(f.sender);
  assert.equal(f.calls.permission,0);assert.equal(f.calls.connections,1);await f.client.disconnect(f.sender);
  f.denyPermission();await assert.rejects(f.client.connectGranted(f.sender),/permission/);
  assert.equal(f.calls.connections,1);
});
test('permission removal cancels connection and old port events cannot kill a later connection',async()=>{
  const f=await fixture();await f.client.connectFromGesture(f.sender);const old=f.ports[0];
  f.permissionsRemoved.emit({permissions:['nativeMessaging']});assert.equal((await f.client.localStatus()).enrollmentVerified,false);
  await f.client.connectFromGesture(f.sender);old.onDisconnect.emit();
  assert.equal((await f.client.localStatus()).enrollmentVerified,true);await f.client.disconnect(f.sender);
});
test('unexpected/oversized native replies and denied dispatch invalidate connection',async()=>{
  const f=await fixture();await f.client.connectFromGesture(f.sender);
  f.ports[0].onMessage.emit({version:1,requestId:webcrypto.randomUUID(),ok:true,result:'x'.repeat(1048576)});
  assert.equal((await f.client.localStatus()).enrollmentVerified,false);
  await f.client.connectFromGesture(f.sender);
  await assert.rejects(f.client.transport.invoke(f.profile,{payload:{jobId:webcrypto.randomUUID()}},new AbortController().signal,
    {assertDispatch:async()=>{throw Error('source-revoked');}}),/source/);
  assert.equal(f.calls.inspect,0);await f.client.disconnect(f.sender);
});
