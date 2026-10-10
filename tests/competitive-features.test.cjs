const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const profiles = require('../teams-captions-saver/exportProfiles.js');
const templates = require('../teams-captions-saver/promptTemplates.js');
const extras = require('../teams-captions-saver/meetingExtras.js');
const translation = require('../teams-captions-saver/translation.js');
const cloud = require('../teams-captions-saver/cloudExports.js');
const source = name => fs.readFileSync(path.join(__dirname, '../teams-captions-saver', name), 'utf8');

test('print derivative escapes markup, preserves Unicode, and does not mutate evidence', () => {
    const transcript = [{Name:'<img src=x onerror=alert(1)>', Time:'10:00', Text:'<script>alert(1)</script>\nこんにちは', key:'<unsafe>'}];
    const before = JSON.stringify(transcript);
    const html = profiles.formatAsPrintHtml({meetingTitle:'<title>', transcript, versionNotice:'Corrected derivative'});
    assert(!html.includes('<script>'));
    assert(!html.includes('<img'));
    assert(html.includes('&lt;script&gt;'));
    assert(html.includes('こんにちは'));
    assert(html.includes('Corrected derivative'));
    assert(html.includes(profiles.TIMING_WARNING));
    assert.equal(JSON.stringify(transcript), before);
});

function printHarness({disabled = false, empty = false, throws = false} = {}) {
    const viewer = source('viewer.js');
    const handler = viewer.slice(viewer.indexOf('    async function handlePrintPdfClick()'), viewer.indexOf('    async function refreshViewerPolicy()'));
    let printed = '';
    let removed = false;
    const notices = [];
    const context = vm.createContext({
        refreshViewerPolicy: async () => {}, enterprisePolicy:{disableFileExport:disabled},
        getVisibleCaptions: () => empty ? [] : [{Text:'visible secret@example.com'}],
        prepareOutput: entries => ({transcript:entries.map(entry => ({...entry, Text:entry.Text.replace(/secret@example.com/g, '[EMAIL]')}))}),
        transcriptVersionNotice: () => 'Corrected derivative', CaptionKeepExportProfiles:profiles,
        showNotification: message => notices.push(message),
        document:{querySelector: () => ({textContent:'Meeting secret@example.com'}), getElementById: () => null,
            createElement: () => ({remove() { removed = true; }}), body:{append(element) { printed = element.innerHTML; }}},
        window:{print() { if (throws) throw new Error('print failed'); }}
    });
    vm.runInContext(`${handler}\n globalThis.runPrint = handlePrintPdfClick;`, context);
    return {run:context.runPrint, result:() => ({printed, removed, notices})};
}

test('PDF action prints only selected scrubbed captions and scrubbed title then clears derivative', async () => {
    const harness = printHarness();
    await harness.run();
    const result = harness.result();
    assert(result.printed.includes('[EMAIL]'));
    assert(!result.printed.includes('secret@example.com'));
    assert(!result.printed.includes('hidden evidence'));
    assert.equal(result.removed, true);
});

test('PDF action respects managed export prohibition and empty selections', async () => {
    for (const options of [{disabled:true}, {empty:true}]) {
        const harness = printHarness(options);
        await harness.run();
        assert.equal(harness.result().printed, '');
        assert(harness.result().notices.length);
    }
});

test('failed printing still removes temporary transcript DOM', async () => {
    const harness = printHarness({throws:true});
    await harness.run();
    assert.equal(harness.result().removed, true);
    assert(harness.result().notices.some(message => message.includes('print failed')));
});

test('print CSS excludes viewer raw data and keyboard routes through policy checked actions', () => {
    assert(source('viewer.html').includes('body > * { display: none !important; }'));
    assert(source('viewer.html').includes('body > #print-output { display: block !important; }'));
    assert(source('viewer.js').includes("if (modifier && key === 'p')"));
    assert(source('viewer.js').includes("exportFormat.value === 'default' ? defaultSaveFormat : exportFormat.value"));
});

test('template sanitizer bounds data, rejects reserved IDs and strips transcript metadata', () => {
    const result = templates.sanitize([
        {id:'minutes', name:'Spoof', instructions:'Bad'},
        {id:'custom-one', name:'x'.repeat(100), instructions:'y'.repeat(5000), transcript:'secret'},
        {id:'custom-one', name:'Duplicate', instructions:'Other'}, null
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].name.length, 80);
    assert.equal(result[0].instructions.length, 4000);
    assert.equal(result[0].transcript, undefined);
    assert.equal(templates.sanitize(Array.from({length:25}, (_, i) => ({id:`custom-${i}`, name:'Task', instructions:'Do it'}))).length, 20);
});

test('template application retains complete evidence and never truncates the meeting', () => {
    const evidence = 'source caption '.repeat(50000);
    const result = templates.apply(evidence, 'Summarize with source IDs');
    assert(result.startsWith(evidence));
    assert(result.endsWith('Summarize with source IDs'));
    assert.equal(templates.apply(evidence, ''), evidence);
    assert.equal(templates.apply(evidence, 'New task').split('USER-SELECTED TASK').length, 2);
});

