const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

// Publish the native host to a managed run or candidate package, then provide its exact path.
// Tests never create compiler outputs in the source tree or infer that a missing build passed.
const host = process.env.BCK_ADMIN_NATIVE_HOST ? path.resolve(process.env.BCK_ADMIN_NATIVE_HOST) : undefined;
const nativeOnly={skip:process.platform!=='win32'?'Native executable protocol requires Windows.':
  !host?'Set BCK_ADMIN_NATIVE_HOST to an explicitly built native-host executable.':false};

function frame(value) {
  const json = Buffer.from(JSON.stringify(value), 'utf8');
  const length = Buffer.alloc(4);
  length.writeInt32LE(json.length);
  return Buffer.concat([length, json]);
}

function invoke(value, origin = `chrome-extension://${'a'.repeat(32)}/`, executable = host) {
  assert.ok(executable && fs.existsSync(executable), 'The explicitly selected native-host build must exist.');
  const result = spawnSync(executable, [origin], {input: frame(value), timeout: 5000, windowsHide: true});
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.ok(result.stdout.length >= 4, result.stderr.toString());
  const length = result.stdout.readInt32LE(0);
  assert.equal(result.stdout.length, length + 4);
  return {status: result.status, response: JSON.parse(result.stdout.subarray(4).toString('utf8'))};
}

test('native host rejects unsupported operations without launching anything', nativeOnly, () => {
  const result = invoke({protocolVersion: 1, operation: 'deploy', source: 'extension-settings', extensionId: 'a'.repeat(32), extensionVersion: '6.0.0'});
  assert.equal(result.status, 1);
  assert.deepEqual(result.response, {protocolVersion: 1, operation: 'launch', ok: false, alreadyRunning: false, error: 'unsupported-request'});
});

test('native host validates installed sibling application before launch', nativeOnly, () => {
  const temporaryRoot=fs.realpathSync(os.tmpdir());
  const isolated=fs.mkdtempSync(path.join(temporaryRoot,'bck-native-without-ui-'));
  try {
    // A real package contains the WPF executable. Copy the host and its published runtime into
    // an isolated fixture without that executable so this negative case cannot open the UI.
    const source=path.dirname(host);
    for(const entry of fs.readdirSync(source,{withFileTypes:true})) {
      if(!entry.isFile() || !(/\.dll$/i.test(entry.name)
          || entry.name===path.basename(host)
          || /^BetterCaptionKeep\.AdminSetup\.NativeHost\.(?:deps|runtimeconfig)\.json$/i.test(entry.name))) continue;
      fs.copyFileSync(path.join(source,entry.name),path.join(isolated,entry.name));
    }
    assert.equal(fs.existsSync(path.join(isolated,'BetterCaptionKeep.AdminSetup.exe')),false);
  for(const extensionId of ['pjpibiimicedkckleehljlklmblkacph','ecpjboeanaehianibdbgijldbikdgkhm','edefcbdhahfolgkoamkbknjppojpaffk','nabjdlnkkaonnbnimnmnhjcbigceebml']) {
    const result = invoke({protocolVersion: 1, operation: 'launch', source: 'extension-settings', mode: 'real', extensionId, extensionVersion: '6.0.3'}, `chrome-extension://${extensionId}/`,path.join(isolated,path.basename(host)));
    assert.equal(result.status, 1);assert.equal(result.response.error, 'setup-not-installed',extensionId+' must pass origin validation');
  }
  } finally {
    const relative=path.relative(temporaryRoot,fs.realpathSync(isolated));
    assert(relative && !path.isAbsolute(relative) && !relative.startsWith('..'));
    fs.rmSync(isolated,{recursive:true,force:true});
  }
});

test('native host rejects a message identity that does not match the browser origin', nativeOnly, () => {
  const extensionId = 'pjpibiimicedkckleehljlklmblkacph';
  const result = invoke({protocolVersion: 1, operation: 'launch', source: 'extension-settings', mode: 'real', extensionId, extensionVersion: '6.0.0'}, 'chrome-extension://edefcbdhahfolgkoamkbknjppojpaffk/');
  assert.equal(result.status, 1);
  assert.equal(result.response.error, 'untrusted-extension-origin');
});

test('native host rejects an absent or unknown launch mode', nativeOnly, () => {
  const extensionId = 'pjpibiimicedkckleehljlklmblkacph';
  for (const mode of [undefined, 'write-everything']) {
    const request = {protocolVersion: 1, operation: 'launch', source: 'extension-settings', extensionId, extensionVersion: '6.0.0'};
    if (mode !== undefined) request.mode = mode;
    const result = invoke(request, `chrome-extension://${extensionId}/`);
    assert.equal(result.status, 1);
    assert.equal(result.response.error, 'invalid-mode');
  }
});
