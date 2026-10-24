const {test} = require('node:test');
const assert = require('node:assert/strict');
const api = require('../teams-captions-saver/shareableSummary.js');

test('summary is a separate immutable draft with a conservative confidentiality stamp', () => {
    const draft = api.createDraft({text:'Business update'});
    assert.equal(Object.isFrozen(draft), true);
    assert.equal(api.draftText(draft), 'CONFIDENTIAL — DRAFT — REVIEW REQUIRED\n\nBusiness update');
    assert.throws(() => api.exportText(draft), /Review/);
});

test('export requires explicit review and emits only label and summary, not source or private metadata', () => {
    const draft = api.createDraft({text:'Approved action', reviewed:true, transcript:'secret source', sourceUrl:'private://source'});
    assert.equal(api.exportText(draft), 'CONFIDENTIAL — FOR AUTHORIZED RECIPIENTS ONLY\n\nApproved action');
    assert.throws(() => api.exportText({...draft,text:'   '}), /nonempty/);
    assert.throws(() => api.exportText({...draft,reviewed:'true'}), /Review/);
});

test('privilege designation is never inferred from counsel words or selection and requires explicit confirmation', () => {
    assert.equal(api.createDraft({text:'Counsel discussed attorney-client privilege'}).label, 'confidential');
    assert.throws(() => api.createDraft({text:'x',label:'privileged',reviewed:true}), /legal guidance/);
    const draft = api.createDraft({text:'Reviewed for counsel',label:'privileged',privilegeConfirmed:true,reviewed:true});
    assert.match(api.exportText(draft), /^ATTORNEY–CLIENT PRIVILEGED — CONFIDENTIAL — FOR AUTHORIZED RECIPIENTS ONLY/);
});

test('invalid labels, oversized content and control characters fail without truncation', () => {
    assert.throws(() => api.createDraft({label:'safe-to-share'}), /supported/);
    assert.throws(() => api.createDraft({text:'a'.repeat(50001)}), /50,000/);
    assert.throws(() => api.createDraft({text:'text\u0000secret'}), /control/);
});

test('prompt contains only explicit selected evidence and leaves the original records unchanged', () => {
    const original = [{key:'C1',Name:'Synthetic speaker',Text:'Business update',Time:'10:00'},
        {key:'C2',Name:'Synthetic counsel',Text:'UNSELECTED RESTRICTED MATERIAL'}];
    const before = structuredClone(original);
    const prompt = api.buildPrompt([original[0]]);
    assert.match(prompt, /Business update/);
    assert.doesNotMatch(prompt, /UNSELECTED RESTRICTED MATERIAL/);
    assert.deepEqual(original, before);
    assert.match(prompt, /untrusted meeting data/);
    assert.match(prompt, /INTERNAL REVIEW FLAGS/);
    assert.match(prompt, /do not determine privilege/);
});

test('prompt rejects empty/oversized selections and malformed evidence without silently dropping captions', () => {
    assert.throws(() => api.buildPrompt([]), /Select/);
    assert.throws(() => api.buildPrompt([{Text:''}]), /unavailable/);
    assert.throws(() => api.buildPrompt(Array(5001).fill({Text:'x'})), /5,000/);
    assert.throws(() => api.buildPrompt([{Text:'x'.repeat(500001)}]), /nothing has been truncated/);
});
