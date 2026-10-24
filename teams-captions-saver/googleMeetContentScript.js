(function initializeGoogleMeetCapture(root) {
    'use strict';

    const registry = root.CaptionKeepProviderRegistry;
    const coordinatorFactory = root.CaptionKeepCaptureCoordinator;
    const insights = root.CaptionKeepTranscriptInsights;
    const configuration = root.CaptionKeepConfiguration;
    if (!registry || !coordinatorFactory || !insights || !configuration) throw new Error('Google Meet capture dependencies did not load.');

    const adapter = registry.create(window.location.href, {document, window, MutationObserver});
    if (!adapter) return;

    let coordinator = null;
    let trackingAllowed = true;
    let liveCaptionsRequested = false;
    let adapterStarted = false;
    let captureSurfaceId = '';
    let providerTransition = null;
    const pendingProviderEvents = [];
    const summaryFeature = insights.createAiSummaryFeature({
        storage: chrome.storage.sync,
        readManaged: () => configuration.readManaged(),
        applyPolicy: (settings, managed) => configuration.applyPolicy(settings, managed),
        sendMessage: message => chrome.runtime.sendMessage(message)
    });

    function updateCaptureBadge() {
        const state = coordinator?.getState();
        chrome.runtime.sendMessage({
            message:'update_badge_status',
            capturing:trackingAllowed && state?.captureState === 'capturing'
        }).catch(() => {});
    }

    function handleProviderEvent(event) {
        if (providerTransition) {
            pendingProviderEvents.push(event);
            return;
        }
        if (event?.type === 'meeting-started') {
            // Wait for the old archive before reusing this tab's checkpoint key.
            providerTransition = restartCapture();
            providerTransition.catch(error => console.error('[Better CaptionKeep] Capture transition failed.', error));
            return;
        }
        consumeProviderEvent(event);
    }

    async function restartCapture() {
        try {
            try { await coordinator.finalize(); }
            catch (error) { console.error('[Better CaptionKeep] Previous meeting remains in recovery.', error); }
            coordinator = createCaptureCoordinator();
            if (!trackingAllowed) coordinator.pause();
            updateCaptureBadge();
        } finally {
            providerTransition = null;
            pendingProviderEvents.splice(0).forEach(handleProviderEvent);
        }
    }

    function consumeProviderEvent(event) {
        if (!trackingAllowed && event?.type?.startsWith('caption-')) return;
        coordinator.handleProviderEvent(event);
        updateCaptureBadge();
        if (event?.type !== 'meeting-ended') return;
        liveCaptionsRequested = false;
        adapter.setAutoEnableCaptions(trackingAllowed);
        const state = coordinator.getState();
        summaryFeature.onMeetingEnded({
            transcript: coordinator.getTranscript(),
            meetingTitle: document.title || 'Google Meet',
            providerLabel: 'Google Meet',
            sessionId: state.recordingStartTime
        }).catch(error => console.error('[Better CaptionKeep] Could not prepare the evidence summary.', error));
    }

    function createCaptureCoordinator() {
        return coordinatorFactory.create({
            providerId:'google-meet', surfaceId:captureSurfaceId,
            normalizeCaption:registry.normalizeCaption, storage:chrome.storage.local,
            sendMessage:message => chrome.runtime.sendMessage(message),
            pageUrl:window.location.href, meetingTitle:document.title || 'Google Meet'
        });
    }

    function startAdapter() {
        if (adapterStarted) return;
        adapter.start(handleProviderEvent);
        adapterStarted = true;
    }

    function stopAdapter(nextState = 'paused') {
        if (adapterStarted) adapter.stop();
        adapterStarted = false;
        if (nextState === 'paused') coordinator?.pause();
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;
        if (changes.trackCaptions) {
            trackingAllowed = changes.trackCaptions.newValue !== false;
            if (!coordinator) return;
            if (trackingAllowed) {
                coordinator.resume();
                adapter.setCaptureEnabled?.(true);
                adapter.setAutoEnableCaptions(true);
                startAdapter();
            } else {
                adapter.setAutoEnableCaptions(false);
                coordinator.pause();
                adapter.setCaptureEnabled?.(false);
            }
            updateCaptureBadge();
        }
    });

    async function initialize() {
        const surface = await chrome.runtime.sendMessage({message: 'get_capture_surface', providerId: 'google-meet'});
        if (!surface?.ok || !surface.surfaceId) throw new Error(surface?.error || 'Capture surface is unavailable');
        captureSurfaceId = surface.surfaceId;
        coordinator = createCaptureCoordinator();
        await coordinator.restore();
        adapter.restoreState?.(coordinator.getTranscript());
        try {
            const stored = await chrome.storage.sync.get(['trackCaptions']);
            trackingAllowed = stored.trackCaptions !== false;
        } catch {
            trackingAllowed = true;
        }
        adapter.setAutoEnableCaptions(trackingAllowed);
        adapter.setCaptureEnabled?.(trackingAllowed);
        if (!trackingAllowed) coordinator.pause();
        startAdapter();
        updateCaptureBadge();
    }

    window.addEventListener('pagehide', () => {
        coordinator?.persistCheckpoint().catch(() => {});
        stopAdapter('page unloading');
    });

    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        if (!coordinator) {
            sendResponse({capturing: false, captureState: 'initializing', captionCount: 0});
            return false;
        }
        const state = coordinator.getState();
        switch (request.message) {
            case 'viewer_ready':
                sendResponse({streaming: state.captureState === 'capturing', sessionId: state.recordingStartTime, captionCount: state.captionCount});
                return false;
            case 'get_status':
                sendResponse({capturing: state.captureState === 'capturing', captureState: state.captureState, checkpointError: state.checkpointError, captionCount: state.captionCount, lastCaptionAt: state.lastCaptionAt, isInMeeting: adapter.isMeetingPresent(), attendeeCount: 0});
                return false;
            case 'get_transcript_for_copying':
                sendResponse({transcriptArray: coordinator.getTranscript()});
                return false;
            case 'get_evidence_context':
                sendResponse({
                    providerLabel: 'Google Meet',
                    sessionId: state.recordingStartTime,
                    meetingTitle: document.title || 'Google Meet',
                    captureState: state.captureState,
                    isInMeeting: adapter.isMeetingPresent(),
                    meetingControls: {
                        liveCaptions: Boolean(adapter.getCaptionSource()),
                        liveCaptionsRequested
                    },
                    transcriptArray: coordinator.getTranscript()
                });
                return false;
            case 'enable_live_captions':
                if (!adapter.isMeetingPresent()) {
                    sendResponse({ok:false, error:'Join a Google Meet meeting before enabling live captions.'});
                    return false;
                }
                liveCaptionsRequested = true;
                adapter.setAutoEnableCaptions(true);
                sendResponse({ok:true, state:adapter.getCaptionSource() ? 'active' : 'requested'});
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
                sendResponse(transcriptArray.length > 0
                    ? {ok:true, opened:true, captionCount:transcriptArray.length}
                    : {ok:false, opened:false, captionCount:0, error:'No captions have been captured yet.'});
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
