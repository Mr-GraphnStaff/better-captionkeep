// --- Constants ---
const TIMING = {
    BUTTON_CLICK_DELAY: 400,
    RETRY_DELAY: 2000,
    MAIN_LOOP_INTERVAL: 5000,
    OBSERVER_CHECK_INTERVAL: 10000,
    TOOLTIP_DISPLAY_DURATION: 1500,
    ATTENDEE_UPDATE_INTERVAL: 60000, // Check attendees every minute
    INITIAL_ATTENDEE_DELAY: 1500, // Wait 1.5s after meeting start before first check
};

const SELECTORS = {
    CAPTIONS_RENDERER: "[data-tid='closed-caption-v2-window-wrapper'], [data-tid='closed-captions-renderer'], [data-tid*='closed-caption']",
    CHAT_MESSAGE: '.fui-ChatMessageCompact',
    AUTHOR: '[data-tid="author"]',
    CAPTION_TEXT: '[data-tid="closed-caption-text"]',
    LEAVE_BUTTONS: [
        "button[data-tid='hangup-main-btn']",
        "button[data-tid='hangup-leave-button']",
        "button[data-tid='hangup-end-meeting-button']",
        "button[data-tid*='hangup']",
        "div#hangup-button button",
        "#hangup-button"
    ].join(','),
    MORE_BUTTON: "button[data-tid='more-button'], button[id='callingButtons-showMoreBtn']",
    MORE_BUTTON_EXPANDED: "button[data-tid='more-button'][aria-expanded='true'], button[id='callingButtons-showMoreBtn'][aria-expanded='true']",
    LANGUAGE_SPEECH_BUTTON: "div[id='LanguageSpeechMenuControl-id']",
    TURN_ON_CAPTIONS_BUTTON: "div[id='closed-captions-button']",
    // Attendee tracking selectors
    ATTENDEE_TREE: "[role='tree'][aria-label='Attendees']",
    ATTENDEE_ITEM: "[data-tid^='participantsInCall-']",
    ATTENDEE_COUNT: "#roster-title-section-2",
    ATTENDEE_NAME: "[id^='roster-avatar-img-']",
    ATTENDEE_ROLE: "[data-tid='ts-roster-organizer-status']",
    MEETING_CHAT: "#chat-pane-list",
    CHAT_CONTROL_MESSAGE: ".fui-ChatControlMessage",
    PEOPLE_BUTTON: "button[data-tid='calling-toolbar-people-button'], button[id='roster-button']",
};

// --- State ---
const transcriptArray = [];
let capturing = false;
let trackingAllowed = true;
let attendeesAllowed = true;
let pausedByUser = false;
let sourceMissingSince = null;
let leaveRequested = false;
let stateCheckRunning = false;
let attendeeStartTimer = null;
let captureState = 'idle';
let checkpointError = '';
let ACTIVE_CAPTURE_KEY = '';
let captureSurfaceId = '';
let documentSessionId = crypto.randomUUID();
let restoredFromCheckpoint = false;
let meetingTitleOnStart = '';
let recordingStartTime = null;
let observer = null;
let observedElement = null;
let hasInitializedListeners = false;
let wasInMeeting = false;
let meetingObserver = null;
let captionsObserver = null;
let cachedElements = new Map();
let autoEnableInProgress = false;
let autoEnableLastAttempt = 0;
let autoEnableDebounceTimer = null;
let autoSaveTriggered = false;
let lastMeetingId = null;
let timestampPreference = '12hr';
let captionBuffer = null;
const aiSummaryFeature = CaptionKeepTranscriptInsights.createAiSummaryFeature({
    storage: chrome.storage.sync,
    readManaged: () => CaptionKeepConfiguration.readManaged(),
    applyPolicy: (settings, managed) => CaptionKeepConfiguration.applyPolicy(settings, managed),
    sendMessage: message => chrome.runtime.sendMessage(message)
});

// --- Attendee Tracking State ---
let attendeeUpdateInterval = null;
let backupInterval = null;
let attendeeData = {
    allAttendees: new Set(), // All unique attendees who joined
    currentAttendees: new Map(), // Currently in meeting (name -> role)
    attendeeHistory: [], // Detailed tracking with timestamps
    lastUpdated: null,
    meetingStartTime: null,
};

// --- Timestamp Preferences ---
(async () => {
    try {
        const { timestampFormat } = await chrome.storage.sync.get('timestampFormat');
        if (timestampFormat) {
            timestampPreference = timestampFormat;
        }
    } catch (error) {
        console.warn('[Teams Caption Saver] Failed to load timestamp preference:', error);
    }
})();

async function readEffectiveCaptureSettings() {
    const user = await chrome.storage.sync.get(['trackCaptions', 'trackAttendees', 'autoOpenAttendees']);
    return CaptionKeepConfiguration.applyPolicy(user, await CaptionKeepConfiguration.readManaged()).settings;
}

