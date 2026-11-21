const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const flushAsync = () => new Promise(resolve => setImmediate(resolve));

test('extension exposes a single organization setup front door', () => {
  const html = fs.readFileSync(path.join(root, 'teams-captions-saver', 'popup.html'), 'utf8');
  assert.match(html, /id="launchOrganizationSetup"/);
  assert.match(html, /Administrator setup — Development/);
  assert.match(html, /deploy through Intune/i);
  assert.match(html, /review the permissions and organization-wide changes/i);
  assert.doesNotMatch(html, /Intune deployment is not enabled/i);
  assert.doesNotMatch(html, /Start-Setup\.cmd/);
});

function browserFixture({granted = true, nativeError, response, available, updateAvailable, deferPermission = false, deferNative = false, deferDownload = false, downloadError} = {}) {
  const vm = require('node:vm');
  const listeners = {};
  const button = {disabled:false,textContent:'Open administrator setup',focus(){this.focused=true;},addEventListener(name,callback){listeners[name]=callback;}};
  const cancel = {hidden:true,focus(){this.focused=true;},addEventListener(name,callback){listeners.cancel=callback;}};
  const update = {hidden:true,disabled:false,addEventListener(name,callback){listeners.update=callback;}};
  const status = {textContent:''};
  const calls = [];
  const timers = new Map();
  const pending = {};
  const runtime = {
    id:'pjpibiimicedkckleehljlklmblkacph',getManifest:()=>({version:'6.0.0'}),
    sendNativeMessage(host,message,callback){
      calls.push({host,message});
      const complete = (error = nativeError, result = response) => {
        if(error) runtime.lastError={message:error};
        callback(result ?? {ok:true,protocolVersion:1,operation:'launch'});
        delete runtime.lastError;
      };
      if(deferNative) pending.native=complete;
      else complete();
    }
  };
  const context = {
    setTimeout(callback){const id=timers.size+1;timers.set(id,callback);return id;},
    clearTimeout(id){timers.delete(id);},
    chrome:{runtime,downloads:{download(options,callback){
      calls.push({download:options});
      const complete=()=>{if(downloadError) runtime.lastError={message:downloadError};callback(downloadError?undefined:42);delete runtime.lastError;};
      if(deferDownload)pending.download=complete;else complete();
    }},
      permissions:{request(request,callback){calls.push({permission:request});if(deferPermission)pending.permission=()=>callback(granted);else callback(granted);}}},
    document:{readyState:'complete',getElementById:id=>({launchOrganizationSetup:button,cancelOrganizationSetup:cancel,updateOrganizationSetup:update,organizationSetupStatus:status}[id])}
  };
  let source=fs.readFileSync(path.join(root,'teams-captions-saver/adminSetupClient.js'),'utf8');
  // Override only explicit release-state fixtures. Other tests exercise the
  // shipping flag unchanged, whether the release is available or not.
  if(typeof available==='boolean') {
    assert.match(source,/\bavailable:\s*(?:true|false)\b/);
    source=source.replace(/(\bavailable:\s*)(?:true|false)\b/,(_match,prefix)=>prefix+available);
  }
  if(typeof updateAvailable==='boolean') {
    assert.match(source,/\bupdateAvailable:\s*(?:true|false)\b/);
    source=source.replace(/(\bupdateAvailable:\s*)(?:true|false)\b/,(_match,prefix)=>prefix+updateAvailable);
  }
  vm.runInNewContext(source,context);
  return {button,cancel,update,status,calls,pending,timers,click:()=>listeners.click(),cancelClick:()=>listeners.cancel(),updateClick:()=>listeners.update()};
}

test('actual click requests permission synchronously and launches through callback-only Chromium APIs', async () => {
  const fixture=browserFixture();
  const pending=fixture.click();
  assert.equal(fixture.calls.length,1,'permission must be requested in the click gesture before awaiting anything');
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls[0])),{permission:{permissions:['nativeMessaging']}});
  await pending;
  assert.equal(fixture.calls[1].host,'com.daftech.bettercaptionkeep.adminsetup');
  assert.match(fixture.status.textContent,/setup opened/i);
  assert.equal(fixture.button.disabled,false);
});

