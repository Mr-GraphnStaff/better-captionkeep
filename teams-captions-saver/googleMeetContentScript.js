(function initializeGoogleMeetCapture(root) {
    'use strict';

    const registry = root.CaptionKeepProviderRegistry;
    const coordinatorFactory = root.CaptionKeepCaptureCoordinator;
    if (!registry || !coordinatorFactory) throw new Error('Google Meet capture dependencies did not load.');

    const adapter = registry.create(window.location.href, {document, window, MutationObserver});
    if (!adapter) return;

    const coordinator = coordinatorFactory.create({
        providerId: 'google-meet',
        normalizeCaption: registry.normalizeCaption,
        storage: chrome.storage.local,
        sendMessage: message => chrome.runtime.sendMessage(message),
        pageUrl: window.location.href,
        meetingTitle: document.title || 'Google Meet'
    });
    let trackingAllowed = true;
    let autoEnableCaptions = true;
    let adapterStarted = false;

    function startAdapter() {
        if (adapterStarted || !trackingAllowed) return;
        adapter.start(event => coordinator.handleProviderEvent(event));
        adapterStarted = true;
    }

    function stopAdapter(nextState = 'paused') {
        if (adapterStarted) adapter.stop();
        adapterStarted = false;
        if (nextState === 'paused') coordinator.pause();
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;
        if (changes.autoEnableCaptions) {
            autoEnableCaptions = changes.autoEnableCaptions.newValue !== false;
            adapter.setAutoEnableCaptions(autoEnableCaptions);
        }
        if (changes.trackCaptions) {
            trackingAllowed = changes.trackCaptions.newValue !== false;
            if (trackingAllowed) {
                coordinator.resume();
                startAdapter();
            } else stopAdapter('paused');
        }
    });

    async function initialize() {
        await coordinator.restore();
        adapter.restoreState?.(coordinator.getTranscript());
        try {
            const stored = await chrome.storage.sync.get(['trackCaptions', 'autoEnableCaptions']);
            trackingAllowed = stored.trackCaptions !== false;
            autoEnableCaptions = stored.autoEnableCaptions !== false;
        } catch {
            trackingAllowed = true;
        }
        adapter.setAutoEnableCaptions(autoEnableCaptions);
        if (trackingAllowed) startAdapter();
        else coordinator.pause();
    }

    window.addEventListener('pagehide', () => {
        coordinator.persistCheckpoint().catch(() => {});
        stopAdapter('page unloading');
    });

    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        const state = coordinator.getState();
        switch (request.message) {
            case 'viewer_ready':
                sendResponse({streaming: state.captureState === 'capturing', sessionId: state.recordingStartTime, captionCount: state.captionCount});
                return false;
            case 'get_status':
                sendResponse({capturing: state.captureState === 'capturing', captureState: state.captureState, checkpointError: state.checkpointError, captionCount: state.captionCount, isInMeeting: adapter.isMeetingPresent(), attendeeCount: 0});
                return false;
            case 'get_transcript_for_copying':
                sendResponse({transcriptArray: coordinator.getTranscript()});
                return false;
            case 'get_unique_speakers':
                sendResponse({speakers: coordinator.getSpeakers()});
                return false;
            case 'return_transcript': {
                const transcriptArray = coordinator.getTranscript();
                if (transcriptArray.length > 0) chrome.runtime.sendMessage({message: 'download_captions', transcriptArray, meetingTitle: document.title || 'Google Meet', format: request.format, recordingStartTime: state.recordingStartTime, attendeeReport: null});
                return false;
            }
            case 'get_captions_for_viewing': {
                const transcriptArray = coordinator.getTranscript();
                if (transcriptArray.length > 0) chrome.runtime.sendMessage({message: 'display_captions', sessionId: state.recordingStartTime, meetingTitle: document.title || 'Google Meet', transcriptArray});
                return false;
            }
            case 'get_google_meet_diagnostic':
                sendResponse({diagnostic: adapter.getSanitizedStructure()});
                return false;
            default:
                return false;
        }
    });

    initialize().catch(error => console.error('[Better CaptionKeep] Google Meet initialization failed.', error));
    console.log('[Better CaptionKeep] Google Meet provider initialized.');
})(globalThis);