async function refreshManagedAttendeeState() {
    const settings = await readEffectiveCaptureSettings();
    attendeesAllowed = settings.trackAttendees !== false;
    if (!attendeesAllowed) stopAttendeeTracking();
    else if (isUserInMeeting()) startAttendeeTracking();
}

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.trackCaptions) {
        trackingAllowed = changes.trackCaptions.newValue !== false;
        if (!trackingAllowed) {
            flushPendingCaptions();
            pausedByUser = true;
            capturing = false;
            captureState = 'paused';
            observer?.disconnect();
            observer = null;
            observedElement = null;
            clearInterval(backupInterval);
            backupInterval = null;
            persistBackup();
            chrome.runtime.sendMessage({message:'update_badge_status', capturing:false}).catch(() => {});
        } else {
            handleCaptionsStateChange();
        }
    }
    if (areaName === 'sync' && changes.trackAttendees) {
        void refreshManagedAttendeeState();
    }
    if (areaName === 'managed') {
        void refreshManagedAttendeeState();
    }
    if (areaName === 'sync' && changes.timestampFormat) {
        timestampPreference = changes.timestampFormat.newValue || '12hr';
    }
});

function formatTimestamp(date = new Date()) {
    if (timestampPreference === 'relative') {
        if (!(recordingStartTime instanceof Date)) {
            return '00:00:00';
        }
        const diffMs = Math.max(0, date - recordingStartTime);
        const totalSeconds = Math.floor(diffMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return [hours, minutes, seconds].map((value) => value.toString().padStart(2, '0')).join(':');
    }

    const options = {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: timestampPreference !== '24hr'
    };
    return date.toLocaleTimeString([], options);
}

// --- Real-time Broadcasting ---
function broadcastCaptionUpdate(data) {
    try {
        chrome.runtime.sendMessage({
            message: "live_caption_update",
            sessionId: recordingStartTime?.toISOString(),
            ...data
        }).catch(() => {
            // Viewer might not be open, ignore error
        });
    } catch (error) {
        // Silent fail if no listeners
    }
}

function broadcastAttendeeUpdate(data) {
    try {
        chrome.runtime.sendMessage({
            message: "live_attendee_update",
            ...data
        }).catch(() => {
            // Viewer might not be open, ignore error
        });
    } catch (error) {
        // Silent fail if no listeners
    }
}

function ensureCaptionBuffer() {
    if (captionBuffer) return captionBuffer;
    captionBuffer = CaptionKeepTeamsCaptionBuffer.create({
        quietMs: 1500,
        maxPendingMs: 10000,
        onCommit(caption, isNew) {
            const existingIndex = transcriptArray.findIndex(entry => entry.key === caption.key);
            if (isNew || existingIndex === -1) {
                transcriptArray.push(caption);
                broadcastCaptionUpdate({type: 'new', caption});
                return;
            }
            transcriptArray[existingIndex] = {...transcriptArray[existingIndex], ...caption};
            broadcastCaptionUpdate({type: 'update', caption: transcriptArray[existingIndex]});
        }
    });
    return captionBuffer;
}

function flushPendingCaptions() {
    captionBuffer?.flushAll();
}

// --- Error Handling & Logging ---
class ErrorHandler {
    static getErrorMessage(error) {
        if (typeof error === 'string') {
            return error;
        }

        if (error && typeof error.message === 'string' && error.message.trim().length > 0) {
            return error.message;
        }

        if (error && typeof error === 'object') {
            try {
                return JSON.stringify(error);
            } catch (_stringifyError) {
                return String(error);
            }
        }

        return String(error);
    }

    static isNoReceiverError(message) {
        return typeof message === 'string' && (
            message.includes('Receiving end does not exist')
            || message.includes('Could not establish connection')
            || message.includes('The message port closed before a response was received')
        );
    }

    static log(error, context = '', silent = false) {
        const timestamp = new Date().toISOString();
        const message = ErrorHandler.getErrorMessage(error);
        const errorInfo = {
            timestamp,
            context,
            message,
            stack: error.stack,
            url: window.location.href
        };

        if (ErrorHandler.isNoReceiverError(message)) {
            console.warn(`[Teams Caption Saver] ${context}: ${message}`);
        } else {
            console.error(`[Teams Caption Saver] ${context}: ${message}`, errorInfo);
        }
        
        if (!silent) {
            // Could send to analytics or show user notification
            chrome.runtime.sendMessage({
                message: "error_logged",
                error: errorInfo
            }).catch(() => {}); // Prevent recursive errors
        }
        
        return errorInfo;
    }
    
    static wrap(fn, context = '', fallback = null) {
        return async function(...args) {
            try {
                return await fn.apply(this, args);
            } catch (error) {
                ErrorHandler.log(error, context);
                return fallback;
            }
        };
    }
}

// --- Retry Mechanism ---
class RetryHandler {
    static async withRetry(fn, context = '', maxAttempts = 3, baseDelay = 1000) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxAttempts) {
                    ErrorHandler.log(error, `${context} - Final attempt failed`, false);
                    throw error;
                }
                
                const delayTime = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
                console.log(`[Teams Caption Saver] ${context} - Attempt ${attempt} failed, retrying in ${delayTime}ms:`, error.message || error);
                await delay(delayTime);
            }
        }
        
        throw lastError;
    }
}