test('built-in templates require grounded owners, dates and translation language', () => {
    assert(templates.BUILT_INS.find(item => item.id === 'actions').instructions.includes('Not stated'));
    assert(templates.BUILT_INS.find(item => item.id === 'translate').instructions.includes('Ask for the target language'));
    const handoff = source('handoff.js');
    assert(handoff.includes('CaptionKeepPromptTemplates.apply(basePrompt, appliedInstructions)'));
    assert(handoff.includes('effectivePolicy.settings.forceScrubbedExport && !scrubberToggle.checked'));
});

test('extras enforce bounds, reject non-PNG content, deduplicate and keep speech separate', () => {
    const item = {speaker:'Ada', text:'Shared project link', links:['https://example.com','javascript:alert(1)']};
    const merged = extras.merge({messages:[item]}, {messages:[item]});
    assert.equal(merged.messages.length, 1);
    assert.deepEqual(merged.messages[0].links, ['https://example.com']);
    assert(extras.markdown(merged).includes('not spoken transcript'));
    assert.throws(() => extras.normalize({screenshot:'data:image/svg+xml,<svg/>'}), /PNG/);
    assert.throws(() => extras.normalize({messages:Array(501).fill(item)}), /500/);
    assert.throws(() => extras.storageKey(''), /identity/);
});

test('All settings shares popup form, is registered for all browser targets, and preserves narrow hosts', () => {
    for (const file of ['teams-captions-saver/manifest.json','manifests/manifest.chrome-store.json']) {
        const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
        assert.deepEqual(manifest.options_ui, {page:'settings.html', open_in_tab:true});
        assert(!manifest.host_permissions.includes('<all_urls>'));
        assert(manifest.content_scripts.every(entry => entry.js.includes('chatCapture.js')));
    }
    assert(source('settings.js').includes('popup.html?view=settings'));
    const popup = source('popup.html');
    assert(popup.includes('<strong>All Settings</strong>'));
    assert(popup.includes('Open every setting in a full browser tab'));
    assert(popup.indexOf('href="settings.html"') < popup.indexOf('<nav class="platform-launchers"'));
    assert.equal((popup.match(/href="settings.html"/g) || []).length, 1);
    assert(popup.includes('target="_blank" rel="noopener" aria-describedby="all-settings-description"'));
    assert(popup.includes('class="graph-manual graph-admin-details" id="graphAdminDetails"'));
    assert(popup.includes('html:not([data-view="settings"]) .graph-admin-details { display: none; }'));
    assert(source('settings.js').includes('.hash = location.hash'));
    const popupScript = source('popup.js');
    assert(popupScript.includes("document.body.dataset.graphConfigured = String(graphConfigured)"));
    assert(popupScript.includes("location.hash === '#microsoft365'"));
    assert.equal((popup.match(/class="settings-help-link"/g) || []).length, 9);
    assert(!popup.includes('id="assistantBridgeSettings"'));
    assert(!popup.includes('Privacy-and-Data-Boundaries#evidence-actions'));
    for (const wikiPage of ['Microsoft-365-Connection', 'Review-Save-and-Export', 'Getting-Started', 'Privacy-and-Data-Boundaries', 'Administrator-Deployment', 'Support']) {
        assert(popup.includes(`better-captionkeep/wiki/${wikiPage}`), wikiPage);
    }
    assert(popup.includes('html[data-view="settings"] .settings-help-link'));
    assert(popup.includes('target="_blank" rel="noopener noreferrer" aria-label='));
});

test('translation preserves originals, source IDs and timing; incremental live updates reuse unchanged text', async () => {
    let calls = 0;
    const translator = {async translate(text) { calls += 1; return `translated:${text}`; }};
    const captions = [{key:'one', Name:'Ada', Time:'10:00', Text:'Hello'}, {key:'two', Text:'Next'}];
    const original = JSON.stringify(captions);
    const cache = new Map();
    const result = await translation.translateTranscript(translator, captions, {cache});
    assert.equal(JSON.stringify(captions), original);
    assert.equal(result[0].key, 'one');
    assert.equal(result[0].Time, '10:00');
    assert.equal(result[0].Text, 'translated:Hello');
    await translation.translateTranscript(translator, [...captions, {key:'three', Text:'New'}], {cache});
    assert.equal(calls, 3);
    await translation.translateTranscript(translator, [{key:'one', Text:'Corrected'}], {cache});
    assert.equal(calls, 4);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(() => translation.translateTranscript(translator, captions, {signal:controller.signal}), /cancelled/);
});

