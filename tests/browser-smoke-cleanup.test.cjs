const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {mkdtemp,writeFile,access,rm}=require('node:fs/promises');

const profile=path.join(os.tmpdir(),'captionkeep-surface-synthetic');
function browser() {
  const child=new EventEmitter();child.pid=1234;child.exitCode=null;child.signalCode=null;
  child.finish=()=>{child.exitCode=0;child.emit('exit',0);};
  return child;
}

test('surface cleanup waits for graceful browser shutdown before deleting its profile',async()=>{
  const {cleanupChromiumSurface}=await import('../scripts/rendered-surface-checks.mjs');
  const child=browser(),events=[];
  const cdp={async send(method){assert.equal(method,'Browser.close');events.push('close request');setTimeout(()=>{events.push('exited');child.finish();},5);},close(){events.push('socket closed');}};
  await cleanupChromiumSurface({child,cdp,profile},{exitTimeoutMs:100,
    terminate(){assert.fail('A graceful browser must not be killed');},
    async remove(directory){assert.equal(directory,profile);assert.equal(child.exitCode,0);events.push('removed');}});
  assert.deepEqual(events,['close request','exited','socket closed','removed']);
  assert.equal(child.listenerCount('exit'),0);
});

test('surface cleanup terminates a nonresponsive spawned tree before profile removal',async()=>{
  const {cleanupChromiumSurface}=await import('../scripts/rendered-surface-checks.mjs');
  const child=browser();let terminated=false,removed=false;
  await cleanupChromiumSurface({child,profile},{exitTimeoutMs:1,
    async terminate(actual){assert.equal(actual,child);terminated=true;child.finish();},
    async remove(){assert(terminated);assert.equal(child.exitCode,0);removed=true;}});
  assert(removed);assert.equal(child.listenerCount('exit'),0);
});

test('surface cleanup fails if the browser survives termination and leaves profile intact',async()=>{
  const {cleanupChromiumSurface}=await import('../scripts/rendered-surface-checks.mjs');
  const child=browser();let closed=false;
  await assert.rejects(cleanupChromiumSurface({child,profile,cdp:{async send(){throw Error('closing socket');},close(){closed=true;}}},
    {exitTimeoutMs:1,async terminate(){},remove(){assert.fail('Profile must not be removed while browser runs');}}),/did not exit/);
  assert(closed);assert.equal(child.listenerCount('exit'),0);
});

test('termination error permits a delayed exit notification before removing the profile',async()=>{
  const {cleanupChromiumSurface}=await import('../scripts/rendered-surface-checks.mjs');
  const child=browser();let removed=false;
  await cleanupChromiumSurface({child,profile},{exitTimeoutMs:50,
    async terminate(){setTimeout(()=>child.finish(),10);throw Error('process already exited');},
    async remove(){assert.equal(child.exitCode,0);removed=true;}});
  assert(removed);assert.equal(child.listenerCount('exit'),0);
});

test('termination error remains a failure when no delayed exit arrives',async()=>{
  const {cleanupChromiumSurface}=await import('../scripts/rendered-surface-checks.mjs');
  const child=browser(),error=new Error('termination failed while alive');
  await assert.rejects(cleanupChromiumSurface({child,profile},{exitTimeoutMs:1,
    async terminate(){throw error;},remove(){assert.fail('Live browser profile must be retained');}}),actual=>actual===error);
  assert.equal(child.listenerCount('exit'),0);
});

test('surface cleanup rejects paths outside its exact temporary directory boundary',async()=>{
  const {cleanupChromiumSurface}=await import('../scripts/rendered-surface-checks.mjs');
  for(const directory of [os.tmpdir(),path.join(os.tmpdir(),'ordinary-profile'),path.join(profile,'nested'),path.join(os.tmpdir(),'captionkeep-surface-')]) {
    await assert.rejects(cleanupChromiumSurface({profile:directory},{remove(){assert.fail('Unsafe path was removed');}}),/Unsafe Chromium/);
  }
});

test('persistent profile lock remains an explicit gate failure',async()=>{
  const {cleanupChromiumSurface}=await import('../scripts/rendered-surface-checks.mjs');
  const locked=Object.assign(new Error('synthetic persistent lock'),{code:'EBUSY'});
  await assert.rejects(cleanupChromiumSurface({profile},{async remove(directory,options){
    assert.equal(directory,profile);assert(options.maxRetries>0);throw locked;
  }}),error=>error===locked);
});

test('Windows transient file lock is retried until the isolated profile can be removed',
  {skip:process.platform!=='win32'},async()=>{
    const {cleanupChromiumSurface}=await import('../scripts/rendered-surface-checks.mjs');
    const directory=await mkdtemp(path.join(os.tmpdir(),'captionkeep-surface-'));
    const filename=path.join(directory,'synthetic-lock.txt');await writeFile(filename,'synthetic');
    const command="$ErrorActionPreference='Stop';$f=[IO.File]::Open($env:CAPTIONKEEP_TEST_LOCK,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None);try{[Console]::WriteLine('LOCKED');Start-Sleep -Milliseconds 800}finally{$f.Dispose()}";
    const child=spawn(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo','-NoProfile','-NonInteractive','-Command',command],
      {windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CAPTIONKEEP_TEST_LOCK:filename}});
    const closed=new Promise(resolve=>child.once('close',resolve));
    try {
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Synthetic lock did not become ready')),10000);
        child.once('error',error=>{clearTimeout(timer);reject(error);});
        child.once('exit',code=>{clearTimeout(timer);if(code)reject(new Error('Synthetic lock process failed'));});
        child.stdout.once('data',bytes=>{clearTimeout(timer);if(bytes.toString().includes('LOCKED'))resolve();else reject(new Error('Synthetic lock not acquired'));});
      });
      await cleanupChromiumSurface({profile:directory});
      await assert.rejects(access(directory),error=>error.code==='ENOENT');
    } finally {
      if(child.exitCode===null)child.kill();await closed;
      await rm(directory,{recursive:true,force:true,maxRetries:8,retryDelay:250});
    }
  });

test('browser startup waits for a page after the debugging endpoint first exposes only workers',async()=>{
  const {waitForPageTarget}=await import('../scripts/rendered-surface-checks.mjs');
  let reads=0;const page={type:'page',webSocketDebuggerUrl:'ws://127.0.0.1/synthetic'};
  assert.equal(await waitForPageTarget(0,{timeoutMs:100,intervalMs:1,async targets(){
    reads++;return reads===1?[]:reads===2?[{type:'service_worker'}]:[page];
  }}),page);
  assert.equal(reads,3);
});

test('page readiness never hides permanent absence or endpoint failure',async()=>{
  const {waitForPageTarget}=await import('../scripts/rendered-surface-checks.mjs');
  await assert.rejects(waitForPageTarget(0,{timeoutMs:0,async targets(){return [{type:'page'}];}}),/unavailable/);
  await assert.rejects(waitForPageTarget(0,{async targets(){throw Error('synthetic endpoint failure');}}),/endpoint failure/);
});