// --- Utility Functions ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getCleanTranscript = () => transcriptArray.map(entry => ({...entry}));

async function maybeTriggerAiSummaries(transcript, meetingTitle, meetingId) {
    try {
        await aiSummaryFeature.onMeetingEnded({
            transcript,
            meetingTitle,
            providerLabel: 'Microsoft Teams',
            sessionId: meetingId
        });
    } catch (error) {
        ErrorHandler.log(error, 'AI summary automation', false);
    }
}

// --- DOM Element Caching ---
function getCachedElement(selector, expiry = 5000) {
    const now = Date.now();
    const cached = cachedElements.get(selector);
    
    if (cached && (now - cached.timestamp) < expiry && document.contains(cached.element)) {
        return cached.element;
    }
    
    const element = document.querySelector(selector);
    if (element) {
        cachedElements.set(selector, { element, timestamp: now });
    }
    return element;
}

function clearElementCache() {
    cachedElements.clear();
}

// Teams replaces the full meeting stage with a compact dock while multitasking.
// The compact stage can use a different hang-up button, and pop-out captions do
// not contain meeting controls at all. Either surface is evidence that the
// meeting/caption session is still alive.
const isUserInMeeting = () => (
    getCachedElement(SELECTORS.LEAVE_BUTTONS) !== null ||
    getCachedElement(SELECTORS.CAPTIONS_RENDERER) !== null
);

// --- Core Logic ---
const processCaptionUpdates = ErrorHandler.wrap(function() {
    if (!trackingAllowed || !capturing) return;
    const closedCaptionsContainer = getCachedElement(SELECTORS.CAPTIONS_RENDERER);
    if (!closedCaptionsContainer) return;

    const transcriptElements = closedCaptionsContainer.querySelectorAll(SELECTORS.CHAT_MESSAGE);

    const snapshot = [];
    transcriptElements.forEach(element => {
        try {
            const authorElement = element.querySelector(SELECTORS.AUTHOR);
            const textElement = element.querySelector(SELECTORS.CAPTION_TEXT);

            if (!authorElement || !textElement) return;

            const name = authorElement.innerText.trim();
            const text = textElement.innerText.trim();
            if (text.length === 0) return;

            snapshot.push({identity: element, Name: name, Text: text, Time: formatTimestamp()});
        } catch (error) {
            ErrorHandler.log(error, 'Processing individual caption element', true);
        }
    });
    ensureCaptionBuffer().observeSnapshot(snapshot);
}, 'Caption updates processing');

// --- Attendee Tracking Functions ---
function updateAttendeesFromTranscript() {
    // Fallback method: Extract unique speakers from transcript
    const speakers = [...new Set(transcriptArray.map(item => item.Name))];
    const currentTime = formatTimestamp();
    
    speakers.forEach(name => {
        if (!attendeeData.allAttendees.has(name)) {
            attendeeData.allAttendees.add(name);
            attendeeData.currentAttendees.set(name, 'Speaker');
            
            attendeeData.attendeeHistory.push({
                name,
                role: 'Speaker',
                action: 'detected from transcript',
                time: currentTime
            });
            
            console.log('[Teams Caption Saver] New transcript speaker observation recorded.');
        }
    });
    
    attendeeData.lastUpdated = currentTime;
    console.log(`Attendee update from transcript. Speakers found: ${speakers.length}`);
}
function updateAttendeeList() {
    if (!attendeesAllowed) return;
    try {
        const attendeeTree = document.querySelector(SELECTORS.ATTENDEE_TREE);
        if (!attendeeTree) {
            console.log("Attendee tree not found, roster might not be open");
            // Fallback: Add speakers from transcript as attendees
            updateAttendeesFromTranscript();
            return;
        }
        
        const attendeeItems = document.querySelectorAll(SELECTORS.ATTENDEE_ITEM);
        const currentTime = formatTimestamp();
        
        // Clear current attendees for fresh update
        const previousAttendees = new Set(attendeeData.currentAttendees.keys());
        attendeeData.currentAttendees.clear();
        
        // Process each attendee
        attendeeItems.forEach(item => {
            const nameElement = item.querySelector(SELECTORS.ATTENDEE_NAME);
            const roleElement = item.querySelector(SELECTORS.ATTENDEE_ROLE);
            
            if (nameElement) {
                const name = nameElement.textContent.trim();
                const role = roleElement ? roleElement.textContent.trim() : 'Attendee';
                
                // Add to current attendees
                attendeeData.currentAttendees.set(name, role);
                
                // Track in all attendees
                if (!attendeeData.allAttendees.has(name)) {
                    attendeeData.allAttendees.add(name);
                    
                    // Add to history as new join
                    attendeeData.attendeeHistory.push({
                        name,
                        role,
                        action: 'joined',
                        time: currentTime
                    });
                    
                    console.log('[Teams Caption Saver] New attendee observation recorded.');
                }
            }
        });
        
        // Check for attendees who left
        previousAttendees.forEach(name => {
            if (!attendeeData.currentAttendees.has(name)) {
                attendeeData.attendeeHistory.push({
                    name,
                    action: 'left',
                    time: currentTime
                });
                console.log('[Teams Caption Saver] Attendee departure observation recorded.');
            }
        });
        
        attendeeData.lastUpdated = currentTime;
        
        // Get count from header
        const countElement = document.querySelector(SELECTORS.ATTENDEE_COUNT);
        if (countElement) {
            const countMatch = countElement.textContent.match(/\((\d+)\)/);
            if (countMatch) {
                console.log(`Total attendees in meeting: ${countMatch[1]}`);
            }
        }
        
        console.log(`Attendee update complete. Current: ${attendeeData.currentAttendees.size}, Total: ${attendeeData.allAttendees.size}`);
        
    } catch (error) {
        ErrorHandler.log(error, 'Updating attendee list', true);
    }
}

