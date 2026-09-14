(function initializeGoogleMeetCapture(root) {
    'use strict';

    const registry = root.CaptionKeepProviderRegistry;
    const adapter = registry?.create(window.location.href, {document, window, MutationObserver});
    if (!adapter) return;

    const transcriptArray = [];
    const sessionStartedAt = new Date();
    let captureState = 'source unavailable';

    function cleanTranscript() {
        return transcriptArray.map(caption => ({...caption}));
    }

    function handleProviderEvent(event) {
        if (event.type === 'caption-source-available') captureState = 'capturing';
        if (event.type === 'caption-source-unavailable') captureState = 'source unavailable';
        if (event.type === 'meeting-ended') captureState = 'meeting ended';
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

    adapter.start(handleProviderEvent);
    window.addEventListener('beforeunload', () => adapter.stop());

    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        switch (request.message) {
            case 'viewer_ready':
                sendResponse({streaming: adapter.isMeetingPresent(), sessionId: sessionStartedAt.toISOString(), captionCount: transcriptArray.length});
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
            default:
                return false;
        }
    });

    console.log('[Better CaptionKeep] Google Meet provider initialized.');
})(globalThis);
