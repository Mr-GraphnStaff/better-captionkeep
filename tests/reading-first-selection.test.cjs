const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rolling = require('../teams-captions-saver/rollingNotes.js');
const source = fs.readFileSync(path.join(__dirname, '../teams-captions-saver/sidepanel.js'), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function actionHarness({action, policy = {}} = {}) {
    let release;
    const calls = {clipboard:0, tabs:0, storage:0};
    const captions = [{key:'a', Name:'Speaker A', Time:'10:00', Text:'Synthetic A'}, {key:'b', Name:'Speaker B', Time:'10:01', Text:'Synthetic B'}];
    const evidence = index => ({evidenceId:`C000${index + 1}`, sourceKey:captions[index].key, text:captions[index].Text,
        speaker:captions[index].Name, time:captions[index].Time, sourceFingerprint:rolling.sourceRevision([captions[index]])});
    const context = vm.createContext({structuredClone, CaptionKeepRollingNotes:rolling,
        currentContext:{sessionId:'synthetic', transcriptArray:captions}, onTheFlyEvidence:evidence(0),
        enterprisePolicy:policy, refreshEnterprisePolicy:() => new Promise(resolve => {release = resolve;}),
        elements:{onTheFlyTask:{value:'research'}, onTheFlyQuestion:{value:'Synthetic question'}}, board:{cleanInline:value => String(value || '').trim()},
        navigator:{clipboard:{async writeText(){calls.clipboard += 1;}}},
        chrome:{tabs:{async create(){calls.tabs += 1;}}, storage:{local:{async set(){calls.storage += 1;}},sync:{async get(){return {};}}}}});
    vm.runInContext(section('    function selectionRequestSnapshot(', '    function preferredAiDestination('), context);
    vm.runInContext(section('    async function runQuickAiTask(', '    function renderTranscript('), context);
    const promise = context[action]();
    return {context, promise, calls, release:() => release(), evidence};
}
for (const action of ['runQuickAiTask','openOnTheFlyEmail','prepareOnTheFly']) {
    test(`${action} never acts on a replacement selection during its policy await`, async () => {
        const fixture = actionHarness({action});
        fixture.context.onTheFlyEvidence = fixture.evidence(1);
        fixture.release();
        await assert.rejects(fixture.promise, /selected words or active meeting changed/);
        assert.deepEqual(fixture.calls, {clipboard:0, tabs:0, storage:0});
    });
}
test('fresh managed clipboard denial causes no clipboard, tab, or storage mutation', async () => {
    const fixture = actionHarness({action:'runQuickAiTask', policy:{disableClipboard:true}});
    fixture.release();
    await assert.rejects(fixture.promise, /Clipboard actions are disabled/);
    assert.deepEqual(fixture.calls, {clipboard:0, tabs:0, storage:0});
});
test('source correction during policy evaluation invalidates the captured selection', async () => {
    const fixture = actionHarness({action:'runQuickAiTask'});
    fixture.context.currentContext.transcriptArray[0].Text = 'Corrected synthetic words';
    fixture.release();
    await assert.rejects(fixture.promise, /selected words or active meeting changed/);
    assert.equal(fixture.calls.clipboard, 0);
});
test('an empty source clears both actionable evidence and selected-caption state', () => {
    const transcriptList = {children:[], querySelectorAll:() => [], contains:() => false, replaceChildren(){}, append(){}};
    const context = vm.createContext({currentContext:null, onTheFlyEvidence:{evidenceId:'C0001'}, selectedCaptionIndex:0,
        elements:{transcriptSearch:{value:'', focus(){}}, transcriptList, transcriptCount:{}, transcriptWindowNote:{},
            onTheFlyBar:{hidden:false, querySelectorAll:() => []}, onTheFlyQuestion:{value:'Old'}, markerNote:{value:'Old'}, markLatest:{disabled:false}},
        window:{getSelection:() => null}, document:{createElement:() => ({})}, board:{cleanInline:value => String(value || '').trim()}});
    vm.runInContext(section('    function clearOnTheFly(', '    function openOnTheFlyDialog('), context);
    vm.runInContext(section('    function renderTranscript(', '    function markerNode('), context);
    context.renderTranscript();
    assert.equal(context.onTheFlyEvidence, null);
    assert.equal(context.selectedCaptionIndex, null);
    assert.equal(context.elements.onTheFlyBar.hidden, true);
    assert.equal(context.elements.markLatest.disabled, true);
});
