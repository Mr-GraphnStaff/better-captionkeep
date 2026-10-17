import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWindowsCredentialStore} from '../cloudflare-oauth.mjs';

// Exercise the real Windows PowerShell/DPAPI boundary, not a mocked process.
// Only synthetic values in this uniquely created temporary directory are used.
test('Windows private credential store creates, reads and atomically overwrites a synthetic record',{
  skip:process.platform!=='win32'?'Requires actual Windows PowerShell and CurrentUser DPAPI.':false,
  timeout:45000
},async()=>{
  const temporaryRoot=path.resolve(os.tmpdir());
  const scratch=await mkdtemp(path.join(temporaryRoot,'captionkeep-dpapi-qa-'));
  const relative=path.relative(temporaryRoot,path.resolve(scratch));
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  assert(path.basename(scratch).startsWith('captionkeep-dpapi-qa-'));
  try {
    // The production store creates this new child with its private ACL itself.
    const store=createWindowsCredentialStore({storePath:path.join(scratch,'private','synthetic.dpapi')});
    const first={version:1,value:'SYNTHETIC_FIRST_NOT_A_CREDENTIAL'};
    const second={version:2,value:'SYNTHETIC_SECOND_NOT_A_CREDENTIAL'};
    assert.equal(await store.write(first),true);
    assert.deepEqual(await store.read(),first);
    assert.equal(await store.write(second),true);
    assert.deepEqual(await store.read(),second);
    // An over-budget failed write must not replace the prior good record.
    await assert.rejects(store.write({value:'x'.repeat(70000)}),/not-verified/);
    assert.deepEqual(await store.read(),second);
  } finally {
    // Exact, validated directory returned by mkdtemp; never a user vault.
    await rm(scratch,{recursive:true,force:true});
  }
});
