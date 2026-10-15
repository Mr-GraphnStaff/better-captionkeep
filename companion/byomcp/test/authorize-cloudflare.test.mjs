import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import path from 'node:path';
import {signInCloudflare,signInFailureMessage} from '../authorize-cloudflare.mjs';
const profile={id:'synthetic-profile',transport:'remote',resource:'https://mcp.cloudflare.com/mcp',credentialReference:'synthetic-credential'};
const configuration={oauthStorePath:'C:/Private/Cloudflare.dpapi',browserConfiguration:{profiles:[{profile}]}};
const setup={configurationPath:path.resolve('synthetic-config.json'),profileId:profile.id,browserPath:process.execPath,platform:'win32'};
test('explicit setup opens only the authorization URL through an argument array and requests no offline access',async()=>{
  let opened=0;
  const result=await signInCloudflare({...setup,load:async()=>configuration,authorize:async options=>{
    assert.equal(options.allowOfflineAccess,false);assert.equal(options.readOnlySessionPreset,false);assert.equal(options.storePath,configuration.oauthStorePath);
    await options.onAuthorizationUrl('https://mcp.cloudflare.com/authorize?synthetic=1');return {authorized:true};
  },open:(executable,args,options)=>{
    opened++;assert.equal(executable,process.execPath);assert.deepEqual(args,['https://mcp.cloudflare.com/authorize?synthetic=1']);
    assert.equal(options.shell,false);assert.equal(options.windowsHide,false);
    const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit('spawn'));return child;
  }});
  assert.equal(result.authorized,true);assert.equal(opened,1);
});
test('setup denies unknown profile, absent explicit store, wrong resource and unsupported platform before authorization',async()=>{
  let attempts=0;const authorize=async()=>{attempts++;};
  for(const config of [{browserConfiguration:configuration.browserConfiguration},
    {...configuration,browserConfiguration:{profiles:[]}},
    {...configuration,browserConfiguration:{profiles:[{profile:{...profile,resource:'https://attacker.invalid'}}]}}]) {
    await assert.rejects(signInCloudflare({...setup,load:async()=>config,authorize}));
  }
  await assert.rejects(signInCloudflare({...setup,platform:'linux',load:async()=>configuration,authorize}));
  assert.equal(attempts,0);
});
test('read-only preset requires explicit setup opt-in and never enables refresh access',async()=>{
  await signInCloudflare({...setup,readOnlySessionPreset:true,load:async()=>configuration,authorize:async options=>{
    assert.equal(options.readOnlySessionPreset,true);assert.equal(options.allowOfflineAccess,false);return {authorized:true};
  }});
});

test('CLI failure output contains only fixed stage/reason and bounded numeric HTTP status',()=>{
  assert.equal(signInFailureMessage({stage:'token-exchange',reason:'invalid-grant',httpStatus:400}),
    'Cloudflare sign-in could not be verified (token-exchange; invalid-grant; HTTP 400). No authenticated connection is claimed.\n');
  const hostile='Bearer SYNTHETIC_SECRET https://private.invalid/token C:\\Private\\secret';
  for(const error of [Object.assign(Error(hostile),{stage:hostile,reason:hostile,httpStatus:hostile}),
    {stage:'__proto__',reason:'constructor',httpStatus:1000},
    {stage:'token-exchange',reason:'unknown',httpStatus:'401',error_description:hostile,body:hostile,token:hostile}]) {
    const output=signInFailureMessage(error);
    assert(!output.includes(hostile));assert(!output.includes('HTTP'));assert(!output.includes('__proto__'));assert(!output.includes('constructor'));
  }
});
