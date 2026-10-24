const test = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../teams-captions-saver/rollingNotesStore.js');

function fixture({disabled = false, flipOnLocalWrite = false} = {}) {
    let policy = {disableSessionHistory:disabled};
    const localData = {}, sessionData = {};
    const area = (data, local) => ({
        async get(key) {return structuredClone({[key]:data[key]});},
        async set(values) {Object.assign(data, structuredClone(values)); if (local && flipOnLocalWrite) policy = {disableSessionHistory:true};},
        async remove(key) {delete data[key];}
    });
    const storage = {local:area(localData, true), session:area(sessionData)};
    return {store:create({storage, readPolicy:async() => policy}), storage, localData, sessionData, setPolicy:value => {policy = value;}};
}

test('Retention-disabled rolling notes never enter persistent local history', async () => {
    const f = fixture({disabled:true});
    await f.store.save('rolling_notes_live-1', {draft:'Synthetic note'});
    assert.equal(f.localData['rolling_notes_live-1'], undefined);
    assert.equal(f.sessionData['rolling_notes_live-1'].draft, 'Synthetic note');
    assert.equal((await f.store.load('rolling_notes_live-1')).draft, 'Synthetic note');
});

test('A policy change during persistence removes the local copy', async () => {
    const f = fixture({flipOnLocalWrite:true});
    await f.store.save('rolling_notes_live-1', {draft:'Synthetic note'});
    assert.equal(f.localData['rolling_notes_live-1'], undefined);
    assert.equal(f.sessionData['rolling_notes_live-1'].draft, 'Synthetic note');
});

test('Disabled retention does not resurrect an old persistent note on load', async () => {
    const f = fixture();
    await f.store.save('rolling_notes_old', {draft:'Old synthetic note'});
    f.setPolicy({disableSessionHistory:true});
    assert.equal(await f.store.load('rolling_notes_old'), undefined);
    assert.equal(f.localData.rolling_notes_old, undefined);
});

test('Temporary storage failure still removes the denied persistent copy', async () => {
    const f = fixture({flipOnLocalWrite:true});
    f.storage.session.set = async () => {throw new Error('Synthetic quota failure');};
    await assert.rejects(f.store.save('rolling_notes_live-1', {draft:'Synthetic note'}), /quota failure/);
    assert.equal(f.localData['rolling_notes_live-1'], undefined);
});

test('An initial temporary-storage failure cannot leave an older local copy', async () => {
    const f = fixture({disabled:true});
    f.localData.rolling_notes_live = {draft:'Old synthetic note'};
    f.storage.session.set = async () => {throw new Error('Synthetic quota failure');};
    await assert.rejects(f.store.save('rolling_notes_live', {draft:'Current synthetic note'}), /quota failure/);
    assert.equal(f.localData.rolling_notes_live, undefined);
});

test('Successful persistent save removes older temporary state and load never falls back to it', async () => {
    const f = fixture();
    f.sessionData.rolling_notes_live = {draft:'Stale synthetic note'};
    assert.equal(await f.store.load('rolling_notes_live'), undefined);
    await f.store.save('rolling_notes_live', {draft:'Current synthetic note'});
    assert.equal(f.sessionData.rolling_notes_live, undefined);
    assert.equal((await f.store.load('rolling_notes_live')).draft, 'Current synthetic note');
});