test('denied permission never turns into an installer offer', async () => {
  const denied=browserFixture({granted:false});
  await denied.click();
  assert.equal(denied.calls.length,1);
  assert.match(denied.status.textContent,/permission was not approved/i);
  assert.equal(denied.cancel.hidden,true);
  assert.equal(denied.button.textContent,'Open administrator setup');
});

test('missing helper offers Download and install only for a released installer', async () => {
  const missing=browserFixture({nativeError:'Specified native messaging host not found.',available:true});
  await missing.click();
  assert.match(missing.status.textContent,/one-time installation/);
  assert.equal(missing.button.textContent,'Download and install');
  assert.equal(missing.button.disabled,false);
  assert.equal(missing.cancel.hidden,false);
  assert.equal(missing.calls.filter(call=>call.download).length,0);
  const unreleased=browserFixture({nativeError:'Specified native messaging host not found.',available:false});
  await unreleased.click();
  assert.equal(unreleased.button.disabled,true);
  assert.match(unreleased.status.textContent,/has not been released/);
  assert.equal(unreleased.calls.filter(call=>call.download).length,0);
});

test('installer download guides Windows installation, then one explicit retry launches setup', async () => {
  const f=browserFixture({nativeError:'Specified native messaging host not found.',available:true,deferNative:true});
  const initial=f.click();await flushAsync();f.pending.native();await initial;
  await f.click();
  assert.equal(f.calls.filter(call=>call.download).length,1);
  assert.match(f.calls.find(call=>call.download).download.url,/\/releases\/download\/admin-setup-v(\d+\.\d+\.\d+)\/BetterCaptionKeep-AdministratorSetup-\1-win-x64\.exe$/);
  assert.equal(f.button.textContent,'Continue setup');
  assert.match(f.status.textContent,/download has started.*When it finishes, open the installer/);
  assert.equal(f.calls.filter(call=>call.host).length,1,'download must not imply an installed helper');
  const retry=f.click();await flushAsync();f.pending.native(null,{ok:true,protocolVersion:1,operation:'launch'});await retry;
  assert.equal(f.calls.filter(call=>call.host).length,2);
  assert.match(f.status.textContent,/setup opened/);
});

test('unrelated native errors and malformed replies never suggest reinstalling', async () => {
  for(const options of [{nativeError:'Access is denied.'},{response:{ok:true,protocolVersion:2,operation:'launch'}},{response:{ok:false,error:'untrusted-extension-origin'}},{response:{ok:false,error:'setup-not-installed'}}]) {
    const f=browserFixture({...options,available:true});await f.click();
    assert.equal(f.button.textContent,'Open administrator setup');
    assert.equal(f.cancel.hidden,true);
    assert.equal(f.calls.filter(call=>call.download).length,0);
  }
});

test('Cancel while permission is pending prevents a subsequent native launch', async () => {
  const f=browserFixture({deferPermission:true});const request=f.click();
  f.cancelClick();f.pending.permission();await request;
  assert.equal(f.calls.filter(call=>call.host).length,0);
  assert.match(f.status.textContent,/cancelled/);
});

test('Cancel while native request is pending ignores its late missing-host response', async () => {
  const f=browserFixture({deferNative:true,nativeError:'Specified native messaging host not found.',available:true});
  const request=f.click();await flushAsync();f.cancelClick();f.pending.native();await request;
  assert.equal(f.button.textContent,'Open administrator setup');
  assert.match(f.status.textContent,/cancelled/);
  assert.equal(f.cancel.hidden,true);
});

test('a hung native host times out and late success cannot overwrite the result', async () => {
  const f=browserFixture({deferNative:true});const request=f.click();await flushAsync();
  [...f.timers.values()][0]();await request;
  assert.match(f.status.textContent,/did not respond/);
  assert.equal(f.button.disabled,false);
  f.pending.native();await Promise.resolve();
  assert.match(f.status.textContent,/did not respond/);
});

test('download failure offers an actionable retry without claiming installation', async () => {
  const f=browserFixture({nativeError:'Specified native messaging host not found.',available:true,downloadError:'blocked'});
  await f.click();await f.click();
  assert.match(f.status.textContent,/download could not start/);
  assert.equal(f.button.textContent,'Download and install');
  assert.equal(f.button.disabled,false);
});

