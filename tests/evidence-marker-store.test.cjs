const test = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../teams-captions-saver/evidenceMarkerStore.js');

function fixture(initial = []) {
    let stored = structuredClone(initial);
    let policy = {};
    const sources = new Map();
    let writes = 0;
    const callbacks = {
        readStored:async () => structuredClone(stored),
        writeStored:async markers => {stored = structuredClone(markers); writes += 1;},
        findSource:async id => sources.get(id),
        readPolicy:async () => policy,
        now:() => '2026-10-13T12:00:00Z'
    };
    const store = create(callbacks);
    const transcript = [{key:'caption-one', Name:'Synthetic speaker', Text:'Authoritative synthetic caption', Time:'10:00'},
        {key:'caption-two', Name:'Another speaker', Text:'Second synthetic caption', Time:'10:01'}];
    sources.set('live', {kind:'live', transcript});
    return {store, sources, callbacks, get:() => stored, writes:() => writes, policy:value => {policy = value;}};
}

const marker = (id, overrides = {}) => ({id, sessionId:'live', sourceKey:'caption-one', kind:'Decision', note:'Reviewed note', ...overrides});

test('deleted-source cached markers cannot return during a new unrelated mark', async () => {
    const stale = marker('deleted', {sessionId:'deleted-session'});
    const f = fixture([stale]);
    f.sources.set('deleted-session', {kind:'archive', transcript:f.sources.get('live').transcript});
    await f.store.apply({removeIds:['deleted']});
    f.sources.delete('deleted-session');
    const result = await f.store.apply({upserts:[stale, marker('new')]});
    assert.deepEqual(f.get().map(item => item.id), ['new']);
    assert.equal(result.rejected[0].id, 'deleted');
    assert.match(result.rejected[0].reason, /no longer available/);
});

test('marker deltas preserve unrelated currently stored markers', async () => {
    const other = {id:'other', sessionId:'unrelated', text:'Unrelated synthetic excerpt'};
    const f = fixture([other]);
    await f.store.apply({upserts:[marker('new')]});
    assert.deepEqual(f.get()[0], other);
    assert.equal(f.get()[1].id, 'new');
});

test('caption text, speaker, citation and original quote are derived from the authoritative source', async () => {
    const f = fixture();
    await f.store.apply({upserts:[marker('new', {text:'Forged', markedText:'Forged original', speaker:'Forged', evidenceId:'C9999'})]});
    const saved = f.get()[0];
    assert.equal(saved.text, 'Authoritative synthetic caption');
    assert.equal(saved.markedText, saved.text);
    assert.equal(saved.speaker, 'Synthetic speaker');
    assert.equal(saved.evidenceId, 'C0001');
    assert.equal(saved.createdAt, '2026-10-13T12:00:00.000Z');
});

test('legacy captions without keys can resolve by citation or explicit index', async () => {
    const f = fixture();
    await f.store.apply({upserts:[marker('citation', {sourceKey:'', evidenceId:'C0002'}),
        marker('index', {sourceKey:'', captionIndex:0})]});
    assert.deepEqual(f.get().map(item => item.text), ['Second synthetic caption', 'Authoritative synthetic caption']);
});

test('an invalid source key cannot fall back to an arbitrary caption and mismatched indexes reject', async () => {
    const f = fixture();
    const result = await f.store.apply({upserts:[marker('bad-key', {sourceKey:'missing', evidenceId:'C0001'}),
        marker('bad-index', {sourceKey:'', captionIndex:0, evidenceId:'C0002'})]});
    assert.equal(f.get().length, 0);
    assert.equal(result.rejected.length, 2);
});

test('a reviewed marker preserves its original quote across source correction', async () => {
    const f = fixture();
    await f.store.apply({upserts:[marker('existing')]});
    f.sources.get('live').transcript[0].Text = 'Corrected authoritative source';
    await f.store.apply({upserts:[marker('existing')]});
    assert.equal(f.get()[0].text, 'Corrected authoritative source');
    assert.equal(f.get()[0].markedText, 'Authoritative synthetic caption');
});

test('existing marker identity cannot be rebound to another caption', async () => {
    const f = fixture();
    await f.store.apply({upserts:[marker('existing')]});
    const result = await f.store.apply({upserts:[marker('existing', {sourceKey:'caption-two'})]});
    assert.match(result.rejected[0].reason, /cannot be moved/);
    assert.equal(f.get()[0].sourceKey, 'caption-one');
});

test('concurrent deltas merge and removal does not replace the complete cached list', async () => {
    const f = fixture();
    await Promise.all([f.store.apply({upserts:[marker('first')]}), f.store.apply({upserts:[marker('second')]})]);
    assert.deepEqual(f.get().map(item => item.id), ['first', 'second']);
    await f.store.apply({removeIds:['first']});
    assert.deepEqual(f.get().map(item => item.id), ['second']);
});

test('managed retention denial rejects persistence but permits deleting existing markers', async () => {
    const f = fixture([{id:'old', sessionId:'archived', text:'Synthetic old text'}]);
    f.policy({settings:{disableSessionHistory:true}});
    await assert.rejects(f.store.apply({upserts:[marker('new')]}), /retention is disabled/);
    assert.equal(f.writes(), 0);
    await f.store.apply({removeIds:['old']});
    assert.deepEqual(f.get(), []);
});

test('policy is rechecked before commit when source lookup changes policy', async () => {
    const f = fixture();
    const store = create({...f.callbacks, findSource:async id => {
        f.policy({disableSessionHistory:true});
        return f.sources.get(id);
    }});
    await assert.rejects(store.apply({upserts:[marker('new')]}), /retention is disabled/);
    assert.equal(f.writes(), 0);
});

test('storage failures reject cleanly and the next operation can still succeed', async () => {
    const f = fixture();
    let fail = true;
    const store = create({...f.callbacks, writeStored:async value => {
        if (fail) throw new Error('Synthetic storage failure');
        return f.callbacks.writeStored(value);
    }});
    await assert.rejects(store.apply({upserts:[marker('first')]}), /storage failure/);
    fail = false;
    await store.apply({upserts:[marker('second')]});
    assert.deepEqual(f.get().map(item => item.id), ['second']);
});

test('marker payload fields and collection size are bounded', async () => {
    const f = fixture(Array.from({length:500}, (_, index) => ({id:`older-${index}`, sessionId:'other'})));
    await f.store.apply({upserts:[marker('new', {note:'x'.repeat(3000), meetingTitle:'x'.repeat(1000)})]});
    assert.equal(f.get().length, 500);
    assert.equal(f.get().some(item => item.id === 'older-0'), false);
    assert.equal(f.get().at(-1).note.length, 2000);
    assert.equal(f.get().at(-1).meetingTitle.length, 300);
    await assert.rejects(f.store.apply({upserts:Array.from({length:501}, (_, index) => marker(`too-many-${index}`))}), /at most 500/);
});
