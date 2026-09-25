const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadEvidenceBoard() {
  const context = {globalThis: {}};
  vm.createContext(context);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'teams-captions-saver', 'evidenceBoard.js'),
    'utf8'
  );
  vm.runInContext(source, context);
  return context.globalThis.CaptionKeepEvidenceBoard;
}

test('creates a marker from the latest normalized caption without changing the source', () => {
  const board = loadEvidenceBoard();
  const transcriptArray = [
    {key: 'a', Name: 'Alex', Text: 'We should investigate it.', Time: '00:01'},
    {key: 'b', Name: 'Sam', Text: 'Ship the pilot on Friday.', Time: '00:02', capturedAt: '2026-09-24T12:00:00.000Z'}
  ];
  const marker = board.createMarker({
    sessionId: 'session-1',
    meetingTitle: 'Planning',
    providerLabel: 'Microsoft Teams',
    transcriptArray
  }, {
    kind: 'Decision',
    note: '  Confirm with release owner.  ',
    createId: () => 'marker-1',
    now: () => new Date('2026-09-24T12:01:00.000Z')
  });

  assert.equal(marker.evidenceId, 'C0002');
  assert.equal(marker.text, 'Ship the pilot on Friday.');
  assert.equal(marker.markedText, 'Ship the pilot on Friday.');
  assert.equal(marker.note, 'Confirm with release owner.');
  assert.equal(marker.sourceKey, 'b');
  assert.equal(transcriptArray[1].Text, 'Ship the pilot on Friday.');
  assert.equal(Object.isFrozen(marker), true);
});

test('reconciles an interim marker to the final caption using the stable source key', () => {
  const board = loadEvidenceBoard();
  const marker = {
    id: 'marker-4', sessionId: 'session-1', sourceKey: 'stable-caption', evidenceId: 'C0001',
    speaker: 'Unknown speaker', time: '00:01', text: 'Ship the', markedText: 'Ship the'
  };
  const result = board.reconcileMarkers([marker], {
    sessionId: 'session-1',
    transcriptArray: [{key: 'stable-caption', Name: 'Alex', Time: '00:02', Text: 'Ship the release candidate.'}]
  });

  assert.equal(result.changed, true);
  assert.equal(result.markers[0].text, 'Ship the release candidate.');
  assert.equal(result.markers[0].markedText, 'Ship the');
  assert.equal(result.markers[0].speaker, 'Alex');
});

test('falls back safely for unsupported marker kinds and missing speaker data', () => {
  const board = loadEvidenceBoard();
  const marker = board.createMarker({
    transcriptArray: [{Text: 'A caption without attribution.'}]
  }, {
    kind: 'Emotion score',
    createId: () => 'marker-2',
    now: () => new Date('2026-09-24T12:01:00.000Z')
  });

  assert.equal(marker.kind, 'Important moment');
  assert.equal(marker.speaker, 'Unknown speaker');
  assert.equal(marker.time, 'time unavailable');
});

test('requires actual caption evidence', () => {
  const board = loadEvidenceBoard();
  assert.throws(
    () => board.createMarker({transcriptArray: []}, {createId: () => 'marker-3'}),
    /captured caption is required/
  );
});

test('exports an evidence-backed Markdown brief in marker order', () => {
  const board = loadEvidenceBoard();
  const markdown = board.toMarkdown([
    {
      createdAt: '2026-09-24T12:02:00.000Z', kind: 'Action item', evidenceId: 'C0002',
      time: '00:02', speaker: 'Sam', text: 'Prepare the test plan.', note: 'Owner confirmed.'
    },
    {
      createdAt: '2026-09-24T12:01:00.000Z', kind: 'Decision', evidenceId: 'C0001',
      time: '00:01', speaker: 'Alex', text: 'Use the existing release branch.'
    }
  ], {meetingTitle: 'Planning', providerLabel: 'Microsoft Teams'});

  assert.match(markdown, /^# Evidence board: Planning/);
  assert.match(markdown, /raw transcript remains authoritative/);
  assert.ok(markdown.indexOf('C0001') < markdown.indexOf('C0002'));
  assert.match(markdown, /Owner confirmed\./);
});

test('canonical transcript is stable and preserves source evidence fields', () => {
  const board = loadEvidenceBoard();
  const context = {
    sessionId: 'session-7', meetingTitle: 'Security review', providerLabel: 'Google Meet',
    transcriptArray: [{key: 'source-1', Name: 'Alex', Time: '00:03', capturedAt: '2026-09-24T12:00:00Z', Text: 'Retain the original.'}]
  };
  const first = board.canonicalTranscript(context);
  const second = board.canonicalTranscript({...context, transcriptArray: [...context.transcriptArray]});
  assert.equal(first, second);
  assert.match(first, /"evidenceId":"C0001"/);
  assert.match(first, /"sourceKey":"source-1"/);
});

test('creates a portable provenance bundle without confusing markers with source captions', () => {
  const board = loadEvidenceBoard();
  const context = {
    sessionId: 'session-8', meetingTitle: 'Planning', providerLabel: 'Microsoft Teams',
    transcriptArray: [{key: 'source-2', Name: 'Sam', Time: '00:04', Text: 'Ship after testing.'}]
  };
  const marker = board.createMarker(context, {
    kind: 'Decision', note: 'Approved in meeting', createId: () => 'marker-8',
    now: () => new Date('2026-09-24T12:01:00Z')
  });
  const bundle = board.createEvidenceBundle([marker], context, {
    generatedAt: '2026-09-24T12:02:00Z', transcriptSha256: 'abc123'
  });
  assert.equal(bundle.format, 'better-captionkeep-evidence-bundle');
  assert.equal(bundle.source.transcriptSha256, 'abc123');
  assert.equal(bundle.source.transcriptIncluded, true);
  assert.equal(bundle.captions[0].text, 'Ship after testing.');
  assert.equal(bundle.markers[0].finalText, 'Ship after testing.');
  assert.match(bundle.authority, /transcript is authoritative/);
});