test('an installed helper has one ordinary update action that downloads before explicit Continue setup', async () => {
  const f=browserFixture({available:true,updateAvailable:true});
  await f.click();
  assert.equal(f.calls.filter(call=>call.host).length,1);
  assert.equal(f.update.hidden,false);
  await f.updateClick();
  assert.equal(f.calls.filter(call=>call.download).length,1);
  assert.equal(f.calls.filter(call=>call.host).length,1,'update download must not launch the old installed helper');
  assert.match(f.status.textContent,/update download has started.*close Administrator Setup, open the installer/);
  assert.equal(f.button.textContent,'Continue setup');
  assert.equal(f.update.hidden,true);
  await f.click();
  assert.equal(f.calls.filter(call=>call.host).length,2);
  assert.match(f.status.textContent,/setup opened/);
  assert.doesNotMatch(f.status.textContent,/update installed|version verified/i);
});

test('missing-helper installation and pending downloads do not expose duplicate update actions', async () => {
  const f=browserFixture({nativeError:'Specified native messaging host not found.',available:true,updateAvailable:true,deferDownload:true});
  await f.click();
  assert.equal(f.update.hidden,true);
  await f.updateClick();
  assert.equal(f.calls.filter(call=>call.download).length,0);
  const download=f.click();await flushAsync();
  assert.equal(f.update.hidden,true);
  await f.updateClick();
  assert.equal(f.calls.filter(call=>call.download).length,1);
  f.pending.download();await download;
  assert.equal(f.update.hidden,true);
});

test('Cancel during an update download ignores the late callback and never auto-launches setup', async () => {
  const f=browserFixture({available:true,updateAvailable:true,deferDownload:true});
  const download=f.updateClick();await flushAsync();
  assert.equal(f.update.hidden,true);
  f.cancelClick();f.pending.download();await download;
  assert.match(f.status.textContent,/cancelled/);
  assert.equal(f.button.textContent,'Open administrator setup');
  assert.equal(f.update.hidden,false);
  assert.equal(f.calls.filter(call=>call.host).length,0);
});

test('unverified updates stay hidden even when an older installer is available', async () => {
  const f=browserFixture({available:true,updateAvailable:false});
  assert.equal(f.update.hidden,true);
  await f.updateClick();
  assert.equal(f.calls.length,0);
});

test('front door uses the fixed native host and never handles credentials', () => {
  const source = fs.readFileSync(path.join(root, 'teams-captions-saver', 'adminSetupClient.js'), 'utf8');
  assert.match(source, /com\.daftech\.bettercaptionkeep\.adminsetup/);
  assert.match(source, /sendNativeMessage/);
  assert.match(source, /mode:\s*'real'/);
  assert.doesNotMatch(source, /password|clientSecret|accessToken|refreshToken/i);
});

test('front door never treats an unknown running setup mode as ready', () => {
  const client = fs.readFileSync(path.join(root, 'teams-captions-saver', 'adminSetupClient.js'), 'utf8');
  const host = fs.readFileSync(path.join(root, 'admin-setup', 'src', 'BetterCaptionKeep.AdminSetup.NativeHost', 'Program.cs'), 'utf8');
  assert.match(host, /setup-instance-conflict/);
  assert.doesNotMatch(host, /return new\(1, "launch", true, alreadyRunning/);
  assert.match(client, /Close the existing Better CaptionKeep Administrator Setup window, then try again/);
  assert.doesNotMatch(client, /Organization setup is already open/);
});

test('manifest requests native messaging only as an optional permission', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'teams-captions-saver', 'manifest.json'), 'utf8'));
  assert.ok(manifest.optional_permissions.includes('nativeMessaging'));
  assert.ok(!manifest.permissions.includes('nativeMessaging'));
});

test('native host registration is constrained to explicit extension origins', () => {
  const host = JSON.parse(fs.readFileSync(path.join(root, 'admin-setup', 'packaging', 'com.daftech.bettercaptionkeep.adminsetup.template.json'), 'utf8'));
  assert.equal(host.name, 'com.daftech.bettercaptionkeep.adminsetup');
  assert.equal(host.type, 'stdio');
  assert.deepEqual(host.allowed_origins, [
    'chrome-extension://__EDGE_EXTENSION_ID__/',
    'chrome-extension://__CHROME_EXTENSION_ID__/'
  ]);
});
