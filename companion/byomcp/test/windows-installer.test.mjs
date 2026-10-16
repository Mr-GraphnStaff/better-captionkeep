import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {contracts} from '../helper.mjs';
import {createInstallPlan} from '../install-plan.mjs';
import {NATIVE_HOST_NAME} from '../enrollment.mjs';
import {inspectWindowsInstallation,repairWindowsRegistration,removeWindowsRegistration,createWindowsInstallerIo} from '../windows-installer.mjs';

const sid='S-1-5-21-123-456-789-1001',root='C:\\CaptionKeep';
async function fixture(browser='chrome') {
  const options={browser,extensionId:'a'.repeat(32),root,nodePath:'C:\\Runtime\\node.exe',cliPath:'C:\\Package\\cli.mjs',
    configurationPath:`${root}\\helper-config.json`,launcherPath:`${root}\\host.cmd`,manifestPath:`${root}\\${NATIVE_HOST_NAME}.json`,
    ...(['brave','opera'].includes(browser)?{registrationConvention:'chrome'}:{})};
  if(browser==='firefox') options.extensionId='captionkeep@synthetic.invalid';
  const plan=createInstallPlan({...options,browser:['brave','opera'].includes(browser)?'chrome':browser,os:'windows'});
  const profile={id:'first',label:'Synthetic service',revision:1,transport:'remote',resource:'https://synthetic.invalid/mcp',
    credentialReference:'SYNTHETIC_TOKEN',tools:[],toolAccess:'catalog'};
  profile.profileDigest=await contracts.digest(profile);
  const config={enabled:true,browserConfiguration:{version:1,hostName:NATIVE_HOST_NAME,
    allowedCallers:[{browser,caller:browser==='firefox'?options.extensionId:`chrome-extension://${options.extensionId}/`}],profiles:[{profile,actions:[]}]},
    browserStoragePath:'C:\\BrowserStorage',verificationTools:[],oauthStorePath:`${root}\\credentials.dpapi`};
  const files=new Map([[options.manifestPath,JSON.stringify(plan.manifest)],[options.launcherPath,plan.launcher],
    [options.configurationPath,JSON.stringify(config)],[options.cliPath,'synthetic-code'],[options.nodePath,'synthetic-runtime'],[config.oauthStorePath,'DO-NOT-READ-SECRET']]);
  let registry=null;
  const reads=[],writes=[],removed=[],paths=[],acls=new Map();
  const io={
    volume:async()=> 'Fixed',
    inspect:async filename=>({size:files.has(filename)?Buffer.byteLength(files.get(filename)):0,
      isFile:()=>files.has(filename),isDirectory:()=>!files.has(filename),isSymbolicLink:()=>false}),
    read:async filename=>{reads.push(filename);return files.get(filename);},
    acl:async filename=>{paths.push(filename);return acls.get(filename)??{owner:sid,currentSid:sid,protected:true,allow:[{sid,write:true}]};},
    registryRead:async()=>registry,
    registryWrite:async(key,view,value)=>{writes.push({key,view,value});registry=value;},
    registryRemove:async(key,view)=>{removed.push({key,view});registry=null;}
  };
  return {options,files,config,io,reads,writes,removed,paths,acls,get registry(){return registry;},set registry(value){registry=value;}};
}

