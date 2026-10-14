const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {existsSync} = require('node:fs');

const binary = process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : ['/usr/bin/google-chrome-stable','/usr/bin/google-chrome'].find(candidate => existsSync(candidate));
test('real unpacked extension preserves legacy data and enforces recovery/deletion boundaries',
  {skip:!binary || !existsSync(binary)}, async () => {
    const {runLoadedExtension} = await import('../scripts/loaded-extension-checks.mjs');
    const result = await runLoadedExtension(binary,path.resolve(__dirname,'../teams-captions-saver'),{browserName:'chrome'});
    assert.equal(result.checks.length,8);
    assert(result.checks.every(check => check.passed));
    assert.match(result.scope,/No live meeting providers or store-installed upgrade/);
    assert.match(result.workerSha256,/^[a-f0-9]{64}$/);
  });
