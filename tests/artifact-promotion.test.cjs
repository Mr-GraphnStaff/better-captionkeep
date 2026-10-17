const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.join(__dirname, '../teams-captions-saver');
const panelSource = fs.readFileSync(path.join(root, 'sidepanel.js'), 'utf8');
const start = panelSource.indexOf('    async function promoteArtifactCitations(');
const end = panelSource.indexOf('    async function saveReviewedNotes(', start);
assert(start >= 0 && end > start, 'Production promotion function must be available');
const promotionSource = panelSource.slice(start, end);

function fixture({sourceSessionId = 'meeting-a', activeSessionId = 'meeting-a', captions, reviewed} = {}) {
    const currentCaptions = structuredClone(captions || [
        {key:'shared-caption-1', Name:'Synthetic speaker', Text:'First reviewed caption', Time:'10:00'},
        {key:'shared-caption-2', Name:'Synthetic speaker', Text:'Second reviewed caption', Time:'10:01'}
    ]);
    const original = structuredClone(reviewed || currentCaptions);
    const artifact = {id:'reviewed-notes', kind:'live-notes', sessionId:sourceSessionId,
        evidenceIds:original.map((caption, index) => `C${String(index + 1).padStart(4, '0')}`),
        payload:{sourceEvidence:original.map((caption, index) => ({evidenceId:`C${String(index + 1).padStart(4, '0')}`, caption}))}};
    const calls = {saved:[], renders:0, status:''};
    const context = vm.createContext({crypto, Date, structuredClone, allMarkers:[], selectedSessionId:'',
        currentContext:{sessionId:activeSessionId, transcriptArray:currentCaptions, meetingTitle:'Synthetic meeting', providerLabel:'Google Meet'},
        derivedArtifacts:[artifact],
        saveMarkers:async () => {calls.saved.push(structuredClone(context.allMarkers));},
        renderMarkers:() => {calls.renders += 1;}, setStatus:value => {calls.status = value;}});
    vm.runInContext(fs.readFileSync(path.join(root, 'evidenceBoard.js'), 'utf8'), context);
    context.board = context.CaptionKeepEvidenceBoard;
    // Execute the production function with only its browser/persistence boundary mocked.
    vm.runInContext(promotionSource, context);
    return {context, calls, promote:() => context.promoteArtifactCitations('reviewed-notes', 'Decision')};
}

test('promotion rejects another meeting even when caption keys and text are reused', async () => {
    const f = fixture({sourceSessionId:'meeting-a', activeSessionId:'meeting-b'});
    await assert.rejects(f.promote(), /different meeting/);
    assert.equal(f.context.allMarkers.length, 0);
    assert.equal(f.calls.saved.length, 0);
    assert.equal(f.calls.renders, 0);
});

test('a disappeared later citation rejects promotion without retaining the earlier marker', async () => {
    const reviewed = [{key:'one', Text:'First reviewed caption'}, {key:'two', Text:'Second reviewed caption'}];
    const f = fixture({captions:reviewed.slice(0, 1), reviewed});
    await assert.rejects(f.promote(), /C0002 is no longer available/);
    assert.equal(f.context.allMarkers.length, 0);
    assert.equal(f.calls.saved.length, 0);
});

test('a changed later citation leaves allMarkers unmodified and performs no write', async () => {
    const reviewed = [{key:'one', Text:'First reviewed caption'}, {key:'two', Text:'Second reviewed caption'}];
    const captions = structuredClone(reviewed);
    captions[1].Text = 'Changed provider caption';
    const f = fixture({captions, reviewed});
    await assert.rejects(f.promote(), /C0002 changed after these notes were reviewed/);
    assert.equal(f.context.allMarkers.length, 0);
    assert.equal(f.calls.saved.length, 0);
    assert.equal(f.calls.status, '');
});

test('valid promotion saves every cited marker together with its original meeting identity', async () => {
    const f = fixture();
    await f.promote();
    assert.equal(f.calls.saved.length, 1);
    assert.deepEqual(f.calls.saved[0].map(item => item.evidenceId), ['C0001', 'C0002']);
    assert(f.calls.saved[0].every(item => item.sessionId === 'meeting-a' && item.kind === 'Decision'));
    assert.deepEqual(f.calls.saved[0].map(item => item.text), ['First reviewed caption', 'Second reviewed caption']);
    assert.equal(f.context.selectedSessionId, 'meeting-a');
    assert.equal(f.calls.renders, 1);
    assert.match(f.calls.status, /2 cited captions promoted/);
});
