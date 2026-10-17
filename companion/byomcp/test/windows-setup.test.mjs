import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {readdir,lstat} from 'node:fs/promises';
import {prepareWindowsSetup,installWindowsSetup,removeWindowsSetup,runWindowsSetupCli,createWindowsSetupIo,WINDOWS_SETUP_HELP} from '../windows-setup.mjs';

const sid='S-1-5-21-123-456-789-1001',root='C:\\Private\\new',nodePath='C:\\Runtime\\node.exe',cliPath='C:\\Package\\cli.mjs';
const request={version:1,browser:'chrome',extensionId:'a'.repeat(32),profile:{label:'Synthetic only',transport:'remote',resource:'https://synthetic.invalid/mcp'}};
const metadata=file=>({size:10,isSymbolicLink:()=>false,isFile:()=>file,isDirectory:()=>!file});
async function fixture() {
  const plan=await prepareWindowsSetup({request,directory:root,nodePath,cliPath,prompt:async question=>question.startsWith('Full path')?'C:\\Storage':'environment',inspect:async()=>metadata(false)});
  const files=new Map([[nodePath,'runtime'],[cliPath,'reviewed package']]);
  const dirs=new Set(['C:\\','C:\\Private','C:\\Runtime','C:\\Package']);
  const acls=new Map(),effects=[],reads=[];let registry=null;
  const io={volume:async()=> 'Fixed',inspect:async filename=>{
    if(!files.has(filename) && !dirs.has(filename)) throw Object.assign(Error('missing'),{code:'ENOENT'});
    return {...metadata(files.has(filename)),size:files.has(filename)?Buffer.byteLength(files.get(filename)):0};
  },acl:async filename=>acls.get(filename)??{currentSid:sid,owner:sid,protected:true,allow:[{sid,write:true,replace:true}]},
  read:async filename=>{reads.push(filename);return files.get(filename);},registryRead:async()=>registry,
  registryWrite:async(key,view,value)=>{effects.push('register');registry=value;},registryRemove:async()=>{effects.push('unregister');registry=null;},
  createRoot:async directory=>{if(dirs.has(directory)) throw Error('exists');effects.push('mkdir');dirs.add(directory);},
  secureRoot:async()=>{effects.push('secure');},saveArtifacts:async(prepared,directory,options)=>{
    await options.verifyParent();effects.push('save');dirs.add(directory);
    for(const [name,text] of Object.entries(prepared.files)) files.set(path.win32.join(directory,name),text);
  },writeReceipt:async(filename,value)=>{if(files.has(filename)) throw Error('exists');effects.push('receipt');files.set(filename,JSON.stringify(value));},
  readReceipt:async filename=>JSON.parse(files.get(filename))};
  return {plan,io,files,dirs,acls,effects,reads,get registry(){return registry;},set registry(value){registry=value;}};
}
test('preparation names reviewed paths without I/O effects or generic OAuth claims',async()=>{
  const f=await fixture();assert.deepEqual(f.effects,[]);assert.equal(f.plan.dryRun,true);
  assert.equal(f.plan.installation.root,root);assert.equal(f.plan.installation.nodePath,nodePath);
  assert.equal(f.plan.installation.configurationPath,`${root}\\configuration\\helper-config.json`);
  assert.match(f.plan.limitations.join(' '),/NEW setup only/);assert.match(WINDOWS_SETUP_HELP,/No existing registration is replaced/);
});
test('confirmation is required before any filesystem, ACL or registration work',async()=>{
  const f=await fixture();await assert.rejects(installWindowsSetup(f.plan,{io:f.io}),/confirmation/);
  assert.deepEqual(f.effects,[]);assert.equal(f.registry,null);
});
test('new installation protects private root before files and persists removable receipt without executing/authenticating',async()=>{
  const f=await fixture(),result=await installWindowsSetup(f.plan,{io:f.io,confirmed:true});
  assert.equal(result.installed,true);assert.equal(result.authenticated,false);
  assert.deepEqual(f.effects,['mkdir','secure','save','receipt','register','receipt']);
  assert.equal(f.registry,f.plan.installation.manifestPath);
  assert.deepEqual(JSON.parse(f.files.get(result.receiptPath)),result.receipt);
  const before=new Map(f.files);
  assert.deepEqual(await removeWindowsSetup(result.receipt,{io:f.io,confirmed:true}),{
    removed:true,filesRemoved:false,credentialsRemoved:false,filesRetained:true,credentialsRetained:true});
  assert.equal(f.registry,null);assert.deepEqual(f.files,before);
});
test('existing directories and registrations, network volumes, junctions and effective untrusted parent permissions produce no mutations',async()=>{
  for(const variant of ['exists','registration','network','junction','parent-read','ancestor-replace']) {
    const f=await fixture();
    if(variant==='exists') f.dirs.add(root);
    if(variant==='registration') f.registry='C:\\Other\\manifest.json';
    if(variant==='network') f.io.volume=async()=> 'Network';
    if(variant==='junction') {const inspect=f.io.inspect;f.io.inspect=async filename=>({...await inspect(filename),isSymbolicLink:()=>filename==='C:\\Private'});}
    if(variant==='parent-read') f.acls.set('C:\\Private',{owner:sid,currentSid:sid,allow:[{sid:'S-1-1-0',write:false}]});
    if(variant==='ancestor-replace') f.acls.set('C:\\',{owner:sid,currentSid:sid,allow:[{sid:'S-1-1-0',replace:true}]});
    await assert.rejects(installWindowsSetup(f.plan,{io:f.io,confirmed:true}));assert.deepEqual(f.effects,[],variant);
  }
});
test('inherit-only ancestor rules are ignored while effective descendant rules still fail closed',async()=>{
  const f=await fixture();f.acls.set('C:\\',{owner:sid,currentSid:sid,allow:[{sid:'S-1-5-11',write:true,replace:true,inheritOnly:true}]});
  assert.equal((await installWindowsSetup(f.plan,{io:f.io,confirmed:true})).registered,true);
  const g=await fixture();g.acls.set('C:\\Private',{owner:sid,currentSid:sid,allow:[{sid:'S-1-5-11',write:true,replace:true}]});
  await assert.rejects(installWindowsSetup(g.plan,{io:g.io,confirmed:true}));assert.deepEqual(g.effects,[]);
});
test('ACL failure retains honest partial-directory state and never writes configuration or registers',async()=>{
  const f=await fixture();f.io.secureRoot=async()=>{throw Error('SECRET OS MESSAGE');};
  await assert.rejects(installWindowsSetup(f.plan,{io:f.io,confirmed:true}),error=>{
    assert.equal(error.filesCreated,true);assert.equal(error.rollback,'not-needed');assert(!error.message.includes('SECRET'));return true;});
  assert.deepEqual(f.effects,['mkdir']);assert.equal(f.registry,null);assert(f.dirs.has(root));
});
test('receipt persistence failure rolls back only newly owned registration and retains inert files',async()=>{
  const f=await fixture(),write=f.io.writeReceipt;
  f.io.writeReceipt=async(filename,value)=>{if(filename===f.plan.receiptPath)throw Error('disk full');return write(filename,value);};
  await assert.rejects(installWindowsSetup(f.plan,{io:f.io,confirmed:true}),error=>error.filesCreated===true && error.rollback==='registration-removed');
  assert.equal(f.registry,null);assert(f.files.has(f.plan.installation.configurationPath));assert(f.files.has(`${root}\\installation-plan.json`));
});
test('receipt failure never removes a concurrent replacement and explicitly reports failed rollback',async()=>{
  const f=await fixture(),write=f.io.writeReceipt;
  f.io.writeReceipt=async(filename,value)=>{if(filename===f.plan.receiptPath){f.registry='C:\\Concurrent\\host.json';throw Error('full');}return write(filename,value);};
  await assert.rejects(installWindowsSetup(f.plan,{io:f.io,confirmed:true}),error=>error.rollback==='failed');
  assert.equal(f.registry,'C:\\Concurrent\\host.json');assert(!f.effects.includes('unregister'));
});
test('an installer rollback failure is reported as uncertain registration even without a returned receipt',async()=>{
  const f=await fixture();f.io.registryWrite=async()=>{f.registry='C:\\Concurrent\\host.json';throw Error('interrupted');};
  await assert.rejects(installWindowsSetup(f.plan,{io:f.io,confirmed:true}),error=>error.filesCreated===true && error.rollback==='failed');
  assert.equal(f.registry,'C:\\Concurrent\\host.json');assert(!f.effects.includes('unregister'));
});
test('changed or forged receipt/registration cannot remove another installation',async()=>{
  const f=await fixture(),result=await installWindowsSetup(f.plan,{io:f.io,confirmed:true});
  await assert.rejects(removeWindowsSetup(result.receipt,{io:f.io}),/confirmation/);
  await assert.rejects(removeWindowsSetup({...result.receipt,extra:1},{io:f.io,confirmed:true}),/receipt/);
  f.registry='C:\\Other\\host.json';await assert.rejects(removeWindowsSetup(result.receipt,{io:f.io,confirmed:true}),/registration-changed/);
  assert(!f.effects.includes('unregister'));
});
test('unsafe output paths and unreviewed Brave convention are refused during pure preparation',async()=>{
  for(const directory of ['\\\\host\\share\\new','C:\\new:stream','C:\\Private\\..\\new','C:\\bad.\\new']) {
    await assert.rejects(prepareWindowsSetup({request,directory,prompt:async()=>{throw Error('must not prompt');}}),/unsafe-path/);
  }
  const f=await fixture(),options={request:{...request,browser:'brave'},directory:root,nodePath,cliPath,
    prompt:async question=>question.startsWith('Full path')?'C:\\Storage':'environment',inspect:async()=>metadata(false)};
  await assert.rejects(prepareWindowsSetup(options),/registration-unverified/);
  const brave=await prepareWindowsSetup({...options,registrationConvention:'chrome'});
  assert.equal(brave.installation.registrationConvention,'chrome');assert.equal(brave.installation.browser,'brave');assert.deepEqual(f.effects,[]);
});
test('CLI dry run/help and canceled install/remove never create an installation or change registry',async()=>{
  const f=await fixture();let installs=0,removes=0,factories=0;
  const options={report:()=>{},load:async()=>request,prepare:async()=>f.plan,prompt:async()=> 'cancel',
    ioFactory:()=>{factories++;return f.io;},install:async()=>{installs++;},remove:async()=>{removes++;}};
  await runWindowsSetupCli(['--help'],options);assert.equal(factories,0);
  await runWindowsSetupCli(['--request','C:\\request.json','--output',root],options);assert.equal(factories,0);
  assert.deepEqual(await runWindowsSetupCli(['--request','C:\\request.json','--output',root,'--install'],options),{cancelled:true,changed:false});
  assert.equal(factories,0);assert.equal(installs,0);
  f.files.set(f.plan.receiptPath,JSON.stringify({installation:f.plan.installation}));
  assert.deepEqual(await runWindowsSetupCli(['--remove',f.plan.receiptPath],options),{cancelled:true,changed:false});
  assert.equal(removes,0);assert.deepEqual(f.effects,[]);
  await assert.rejects(runWindowsSetupCli(['--request','C:\\request.json','--output',root,'--evil'],options),/usage/);
});
test('CLI shows the exact prepared endpoint, identity, runtime, package, output and registry before INSTALL review',async()=>{
  const f=await fixture(),events=[];
  await runWindowsSetupCli(['--request','C:\\request.json','--output',root,'--install'],{
    load:async()=>request,prepare:async()=>f.plan,report:line=>events.push(line),
    prompt:async question=>{events.push(question);return 'cancel';},ioFactory:()=>{throw Error('must not construct mutation adapter');}});
  const promptIndex=events.findIndex(line=>line==='Type INSTALL to confirm: ');assert(promptIndex>0);
  const review=events.slice(0,promptIndex).join('\n');
  for(const expected of [request.extensionId,request.profile.label,request.profile.resource,
    JSON.stringify(nodePath),JSON.stringify(cliPath),JSON.stringify(root),
    'HKCU\\\\Software\\\\Google\\\\Chrome\\\\NativeMessagingHosts\\\\com.daftech.captionkeep.byomcp']) assert(review.includes(expected),expected);
  assert.deepEqual(f.effects,[]);
});
test('CLI displays exact quoted receipt and registration identity before REMOVE; cancellation preserves everything',async()=>{
  const f=await fixture(),events=[];
  const receipt={version:1,installation:f.plan.installation,registration:{}};
  f.files.set(f.plan.receiptPath,JSON.stringify(receipt));
  const before=new Map(f.files);
  const result=await runWindowsSetupCli(['--remove',f.plan.receiptPath],{report:line=>events.push(line),
    prompt:async question=>{events.push(question);return 'cancel';},ioFactory:()=>f.io,
    remove:async()=>{throw Error('canceled removal must not run');}});
  const promptIndex=events.findIndex(line=>line==='Type REMOVE to confirm: ');assert(promptIndex>0);
  const review=events.slice(0,promptIndex).join('\n');
  for(const expected of [JSON.stringify(f.plan.receiptPath),'Browser: "chrome"',JSON.stringify(request.extensionId),
    'HKCU\\\\Software\\\\Google\\\\Chrome\\\\NativeMessagingHosts\\\\com.daftech.captionkeep.byomcp',
    'Registry view: "Registry64"',JSON.stringify(f.plan.installation.manifestPath)]) assert(review.includes(expected),expected);
  assert.deepEqual(result,{cancelled:true,changed:false});assert.deepEqual(f.effects,[]);assert.deepEqual(f.files,before);
});
test('real OS adapter uses fixed hidden PowerShell script and stdin path data without shell interpolation',async()=>{
  const invocations=[];
  const execute=(executable,args,options,done)=>{
    const stdin=new EventEmitter();stdin.end=value=>{invocations.push({executable,args,options,input:value});done(null,'private');};return {stdin};};
  const io=createWindowsSetupIo({platform:'win32',systemRoot:'C:\\Windows',execute});
  await io.secureRoot(root);
  assert.equal(invocations.length,1);assert.equal(invocations[0].input,root);
  assert.equal(invocations[0].executable,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(invocations[0].options.windowsHide,true);assert(!invocations[0].args.at(-1).includes(root));
  assert.match(invocations[0].args.at(-1),/SetAccessRuleProtection\(\$true,\$false\)/);
  assert(!invocations[0].args.at(-1).includes('.SetOwner('));
  assert.match(invocations[0].args.at(-1),/GetAccessControl\(\[Security.AccessControl.AccessControlSections\]::Access\)/);
});
test('opt-in real Windows ACL adapter secures only a new User-owned disposable directory and retains it',{
  skip:process.platform!=='win32' || process.env.CAPTIONKEEP_TEST_WINDOWS_ACL!=='1'
},async t=>{
  const directory=`C:\\CaptionKeep-Setup-Acl-${randomUUID()}`,io=createWindowsSetupIo();
  t.diagnostic(`Disposable directory retained for inspection: ${directory}`);
  await io.createRoot(directory);
  const before=await io.acl(directory);assert.equal(before.owner,before.currentSid);
  await io.secureRoot(directory);
  const after=await io.acl(directory);
  assert.equal(after.owner,before.owner);assert.equal(after.protected,true);
  assert.equal(after.allow.length,3);
  assert.deepEqual(after.allow.map(entry=>entry.sid).sort(),[before.currentSid,'S-1-5-18','S-1-5-32-544'].sort());
  assert(after.allow.every(entry=>entry.write===true && entry.inheritOnly===false));
  assert((await lstat(directory)).isDirectory());assert.deepEqual(await readdir(directory),[]);
});
