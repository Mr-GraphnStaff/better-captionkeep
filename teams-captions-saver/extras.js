const params = new URL(location.href).searchParams;
const elements = Object.fromEntries(['meeting','capture-chat','load-extras','chat','screenshot','image-confirm','save','discard','export','delete','status'].map(id => [id, document.getElementById(id)]));
let context = null;
let pendingImage = '';
let capturedMessages = [];
let capturedPreview = '';
let pendingKey = params.get('pending');
const tabId = Number(params.get('tab'));
const historical = params.get('historical') === 'true';

async function policy() {
    const user = await chrome.storage.sync.get(['privacyScrubberEnabled','profanityFilterEnabled','customScrubTerms']);
    return CaptionKeepConfiguration.applyPolicy(user, await CaptionKeepConfiguration.readManaged()).settings;
}
function options(settings) { return {profanityFilterEnabled:!!settings.profanityFilterEnabled, customTerms:settings.customScrubTerms || []}; }
async function worker(message) {
    const response = await chrome.runtime.sendMessage({...message, sessionId:context?.sessionId, historical});
    if (!response?.ok) throw new Error(response?.error || 'Meeting extras request failed.');
    return response;
}
function preview(bundle) {
    capturedMessages = bundle?.messages || [];
    capturedPreview = capturedMessages.length ? CaptionKeepMeetingExtras.markdown({messages:capturedMessages}) : '';
    elements.chat.value = capturedPreview;
    pendingImage = bundle?.screenshot || '';
    elements.screenshot.hidden = !pendingImage;
    if (pendingImage) elements.screenshot.src = pendingImage;
    else elements.screenshot.removeAttribute('src');
    elements['image-confirm'].checked = false;
}
async function reload() { preview((await worker({message:'get_meeting_extras'})).extras); }
function listen(id, action) {
    elements[id].addEventListener('click', async () => {
        elements[id].disabled = true;
        try { await action(); } catch (error) { elements.status.textContent = error.message; }
        finally { elements[id].disabled = !context; }
    });
}
listen('capture-chat', async () => {
    if (!Number.isInteger(tabId) || !params.has('tab')) throw new Error('Open extras from the active meeting to capture chat.');
    const status = await chrome.tabs.sendMessage(tabId, {message:'get_status'});
    const current = await chrome.tabs.sendMessage(tabId, {message:'get_evidence_context'});
    if (!status?.isInMeeting || current?.sessionId !== context.sessionId) throw new Error('The original meeting is no longer active. Nothing was captured.');
    const result = await chrome.tabs.sendMessage(tabId, {message:'capture_visible_meeting_chat'});
    if (!result?.ok) throw new Error(result?.error || 'Chat adapter unavailable. Reload the meeting page after updating the extension.');
    const settings = await policy();
    const text = CaptionKeepPrivacyScrubber.scrub(CaptionKeepMeetingExtras.markdown({messages:result.messages}), options(settings)).text;
    capturedMessages = result.messages;
    capturedPreview = text;
    elements.chat.value = text;
    elements.status.textContent = `${result.messages.length} loaded messages captured for review. Earlier/unloaded messages are not included.`;
});
listen('load-extras', reload);
listen('save', async () => {
    const settings = await policy();
    if (settings.disableSessionHistory) throw new Error('Local meeting retention is disabled by your organization.');
    if (pendingImage && !elements['image-confirm'].checked) throw new Error('Review and approve the screenshot, or discard it before saving.');
    if (pendingImage && settings.forceScrubbedExport) throw new Error('Your organization requires scrubbed output; images cannot be automatically masked.');
    const messages = elements.chat.value === capturedPreview ? capturedMessages
        : [{speaker:'Manually attached chat (reviewed)', text:elements.chat.value, time:'', links:[]}];
    const extras = CaptionKeepMeetingExtras.normalize({messages:elements.chat.value.trim() ? messages : [], screenshot:pendingImage});
    await worker({message:'save_meeting_extras', extras});
    elements.status.textContent = 'Reviewed extras saved locally with this meeting. Spoken transcript was not changed.';
});
listen('discard', async () => {
    pendingImage = '';
    elements.screenshot.hidden = true;
    elements.screenshot.removeAttribute('src');
    elements['image-confirm'].checked = false;
    if (pendingKey?.startsWith('extras_preview_')) await chrome.storage.session.remove(pendingKey);
    elements.status.textContent = 'Screenshot preview discarded. Saved extras were not changed.';
});
listen('export', async () => {
    const settings = await policy();
    if (settings.disableFileExport) throw new Error('File export is disabled by your organization.');
    const text = CaptionKeepPrivacyScrubber.scrub(elements.chat.value, options(settings)).text;
    const result = await chrome.runtime.sendMessage({message:'download_captions', meetingTitle:'Meeting chat (not spoken transcript)', format:'txt',
        transcriptArray:[{Name:'Reviewed chat attachment', Time:'Observation time unavailable', Text:text}]});
    if (!result?.ok) throw new Error(result?.error || 'Export failed.');
    elements.status.textContent = 'Chat export is ready on the save page.';
});
listen('delete', async () => {
    if (!confirm('Delete saved chat and screenshot extras for this meeting? The spoken transcript is not affected.')) return;
    await worker({message:'delete_meeting_extras'});
    preview({});
    elements.status.textContent = 'Saved meeting extras deleted.';
});
(async () => {
    try {
        if (params.has('session')) context = {sessionId:params.get('session'), meetingTitle:'Saved meeting'};
        else {
            if (!params.has('tab') || !Number.isInteger(tabId)) throw new Error('Open extras from a meeting or transcript viewer.');
            context = await chrome.tabs.sendMessage(tabId, {message:'get_evidence_context'});
        }
        if (!context?.sessionId) throw new Error('Start caption capture first so extras can be associated with this meeting.');
        elements.meeting.textContent = context.meetingTitle || 'Meeting extras';
        await reload();
        if (pendingKey?.startsWith('extras_preview_')) {
            const pending = (await chrome.storage.session.get(pendingKey))[pendingKey];
            await chrome.storage.session.remove(pendingKey);
            if (pending?.sessionId === context.sessionId) preview({...CaptionKeepMeetingExtras.normalize({messages:capturedMessages}), screenshot:pending.screenshot});
        }
        for (const id of ['load-extras','save','export','delete']) elements[id].disabled = false;
        elements['capture-chat'].disabled = !params.has('tab');
        elements.status.textContent = 'Review extras before saving. No automatic upload or sharing.';
    } catch (error) { context = null; elements.status.textContent = error.message; }
})();
