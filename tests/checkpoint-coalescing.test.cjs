const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const clone = value => JSON.parse(JSON.stringify(value));
const source = fs.readFileSync(path.join(__dirname, '../teams-captions-saver/captureCoordinator.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(overrides = {}) {
    const context = vm.createContext({URL, Date, globalThis:null}); context.globalThis = context;
    vm.runInContext(source, context);
    const data = {}, messages = [];
    const coordinator = context.CaptionKeepCaptureCoordinator.create({providerId:'google-meet', surfaceId:'tab-1', pageUrl:'https://meet.google.com/abc-defg-hij',
        storage:{async get(key) {return {[key]:data[key]};}, async set(values) {Object.assign(data, clone(values));}, async remove(key) {delete data[key];}, ...overrides.storage},
        normalizeCaption:caption => ({...caption}), sendMessage:async message => {messages.push(clone(message)); return {ok:true};},
        createId:() => 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', ...overrides});
    return {coordinator, data, messages};
}
function caption(coordinator, index, text = `Caption ${index}`) {
    coordinator.handleProviderEvent({type:'caption-upsert', caption:{key:`k${index}`, Name:'A', Text:text, capturedAt:'2026-10-13T00:00:00Z'}});
}
test('slow checkpoint burst coalesces 1000 updates into one active plus one latest write', async () => {
    let release, calls = 0, active = 0, maxActive = 0;
    const writes = [];
    const storage = {async get(){return {};}, async remove(){}, async set(values) {
        calls += 1; active += 1; maxActive = Math.max(maxActive, active); writes.push(clone(values));
        if (calls === 1) await new Promise(resolve => {release = resolve;});
        active -= 1;
    }};
    const {coordinator} = setup({storage});
    caption(coordinator, 0); await tick();
    for (let index = 1; index <= 1000; index += 1) caption(coordinator, index);
    caption(coordinator, 0, 'Corrected first caption');
    const firstPromise = coordinator.persistCheckpoint();
    assert.equal(firstPromise, coordinator.persistCheckpoint());
    assert.equal(calls, 1);
    release(); await coordinator.whenIdle();
    assert.equal(calls, 2);
    assert.equal(maxActive, 1);
    const last = writes.at(-1)[coordinator.activeCaptureKey].transcript;
    assert.equal(last.length, 1001);
    assert.equal(last[0].Text, 'Corrected first caption');
});
test('failed checkpoint preserves memory and later retry saves latest snapshot', async () => {
    let fail = true;
    const snapshots = [];
    const {coordinator} = setup({storage:{async get(){return {};}, async remove(){}, async set(values) {
        if (fail) throw new Error('Synthetic storage failure');
        snapshots.push(clone(values));
    }}});
    caption(coordinator, 0);
    await assert.rejects(coordinator.whenIdle(), /Synthetic storage failure/);
    assert.equal(coordinator.getTranscript().length, 1);
    assert.match(coordinator.getState().checkpointError, /Recovery save failed/);
    fail = false; caption(coordinator, 1);
    await coordinator.whenIdle();
    assert.equal(snapshots.at(-1)[coordinator.activeCaptureKey].transcript.length, 2);
    assert.equal(coordinator.getState().checkpointError, '');
});
test('finalize waits for late caption during history save and removes checkpoint only after latest history', async () => {
    let releaseHistory, historyCalls = 0;
    const data = {}, histories = [];
    const {coordinator} = setup({storage:{async get(){return {};}, async set(values){Object.assign(data, clone(values));}, async remove(key){delete data[key];}},
        sendMessage:async message => {
            if (message.message === 'save_session_history') {
                historyCalls += 1; histories.push(clone(message.transcriptArray));
                if (historyCalls === 1) await new Promise(resolve => {releaseHistory = resolve;});
            }
            return {ok:true};
        }});
    caption(coordinator, 0); await coordinator.whenIdle();
    const final = coordinator.finalize(); await tick();
    caption(coordinator, 1); releaseHistory(); await final; await coordinator.whenIdle();
    assert.equal(histories.at(-1).length, 2);
    assert.equal(coordinator.getState().finalized, true);
    assert.equal(data[coordinator.activeCaptureKey], undefined);
    const backup = Object.entries(data).find(([key]) => key.startsWith('backup_'))[1];
    assert.equal(backup.transcript.length, 2);
});
test('history failure retains recoverable data and successful final retry saves every caption', async () => {
    const data = {}; let failHistory = true;
    const histories = [];
    const {coordinator} = setup({storage:{async get(){return {};}, async set(values){Object.assign(data, clone(values));}, async remove(key){delete data[key];}},
        sendMessage:async message => {
            if (message.message === 'save_session_history') {
                if (failHistory) return {ok:false, error:'Synthetic history failure'};
                histories.push(clone(message.transcriptArray));
            }
            return {ok:true};
        }});
    caption(coordinator, 0); await coordinator.whenIdle();
    await assert.rejects(coordinator.finalize(), /Synthetic history failure/);
    assert.equal(coordinator.getState().finalized, false);
    assert.equal(data[coordinator.activeCaptureKey].transcript.length, 1);
    caption(coordinator, 1); failHistory = false;
    await coordinator.finalize(); await coordinator.whenIdle();
    assert.equal(histories.at(-1).length, 2);
    assert.equal(data[coordinator.activeCaptureKey], undefined);
});
test('caption during initially empty final checkpoint removal is saved before finalize completes', async () => {
    let release, removeCalls = 0;
    const histories = [];
    const {coordinator} = setup({storage:{async get(){return {};}, async set(){}, async remove() {
        removeCalls += 1;
        if (removeCalls === 1) await new Promise(resolve => {release = resolve;});
    }}, sendMessage:async message => {
        if (message.message === 'save_session_history') histories.push(clone(message.transcriptArray));
        return {ok:true};
    }});
    const final = coordinator.finalize(); await tick();
    caption(coordinator, 0); release(); await final; await coordinator.whenIdle();
    assert.equal(histories.at(-1).length, 1);
    assert.equal(coordinator.getState().finalized, true);
});
