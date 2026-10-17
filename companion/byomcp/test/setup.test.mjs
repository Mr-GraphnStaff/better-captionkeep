import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,lstat,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateSetupRequest,readSetupRequest,prepareSetup,runSetup,savePreparedSetup} from '../setup.mjs';
import {RESOURCE} from '../cloudflare-oauth.mjs';

const request={version:1,browser:'chrome',extensionId:'a'.repeat(32),profile:{label:'Synthetic MCP',transport:'remote',resource:'https://synthetic.invalid/mcp'}};
async function fixture(run) {
  const directory=await mkdtemp(path.join(tmpdir(),'captionkeep-setup-'));
  try {return await run(directory);} finally {await rm(directory,{recursive:true,force:true});}
}
const answers=values=>async()=>{assert(values.length,'unexpected prompt');return values.shift();};
const platform=process.platform==='win32'?'win32':'darwin';

test('strict non-secret browser request rejects commands, credentials, alternate callers and unsafe endpoint fields',()=>{
  assert.equal(validateSetupRequest(request).extensionId,request.extensionId);
  for(const value of [{...request,executable:'evil'},{...request,credentials:'secret'},{...request,extensionId:'bad'},
    {...request,profile:{...request.profile,args:['evil']}},{...request,profile:{...request.profile,resource:'http://synthetic.invalid'}},
    {...request,profile:{...request.profile,resource:'https://user:secret@synthetic.invalid'}},
    {...request,profile:{...request.profile,resource:'https://synthetic.invalid?token=secret'}},
    {...request,profile:{...request.profile,resource:['https://synthetic.invalid/mcp']}},
    {...request,profile:{...request.profile,resource:'https://synthetic.invalid/'+ 'x'.repeat(2048)}}]) assert.throws(()=>validateSetupRequest(value));
});
test('request reader rejects oversized files and reads only the selected non-secret request',()=>fixture(async directory=>{
  const filename=path.join(directory,'request.json');await writeFile(filename,JSON.stringify(request));
  assert.deepEqual(await readSetupRequest(filename),request);await writeFile(filename,'x'.repeat(16385));
  await assert.rejects(readSetupRequest(filename),/limit/);await assert.rejects(readSetupRequest('relative.json'),/absolute/);
}));
test('remote preparation computes exact caller/digests and provides binding plus untouched installation plan',()=>fixture(async directory=>{
  const prepared=await prepareSetup({request,directory:path.join(directory,'new'),platform,prompt:answers([directory,'environment'])});
  const helper=JSON.parse(prepared.files['helper-config.json']),binding=JSON.parse(prepared.files['browser-configuration.json']);
  assert.deepEqual(helper.browserConfiguration,binding);assert.equal(helper.browserStoragePath,directory);
  assert.deepEqual(binding.allowedCallers,[{browser:'chrome',caller:`chrome-extension://${'a'.repeat(32)}/`}]);
  assert.equal(binding.profiles[0].profile.toolAccess,'catalog');assert.deepEqual(binding.profiles[0].actions,[]);
  assert.equal(prepared.dryRun,true);assert.equal(prepared.plan.dryRunOnly,true);
  await assert.rejects(lstat(path.join(directory,'new')),/ENOENT/);
}));
test('stdio executable is entered locally, hashed and uses discrete arguments without launching it',()=>fixture(async directory=>{
  const executable=path.join(directory,'synthetic-server');await writeFile(executable,'synthetic executable bytes, never run');
  const prepared=await prepareSetup({request:{...request,profile:{label:'Local synthetic',transport:'stdio'}},directory:path.join(directory,'new'),platform,
    prompt:answers([directory,executable,directory,'--synthetic','value with spaces',''])});
  const profile=JSON.parse(prepared.files['browser-configuration.json']).profiles[0].profile;
  assert.equal(profile.executable,executable);assert.deepEqual(profile.args,['--synthetic','value with spaces']);
  assert.equal(profile.executableDigest,createHash('sha256').update(await readFile(executable)).digest('hex'));
}));
test('Cloudflare sign-in is a separate next step; generic OAuth and unsupported registrations are not invented',()=>fixture(async directory=>{
  const cloud=await prepareSetup({request:{...request,profile:{...request.profile,resource:RESOURCE}},directory:path.join(directory,'new'),platform,prompt:answers([directory,'cloudflare'])});
  assert.equal(cloud.authentication,'cloudflare');assert.match(JSON.parse(cloud.files['helper-config.json']).oauthStorePath,/\.dpapi$/);
  await assert.rejects(prepareSetup({request,directory:path.join(directory,'new'),platform,prompt:answers([directory,'oauth'])}),/unsupported/);
  const brave=await prepareSetup({request:{...request,browser:'brave'},directory:path.join(directory,'brave'),platform,prompt:answers([directory,'environment'])});
  assert.equal(brave.plan.registrationConventionVerified,false);
}));
test('save creates only a new reviewed directory, refuses occupied/private-parent failures and never overwrites profiles',()=>fixture(async directory=>{
  const output=path.join(directory,'new'),prepared=await prepareSetup({request,directory:output,platform,prompt:answers([directory,'environment'])});
  const result=await savePreparedSetup(prepared,output,{verifyParent:async()=>{}});
  assert.deepEqual(result,{saved:true,directory:output,installed:false,registered:false});
  const original=await readFile(path.join(output,'browser-configuration.json'),'utf8');
  await assert.rejects(savePreparedSetup(prepared,output,{verifyParent:async()=>{}}),/EEXIST/);
  assert.equal(await readFile(path.join(output,'browser-configuration.json'),'utf8'),original);
  await assert.rejects(savePreparedSetup(prepared,path.join(directory,'denied'),{verifyParent:async()=>{throw Error('unsafe-acl');}}),/unsafe-acl/);
  await assert.rejects(lstat(path.join(directory,'denied')),/ENOENT/);
}));
test('run defaults to no mutation; saving and injected installation each require separate explicit confirmation',()=>fixture(async directory=>{
  let saved=0,installed=0;
  const options={requestPath:path.join(directory,'request.json'),directory:path.join(directory,'new'),platform,load:async()=>request,
    saveArtifacts:async()=>{saved++;},install:async()=>{installed++;}};
  await runSetup({...options,prompt:answers([directory,'environment'])});assert.equal(saved,0);assert.equal(installed,0);
  await runSetup({...options,save:true,prompt:answers([directory,'environment','no'])});assert.equal(saved,0);
  await runSetup({...options,save:true,prompt:answers([directory,'environment','SAVE'])});assert.equal(saved,1);assert.equal(installed,0);
  await runSetup({...options,apply:true,prompt:answers([directory,'environment','no'])});assert.equal(installed,0);
  await runSetup({...options,apply:true,prompt:answers([directory,'environment','INSTALL'])});assert.equal(installed,1);
  await assert.rejects(runSetup({...options,install:undefined,apply:true,prompt:answers([directory,'environment'])}),/installer-unavailable/);
}));
test('Windows network/device outputs are denied before prompts or filesystem work',async()=>{
  for(const directory of ['\\\\server\\share\\new','\\\\?\\C:\\new','\\\\.\\C:\\new','C:\\new:alternate']) {
    await assert.rejects(prepareSetup({request,directory,platform:'win32',prompt:async()=>{throw Error('must-not-prompt');}}),/setup-output/);
    await assert.rejects(savePreparedSetup({dryRun:true,files:{}},directory,{platform:'win32',verifyParent:async()=>{throw Error('must-not-inspect');}}),/setup-output/);
  }
});
test('an ancestor junction or symlink is rejected even when immediate output parent is a real directory',()=>fixture(async directory=>{
  const target=path.join(directory,'target'),linked=path.join(directory,'linked');await mkdir(target);await mkdir(path.join(target,'parent'));
  await symlink(target,linked,process.platform==='win32'?'junction':'dir');
  const output=path.join(linked,'parent','new'),prepared=await prepareSetup({request,directory:output,platform,prompt:answers([directory,'environment'])});
  await assert.rejects(savePreparedSetup(prepared,output),/setup-output-parent/);
  await assert.rejects(lstat(path.join(target,'parent','new')),/ENOENT/);
}));
