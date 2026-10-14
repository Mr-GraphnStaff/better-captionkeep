const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '../teams-captions-saver', file), 'utf8');

function host({open = false, available = true, changes = true, attribute = 'aria-pressed'} = {}) {
    let clicks = 0;
    const button = {getAttribute: name => name === attribute ? String(open) : null,
        click() { clicks++; if (changes) open = !open; }};
    const context = vm.createContext({SELECTORS:{PEOPLE_BUTTON:'people', ATTENDEE_TREE:'tree'},
        getLiveMeetingElement: selector => selector === 'people' && available ? button : null,
        isUserInMeeting: () => true, delay: async () => {}});
    const text = source('content_script.js');
    vm.runInContext(text.slice(text.indexOf('function isParticipantPanelOpen()'), text.indexOf('async function startAttendeeTracking()')), context);
    return {run: code => vm.runInContext(code, context), closeNative: () => {open = false;}, clicks: () => clicks};
}

for (const attribute of ['aria-pressed', 'aria-expanded']) {
    test(`Teams panel opens, closes and reopens after native X (${attribute})`, async () => {
        const h = host({attribute});
        assert.equal(await h.run('setParticipantPanelOpen(true)'), true);
        assert.equal(h.run('isParticipantPanelOpen()'), true);
        assert.equal(await h.run('setParticipantPanelOpen(true)'), false);
        assert.equal(h.clicks(), 1);
        assert.equal(await h.run('setParticipantPanelOpen(false)'), true);
        await h.run('setParticipantPanelOpen(true)');
        h.closeNative();
        assert.equal(h.run('isParticipantPanelOpen()'), false);
        assert.equal(await h.run('setParticipantPanelOpen(true)'), true);
        assert.equal(h.clicks(), 4);
    });
}

test('unavailable and unresponsive Teams controls do not report success', async () => {
    await assert.rejects(host({available:false}).run('setParticipantPanelOpen(true)'), /unavailable/);
    await assert.rejects(host({changes:false}).run('setParticipantPanelOpen(true)'), /did not change/);
});

function workspace(controls, inMeeting = true) {
    const elements = Object.fromEntries(['meetingSourceControls', 'openAttendeePanel', 'requestTeamsTranscription',
        'enableLiveCaptions', 'meetingSourceStatus'].map(key => [key, {setAttribute(name, value) {this[name] = value;}}]));
    const context = vm.createContext({elements, currentContext:{providerLabel:'Microsoft Teams', isInMeeting:inMeeting, meetingControls:controls}});
    const text = source('sidepanel.js');
    vm.runInContext(text.slice(text.indexOf('    function renderMeetingSourceControls()'), text.indexOf('    function renderContext()')) + '\nrenderMeetingSourceControls();', context);
    return elements.openAttendeePanel;
}

test('Live Workspace keeps attendee control usable when capture has already been enabled', () => {
    const closed = workspace({attendees:true, attendeePanelOpen:false});
    assert.equal(closed.disabled, false);
    assert.equal(closed.textContent, 'Open attendee panel');
    assert.equal(closed['aria-expanded'], 'false');
    const open = workspace({attendees:true, attendeePanelOpen:true});
    assert.equal(open.disabled, false);
    assert.equal(open.textContent, 'Close attendee panel');
    assert.equal(open['aria-expanded'], 'true');
});

test('managed denial prevents opening but allows closing; departure disables the control', () => {
    assert.equal(workspace({attendeeAllowed:false, attendeePanelOpen:false}).disabled, true);
    assert.equal(workspace({attendeeAllowed:false, attendeePanelOpen:true}).disabled, false);
    assert.equal(workspace({attendeePanelOpen:true}, false).disabled, true);
});

test('closing attendee panel only changes visibility, not caption capture or attendee history', () => {
    const text = source('content_script.js');
    const handler = text.slice(text.indexOf("case 'close_attendee_panel':"), text.indexOf("case 'request_teams_transcription':"));
    assert.match(handler, /setParticipantPanelOpen\(false\)/);
    assert.doesNotMatch(handler, /stopAttendeeTracking|attendeeData\s*=|capturing\s*=|storage\.sync\.set/);
});