test('chat capture refuses absent panes and rejects a foreign extension sender', () => {
    let listener;
    const context = vm.createContext({location:{hostname:'teams.microsoft.com'}, document:{querySelector:() => null}, chrome:{runtime:{id:'test',onMessage:{addListener(fn) { listener = fn; }}}}});
    vm.runInContext(source('chatCapture.js'), context);
    let response;
    assert.equal(listener({message:'capture_visible_meeting_chat'}, {id:'foreign'}, result => {response = result;}), false);
    assert.equal(response, undefined);
    listener({message:'capture_visible_meeting_chat'}, {id:'test'}, result => {response = result;});
    assert.equal(response.ok, false);
    assert(response.error.includes('no page-wide chat'));
});

test('cloud transports use only fixed provider endpoints and preserve reviewed content', async () => {
    const calls = [];
    const fetcher = async (url, options) => { calls.push({url, options}); return {ok:true, json:async () => ({id:'synthetic-file'})}; };
    await cloud.uploadGoogleDoc({accessToken:'synthetic-test-token', text:'Reviewed evidence', title:'Meeting'}, fetcher);
    assert(calls[0].url.startsWith('https://www.googleapis.com/upload/drive/v3/files'));
    assert(calls[0].options.body.includes('application/vnd.google-apps.document'));
    assert(calls[0].options.body.includes('Reviewed evidence'));
    await cloud.uploadMicrosoftFile({accessToken:'synthetic-test-token', text:'Reviewed evidence', title:'Meeting'}, fetcher);
    assert(calls[1].url.startsWith('https://graph.microsoft.com/v1.0/me/drive/root:/'));
    assert.equal(calls[1].options.body, 'Reviewed evidence');
    assert.equal(calls[1].options.redirect, 'error');
    assert(!calls[1].url.includes('synthetic-test-token'));
});

test('cloud transports reject missing consent tokens, malicious destinations and avoid retrying failed mutations', async () => {
    await assert.rejects(() => cloud.uploadGoogleDoc({text:'Evidence'}), /Connect/);
    await assert.rejects(() => cloud.uploadMicrosoftFile({accessToken:'test', text:'Evidence', driveId:'evil/path'}), /identity/);
    let calls = 0;
    await assert.rejects(() => cloud.uploadGoogleDoc({accessToken:'never-log-secret', text:'Evidence'}, async () => {calls++; return {ok:false,status:403};}), /HTTP 403/);
    assert.equal(calls, 1);
});

test('subtitle exports preserve imported boundaries and reject invented observation timing', () => {
    const transcript = [{Name:'Ada', Text:'Hello <script>bad</script>\n\n00:00:00 --> bad', Time:'00:00:01.234', key:'graph-1', mediaStartMs:1234, mediaEndMs:5678, timingSource:'official-vtt'}];
    const before = JSON.stringify(transcript);
    const srt = profiles.createProfile({format:'srt', transcript});
    assert(srt.content.startsWith('1\n00:00:01,234 --> 00:00:05,678'));
    assert(!srt.content.includes('<script>'));
    assert.equal(srt.content.split('-->').length - 1, 1);
    assert.equal(srt.timingBasis, 'source-media-cues');
    assert(profiles.createProfile({format:'vtt', transcript}).content.startsWith('WEBVTT\n\n00:00:01.234'));
    assert.throws(() => profiles.createProfile({format:'srt', transcript:[{Text:'Observed', capturedAt:'2026-10-03', Time:'10:00'}]}), /actual media cues/);
    assert.throws(() => profiles.createProfile({format:'vtt', transcript:[{...transcript[0], mediaEndMs:1}]}), /actual media cues/);
    assert.equal(JSON.stringify(transcript), before);
});

test('popup save failures, Graph busy state and native copy behavior stay guarded', () => {
    const popup = source('popup.js');
    assert(popup.includes('await chrome.tabs.sendMessage(tab.id, { message: "return_transcript", format })'));
    assert(popup.includes('Save failed. Refresh the meeting tab and try again.'));
    assert(popup.includes('let graphBusy = false;'));
    assert(/graphJoinUrl\?\.addEventListener\('input',[\s\S]*?markSelectedGraphMeeting\(\);\s*refreshGraphControls\(\);/.test(popup));
    assert(!/graphJoinUrl\?\.addEventListener\('input',[\s\S]*?markSelectedGraphMeeting\(\);\s*setGraphBusy\(false\);/.test(popup));
    assert(popup.includes('window.getSelection?.()?.toString().trim()'));
    assert(popup.includes("!editable && !selection"));
});

test('popup list choices and split-button menus preserve accessible semantics', () => {
    const popup = source('popup.js');
    const html = source('popup.html');
    assert(popup.includes("item.setAttribute('role', 'listitem')"));
    assert(!popup.includes("button.setAttribute('role', 'listitem')"));
    assert(html.includes('aria-label="More copy options" aria-haspopup="menu" aria-expanded="false" aria-controls="copyOptions"'));
    assert(html.includes('aria-label="More save options" aria-haspopup="menu" aria-expanded="false" aria-controls="saveOptions"'));
    assert(popup.includes("dropdownButton.setAttribute('aria-expanded', 'true')"));
    assert(popup.includes("if (e.key !== 'Escape') return;"));
    assert(popup.includes('if (restoreFocus) dropdownButton.focus();'));
});
