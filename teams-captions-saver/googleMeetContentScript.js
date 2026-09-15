(function initializeGoogleMeetCapture(root) {
    'use strict';

    const registry = root.CaptionKeepProviderRegistry;
    const adapter = registry?.create(window.location.href, {document, window, MutationObserver});
    if (!adapter) return;

    const transcriptArray = [];
    const sessionStartedAt = new Date();
    let captureState = 'initializing';
    let trackingAllowed = true;
    let adapterStarted = false;

    function cleanTranscript() {
        return transcriptArray.map(caption => ({...caption}));
    }

    function handleProviderEvent(event) {
        if (event.type === 'caption-source-available') captureState = 'capturing';
        if (event.type === 'caption-source-unavailable') captureState = 'source unavailable';
        if (event.type === 'meeting-ended') {
            captureState = 'meeting ended';
            chrome.runtime.sendMessage({message: 'meeting_ended', sessionId: sessionStartedAt.toISOString()}).catch(() => {});
        }
        if (!trackingAllowed) return;
        if (event.type !== 'caption-upsert' || !event.caption) return;

        const caption = registry.normalizeCaption(event.caption);
        const existingIndex = transcriptArray.findIndex(item => item.key === caption.key);
        if (existingIndex === -1) transcriptArray.push(caption);
        else transcriptArray[existingIndex] = caption;
        chrome.runtime.sendMessage({
            message: 'live_caption_update', sessionId: sessionStartedAt.toISOString(),
            type: existingIndex === -1 ? 'new' : 'update', caption
        }).catch(() => {});
    }

    function startAdapter() {
        if (adapterStarted || !trackingAllowed) return;
        adapter.start(handleProviderEvent);
        adapterStarted = true;
    }

    function stopAdapter(nextState = 'paused') {
        if (adapterStarted) adapter.stop();
        adapterStarted = false;
        captureState = nextState;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync' || !changes.trackCaptions) return;
        trackingAllowed = changes.trackCaptions.newValue !== false;
        if (trackingAllowed) startAdapter();
        else stopAdapter('paused');
    });

    chrome.storage.sync.get('trackCaptions').then(({trackCaptions}) => {
        trackingAllowed = trackCaptions !== false;
        if (trackingAllowed) startAdapter();
        else captureState = 'paused';
    }).catch(() => startAdapter());

    window.addEventListener('beforeunload', () => stopAdapter('page unloading'));

    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        switch (request.message) {
            case 'viewer_ready':
                sendResponse({streaming: captureState === 'capturing', sessionId: sessionStartedAt.toISOString(), captionCount: transcriptArray.length});
                return false;
            case 'get_status':
                sendResponse({capturing: captureState === 'capturing', captureState, checkpointError: '', captionCount: transcriptArray.length, isInMeeting: adapter.isMeetingPresent(), attendeeCount: 0});
                return false;
            case 'get_transcript_for_copying':
                sendResponse({transcriptArray: cleanTranscript()});
                return false;
            case 'get_unique_speakers':
                sendResponse({speakers: [...new Set(transcriptArray.map(item => item.Name).filter(Boolean))]});
                return false;
            case 'return_transcript':
                if (transcriptArray.length > 0) chrome.runtime.sendMessage({message: 'download_captions', transcriptArray: cleanTranscript(), meetingTitle: document.title || 'Google Meet', format: request.format, recordingStartTime: sessionStartedAt.toISOString(), attendeeReport: null});
                return false;
            case 'get_captions_for_viewing':
                if (transcriptArray.length > 0) chrome.runtime.sendMessage({message: 'display_captions', sessionId: sessionStartedAt.toISOString(), meetingTitle: document.title || 'Google Meet', transcriptArray: cleanTranscript()});
                return false;
            case 'get_google_meet_diagnostic':
                sendResponse({diagnostic: adapter.getSanitizedStructure()});
                return false;
            default:
                return false;
        }
    });

    console.log('[Better CaptionKeep] Google Meet provider initialized.');
})(globalThis);
