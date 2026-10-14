const {test} = require('node:test');
const assert = require('node:assert/strict');
const templates = require('../teams-captions-saver/promptTemplates.js');
test('applied stored templates retain exact versions while unsaved and manually edited prompts are drafts', () => {
    const selected = templates.BUILT_INS[0];
    const stored = templates.appliedSnapshot(selected, selected.instructions);
    assert.equal(stored.version, 1);
    assert.equal(stored.state, 'stored');
    const draft = templates.appliedSnapshot(selected, 'Unsaved instructions');
    assert.equal(draft.version, null);
    assert.equal(draft.basedOnVersion, 1);
    assert.equal(draft.instructions, 'Unsaved instructions');
    assert.equal(templates.appliedSnapshot(selected, selected.instructions, true).state, 'draft');
});
test('source-bound session metadata whitelists instructions and rejects missing source hashes', () => {
    const snapshot = {...templates.appliedSnapshot(templates.BUILT_INS[0]), transcript:'PRIVATE TRANSCRIPT', prompt:'PRIVATE PROMPT', response:'PRIVATE RESPONSE'};
    const metadata = templates.handoffMetadata('meeting/key', 'a'.repeat(64), snapshot, '2026-10-13T00:00:00Z');
    assert.equal(metadata.key, 'handoff_template_meeting%2Fkey');
    assert.equal(metadata.value.templateSnapshot.version, 1);
    assert.equal(metadata.value.sourceTranscriptSha256, 'a'.repeat(64));
    assert(!JSON.stringify(metadata).includes('PRIVATE'));
    assert.equal(templates.handoffMetadata('meeting', 'invalid', snapshot), null);
    assert.equal(templates.handoffMetadata('', 'a'.repeat(64), snapshot), null);
});
