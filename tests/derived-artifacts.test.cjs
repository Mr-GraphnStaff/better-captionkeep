const assert = require('node:assert/strict');
const test = require('node:test');

const artifacts = require('../teams-captions-saver/derivedArtifacts.js');
const HASH = 'a'.repeat(64);

test('derived artifacts preserve a bounded immutable source reference', () => {
    const source = {
        id: 'moment-1', kind: 'moment', sessionId: 'session-1',
        sourceTranscriptSha256: HASH, sourceCaptionCount: 12,
        sourceKeys: ['caption-10', 'caption-11', 'caption-11'],
        evidenceIds: ['E-0011'], createdAt: '2026-10-13T12:00:00.000Z',
        payload: {note: 'Reviewed locally'}
    };
    const normalized = artifacts.normalize(source);
    assert.equal(normalized.version, 1);
    assert.equal(normalized.kind, 'moment');
    assert.deepEqual(normalized.sourceKeys, ['caption-10', 'caption-11']);
    assert.equal(normalized.status, 'draft');
    source.payload.note = 'mutated';
    assert.equal(normalized.payload.note, 'Reviewed locally');
});

test('derived artifacts reject unsupported kinds, invalid hashes, and invalid revisions', () => {
    assert.throws(() => artifacts.normalize({kind: 'transcript', sessionId: 's', sourceTranscriptSha256: HASH, sourceCaptionCount: 1}), /Unsupported/);
    assert.throws(() => artifacts.normalize({kind: 'answer', sessionId: 's', sourceTranscriptSha256: 'bad', sourceCaptionCount: 1}), /SHA-256/);
    assert.throws(() => artifacts.normalize({kind: 'answer', sessionId: 's', sourceTranscriptSha256: HASH, sourceCaptionCount: -1}), /non-negative/);
});

test('derived artifact collections are session-scoped, replace by id, and bounded', () => {
    const first = {id: 'moment-1', kind: 'moment', sessionId: 'session-1', sourceTranscriptSha256: HASH, sourceCaptionCount: 1};
    const replacement = {...first, sourceCaptionCount: 2, payload: {reviewed: true}};
    const collection = artifacts.upsert(artifacts.upsert([], first), replacement);
    assert.equal(artifacts.storageKey('session-1'), 'derived_artifacts_session-1');
    assert.equal(collection.length, 1);
    assert.equal(collection[0].sourceCaptionCount, 2);
    assert.equal(collection[0].payload.reviewed, true);
});

test('moment payload keeps reviewed PNG evidence and rejects oversized or foreign image content', () => {
    const valid = artifacts.normalize({kind: 'moment', sessionId: 'session-1', sourceTranscriptSha256: HASH,
        sourceCaptionCount: 1, payload: {screenshot: 'data:image/png;base64,AA=='}});
    assert.equal(valid.payload.screenshot, 'data:image/png;base64,AA==');
    assert.throws(() => artifacts.normalize({kind: 'moment', sessionId: 'session-1', sourceTranscriptSha256: HASH,
        sourceCaptionCount: 1, payload: {screenshot: 'data:image/jpeg;base64,AA=='}}), /PNG/);
});

test('reviewed notes and answers require real caption citations from their source snapshot', () => {
    assert.deepEqual(artifacts.assertCitations('Decision [C0002]. Also C0002.', 3), ['C0002']);
    assert.throws(() => artifacts.assertCitations('An uncited conclusion.', 3), /citation/);
    assert.throws(() => artifacts.assertCitations('Decision [C0004].', 3), /not present/);
});

test('reviewed transcript answers retain the question without becoming source transcript data', () => {
    const answer = artifacts.normalize({
        kind: 'answer', sessionId: 'session-1', sourceTranscriptSha256: HASH,
        sourceCaptionCount: 3, evidenceIds: ['C0002'], status: 'user-confirmed',
        generator: 'reviewed-transcript-answer-v1', payload: {question: 'Who owns it?', text: 'Alex owns it [C0002].'}
    });
    assert.equal(answer.kind, 'answer');
    assert.equal(answer.payload.question, 'Who owns it?');
    assert.equal(answer.payload.text, 'Alex owns it [C0002].');
    assert.deepEqual(answer.evidenceIds, ['C0002']);
});
