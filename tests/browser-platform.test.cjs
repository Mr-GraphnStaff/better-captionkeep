const test = require('node:test');
const assert = require('node:assert/strict');

test('Linux discovery identifies real Chrome paths without silently certifying Chromium as Chrome', async () => {
  const {browserCandidates} = await import('../scripts/browser-platform.mjs');
  const chrome = browserCandidates('linux').find(item => item.browser === 'chrome');
  assert(chrome.paths.includes('/usr/bin/google-chrome'));
  assert(!chrome.paths.some(candidate => candidate.includes('chromium')));
  assert.equal(browserCandidates('linux').length, 5);
});

test('Windows and macOS discovery retain separate browser identities', async () => {
  const {browserCandidates} = await import('../scripts/browser-platform.mjs');
  for (const platform of ['win32','darwin']) {
    assert.deepEqual(browserCandidates(platform, {LOCALAPPDATA:'C:/Synthetic'}).map(item => item.browser),
      ['chrome','edge','brave','opera','firefox']);
    assert.equal(browserCandidates(platform).find(item => item.browser === 'firefox').chromium, false);
  }
});
