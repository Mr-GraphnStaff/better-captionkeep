const {test} = require('node:test');
const assert = require('node:assert/strict');
const rolling = require('../teams-captions-saver/rollingNotes.js');
const transcript = () => Array.from({length:55}, (_, index) => ({key:`k${index}`, Name:'Speaker', Text:`Original ${index}`}));
function drain(captions, state) {
    for (let count = 0; count < 10; count += 1) {
        const result = rolling.update(captions, JSON.parse(JSON.stringify(state)), {force:true, now:`2026-10-13T12:${String(count).padStart(2, '0')}:00Z`});
        state = result.state;
        if (!result.changed) return state;
    }
    throw new Error('Updates failed to converge');
}
test('earlier text and speaker corrections supersede stale batches and survive restart', () => {
    const captions = transcript();
    let state = drain(captions, {...rolling.emptyState('test'), enabled:true});
    captions[3].Text = 'Corrected early text';
    captions[32].Name = 'Corrected speaker';
    const first = rolling.update(captions, state, {force:true});
    assert(first.state.revisions.some(item => item.status === 'superseded'));
    assert(!first.state.draft.includes('Original 3\n'));
    assert(!first.state.draft.includes('[C0033] Speaker:'));
    state = drain(captions, first.state);
    assert(state.draft.includes('[C0004] Speaker: Corrected early text'));
    assert(state.draft.includes('[C0033] Corrected speaker: Original 32'));
    assert.equal(state.processedCaptionCount, captions.length);
    const repeated = rolling.update(captions, state, {force:true, now:'2026-10-14T00:00:00Z'});
    assert.equal(repeated.changed, false);
    assert.equal(repeated.state.revisions.length, state.revisions.length);
});
test('source truncation and legacy states rebuild without silently retaining obsolete captions', () => {
    const captions = transcript();
    let state = drain(captions, {...rolling.emptyState('test'), enabled:true});
    captions.splice(27);
    state = drain(captions, state);
    assert(!state.draft.includes('[C0028]'));
    delete state.sourceFingerprints;
    state = drain(captions, state);
    assert(state.draft.includes('[C0001]'));
    assert.equal(state.processedCaptionCount, 27);
    state = drain([], state);
    assert.equal(state.processedCaptionCount, 0);
    assert.equal(state.draft, '');
});
test('full text changes beyond old truncated tail signature are detected', () => {
    const captions = [{key:'a', Name:'A', Text:'x'.repeat(1500)}];
    const revision = rolling.sourceRevision(captions);
    captions[0].Text += 'changed';
    assert.notEqual(rolling.sourceRevision(captions), revision);
});
test('a single-caption automatic correction refreshes immediately and reverting retains unique lineage', () => {
    const captions = [{key:'a', Name:'A', Text:'Original'}];
    let state = drain(captions, {...rolling.emptyState('test'), enabled:true});
    captions[0].Text = 'Correction';
    const correction = rolling.update(captions, state);
    assert.equal(correction.changed, true);
    assert(!correction.state.draft.includes('Original'));
    state = correction.state;
    captions[0].Text = 'Original';
    state = drain(captions, state);
    assert.equal(new Set(state.revisions.map(item => item.id)).size, state.revisions.length);
    assert.equal(state.revisions.filter(item => item.status === 'current').length, 1);
});
test('paused generation invalidates obsolete draft without generating a replacement', () => {
    const captions = [{key:'a', Name:'A', Text:'Original'}];
    const state = {...drain(captions, {...rolling.emptyState('test'), enabled:true}), paused:true};
    captions[0].Text = 'Correction';
    const paused = rolling.update(captions, state);
    assert.equal(paused.reason, 'paused');
    assert.equal(paused.changed, true);
    assert.equal(paused.state.draft, '');
    assert.equal(paused.state.revisions.length, state.revisions.length);
    const resumed = rolling.update(captions, {...paused.state, paused:false}, {force:true});
    assert(resumed.state.draft.includes('Correction'));
});
