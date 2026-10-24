const test = require('node:test');
const assert = require('node:assert/strict');
const {create,STORAGE_KEY} = require('../teams-captions-saver/captureTabProtection.js');
const SESSION_A = '11111111-1111-4111-8111-111111111111';
const SESSION_B = '22222222-2222-4222-8222-222222222222';

function fixture(previous = true) {
  const data = {};
  const tabsById = new Map([[7,{id:7,url:'https://teams.microsoft.com/synthetic',autoDiscardable:previous}],
    [8,{id:8,url:'https://example.test/unrelated',autoDiscardable:true}]]);
  const calls = [];
  const storage = {
    get:async key => structuredClone({[key]:data[key]}),
    set:async values => {Object.assign(data,structuredClone(values));},
    remove:async key => {delete data[key];}
  };
  const tabs = {
    get:async id => {if (!tabsById.has(id)) throw new Error('Tab unavailable'); return {...tabsById.get(id)};},
    update:async (id,changes) => {calls.push({id,...changes}); Object.assign(tabsById.get(id),changes); return {...tabsById.get(id)};}
  };
  let active = true;
  let owner = SESSION_A;
  const dependencies = {tabs,storage,readCaptureState:async () =>
    active === undefined ? undefined : {captureSessionActive:active,captureSessionId:owner}};
  const guard = create(dependencies);
  const originalApply = guard.apply;
  const defaultGuard = {...guard,apply:(sender,value,session = SESSION_A) => originalApply(sender,value,session)};
  return {data,tabs,tabsById,calls,storage,dependencies,setActive:value => {active = value;},setOwner:value => {owner = value;},
    guard:defaultGuard,sender:{url:'https://teams.microsoft.com/synthetic',frameId:0,tab:{id:7}}};
}

test('Teams protection changes only the sender tab and restores its prior true state', async () => {
  const f = fixture();
  assert.equal((await f.guard.apply({...f.sender,tabId:8},true)).protected,true);
  assert.equal(f.tabsById.get(7).autoDiscardable,false);
  assert.equal(f.tabsById.get(8).autoDiscardable,true);
  await f.guard.apply(f.sender,false);
  assert.equal(f.tabsById.get(7).autoDiscardable,true);
  assert.equal(f.data[STORAGE_KEY],undefined);
});

test('a preexisting non-auto-discardable tab remains false when capture ends', async () => {
  const f = fixture(false);
  await f.guard.apply(f.sender,true);
  await f.guard.apply(f.sender,false);
  assert.equal(f.tabsById.get(7).autoDiscardable,false);
  assert.deepEqual(f.calls,[]);
});

test('unrelated origins, extension pages and child frames cannot acquire ownership', async () => {
  const f = fixture();
  for (const sender of [{url:'https://example.test/',tab:{id:8}},
    {url:'chrome-extension://synthetic/popup.html',tab:{id:7}}, {...f.sender,frameId:2}]) {
    await assert.rejects(f.guard.apply(sender,true),/originating Teams/);
  }
  assert.deepEqual(f.calls,[]);
  assert.equal(f.data[STORAGE_KEY],undefined);
});

test('a stale Teams message cannot protect a tab that navigated to an unrelated origin', async () => {
  const f = fixture();
  f.tabsById.get(7).url = 'https://example.test/';
  assert.equal((await f.guard.apply(f.sender,true)).protected,false);
  assert.deepEqual(f.calls,[]);
});

test('a delayed active message cannot protect another Teams document in the same tab', async () => {
  const f = fixture();
  f.tabsById.get(7).url = 'https://teams.microsoft.com/different-meeting';
  assert.equal((await f.guard.apply(f.sender,true)).stale,true);
  assert.deepEqual(f.calls,[]);
});

test('worker recreation preserves original ownership and transient source loss does not release it', async () => {
  const f = fixture();
  await f.guard.apply(f.sender,true);
  const resumed = create(f.dependencies);
  // Raw capture remains true despite a rendered-caption/badge failure.
  f.setActive(true);
  await resumed.reconcile();
  assert.equal(f.tabsById.get(7).autoDiscardable,false);
  assert.equal(f.data[STORAGE_KEY].records[7].previousAutoDiscardable,true);
  f.setActive(undefined);
  await resumed.reconcile();
  assert.equal(f.tabsById.get(7).autoDiscardable,false);
  await resumed.apply(f.sender,false,SESSION_A);
  assert.equal(f.tabsById.get(7).autoDiscardable,true);
});

test('delayed OFF from an older document cannot release the new protected owner', async () => {
  const f = fixture();
  await f.guard.apply(f.sender,true);
  f.tabsById.get(7).url = 'https://teams.microsoft.com/new-meeting';
  const senderB = {...f.sender,url:f.tabsById.get(7).url};
  f.setOwner(SESSION_B);
  await f.guard.apply(senderB,true,SESSION_B);
  assert.equal((await f.guard.apply(f.sender,false,SESSION_A)).stale,true);
  assert.equal(f.tabsById.get(7).autoDiscardable,false);
  await f.guard.apply(senderB,false,SESSION_B);
  assert.equal(f.tabsById.get(7).autoDiscardable,true);
});

