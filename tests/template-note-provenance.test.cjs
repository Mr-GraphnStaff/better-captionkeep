const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const templates = require('../teams-captions-saver/promptTemplates.js');
const artifacts = require('../teams-captions-saver/derivedArtifacts.js');
const script = fs.readFileSync(path.join(__dirname, '../teams-captions-saver/sidepanel.js'), 'utf8');
const start = script.indexOf('    async function saveReviewedNotes()');
const end = script.indexOf('    async function saveReviewedAnswer()', start);
const hash = 'a'.repeat(64);

async function save(metadata, {switchDuringHash = false} = {}) {
    let kept;
    const context = vm.createContext({
        currentContext:{sessionId:'synthetic-source', transcriptArray:[{key:'caption-1', Text:'Synthetic words'}]},
        enterprisePolicy:{}, elements:{notesDraft:{value:'Reviewed synthetic note [C0001]'}},
        refreshEnterprisePolicy:async() => {}, board:{canonicalTranscript:() => 'Synthetic canonical transcript', evidenceId:index => `C${String(index+1).padStart(4,'0')}`},
        sha256Hex:async() => {
            if (switchDuringHash) context.currentContext = {sessionId:'different-synthetic-source', transcriptArray:[{key:'new-caption', Text:'Different words'}]};
            return hash;
        },
        chrome:{storage:{session:{get:async key => ({[key]:metadata})}}},
        CaptionKeepDerivedArtifacts:artifacts,
        derivedRequest:async(message, {artifact}) => {kept = artifact; return {artifacts:[artifact]};},
        renderDerivedArtifacts:() => {}, setStatus:() => {}, Date, encodeURIComponent, structuredClone
    });
    vm.runInContext(script.slice(start, end), context);
    await context.saveReviewedNotes();
    return kept;
}

test('Reviewed notes retain the actual ISO-timestamped template handoff snapshot', async () => {
    const snapshot = templates.appliedSnapshot(templates.BUILT_INS[0], templates.BUILT_INS[0].instructions);
    const metadata = templates.handoffMetadata('synthetic-source', hash, snapshot).value;
    const artifact = await save(metadata);
    assert.equal(artifact.templateId, 'minutes');
    assert.equal(artifact.templateVersion, '1');
    assert.equal(artifact.payload.reviewedHandoffTemplate.instructions, snapshot.instructions);
    assert.equal(artifact.payload.sourceEvidence[0].caption.Text, 'Synthetic words');
    assert.equal(artifact.payload.sourceEvidence[0].evidenceId, 'C0001');
});

test('Old or different-source handoff metadata cannot be attributed to reviewed notes', async () => {
    const snapshot = templates.appliedSnapshot(templates.BUILT_INS[0], templates.BUILT_INS[0].instructions);
    const metadata = templates.handoffMetadata('synthetic-source', hash, snapshot).value;
    for (const changed of [{...metadata, sourceTranscriptSha256:'b'.repeat(64)}, {...metadata, createdAt:new Date(Date.now()-7200000).toISOString()}]) {
        const artifact = await save(changed);
        assert.equal(artifact.templateVersion, '');
        assert.equal(artifact.payload.reviewedHandoffTemplate, undefined);
    }
});

test('Edited instructions are attributed as a draft rather than a stored template revision', async () => {
    const snapshot = templates.appliedSnapshot(templates.BUILT_INS[0], 'Synthetic edited instructions');
    const artifact = await save(templates.handoffMetadata('synthetic-source', hash, snapshot).value);
    assert.equal(artifact.templateVersion, 'draft based on v1');
    assert.equal(artifact.payload.reviewedHandoffTemplate.version, null);
});

test('Switching meetings during hashing cannot save the old notes against the new source', async () => {
    await assert.rejects(save(undefined, {switchDuringHash:true}), /active meeting changed/);
});
