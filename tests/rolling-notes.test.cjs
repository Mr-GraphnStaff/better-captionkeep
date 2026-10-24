const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../teams-captions-saver/rollingNotes.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function api() {
    const context = vm.createContext({Date, globalThis:null});
    context.globalThis = context;
    vm.runInContext(source, context);
    return context.CaptionKeepRollingNotes;
}

test('rolling notes process bounded caption deltas with restart-safe revisions', () => {
    const rolling = api();
    const transcript = Array.from({length:31}, (_, index) => ({
        key:`k${index}`,
        Name:'Speaker',
        Text:`Synthetic caption ${index + 1}`
    }));
    let state = {...rolling.emptyState('meeting-rolling'), enabled:true};
    const first = rolling.update(transcript, state, {force:true, now:'2026-10-13T12:00:00.000Z'});
    assert.equal(first.changed, true);
    assert.equal(first.revision.evidenceIds.length, 24);
    assert.equal(first.state.processedCaptionCount, 24);
    assert(first.state.draft.includes('[C0001]'));
    assert(first.state.draft.includes('[C0024]'));

    const restored = rolling.normalizeState(clone(first.state), 'meeting-rolling');
    const second = rolling.update(transcript, restored, {force:true, now:'2026-10-13T12:01:00.000Z'});
    assert.equal(second.changed, true);
    assert.equal(second.state.processedCaptionCount, 31);
    assert.equal(second.state.revisions.length, 2);
    assert(second.state.draft.includes('[C0031]'));

    const duplicate = rolling.update(transcript, second.state, {force:true, now:'2026-10-13T12:02:00.000Z'});
    assert.equal(duplicate.changed, false);
    assert.equal(duplicate.reason, 'current');
});

test('rolling notes pause automatic updates and stop after three failures', () => {
    const rolling = api();
    const transcript = [
        {key:'a', Name:'A', Text:'one'},
        {key:'b', Name:'B', Text:'two'},
        {key:'c', Name:'C', Text:'three'}
    ];
    const paused = {...rolling.emptyState('meeting-paused'), enabled:true, paused:true};
    assert.equal(rolling.update(transcript, paused).reason, 'paused');
    let failed = paused;
    for (let index = 0; index < 3; index += 1) failed = rolling.recordFailure(failed, new Error('Synthetic storage failure'));
    failed = {...failed, paused:false};
    assert.equal(rolling.update(transcript, failed).reason, 'retry-limit');
    assert.equal(rolling.update(transcript, failed, {force:true, now:'2026-10-13T12:03:00.000Z'}).changed, true);
});

test('rolling notes wait for a minimum automatic delta but update on demand', () => {
    const rolling = api();
    const transcript = [{key:'a', Name:'A', Text:'one'}];
    const state = {...rolling.emptyState('meeting-small'), enabled:true};
    assert.equal(rolling.update(transcript, state).reason, 'waiting');
    const forced = rolling.update(transcript, state, {force:true, now:'2026-10-13T12:04:00.000Z'});
    assert.equal(forced.changed, true);
    assert.deepEqual(Array.from(forced.revision.evidenceIds), ['C0001']);
});