test('same-URL SPA rejoin transfers ownership while retaining the original browser state', async () => {
  const f = fixture();
  await f.guard.apply(f.sender,true);
  f.setOwner(SESSION_B);
  await f.guard.apply(f.sender,true,SESSION_B);
  assert.equal(f.data[STORAGE_KEY].records[7].previousAutoDiscardable,true);
  assert.equal(f.data[STORAGE_KEY].records[7].ownerSessionId,SESSION_B);
  assert.equal((await f.guard.apply(f.sender,false,SESSION_A)).stale,true);
  assert.equal((await f.guard.apply(f.sender,true,SESSION_A)).stale,true);
  assert.equal(f.tabsById.get(7).autoDiscardable,false);
  await f.guard.apply(f.sender,false,SESSION_B);
  assert.equal(f.tabsById.get(7).autoDiscardable,true);
});

test('reload reconciliation adopts a verified newer session without releasing protection', async () => {
  const f = fixture();
  await f.guard.apply(f.sender,true);
  f.setOwner(SESSION_B);
  await create(f.dependencies).reconcile();
  assert.equal(f.data[STORAGE_KEY].records[7].ownerSessionId,SESSION_B);
  assert.equal(f.tabsById.get(7).autoDiscardable,false);
  assert.equal((await f.guard.apply(f.sender,false,SESSION_A)).stale,true);
});

test('navigation release queued for the old owner cannot release a newer ownership transfer', async () => {
  const f = fixture();
  await f.guard.apply(f.sender,true);
  let finishRead;
  let started;
  const readStarted = new Promise(resolve => {started = resolve;});
  const delayed = new Promise(resolve => {finishRead = resolve;});
  const guard = create({...f.dependencies,readCaptureState:async () => {started(); return await delayed;}});
  // Hydrate old ownership, then delay verification while navigation queues a release.
  const transfer = guard.apply(f.sender,true,SESSION_B);
  await readStarted;
  const release = guard.release(7);
  finishRead({captureSessionActive:true,captureSessionId:SESSION_B});
  await transfer;
  assert.equal((await release).stale,true);
  assert.equal(f.tabsById.get(7).autoDiscardable,false);
  assert.equal(f.data[STORAGE_KEY].records[7].ownerSessionId,SESSION_B);
});

test('navigation releases owned metadata and extension reload restores an unreachable old capture', async () => {
  const f = fixture();
  await f.guard.apply(f.sender,true);
  f.tabsById.get(7).url = 'https://example.test/new';
  await f.guard.release(7);
  assert.equal(f.tabsById.get(7).autoDiscardable,true);
  f.tabsById.get(7).url = f.sender.url;
  await f.guard.apply(f.sender,true);
  f.setActive(undefined);
  await create(f.dependencies).reconcile({restoreUnreachable:true});
  assert.equal(f.tabsById.get(7).autoDiscardable,true);
});

test('cold-worker navigation queued before hydration cannot release a newly verified owner', async () => {
  const f = fixture();
  await f.guard.apply(f.sender,true);
  f.setOwner(SESSION_B);
  const cold = create(f.dependencies);
  const transfer = cold.apply(f.sender,true,SESSION_B);
  const release = cold.release(7);
  await transfer;
  await release;
  assert.equal(f.tabsById.get(7).autoDiscardable,false);
  assert.equal(f.data[STORAGE_KEY].records[7].ownerSessionId,SESSION_B);
});

test('cold-worker unknown navigation defers then restores only its completed destination', async () => {
  const f = fixture();
  await f.guard.apply(f.sender,true);
  f.setActive(undefined);
  const cold = create(f.dependencies);
  assert.equal((await cold.release(7)).deferred,true);
  assert.equal(f.tabsById.get(7).autoDiscardable,false);
  f.tabsById.get(7).url = 'https://example.test/new';
  await cold.reconcile({restoreUnreachable:true,onlyTabId:8});
  assert.equal(f.tabsById.get(7).autoDiscardable,false);
  await cold.reconcile({restoreUnreachable:true,onlyTabId:7});
  assert.equal(f.tabsById.get(7).autoDiscardable,true);
  assert.equal(f.data[STORAGE_KEY],undefined);
});

test('failure before ownership persistence leaves the browser tab untouched', async () => {
  const f = fixture();
  f.storage.set = async () => {throw new Error('Synthetic storage rejection');};
  await assert.rejects(f.guard.apply(f.sender,true),/storage rejection/);
  assert.equal(f.tabsById.get(7).autoDiscardable,true);
  assert.deepEqual(f.calls,[]);
});

test('failed native update rolls back the ownership record while retaining exact prior state', async () => {
  const f = fixture();
  f.tabs.update = async () => {throw new Error('Synthetic update rejection');};
  await assert.rejects(f.guard.apply(f.sender,true),/update rejection/);
  assert.equal(f.tabsById.get(7).autoDiscardable,true);
  assert.equal(f.data[STORAGE_KEY],undefined);
});

test('closed-tab cleanup and browser-startup invalidation never mutate other tabs', async () => {
  const f = fixture();
  await f.guard.apply(f.sender,true);
  f.tabsById.delete(7);
  await f.guard.forget(7);
  assert.equal(f.data[STORAGE_KEY],undefined);
  await f.guard.forgetAll();
  assert.equal(f.tabsById.get(8).autoDiscardable,true);
});