async function tryOpenParticipantPanel() {
    try {
        const peopleButton = document.querySelector(SELECTORS.PEOPLE_BUTTON);
        if (peopleButton && peopleButton.getAttribute('aria-pressed') !== 'true') {
            console.log("Attempting to open participant panel for attendee tracking...");
            peopleButton.click();
            await delay(500); // Wait for panel to open
            return true;
        }
        return false;
    } catch (error) {
        console.log("Could not open participant panel:", error);
        return false;
    }
}

async function startAttendeeTracking() {
    // Check if attendee tracking is enabled
    const { trackAttendees, autoOpenAttendees } = await readEffectiveCaptureSettings();
    if (trackAttendees === false) {
        console.log("Attendee tracking is disabled in settings");
        return;
    }
    
    if (!attendeesAllowed || attendeeUpdateInterval || attendeeStartTimer) return;
    
    // Reset attendee data for new meeting
    attendeeData = {
        allAttendees: new Set(),
        currentAttendees: new Map(),
        attendeeHistory: [],
        lastUpdated: null,
        meetingStartTime: new Date().toISOString(),
    };
    
    console.log("Starting attendee tracking...");
    
    // Initial update after delay
    attendeeStartTimer = setTimeout(async () => {
        attendeeStartTimer = null;
        if (!attendeesAllowed || !isUserInMeeting()) return;
        // Only auto-open participant panel if setting is enabled
        if (autoOpenAttendees) {
            await tryOpenParticipantPanel();
        }
        
        if (!attendeesAllowed || !isUserInMeeting()) return;
        updateAttendeeList();
        
        // Then update every minute
        attendeeUpdateInterval = setInterval(updateAttendeeList, TIMING.ATTENDEE_UPDATE_INTERVAL);
    }, TIMING.INITIAL_ATTENDEE_DELAY);
}

function stopAttendeeTracking() {
    clearTimeout(attendeeStartTimer);
    attendeeStartTimer = null;
    if (attendeeUpdateInterval) {
        clearInterval(attendeeUpdateInterval);
        attendeeUpdateInterval = null;
        console.log("Stopped attendee tracking");
    }
}

async function getAttendeeReport() {
    // Check if attendee tracking is enabled
    const { trackAttendees } = await readEffectiveCaptureSettings();
    if (trackAttendees === false) {
        return null; // Return null if tracking is disabled
    }
    
    const report = {
        meetingStartTime: attendeeData.meetingStartTime,
        lastUpdated: attendeeData.lastUpdated,
        totalUniqueAttendees: attendeeData.allAttendees.size,
        currentAttendeeCount: attendeeData.currentAttendees.size,
        attendeeList: Array.from(attendeeData.allAttendees),
        currentAttendees: Array.from(attendeeData.currentAttendees.entries()).map(([name, role]) => ({
            name,
            role
        })),
        attendeeHistory: attendeeData.attendeeHistory
    };
    
    console.log("[Teams Caption Saver] Attendee report generated:", {
        totalAttendees: report.totalUniqueAttendees
    });
    
    return report;
}

// --- Event-Driven Meeting Detection ---
let meetingStateDebounceTimer = null;
let captionsStateDebounceTimer = null;

function setupMeetingObserver() {
    if (meetingObserver) return;
    
    meetingObserver = new MutationObserver(() => {
        // Debounce meeting state changes to prevent excessive calls
        if (meetingStateDebounceTimer) {
            clearTimeout(meetingStateDebounceTimer);
        }
        meetingStateDebounceTimer = setTimeout(() => {
            handleMeetingStateChange();
        }, 1000);
    });
    
    meetingObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributeFilter: ['data-tid']
    });
}

function setupCaptionsObserver() {
    if (captionsObserver) return;
    
    captionsObserver = new MutationObserver(() => {
        // Debounce captions state changes to prevent excessive calls
        if (captionsStateDebounceTimer) {
            clearTimeout(captionsStateDebounceTimer);
        }
        captionsStateDebounceTimer = setTimeout(() => {
            handleCaptionsStateChange();
        }, 1500);
    });
    
    captionsObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributeFilter: ['data-tid']
    });
}

