import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createEnrollmentAuthority,validateConfiguredProfiles,NATIVE_HOST_NAME} from '../enrollment.mjs';
import {contracts} from '../helper.mjs';
import {installerTemplate} from '../installer-templates.mjs';
import {serveNative} from '../native.mjs';
import {encodeNative,NativeDecoder} from '../framing.mjs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ui=require('../../../teams-captions-saver/byomcpSettings.js');

const context={browser:'chrome',caller:`chrome-extension://${'a'.repeat(32)}/`,hostName:NATIVE_HOST_NAME};
async function profile() {
  const value={id:'remote-profile',label:'Synthetic owner',revision:1,transport:'remote',resource:'https://synthetic.invalid/mcp',credentialReference:'os-vault-reference',
    tools:[{name:'synthetic_read',operation:'read',readOnly:true,schemaDigest:'b'.repeat(64)}]};
  return {...value,profileDigest:await contracts.digest(value)};
}
async function authority(options={}) {
  return createEnrollmentAuthority({allowedCallers:[{browser:context.browser,caller:context.caller}],profiles:[await profile()],...options});
}
test('default denied local confirmation, wrong native caller/host and nonce replay reject',async()=>{
  const denied=await authority();const pending=denied.challenge(context,['remote-profile']);
  await assert.rejects(denied.complete(context,pending.nonce),/confirmation/);
  const enabled=await authority({confirmLocalUser:async()=>true});
  assert.throws(()=>enabled.challenge({...context,caller:`chrome-extension://${'b'.repeat(32)}/`},['remote-profile']),/caller/);
  assert.throws(()=>enabled.challenge({...context,hostName:'other.host'},['remote-profile']),/caller/);
  assert.throws(()=>enabled.challenge(context,['not-configured']),/profile/);
  const challenge=enabled.challenge(context,['remote-profile']);const enrollment=await enabled.complete(context,challenge.nonce);
  assert.equal(enabled.resolve(context,enrollment.enrollmentId).profiles.length,1);
  await assert.rejects(enabled.complete(context,challenge.nonce),/challenge/);
});
test('challenge expires during confirmation and parallel completion consumes nonce once',async()=>{
  let time=1000,release;const wait=new Promise(resolve=>release=resolve);
  const manager=await authority({now:()=>time,confirmLocalUser:async()=>{await wait;return true;}});
  const challenge=manager.challenge(context,['remote-profile']);const completion=manager.complete(context,challenge.nonce);
  await assert.rejects(manager.complete(context,challenge.nonce),/challenge/);
  time=challenge.expiresAt;release();await assert.rejects(completion,/confirmation/);
});
test('malformed configured profiles and changed profile digest reject before enrollment',async()=>{
  const valid=await profile();
  await assert.rejects(validateConfiguredProfiles([{...valid,resource:'https://other.invalid/mcp'}]),/digest/);
  await assert.rejects(validateConfiguredProfiles([{...valid,executable:'message-path'}]),/remote/);
  await assert.rejects(validateConfiguredProfiles([{...valid,secret:'must-not-configure-here'}]),/config/);
  await assert.rejects(validateConfiguredProfiles([valid,valid]),/profile/);
});
test('actual native split-frame fixture exposes selectable enrolled metadata and inventory contains no transcript',{timeout:5000},async()=>{
  const manager=await authority({confirmLocalUser:async()=>true});const challenge=manager.challenge(context,['remote-profile']);
  const enrollment=await manager.complete(context,challenge.nonce);let inspections=0;
  const helper=manager.helper(context,enrollment.enrollmentId,{readPolicy:async()=>({disabled:false}),adapters:{remote:{
    inspect:async configured=>{inspections++;assert(!JSON.stringify(configured).includes('transcript'));return [{name:'synthetic_read',schemaDigest:'b'.repeat(64)}];}
  }}});
  const input=new PassThrough(),output=new PassThrough(),chunks=[];output.on('data',chunk=>chunks.push(chunk));
  const liveDecoder=new NativeDecoder();let replyCount=0;
  const received=new Promise(resolve=>output.on('data',chunk=>{replyCount+=liveDecoder.push(chunk).length;if(replyCount===2) resolve();}));
  const completed=new Promise(resolve=>output.on('end',resolve));serveNative(input,output,helper);
  const statusMessage={version:1,requestId:randomUUID(),enrollmentId:enrollment.enrollmentId,operation:'status'};
  const first=encodeNative(statusMessage);input.write(first.subarray(0,3));input.write(first.subarray(3));
  input.write(encodeNative({...statusMessage,requestId:randomUUID(),operation:'inventory',profileId:'remote-profile'}));await received;input.end();await completed;
  const decoder=new NativeDecoder();const replies=decoder.push(Buffer.concat(chunks));decoder.end();
  assert.equal(replies.length,2);const status=replies.find(reply=>reply.requestId===statusMessage.requestId).result;
  assert.equal(status.protocolVersion,1);assert.equal(status.profiles[0].transport,'streamable-http');
  assert.equal(status.profiles[0].verified,true);assert.equal(status.profiles[0].inventoryVerified,false);
  const uiStatus=ui.statusView({ok:true,status});assert.equal(uiStatus.verified,true);assert.equal(uiStatus.profiles.length,1);
  const inventory=replies.find(reply=>reply.requestId!==statusMessage.requestId).result;
  assert.equal(inspections,1);assert.match(inventory.tools[0].profileGrantId,/^[a-zA-Z0-9._-]{1,100}$/);
  assert.equal(ui.inventoryView({ok:true,inventory},uiStatus.profiles[0]).length,1);
  // Closing the native channel itself revokes the enrollment.
  await assert.rejects(helper.handle(statusMessage),/enrolled/);
});
test('installer generation is dry-run only and preserves exact Chromium/Firefox allowlisting',()=>{
  const chrome=installerTemplate({browser:'chrome',os:'windows',extensionId:'a'.repeat(32),launcherPath:'C:\\Synthetic\\helper.exe',manifestPath:'C:\\Synthetic\\host.json'});
  assert.equal(chrome.dryRunOnly,true);assert.deepEqual(chrome.manifest.allowed_origins,[`chrome-extension://${'a'.repeat(32)}/`]);
  const firefox=installerTemplate({browser:'firefox',os:'macos',extensionId:'synthetic@example.invalid',launcherPath:'/synthetic/helper',manifestPath:'/synthetic/host.json'});
  assert.deepEqual(firefox.manifest.allowed_extensions,['synthetic@example.invalid']);assert.equal(firefox.windowsRegistry,null);
  assert.throws(()=>installerTemplate({browser:'safari',os:'macos'}),/unsupported/);
});
