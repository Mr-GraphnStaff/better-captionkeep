const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'teams-captions-saver', file), 'utf8');

function loadPackage() {
    const context = vm.createContext({globalThis:null, TextEncoder});
    context.globalThis = context;
    vm.runInContext(read('handoffPackage.js'), context);
    return context.CaptionKeepHandoffPackage;
}

test('complete handoff includes every long-meeting caption once and keeps the final decision', () => {
    const handoff = loadPackage();
    const transcript = Array.from({length:700}, (_, index) => ({
        key:`source-${index + 1}`,
        Time:`10:${String(index % 60).padStart(2, '0')}`,
        Name:index % 2 ? 'Mary' : 'David',
        Text:index === 699 ? 'Final decision: keep the complete archive local.' : `Synthetic evidence row ${index + 1} ${'x'.repeat(40)}`
    }));
    const result = handoff.buildPackage(transcript, {meetingTitle:'Long review', maxChunkLength:12000});
    assert(result.file.length > 12000);
    assert.equal(result.coverage.selected, 700);
    assert.equal(result.coverage.included, 700);
    assert.equal(result.coverage.omitted, 0);
    assert.match(result.file, /\[C0700\].*Final decision: keep the complete archive local\./);
    for (let index = 1; index <= transcript.length; index += 1) {
        const id = `C${String(index).padStart(4, '0')}`;
        assert.equal((result.file.match(new RegExp(`\\[${id}\\]`, 'g')) || []).length, 1, id);
    }
    assert(result.chunks.length > 1);
    assert(result.chunks.every(chunk => chunk.text.length <= 12000));
});

test('chunks preserve order, Unicode, empty captions, source IDs and long-caption part labels', () => {
    const handoff = loadPackage();
    const longText = `start 😀 ${'界'.repeat(2400)} end`;
    const result = handoff.buildPackage([
        {key:'stable-a', Time:'09:00', Name:'Zoë', Text:'naïve café'},
        {key:'stable-empty', Time:'09:01', Name:'', Text:''},
        {key:'stable-long', Time:'09:02', Name:'李', Text:longText}
    ], {maxChunkLength:1000, privacyMode:'cleaned by Scrubby'});
    const joined = result.chunks.map(chunk => chunk.evidence).join('\n');
    assert.match(joined, /\[C0001\].*\[source:stable-a\].*Zoë: naïve café/);
    assert.match(joined, /\[C0002\].*Unknown speaker: \(empty caption\)/);
    assert.match(joined, /\[C0003 part 1\/\d+\]/);
    assert.match(joined, /\[C0003 part \d+\/\d+\].* end/);
    assert(!joined.includes('\uFFFD'));
    assert(result.chunks.every(chunk => chunk.text.length <= 1000));
    assert.equal(result.coverage.privacyMode, 'cleaned by Scrubby');
});

test('handoff UI exposes complete save and chunk paths with action-time policy checks', () => {
    const html = read('handoff.html');
    const script = read('handoff.js');
    for (const id of ['saveEvidence', 'copyChunk', 'previousChunk', 'nextChunk', 'coverageCaptions', 'coverageOmitted']) {
        assert(html.includes(`id="${id}"`));
    }
    assert(html.includes('handoffPackage.js'));
    assert(script.includes("await requireAllowedAction('copy')"));
    assert(script.includes("await requireAllowedAction('save')"));
    assert(script.includes('disableClipboard'));
    assert(script.includes('disableFileExport'));
    assert(script.includes('forceScrubbedExport'));
    assert(script.includes('chrome.storage.local.remove(id)'));
});

test('Scrubby uses one placeholder context for handoff metadata and every caption', () => {
    const context = vm.createContext({globalThis:null});
    context.globalThis = context;
    vm.runInContext(read('privacyScrubber.js'), context);
    const cleaned = context.CaptionKeepPrivacyScrubber.scrubHandoff([
        {key:'keep-source', Name:'owner@example.com', Text:'Ask owner@example.com'}
    ], {
        meetingTitle:'Review with owner@example.com',
        providerLabel:'Synthetic provider',
        warnings:['Gap reported by owner@example.com']
    });
    assert.equal(cleaned.metadata.meetingTitle, 'Review with [EMAIL_1]');
    assert.equal(cleaned.transcript[0].Name, '[EMAIL_1]');
    assert.equal(cleaned.transcript[0].Text, 'Ask [EMAIL_1]');
    assert.equal(cleaned.metadata.warnings[0], 'Gap reported by [EMAIL_1]');
    assert.equal(cleaned.transcript[0].key, 'keep-source');
    assert(!JSON.stringify({transcript:cleaned.transcript, metadata:cleaned.metadata}).includes('owner@example.com'));
});