test('read-only health checks exact identity, launcher and private ACLs without secrets or mutation',async()=>{
  const f=await fixture();const health=await inspectWindowsInstallation(f.options,{io:f.io});
  assert.deepEqual(health,{valid:true,registration:'missing',browser:'chrome',view:'Registry64',profileCount:1,credentialsRead:false});
  assert(!f.reads.includes(f.config.oauthStorePath));assert.equal(f.writes.length,0);
  assert(!JSON.stringify(health).includes(root));assert(f.paths.includes('C:\\'));
});
test('confirmed repair writes only fixed per-user host default after all validation and is idempotent',async()=>{
  const f=await fixture(),before=new Map(f.files);
  await assert.rejects(repairWindowsRegistration(f.options,{io:f.io}),/ownership/);
  const result=await repairWindowsRegistration(f.options,{io:f.io,confirmed:true});
  assert.equal(result.changed,true);assert.equal(result.receipt.previous,null);
  assert.deepEqual(f.writes,[{key:`HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,view:'Registry64',value:f.options.manifestPath}]);
  assert.deepEqual(f.files,before);assert.equal(f.reads.includes(f.config.oauthStorePath),false);
  const second=await repairWindowsRegistration(f.options,{io:f.io,confirmed:true});assert.equal(second.changed,false);assert.equal(f.writes.length,1);
});
test('conflicting existing registration is preserved rather than silently replaced',async()=>{
  const f=await fixture();f.registry='C:\\Other\\host.json';
  assert.equal((await inspectWindowsInstallation(f.options,{io:f.io})).registration,'conflict');
  await assert.rejects(repairWindowsRegistration(f.options,{io:f.io,confirmed:true}),/registration-conflict/);
  assert.equal(f.registry,'C:\\Other\\host.json');assert.equal(f.writes.length,0);
});
test('post-write failure rolls back only the newly written default value',async()=>{
  const f=await fixture();let written=false;
  const original=f.io.registryWrite;f.io.registryWrite=async(...args)=>{await original(...args);written=true;throw Error('synthetic write interruption');};
  await assert.rejects(repairWindowsRegistration(f.options,{io:f.io,confirmed:true}),/registration-failed/);
  assert(written);assert.equal(f.registry,null);assert.equal(f.removed.length,1);
});
test('concurrent registration changes before mutation and during rollback are not clobbered',async()=>{
  const f=await fixture();let count=0;
  f.io.registryRead=async()=>++count===1?null:'C:\\Concurrent\\host.json';
  await assert.rejects(repairWindowsRegistration(f.options,{io:f.io,confirmed:true}),/registration-changed/);
  assert.equal(f.writes.length,0);
  const g=await fixture();g.io.registryWrite=async()=>{g.registry='C:\\Concurrent\\host.json';throw Error('interrupted');};
  await assert.rejects(repairWindowsRegistration(g.options,{io:g.io,confirmed:true}),/rollback-failed/);
  assert.equal(g.registry,'C:\\Concurrent\\host.json');assert.equal(g.removed.length,0);
});
test('uninstall only removes receipt-owned unchanged default and retains every file and credential',async()=>{
  const f=await fixture(),before=new Map(f.files),result=await repairWindowsRegistration(f.options,{io:f.io,confirmed:true});
  await assert.rejects(removeWindowsRegistration(f.options,result.receipt,{io:f.io}),/ownership/);
  assert.deepEqual(await removeWindowsRegistration(f.options,result.receipt,{io:f.io,confirmed:true}),{removed:true,filesRemoved:false,credentialsRemoved:false});
  assert.equal(f.registry,null);assert.deepEqual(f.files,before);
});
test('uninstall refuses a replaced registration, changed manifest or forged receipt',async()=>{
  const f=await fixture(),{receipt}=await repairWindowsRegistration(f.options,{io:f.io,confirmed:true});
  f.registry='C:\\Other\\manifest.json';
  await assert.rejects(removeWindowsRegistration(f.options,receipt,{io:f.io,confirmed:true}),/registration-changed/);
  f.registry=f.options.manifestPath;
  await assert.rejects(removeWindowsRegistration(f.options,{...receipt,previous:'C:\\victim.json'},{io:f.io,confirmed:true}),/ownership/);
  f.files.set(f.options.manifestPath,JSON.stringify(JSON.parse(f.files.get(f.options.manifestPath)),null,2));
  await assert.rejects(removeWindowsRegistration(f.options,receipt,{io:f.io,confirmed:true}),/ownership/);
  assert.equal(f.removed.length,0);
});
test('endpoint/command injection, network/device paths and paths outside owner root fail before registry writes',async()=>{
  for(const change of [{nodePath:'\\\\host\\share\\node.exe'},{root:'C:\\'},{configurationPath:'C:\\Other\\config.json'},
    {nodePath:'C:\\Runtime\\node.exe:stream'},{nodePath:'C:\\Runtime\\..\\node.exe'},{nodePath:'C:\\Runtime\\node%EVIL%.exe'},
    {manifestPath:'C:\\CaptionKeep\\bad.\\manifest.json'}]) {
    const f=await fixture();const health=await inspectWindowsInstallation({...f.options,...change},{io:f.io});assert.equal(health.valid,false);
    await assert.rejects(repairWindowsRegistration({...f.options,...change},{io:f.io,confirmed:true}));assert.equal(f.writes.length,0);
  }
});
test('writable ancestors, junctions and unprotected private roots fail closed',async()=>{
  for(const variant of ['writable','junction','inherited','readable']) {
    const f=await fixture();
    if(variant==='writable') f.acls.set('C:\\',{owner:sid,currentSid:sid,protected:true,allow:[{sid:'S-1-1-0',write:true}]});
    if(variant==='inherited') f.acls.set(root,{owner:sid,currentSid:sid,protected:false,allow:[{sid,write:true}]});
    if(variant==='readable') f.acls.set(f.options.configurationPath,{owner:sid,currentSid:sid,protected:true,allow:[{sid:'S-1-1-0',write:false}]});
    if(variant==='junction') {const inspect=f.io.inspect;f.io.inspect=async filename=>({...await inspect(filename),isSymbolicLink:()=>filename==='C:\\Package'});}
    assert.equal((await inspectWindowsInstallation(f.options,{io:f.io})).valid,false);
    await assert.rejects(repairWindowsRegistration(f.options,{io:f.io,confirmed:true}));assert.equal(f.writes.length,0);
  }
});
test('benign ancestor create-directory permission is not confused with child replacement; network volumes fail closed',async()=>{
  const f=await fixture();f.acls.set('C:\\',{owner:sid,currentSid:sid,protected:false,allow:[{sid:'S-1-5-11',write:true,replace:false}]});
  assert.equal((await inspectWindowsInstallation(f.options,{io:f.io})).valid,true);
  f.acls.get('C:\\').allow[0].replace=true;assert.equal((await inspectWindowsInstallation(f.options,{io:f.io})).valid,false);
  const g=await fixture();g.io.volume=async()=> 'Network';
  await assert.rejects(repairWindowsRegistration(g.options,{io:g.io,confirmed:true}),/unsafe-filesystem/);assert.equal(g.writes.length,0);
});
test('inherit-only ancestor rules do not grant rights on the inspected object; effective descendant rights still deny',async()=>{
  const f=await fixture();
  const inherited={sid:'S-1-5-11',inheritOnly:true,write:true,replace:true};
  f.acls.set('C:\\',{owner:sid,currentSid:sid,protected:false,allow:[inherited]});
  assert.equal((await inspectWindowsInstallation(f.options,{io:f.io})).valid,true);
  inherited.inheritOnly=false;
  assert.equal((await inspectWindowsInstallation(f.options,{io:f.io})).valid,false);
  inherited.inheritOnly=true;
  f.acls.set(root,{owner:sid,currentSid:sid,protected:true,allow:[{sid:'S-1-5-11',write:true,replace:true}]});
  assert.equal((await inspectWindowsInstallation(f.options,{io:f.io})).valid,false);
  assert.equal(f.writes.length,0);
});

test('wrong origin, extra origin, altered launcher and invalid profile digest never register',async()=>{
  for(const variant of ['origin','extra','launcher','digest']) {
    const f=await fixture();
    if(variant==='origin' || variant==='extra') {const manifest=JSON.parse(f.files.get(f.options.manifestPath));manifest.allowed_origins=variant==='origin'?['chrome-extension://'+'b'.repeat(32)+'/']:[...manifest.allowed_origins,'chrome-extension://'+'b'.repeat(32)+'/'];f.files.set(f.options.manifestPath,JSON.stringify(manifest));}
    if(variant==='launcher') f.files.set(f.options.launcherPath,f.files.get(f.options.launcherPath)+'evil.exe\r\n');
    if(variant==='digest') {f.config.browserConfiguration.profiles[0].profile.label='tampered';f.files.set(f.options.configurationPath,JSON.stringify(f.config));}
    await assert.rejects(repairWindowsRegistration(f.options,{io:f.io,confirmed:true}));assert.equal(f.writes.length,0);
  }
});
test('Brave/Opera explicitly use checked Chrome convention; Edge and Firefox use exact respective keys',async()=>{
  for(const [browser,vendor] of [['brave','Google\\Chrome'],['opera','Google\\Chrome'],['edge','Microsoft\\Edge'],['firefox','Mozilla']]) {
    const f=await fixture(browser);await repairWindowsRegistration(f.options,{io:f.io,confirmed:true});
    assert.equal(f.writes[0].key,`HKCU\\Software\\${vendor}\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`);
    if(['brave','opera'].includes(browser)) {delete f.options.registrationConvention;await assert.rejects(repairWindowsRegistration(f.options,{io:f.io,confirmed:true}),/unsupported-registration/);}
  }
});
test('health never returns raw OS errors or profile/configuration content',async()=>{
  const f=await fixture();f.io.acl=async()=>{throw Error('SENSITIVE-TOKEN-AND-PATH');};
  const result=await inspectWindowsInstallation(f.options,{io:f.io});
  assert.deepEqual(result,{valid:false,reason:'invalid-installation',credentialsRead:false});
});
test('OS adapter uses fixed script, absolute executable and stdin JSON, never interpolated shell data',async()=>{
  let invocation;
  const io=createWindowsInstallerIo({platform:'win32',systemRoot:'C:\\Windows',execute:(executable,args,options,callback)=>{
    invocation={executable,args,options};const child=new EventEmitter();child.stdin={end:input=>{invocation.input=JSON.parse(input);callback(null,'null');}};return child;
  }});
  assert.equal(await io.registryRead(`HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,'Registry32'),null);
  assert.equal(invocation.executable,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert(!invocation.args.includes(invocation.input.key));assert.equal(invocation.options.windowsHide,true);
  assert.equal(invocation.options.env.PSModulePath,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules');
  assert.throws(()=>createWindowsInstallerIo({platform:'linux'}),/os-unavailable/);
});
test('real Windows adapter reads ACL, local drive type and current-user registration without changing them',
  {skip:process.platform!=='win32'},async()=>{
    const io=createWindowsInstallerIo(),drive=process.env.SystemRoot.slice(0,3),acl=await io.acl(drive);
    assert(acl.owner);assert.match(acl.currentSid,/^S-1-(?:5-21|12-1)-/);assert(Array.isArray(acl.allow));
    assert.equal(await io.volume(drive),'Fixed');
    const value=await io.registryRead(`HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,'Registry64');
    assert(value===null || typeof value==='string');
  });