const checkMeetingState = ErrorHandler.wrap(async function() {
    const previouslyInMeeting = wasInMeeting;
    const nowInMeeting = isUserInMeeting();
    if (nowInMeeting) {
        sourceMissingSince = null;
        leaveRequested = false;
        captureState = trackingAllowed ? (document.querySelector(SELECTORS.CAPTIONS_RENDERER) ? 'capturing' : 'source unavailable') : 'paused';
    } else if (wasInMeeting) {
        sourceMissingSince ??= Date.now();
        captureState = 'source unavailable';
        // Hidden Teams windows are not evidence that a meeting ended.
        // Allow visible DOM swaps 15 seconds to settle before finalizing.
        if ((document.hidden && !leaveRequested) || Date.now() - sourceMissingSince < 15000) return;
    }
    
    if (wasInMeeting && !nowInMeeting) {
        flushPendingCaptions();
        console.log("Meeting transition detected: In -> Out. Checking for auto-save.");
        
        // Send meeting ended signal to viewer
        try {
            chrome.runtime.sendMessage({
                message: "meeting_ended", sessionId: recordingStartTime?.toISOString()
            }).catch(() => {
                // Viewer might not be open, ignore error
            });
        } catch (error) {
            // Silent fail if no listeners
        }
        
        // Generate a unique meeting session ID
        const currentMeetingId = `${meetingTitleOnStart}_${recordingStartTime?.toISOString() || Date.now()}`;
        
        // Prevent duplicate auto-saves for the same meeting session
        if (autoSaveTriggered && lastMeetingId === currentMeetingId) {
            console.log("Auto-save already triggered for this meeting session, skipping...");
            clearElementCache();
            wasInMeeting = nowInMeeting;
            return;
        }

        try {
            const { autoSaveOnEnd } = await chrome.storage.sync.get('autoSaveOnEnd');
            const effective = await readEffectiveCaptureSettings();
            if (autoSaveOnEnd && transcriptArray.length > 0 && !effective.disableFileExport) {
                console.log("Auto-save is ON and transcript has data. Triggering save.");
                
                // Mark auto-save as triggered before sending message
                autoSaveTriggered = true;
                lastMeetingId = currentMeetingId;
                
                // Send save message without retry (let service worker handle retries if needed)
                const attendeeReport = await getAttendeeReport();
                await chrome.runtime.sendMessage({
                    message: "save_on_leave",
                    transcriptArray: getCleanTranscript(),
                    meetingTitle: meetingTitleOnStart,
                    recordingStartTime: recordingStartTime ? recordingStartTime.toISOString() : new Date().toISOString(),
                    attendeeReport: attendeeReport
                });
                
                console.log("Auto-save message sent successfully.");
            }
        } catch (error) {
            ErrorHandler.log(error, 'Auto-save on meeting end', false);
            // Reset auto-save state on error so it can be retried
            autoSaveTriggered = false;
        }

        await maybeTriggerAiSummaries(getCleanTranscript(), meetingTitleOnStart, currentMeetingId);

        clearElementCache();
    }

    if (!nowInMeeting) {
        wasInMeeting = false;
        stopCaptureSession();
        stopAttendeeTracking();
        return;
    } else if (!previouslyInMeeting && nowInMeeting) {
        // Reset auto-save state when joining a new meeting
        console.log("Meeting transition detected: Out -> In. Resetting auto-save state.");
        autoSaveTriggered = false;
        lastMeetingId = null;
        aiSummaryFeature.reset();
        // Start attendee tracking when entering meeting
        startAttendeeTracking();
    }

    wasInMeeting = true;
    
    handleCaptionsStateChange();
}, 'Meeting state change handler');

async function handleMeetingStateChange() {
    if (stateCheckRunning) return;
    stateCheckRunning = true;
    try { await checkMeetingState(); } finally { stateCheckRunning = false; }
}

const handleCaptionsStateChange = ErrorHandler.wrap(async function() {
    if (!isUserInMeeting()) return;
    
    const { trackCaptions } = await chrome.storage.sync.get('trackCaptions');
    if (trackCaptions === false) {
        console.log("Caption tracking disabled, skipping caption state handling");
        return;
    }
    
    const captionsContainer = getCachedElement(SELECTORS.CAPTIONS_RENDERER);
    if (captionsContainer) {
        startCaptureSession();
    } else {
        // Teams temporarily unmounts the caption renderer when its PWA meeting
        // window changes to the compact dock. Keep the same capture session and
        // transcript alive; ensureObserverIsActive() will attach to the new
        // renderer as soon as Teams mounts it again.
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        observedElement = null;
        
        const { autoEnableCaptions } = await chrome.storage.sync.get('autoEnableCaptions');
        if (autoEnableCaptions !== false) {
            // Use debounced version to prevent rapid firing
            debouncedAutoEnableCaptions();
        }
    }
}, 'Captions state change handler');

