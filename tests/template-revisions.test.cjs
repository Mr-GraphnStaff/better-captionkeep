const {test} = require('node:test');
const assert = require('node:assert/strict');
const templates = require('../teams-captions-saver/promptTemplates.js');
test('legacy custom templates migrate to version one and revisions survive persistence', () => {
    const old = {id:'custom-test', name:'Test', instructions:'Cite evidence'};
    const current = templates.sanitize([old])[0];
    assert.equal(current.version, 1);
    const snapshot = templates.snapshot(current);
    const edited = templates.revise(current, {instructions:'Extract cited risks'});
    assert.equal(edited.version, 2);
    assert.deepEqual(edited.revisions, [snapshot]);
    assert.equal(snapshot.instructions, 'Cite evidence');
    assert(Object.isFrozen(snapshot));
    assert.deepEqual(templates.sanitize(JSON.parse(JSON.stringify([edited])))[0], edited);
    assert.deepEqual(templates.revise(edited, {instructions:edited.instructions}), edited);
});
test('built-ins carry immutable versions and editing requires duplication', () => {
    for (const template of templates.BUILT_INS) {
        assert.equal(template.version, 1);
        assert(Object.isFrozen(template));
        assert.throws(() => templates.revise(template, {instructions:'Replace'}), /cannot be edited/);
    }
});
test('invalid and duplicate historical versions cannot replace the current revision', () => {
    const value = {id:'custom-test', name:'Current', instructions:'Current instruction', version:3,
        revisions:[{version:1, name:'Old', instructions:'Old instruction'}, {version:1, name:'Duplicate', instructions:'bad'}, {version:3, name:'Override', instructions:'bad'}]};
    const current = templates.sanitize([value])[0];
    assert.equal(current.revisions.length, 1);
    assert.equal(current.revisions[0].version, 1);
    assert.equal(current.instructions, 'Current instruction');
});
test('history is bounded without resetting monotonic version or retained snapshots', () => {
    let template = templates.sanitize([{id:'custom-test', name:'Test', instructions:'Initial'}])[0];
    const retained = templates.snapshot(template);
    for (let index = 0; index < 60; index += 1) template = templates.revise(template, {instructions:`Revision ${index}`});
    assert.equal(template.version, 61);
    assert.equal(template.revisions.length, templates.MAX_REVISIONS);
    assert.equal(template.revisions[0].version, 11);
    assert.equal(retained.version, 1);
    assert.equal(retained.instructions, 'Initial');
});
