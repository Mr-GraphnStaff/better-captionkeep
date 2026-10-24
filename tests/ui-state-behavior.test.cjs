const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '../teams-captions-saver', name), 'utf8');

test('System appearance reacts to OS changes without overriding an explicit preference', () => {
    let onAppearanceChange;
    const media = {matches:false, addEventListener(type, handler) { assert.equal(type, 'change'); onAppearanceChange = handler; }};
    const document = {documentElement:{dataset:{}}};
    const context = vm.createContext({document, console, URLSearchParams, matchMedia:() => media});
    vm.runInContext(read('theme.js'), context);
    assert.equal(context.CaptionKeepTheme.apply('system'), 'system');
    assert.equal(document.documentElement.dataset.theme, 'light');
    assert.equal(document.documentElement.dataset.themePreference, 'system');
    media.matches = true;
    onAppearanceChange();
    assert.equal(document.documentElement.dataset.theme, 'captionkeep');
    context.CaptionKeepTheme.apply('light');
    onAppearanceChange();
    assert.equal(document.documentElement.dataset.theme, 'light');
    context.CaptionKeepTheme.apply('midnight');
    media.matches = false;
    onAppearanceChange();
    assert.equal(document.documentElement.dataset.theme, 'midnight');
});

function popupHarness(provider) {
    const script = read('popup.js');
    const nodes = {};
    for (const name of ['v6StatusOrbit','v6StatusBand','v6ProviderState','v6ProviderDetail','v6ReadyTitle','liveWorkspaceButton','openLastTranscriptButton','statusMessage']) {
        const classes = new Set();
        nodes[name] = {textContent:'', style:{}, classList:{remove(...names) {names.forEach(name => classes.delete(name));}, add(name) {classes.add(name);}}, classes};
    }
    const context = vm.createContext({UI_ELEMENTS:nodes, document:{documentElement:{dataset:{}}}, currentProviderLabel:provider,
        currentMeetingTab:null, currentMeetingStatus:{}, hasSavedSessions:true, Date, Number, chrome:{storage:{sync:{get:async() => ({trackCaptions:true})}}}});
    const start = script.indexOf('function updateV6State(');
    const end = script.indexOf('async function openLastLiveTranscript(', start);
    vm.runInContext(script.slice(start, end), context);
    const statusStart = script.indexOf('async function updateStatusUI(');
    const statusEnd = script.indexOf('\nfunction ', statusStart);
    // Compile only this declaration; its closing brace is before the next function.
    vm.runInContext(script.slice(statusStart, statusEnd), context);
    return {context, nodes};
}

test('Unavailable meeting captions show attention rather than normal startup', () => {
    const {context, nodes} = popupHarness('Google Meet');
    context.updateV6State({isInMeeting:true, captureState:'source unavailable', checkpointError:'', captionCount:2});
    assert.equal(nodes.v6ProviderState.textContent, 'Needs attention');
    assert(nodes.v6StatusOrbit.classes.has('error'));
    assert.match(nodes.v6ProviderDetail.textContent, /unavailable/);
    assert.equal(nodes.openLastTranscriptButton.disabled, false);
    context.updateV6State({isInMeeting:true, captureState:'initializing'});
    assert.equal(nodes.v6ProviderState.textContent, 'Starting');
    context.updateV6State({isInMeeting:true, captureState:'source unavailable', trackingAllowed:false});
    assert.equal(nodes.v6ProviderState.textContent, 'Off by you');
});

test('Only Teams capture status mentions Microsoft 365 transcription', async () => {
    for (const provider of ['Google Meet', 'Zoom Web', 'Microsoft Teams']) {
        const {context, nodes} = popupHarness(provider);
        await context.updateStatusUI({capturing:true, captionCount:2, isInMeeting:true, captureState:'capturing'});
        assert.equal(nodes.statusMessage.textContent.includes('Microsoft 365'), provider === 'Microsoft Teams');
    }
});