function ensureObserverIsActive() {
    if (!capturing || !trackingAllowed) return;

    const captionContainer = getCachedElement(SELECTORS.CAPTIONS_RENDERER);
    
    // If the container doesn't exist or has changed, re-initialize the observer
    if (!captionContainer || captionContainer !== observedElement) {
        if (observer) {
            observer.disconnect();
        }

        if (captionContainer) {
            observer = new MutationObserver(processCaptionUpdates);
            observer.observe(captionContainer, {
                childList: true,
                subtree: true,
                characterData: true,
            });
            observedElement = captionContainer;
            processCaptionUpdates(); // Initial scan
        } else {
            observedElement = null;
        }
    }
}

async function startCaptureSession() {
    // Check if caption tracking is enabled
    const { trackCaptions } = await chrome.storage.sync.get('trackCaptions');
    if (trackCaptions === false) {
        console.log("Caption tracking is disabled in settings");
        // Still start attendee tracking if captions are disabled
        startAttendeeTracking();
        return;
    }
    
    if (capturing || !trackingAllowed) return;

    console.log("New caption session detected. Starting capture.");
    if (!pausedByUser && !restoredFromCheckpoint) {
        captionBuffer?.reset();
        transcriptArray.length = 0;
        meetingTitleOnStart = document.title;
        recordingStartTime = new Date();
        chrome.runtime.sendMessage({message:'reset_aliases'}).catch(() => {});
    }
    pausedByUser = false;
    restoredFromCheckpoint = false;

    capturing = true;
    captureState = 'capturing';

    console.log('[Teams Caption Saver] Capture started.');
    
    // Start periodic backup
    startPeriodicBackup();
    
    // Start attendee tracking
    startAttendeeTracking();
    
    chrome.runtime.sendMessage({ message: "update_badge_status", capturing: true });
    
    ensureObserverIsActive();
}

async function persistBackup() {
    if (!ACTIVE_CAPTURE_KEY || !transcriptArray.length) return;
    try {
        const snapshot = {
            transcript: getCleanTranscript(), meetingTitle: meetingTitleOnStart,
            recordingStartTime: recordingStartTime?.toISOString(), lastBackup: new Date().toISOString(),
            documentSessionId, pageUrl: window.location.href, surfaceId: captureSurfaceId,
            attendeeData: { ...attendeeData, allAttendees:[...attendeeData.allAttendees], currentAttendees:[...attendeeData.currentAttendees] }
        };
        await chrome.storage.local.set({ [`backup_${documentSessionId}`]: snapshot, [ACTIVE_CAPTURE_KEY]: snapshot });
        checkpointError = '';
    } catch (error) { checkpointError = 'Recovery save failed: ' + error.message; }
}

async function restoreActiveCapture() {
    if (!ACTIVE_CAPTURE_KEY) return false;
    try {
        const snapshot = (await chrome.storage.local.get(ACTIVE_CAPTURE_KEY))[ACTIVE_CAPTURE_KEY];
        const age = Date.now() - Date.parse(snapshot?.lastBackup || '');
        if (!captureSurfaceId || !snapshot || snapshot.surfaceId !== captureSurfaceId
            || !Array.isArray(snapshot.transcript) || !snapshot.transcript.length ||
            !Number.isFinite(age) || age > 4 * 60 * 60 * 1000 || snapshot.pageUrl !== window.location.href) return false;

        transcriptArray.splice(0, transcriptArray.length, ...snapshot.transcript);
        meetingTitleOnStart = snapshot.meetingTitle || document.title;
        recordingStartTime = snapshot.recordingStartTime ? new Date(snapshot.recordingStartTime) : new Date();
        if (typeof snapshot.documentSessionId === 'string' && /^[a-f0-9-]+$/i.test(snapshot.documentSessionId)) {
            documentSessionId = snapshot.documentSessionId;
        }
        if (snapshot.attendeeData) {
            attendeeData = {
                ...attendeeData,
                ...snapshot.attendeeData,
                allAttendees: new Set(snapshot.attendeeData.allAttendees || []),
                currentAttendees: new Map(snapshot.attendeeData.currentAttendees || [])
            };
        }
        restoredFromCheckpoint = true;
        ensureCaptionBuffer().seed(transcriptArray);
        checkpointError = 'Capture resumed from a recovery checkpoint. The reload interval may be incomplete.';
        captureState = 'recovering';
        return true;
    } catch (error) {
        checkpointError = 'Recovery check failed: ' + error.message;
        return false;
    }
}

function startPeriodicBackup() {
    // Clear any existing backup interval
    if (backupInterval) {
        clearInterval(backupInterval);
    }
    
    // Backup transcript every 30 seconds
    backupInterval = setInterval(persistBackup, 30000); // 30 seconds
}

function stopCaptureSession() {
    if (!capturing && !pausedByUser) return;
    flushPendingCaptions();
    pausedByUser = false;
    captureState = 'ended';

    console.log("Captions turned off or meeting ended. Capture stopped. Data preserved.");
    capturing = false;
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    observedElement = null;
    
    // Stop periodic backup
    if (backupInterval) {
        clearInterval(backupInterval);
        backupInterval = null;
    }
    
    if (transcriptArray.length > 0) {
        persistBackup().then(() => saveToSessionHistory());
    }

    // Stop attendee tracking
    stopAttendeeTracking();
    
    chrome.runtime.sendMessage({ message: "update_badge_status", capturing: false });
}

