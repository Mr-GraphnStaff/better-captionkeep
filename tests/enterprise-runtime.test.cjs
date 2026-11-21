const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

test('native setup owner survives hidden Windows PowerShell and nested PowerShell, then restores exact state',
  {skip: process.platform !== 'win32'}, () => {
    assert.ok(process.env.AGENT_WORKING_DIR, 'Run native tests through working_area.py run.');
    const probe = path.join(__dirname, '../admin-setup/tests/setup-owner-native.ps1');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-File', probe],
      {encoding: 'utf8', windowsHide: true, timeout: 60000});
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /"ownerVerified":\s*true/);
    assert.match(result.stdout, /"styleRestored":\s*true/);
    assert.match(result.stdout, /"restored":\s*true/);
  });