// Save current transcript to session history
async function saveToSessionHistory() {
    if (transcriptArray.length === 0) return;
    
    try {
        // Use message passing to save session (content scripts can't import modules)
        const attendeeReport = await getAttendeeReport();
        const result = await chrome.runtime.sendMessage({
            message: "save_session_history",
            backupKey: `backup_${documentSessionId}`,
            recordingStartTime: recordingStartTime?.toISOString(),
            transcriptArray: transcriptArray,
            meetingTitle: meetingTitleOnStart || 'Untitled Meeting',
            attendeeReport: attendeeReport
        });
        
        if (!result?.ok) throw new Error(result?.error || 'History save failed');
        await chrome.storage.local.remove(ACTIVE_CAPTURE_KEY);
        checkpointError = '';
    } catch (error) {
        checkpointError = 'History save failed: ' + error.message;
    }
}

// --- Automated Features ---
async function attemptAutoEnableCaptions() {
    // Prevent multiple simultaneous auto-enable attempts
    if (autoEnableInProgress) {
        console.log("Auto-enable already in progress, skipping...");
        return;
    }
    
    // Prevent too frequent attempts (min 10 seconds between attempts)
    const now = Date.now();
    if (now - autoEnableLastAttempt < 10000) {
        console.log("Auto-enable attempted too recently, skipping...");
        return;
    }
    
    autoEnableInProgress = true;
    autoEnableLastAttempt = now;
    
    try {
        console.log("Starting auto-enable captions attempt...");
        
        const moreButton = getCachedElement(SELECTORS.MORE_BUTTON);
        if (!moreButton) {
            console.error("Auto-enable FAILED: Could not find 'More' button.");
            return;
        }
        
        // Check if More menu is already expanded
        const expandedMoreButton = getCachedElement(SELECTORS.MORE_BUTTON_EXPANDED);
        if (!expandedMoreButton) {
            console.log("Clicking More button...");
            moreButton.click();
            await delay(TIMING.BUTTON_CLICK_DELAY);
        } else {
            console.log("More menu already expanded, proceeding...");
        }

        const langAndSpeechButton = getCachedElement(SELECTORS.LANGUAGE_SPEECH_BUTTON);
        if (!langAndSpeechButton) {
            console.error("Auto-enable FAILED: Could not find 'Language and speech' menu item.");
            // Close the More menu if we opened it
            const currentExpandedButton = getCachedElement(SELECTORS.MORE_BUTTON_EXPANDED);
            if (currentExpandedButton) {
                currentExpandedButton.click();
            }
            return;
        }
        
        console.log("Clicking Language and speech...");
        langAndSpeechButton.click();
        await delay(TIMING.BUTTON_CLICK_DELAY);

        const turnOnCaptionsButton = getCachedElement(SELECTORS.TURN_ON_CAPTIONS_BUTTON);
        if (turnOnCaptionsButton) {
            console.log("Clicking Turn on live captions...");
            turnOnCaptionsButton.click();
            await delay(TIMING.BUTTON_CLICK_DELAY);
        } else {
            console.error("Auto-enable FAILED: Could not find 'Turn on live captions' button.");
        }

        // Attempt to close the 'More' menu
        const finalExpandedButton = getCachedElement(SELECTORS.MORE_BUTTON_EXPANDED);
        if (finalExpandedButton) {
            console.log("Closing More menu...");
            finalExpandedButton.click();
        }
        
        console.log("Auto-enable captions attempt completed.");
    } catch (e) {
        console.error("Error during auto-enable captions attempt:", e);
    } finally {
        autoEnableInProgress = false;
    }
}

function debouncedAutoEnableCaptions() {
    if (autoEnableDebounceTimer) {
        clearTimeout(autoEnableDebounceTimer);
    }
    
    autoEnableDebounceTimer = setTimeout(() => {
        attemptAutoEnableCaptions();
    }, 2000); // 2 second debounce to prevent rapid firing
}

// --- Event-Driven Initialization ---
function initializeEventDrivenSystem() {
    if (hasInitializedListeners) return;
    
    console.log("Initializing event-driven caption system...");
    
    // Set up observers for meeting state changes
    setupMeetingObserver();
    setupCaptionsObserver();
    
    // Periodically check observer status (much less frequent than before)
    setInterval(() => {
        handleMeetingStateChange();
        ensureObserverIsActive();
    }, TIMING.MAIN_LOOP_INTERVAL);
    document.addEventListener('visibilitychange', () => {
        clearElementCache();
        handleMeetingStateChange();
        ensureObserverIsActive();
        persistBackup();
    });
    document.addEventListener('click', event => {
        if (event.target.closest?.(SELECTORS.LEAVE_BUTTONS)) {
            leaveRequested = true;
            persistBackup();
        }
    }, true);
    
    // Initial state check
    handleMeetingStateChange();
    
    hasInitializedListeners = true;
}

// --- Memory Leak Prevention ---
function cleanupObservers() {
    flushPendingCaptions();
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    if (meetingObserver) {
        meetingObserver.disconnect();
        meetingObserver = null;
    }
    if (captionsObserver) {
        captionsObserver.disconnect();
        captionsObserver = null;
    }
    
    // Clear all debounce timers
    if (meetingStateDebounceTimer) {
        clearTimeout(meetingStateDebounceTimer);
        meetingStateDebounceTimer = null;
    }
    if (captionsStateDebounceTimer) {
        clearTimeout(captionsStateDebounceTimer);
        captionsStateDebounceTimer = null;
    }
    if (autoEnableDebounceTimer) {
        clearTimeout(autoEnableDebounceTimer);
        autoEnableDebounceTimer = null;
    }
    
    // Reset auto-enable state
    autoEnableInProgress = false;
    
    // Stop attendee tracking
    stopAttendeeTracking();
    
    clearElementCache();
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanupObservers);

// Initialize the system
readEffectiveCaptureSettings().then(async settings => {
    const surface = await chrome.runtime.sendMessage({message: 'get_capture_surface', providerId: 'teams'}).catch(() => null);
    captureSurfaceId = String(surface?.surfaceId || '');
    ACTIVE_CAPTURE_KEY = captureSurfaceId ? `active_capture_v2_${captureSurfaceId.replace(/[^a-z0-9_-]/gi, '_')}` : '';
    trackingAllowed = settings.trackCaptions !== false;
    attendeesAllowed = settings.trackAttendees !== false;
    await restoreActiveCapture();
    initializeEventDrivenSystem();
});

// --- Message Handling ---
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    switch (request.message) {
        case 'viewer_ready':
            // Viewer is ready to receive live updates
            sendResponse({
                streaming: capturing, sessionId:recordingStartTime?.toISOString(),
                captionCount: transcriptArray.length
            });
            return true;
            
        case 'get_status':
            (async () => {
                const { trackCaptions } = await chrome.storage.sync.get('trackCaptions');
                const attendeeReport = await getAttendeeReport();
                sendResponse({
                    capturing: trackCaptions !== false ? capturing : false,
                    captureState, checkpointError,
                    captionCount: transcriptArray.length,
                    lastCaptionAt: transcriptArray.at(-1)?.capturedAt || '',
                    isInMeeting: isUserInMeeting(),
                    attendeeCount: attendeeReport ? attendeeReport.totalUniqueAttendees : 0
                });
            })();
            return true; // Will respond asynchronously

        case 'return_transcript':
            flushPendingCaptions();
            if (transcriptArray.length > 0) {
                (async () => {
                    const attendeeReport = await getAttendeeReport();
                    console.log("[Teams Caption Saver] Sending transcript with attendee report:", {
                        transcriptCount: transcriptArray.length,
                        attendeeCount: attendeeReport ? attendeeReport.totalUniqueAttendees : 0
                    });
                    chrome.runtime.sendMessage({
                        message: "download_captions",
                        transcriptArray: getCleanTranscript(),
                        meetingTitle: meetingTitleOnStart,
                        format: request.format,
                        recordingStartTime: recordingStartTime ? recordingStartTime.toISOString() : new Date().toISOString(),
                        attendeeReport: attendeeReport
                    });
                })();
            } else {
                alert("No captions were captured. Please ensure captions are turned on in the meeting.");
            }
            break;

        case 'get_transcript_for_copying':
            flushPendingCaptions();
            sendResponse({ transcriptArray: getCleanTranscript() });
            break;

        case 'get_evidence_context':
            flushPendingCaptions();
            sendResponse({
                providerLabel: 'Microsoft Teams',
                sessionId: recordingStartTime?.toISOString(),
                meetingTitle: meetingTitleOnStart || document.title || 'Microsoft Teams',
                captureState,
                transcriptArray: getCleanTranscript()
            });
            break;

        case 'get_captions_for_viewing':
            flushPendingCaptions();
            if (transcriptArray.length > 0) {
                chrome.runtime.sendMessage({
                    message: "display_captions",
                    sessionId:recordingStartTime?.toISOString(), meetingTitle:meetingTitleOnStart,
                    transcriptArray: getCleanTranscript()
                });
            } else {
                alert("No captions were captured. Please ensure captions are turned on in the meeting.");
            }
            break;

        case 'get_unique_speakers':
            const speakers = [...new Set(transcriptArray.map(item => item.Name))];
            sendResponse({ speakers });
            break;
            
        case 'get_attendee_report':
            (async () => {
                const attendeeReport = await getAttendeeReport();
                sendResponse({ attendeeReport: attendeeReport });
            })();
            return true; // Will respond asynchronously
        
        default:
            console.log("Unhandled message received in content script:", request.message);
            break;
    }

    return true; // Indicates an asynchronous response may be sent.
});

console.log("Teams Captions Saver content script is running.");
