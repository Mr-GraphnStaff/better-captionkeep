// --- Constants for DOM Elements and Data ---
const UI_ELEMENTS = {
    statusMessage: document.getElementById('status-message'),
    manualStartInfo: document.getElementById('manual-start-info'),
    copyButton: document.getElementById('copyButton'),
    copyDropdownButton: document.getElementById('copyDropdownButton'),
    copyOptions: document.getElementById('copyOptions'),
    saveButton: document.getElementById('saveButton'),
    saveDropdownButton: document.getElementById('saveDropdownButton'),
    saveOptions: document.getElementById('saveOptions'),
    liveWorkspaceButton: document.getElementById('liveWorkspaceButton'),
    themeSelect: document.getElementById('themeSelect'),
    defaultSaveFormatSelect: document.getElementById('defaultSaveFormat'),
    saveAsTypeSelect: document.getElementById('saveAsType'),
    saveLocationInput: document.getElementById('saveLocation'),
    saveLocationRow: document.getElementById('saveLocationRow'),
    saveBehaviorHint: document.getElementById('saveBehaviorHint'),
    openLastTranscriptFolder: document.getElementById('openLastTranscriptFolder'),
    downloadFolderStatus: document.getElementById('downloadFolderStatus'),
    autoEnableCaptionsToggle: document.getElementById('autoEnableCaptionsToggle'),
    autoSaveOnEndToggle: document.getElementById('autoSaveOnEndToggle'),
    trackCaptionsToggle: document.getElementById('trackCaptionsToggle'),
    trackAttendeesToggle: document.getElementById('trackAttendeesToggle'),
    autoOpenAttendeesToggle: document.getElementById('autoOpenAttendeesToggle'),
    autoAISummaryToggle: document.getElementById('autoAISummaryToggle'),
    privacyScrubberToggle: document.getElementById('privacyScrubberToggle'),
    profanityFilterToggle: document.getElementById('profanityFilterToggle'),
    customScrubTerms: document.getElementById('customScrubTerms'),
    exportConfiguration: document.getElementById('exportConfiguration'),
    importConfiguration: document.getElementById('importConfiguration'),
    configurationFile: document.getElementById('configurationFile'),
    configurationStatus: document.getElementById('configurationStatus'),
    aiProviderOptions: document.getElementById('aiProviderOptions'),
    aiProviderHint: document.getElementById('aiProviderHint'),
    enterpriseDestinations: document.getElementById('enterpriseDestinations'),
    enterpriseDestinationHint: document.getElementById('enterpriseDestinationHint'),
    chatgptWorkspaceUrl: document.getElementById('chatgptWorkspaceUrl'),
    claudeWorkspaceUrl: document.getElementById('claudeWorkspaceUrl'),
    claudeConsoleUrl: document.getElementById('claudeConsoleUrl'),
    timestampFormat: document.getElementById('timestampFormat'),
    filenamePattern: document.getElementById('filenamePattern'),
    filenamePreview: document.getElementById('filenamePreview'),
    speakerAliasList: document.getElementById('speaker-alias-list'),
    // Session History Elements
    sessionHistory: document.getElementById('sessionHistory'),
    historyButton: document.getElementById('historyButton'),
    sessionList: document.getElementById('sessionList'),
    graphTranscriptSection: document.getElementById('graphTranscriptSection'),
    graphConnectionStatus: document.getElementById('graphConnectionStatus'),
    graphRedirectUri: document.getElementById('graphRedirectUri'),
    graphTenantId: document.getElementById('graphTenantId'),
    graphClientId: document.getElementById('graphClientId'),
    graphSaveSetup: document.getElementById('graphSaveSetup'),
    graphClearSetup: document.getElementById('graphClearSetup'),
    graphSetupStatus: document.getElementById('graphSetupStatus'),
    graphConnectButton: document.getElementById('graphConnectButton'),
    graphDisconnectButton: document.getElementById('graphDisconnectButton'),
    graphJoinUrl: document.getElementById('graphJoinUrl'),
    graphUseCurrentMeeting: document.getElementById('graphUseCurrentMeeting'),
    graphRefreshMeetings: document.getElementById('graphRefreshMeetings'),
    graphRecentMeetings: document.getElementById('graphRecentMeetings'),
    graphImportButton: document.getElementById('graphImportButton'),
    graphImportStatus: document.getElementById('graphImportStatus')
};


let currentDefaultFormat = 'txt';
let currentEnterprisePolicy = {};
let graphConnected = false;
let graphConfigured = false;
const MICROSOFT_365_HOST_ACCESS = Object.freeze([
    'https://login.microsoftonline.com/*',
    'https://graph.microsoft.com/*'
]);
const runtimeManifest = chrome.runtime.getManifest();
const isFullSettingsPage = new URL(location.href).searchParams.get('view') === 'settings';

// --- Error Handling ---
function safeExecute(fn, context = '', fallback = null) {
    try {
        return fn();
    } catch (error) {
        console.error(`[Teams Caption Saver] ${context}:`, error);
        return fallback;
    }
}

async function requestMicrosoft365HostAccess() {
    if (!chrome.permissions?.request || !chrome.permissions?.contains) {
        return {granted: true, continuesInWorker: false};
    }
    const request = {origins: [...MICROSOFT_365_HOST_ACCESS]};
    if (await chrome.permissions.contains(request)) {
        return {granted: true, continuesInWorker: false};
    }
    await chrome.storage.session.set({graphConnectPending: {createdAt: Date.now()}});
    const granted = await chrome.permissions.request(request);
    if (!granted) await chrome.storage.session.remove('graphConnectPending');
    return {granted, continuesInWorker: granted};
}

// --- Utility Functions ---
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function getActiveMeetingTab() {
    const tabs = await chrome.tabs.query(isFullSettingsPage
        ? {currentWindow:true, url:['https://teams.microsoft.com/*', 'https://teams.cloud.microsoft/*', 'https://meet.google.com/*', 'https://app.zoom.us/wc/*']}
        : { active: true, currentWindow: true });
    const meetingTab = tabs.find(tab => /^(?:https:\/\/teams\.(?:microsoft\.com|cloud\.microsoft)|https:\/\/meet\.google\.com|https:\/\/app\.zoom\.us\/wc)(?:\/|$)/.test(tab.url || ''));
    return meetingTab || null;
}

async function formatTranscript(transcript, aliases = {}) {
    if (!Array.isArray(transcript)) {
        return '';
    }

    const processed = transcript.map(entry => ({
        ...entry,
        Name: aliases[entry.Name] || entry.Name
    }));

    return processed.map(entry => `[${entry.Time}] ${entry.Name}: ${entry.Text}`).join('\n');
}

async function getScrubOptions() {
    const user = await chrome.storage.sync.get(['profanityFilterEnabled', 'customScrubTerms']);
    const policy = CaptionKeepConfiguration.applyPolicy(user, await CaptionKeepConfiguration.readManaged());
    return { profanityFilterEnabled: !!policy.settings.profanityFilterEnabled, customTerms: policy.settings.customScrubTerms || [] };
}

// --- UI Update Functions ---
async function updateStatusUI({ capturing, captionCount, lastCaptionAt, isInMeeting, attendeeCount, captureState, checkpointError, transcriptionState, transcriptionDetail }) {
    const { statusMessage } = UI_ELEMENTS;
    const { trackCaptions, trackAttendees } = await chrome.storage.sync.get(['trackCaptions', 'trackAttendees']);
    
    if (checkpointError || captureState === 'source unavailable') {
        statusMessage.textContent = checkpointError || 'Caption source unavailable — capture may be incomplete. Existing text is preserved.';
        return;
    }
    if (isInMeeting) {
        // In meeting - show appropriate status based on what's being tracked
        if (trackCaptions !== false && capturing) {
            let status = captionCount > 0 ? `Capturing! (${captionCount} lines recorded` : 'Capturing... (Waiting for speech';
            const secondsSinceCaption = lastCaptionAt ? Math.max(0, Math.floor((Date.now() - Date.parse(lastCaptionAt)) / 1000)) : null;
            if (Number.isFinite(secondsSinceCaption)) status += `, last caption ${secondsSinceCaption}s ago`;
            if (attendeeCount > 0) {
                status += `, ${attendeeCount} attendees`;
            }
            status += ')';
            if (transcriptionState === 'running') {
                status += ' Official Microsoft 365 transcription is running.';
            } else if (transcriptionState === 'requested') {
                status += ' Microsoft 365 transcription was requested; Teams will confirm when it starts.';
            } else if (transcriptionState === 'unavailable') {
                status += ` ${transcriptionDetail || 'Local capture is working. An official Microsoft 365 transcript is unavailable for this meeting.'}`;
            } else if (transcriptionState === 'disabled') {
                status += ` ${transcriptionDetail || 'Local capture is working. Automatic Microsoft 365 transcription is off.'}`;
            } else {
                status += ' Local capture is working. Microsoft 365 transcription has not been verified yet.';
            }
            statusMessage.textContent = status;
            statusMessage.style.color = captionCount > 0 ? 'var(--ck-success)' : 'var(--ck-warning)';
        } else if (trackCaptions === false && trackAttendees !== false && attendeeCount > 0) {
            // Only tracking attendees
            statusMessage.textContent = `Tracking attendees (${attendeeCount} participants)`;
            statusMessage.style.color = 'var(--ck-primary)';
        } else if (trackCaptions === false) {
            statusMessage.textContent = 'In a meeting (caption tracking disabled)';
            statusMessage.style.color = 'var(--ck-text-muted)';
        } else {
            statusMessage.textContent = 'In a meeting, but captions are off.';
            statusMessage.style.color = 'var(--ck-danger)';
        }
    } else {
        // Not in meeting - show saved data status
        let hasData = captionCount > 0 || attendeeCount > 0;
        if (hasData) {
            let status = 'Meeting ended. ';
            let parts = [];
            if (captionCount > 0) parts.push(`${captionCount} lines`);
            if (attendeeCount > 0) parts.push(`${attendeeCount} attendees`);
            status += parts.join(', ') + ' available.';
            statusMessage.textContent = status;
            statusMessage.style.color = 'var(--ck-primary)';
        } else {
            statusMessage.textContent = 'Not in a meeting.';
            statusMessage.style.color = 'var(--ck-text-muted)';
        }
    }
}

function updateButtonStates(hasData) {
    UI_ELEMENTS.copyButton.disabled = !hasData || !!currentEnterprisePolicy.disableClipboard;
    UI_ELEMENTS.copyDropdownButton.disabled = !hasData || !!currentEnterprisePolicy.disableClipboard;
    UI_ELEMENTS.saveButton.disabled = !hasData || !!currentEnterprisePolicy.disableFileExport;
    UI_ELEMENTS.saveDropdownButton.disabled = !hasData || !!currentEnterprisePolicy.disableFileExport;
}

async function refreshEnterprisePolicy() {
    const user = {
        ...await chrome.storage.sync.get(CaptionKeepConfiguration.USER_KEYS),
        ...await CaptionKeepConfiguration.readGraphUserConfig()
    };
    const managedPolicy = CaptionKeepConfiguration.applyPolicy(user, await CaptionKeepConfiguration.readManaged());
    const policy = CaptionKeepConfiguration.applyGraphRuntimeConfig(
        managedPolicy,
        globalThis.CaptionKeepGraphRuntimeConfig,
        runtimeManifest
    );
    currentEnterprisePolicy = policy.settings;
    return currentEnterprisePolicy;
}

function setGraphBusy(busy) {
    if (!UI_ELEMENTS.graphTranscriptSection || UI_ELEMENTS.graphTranscriptSection.hidden) return;
    UI_ELEMENTS.graphConnectButton.disabled = busy || graphConnected || !graphConfigured;
    UI_ELEMENTS.graphDisconnectButton.disabled = busy || !graphConnected;
    UI_ELEMENTS.graphUseCurrentMeeting.disabled = busy;
    UI_ELEMENTS.graphRefreshMeetings.disabled = busy || !graphConnected;
    UI_ELEMENTS.graphRecentMeetings?.querySelectorAll('button').forEach(button => {
        button.disabled = busy || !graphConnected;
    });
    UI_ELEMENTS.graphImportButton.disabled = busy || !graphConnected || !UI_ELEMENTS.graphJoinUrl.value.trim();
}

function graphErrorMessage(error) {
    const messages = {
        SIGN_IN_REQUIRED: 'Your Microsoft 365 session ended. Connect again to continue.',
        invalid_grant: 'Microsoft 365 access expired or was revoked. Connect again to continue.',
        Authorization_RequestDenied: 'Your organization denied access to this meeting.',
        ErrorAccessDenied: 'Your organization did not grant access to the required calendar or transcript data.',
        GraphAccessToTranscriptsDisabled: 'Your Teams administrator has disabled transcript access through Microsoft Graph.',
        MEETING_NOT_FOUND: 'Microsoft 365 could not find that meeting for this account.',
        TRANSCRIPT_NOT_FOUND: 'Teams has not finished producing an official transcript for this meeting.',
        JOIN_URL_INVALID: 'Choose a recent Teams meeting or paste its complete Teams join link.',
        AUTH_CANCELLED: 'Microsoft 365 sign-in was cancelled.',
        GRAPH_NOT_ENABLED: 'The Microsoft 365 connection is not configured for this installation.',
        GRAPH_CONFIG_INVALID: 'The Microsoft 365 connection configuration is incomplete.'
    };
    return messages[error?.code] || error?.message || 'Microsoft 365 could not complete the request.';
}

function formatGraphMeetingTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Time unavailable';
    return new Intl.DateTimeFormat(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(date);
}

function markSelectedGraphMeeting() {
    const selected = UI_ELEMENTS.graphJoinUrl.value.trim();
    UI_ELEMENTS.graphRecentMeetings?.querySelectorAll('.graph-meeting-card').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.joinUrl === selected));
    });
}

function selectGraphMeeting(meeting, message) {
    UI_ELEMENTS.graphJoinUrl.value = String(meeting?.joinUrl || '');
    markSelectedGraphMeeting();
    UI_ELEMENTS.graphImportStatus.textContent = message;
    setGraphBusy(false);
}

async function importGraphTranscript(joinUrl) {
    const normalizedJoinUrl = String(joinUrl || '').trim();
    if (!normalizedJoinUrl) return null;
    setGraphBusy(true);
    UI_ELEMENTS.graphImportStatus.textContent = 'Requesting the official transcript from Microsoft Graph…';
    try {
        const result = await sendGraphMessage({message:'graph_import_transcript', joinUrl:normalizedJoinUrl});
        UI_ELEMENTS.graphImportStatus.textContent = `Imported ${result.captionCount} transcript lines as a separate Microsoft Graph source.`;
        return result;
    } catch (error) {
        UI_ELEMENTS.graphImportStatus.textContent = graphErrorMessage(error);
        if (['SIGN_IN_REQUIRED', 'invalid_grant'].includes(error.code)) await refreshGraphStatus();
        return null;
    } finally {
        setGraphBusy(false);
    }
}

function renderRecentGraphMeetings(meetings) {
    const container = UI_ELEMENTS.graphRecentMeetings;
    if (!container) return;
    container.replaceChildren();
    if (!Array.isArray(meetings) || meetings.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'small-info-text';
        empty.textContent = 'No recent Teams meetings were found in the last 30 days. You can still use the current meeting or paste a link.';
        container.appendChild(empty);
        return;
    }
    for (const meeting of meetings.slice(0, 5)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'graph-meeting-card';
        button.dataset.joinUrl = meeting.joinUrl;
        button.setAttribute('role', 'listitem');
        button.setAttribute('aria-pressed', 'false');
        const title = document.createElement('span');
        title.className = 'graph-meeting-title';
        title.textContent = meeting.subject || 'Teams meeting';
        const meta = document.createElement('span');
        meta.className = 'graph-meeting-meta';
        meta.textContent = `${formatGraphMeetingTime(meeting.startDateTime)} · ${meeting.state === 'in-progress' ? 'In progress' : 'Ended'}`;
        button.append(title, meta);
        button.addEventListener('click', async () => {
            selectGraphMeeting(meeting, `Retrieving ${meeting.subject || 'meeting'} from Microsoft 365…`);
            await importGraphTranscript(meeting.joinUrl);
        });
        container.appendChild(button);
    }
    markSelectedGraphMeeting();
}

async function refreshRecentGraphMeetings(silent = false) {
    if (!graphConnected || !UI_ELEMENTS.graphRecentMeetings) return;
    setGraphBusy(true);
    if (!silent) UI_ELEMENTS.graphImportStatus.textContent = 'Finding your recent Teams meetings…';
    try {
        const result = await sendGraphMessage({message:'graph_list_recent_meetings'});
        renderRecentGraphMeetings(result.meetings);
        if (!silent) {
            const count = Array.isArray(result.meetings) ? result.meetings.length : 0;
            const discovery = result.discovery || {};
            const limited = discovery.calendarEnumerationLimited
                ? ' Microsoft 365 limited discovery to the default calendar.'
                : '';
            const unavailable = discovery.calendarErrorCount
                ? ` ${discovery.calendarErrorCount} calendar${discovery.calendarErrorCount === 1 ? ' was' : 's were'} unavailable to the signed-in account.`
                : '';
            const diagnostic = Number.isFinite(discovery.eventCount)
                ? ` Checked ${discovery.eventCount} events across ${discovery.calendarCount || 1} Microsoft 365 calendar${discovery.calendarCount === 1 ? '' : 's'}; ${discovery.teamsEventCount || 0} had a usable Teams join link.${limited}${unavailable} This is separate from local Previous Sessions.`
                : '';
            UI_ELEMENTS.graphImportStatus.textContent = count
                ? `Found ${count} recent Teams meeting${count === 1 ? '' : 's'}.${diagnostic} Choose a meeting to retrieve and open its verified transcript.`
                : `No recent Teams meeting was found.${diagnostic} Use the current meeting or paste its link.`;
        }
    } catch (error) {
        renderRecentGraphMeetings([]);
        UI_ELEMENTS.graphImportStatus.textContent = graphErrorMessage(error);
        if (['SIGN_IN_REQUIRED', 'invalid_grant'].includes(error.code)) graphConnected = false;
    }
    setGraphBusy(false);
}

async function sendGraphMessage(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) {
        const error = new Error(response?.error || 'The Microsoft Graph operation failed.');
        error.code = response?.code;
        throw error;
    }
    return response;
}

function applyGraphVisibility() {
    if (!UI_ELEMENTS.graphTranscriptSection) return;
    UI_ELEMENTS.graphTranscriptSection.hidden = false;
}

function isGraphGuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function updateGraphSetupControls(settings, locked = new Set()) {
    const tenantId = String(settings.graphTenantId || '');
    const clientId = String(settings.graphClientId || '');
    graphConfigured = settings.enableGraphTranscriptImport === true
        && isGraphGuid(tenantId) && isGraphGuid(clientId);
    if (UI_ELEMENTS.graphTenantId) UI_ELEMENTS.graphTenantId.value = tenantId;
    if (UI_ELEMENTS.graphClientId) UI_ELEMENTS.graphClientId.value = clientId;
    const managed = ['enableGraphTranscriptImport', 'graphTenantId', 'graphClientId'].some(key => locked.has(key));
    for (const input of [UI_ELEMENTS.graphTenantId, UI_ELEMENTS.graphClientId]) {
        if (input) input.disabled = managed;
    }
    if (UI_ELEMENTS.graphSaveSetup) UI_ELEMENTS.graphSaveSetup.disabled = managed;
    if (UI_ELEMENTS.graphClearSetup) UI_ELEMENTS.graphClearSetup.disabled = managed || (!tenantId && !clientId);
    if (UI_ELEMENTS.graphSetupStatus) {
        UI_ELEMENTS.graphSetupStatus.textContent = managed
            ? (graphConfigured ? 'Configured and locked by your organization.' : 'Microsoft 365 import is disabled or incomplete in organization policy.')
            : (graphConfigured ? 'Customer-owned Microsoft 365 setup saved locally.' : 'Enter the tenant and client IDs from your organization’s Entra app registration.');
    }
}

async function refreshGraphStatus() {
    if (!UI_ELEMENTS.graphTranscriptSection || UI_ELEMENTS.graphTranscriptSection.hidden) return;
    try {
        const status = await sendGraphMessage({message:'graph_get_status'});
        graphConnected = !!status.connected;
        UI_ELEMENTS.graphConnectionStatus.textContent = graphConnected
            ? `Connected${status.accountLabel ? ` as ${status.accountLabel}` : ''}. Recent meetings are read directly from Microsoft 365 and are not retained.`
            : (status.configured ? 'Microsoft 365 setup detected. Connect to begin.' : 'Microsoft 365 setup required. Add your organization’s tenant and client IDs below.');
        UI_ELEMENTS.graphRedirectUri.textContent = status.redirectUri ? `Redirect URI: ${status.redirectUri}` : '';
    } catch (error) {
        graphConnected = false;
        UI_ELEMENTS.graphConnectionStatus.textContent = `Connection status unavailable: ${error.message}`;
    }
    setGraphBusy(false);
}

async function populateCurrentTeamsMeeting(tab = null, silent = false) {
    if (!UI_ELEMENTS.graphJoinUrl || UI_ELEMENTS.graphTranscriptSection?.hidden) return false;
    const meetingTab = tab || await getActiveMeetingTab();
    if (!meetingTab || !/^https:\/\/teams\.(?:microsoft\.com|cloud\.microsoft)(?:\/|$)/.test(meetingTab.url || '')) {
        if (!silent) UI_ELEMENTS.graphImportStatus.textContent = 'Open the active Teams meeting, then try again.';
        return false;
    }
    try {
        const response = await chrome.tabs.sendMessage(meetingTab.id, {message:'get_teams_meeting_join_url'});
        if (!response?.joinUrl) {
            if (!silent) UI_ELEMENTS.graphImportStatus.textContent = 'Open Meeting info in Teams, then choose Use current Teams meeting again.';
            return false;
        }
        selectGraphMeeting(
            {joinUrl:response.joinUrl},
            'Current Teams meeting selected. Import after Teams publishes its official transcript.'
        );
        return true;
    } catch {
        if (!silent) UI_ELEMENTS.graphImportStatus.textContent = 'Refresh the Teams meeting tab, then try again.';
        return false;
    }
}

function updateSaveButtonText(format) {
    UI_ELEMENTS.saveButton.textContent = `${currentEnterprisePolicy.forceScrubbedExport ? 'Save Cleaned' : 'Save'} ${format.toUpperCase()}`;
}

function updateSaveBehaviorHint(type) {
    if (!UI_ELEMENTS.saveBehaviorHint) return;
    const custom = type === 'custom';
    if (UI_ELEMENTS.saveLocationRow) UI_ELEMENTS.saveLocationRow.style.display = custom ? 'flex' : 'none';
    if (UI_ELEMENTS.saveLocationInput) UI_ELEMENTS.saveLocationInput.disabled = !custom;
    UI_ELEMENTS.saveBehaviorHint.textContent = type === 'prompt'
        ? 'Your browser asks where to put each transcript.'
        : custom
            ? 'Enter a relative folder such as Transcripts. It means Downloads/Transcripts.'
            : 'Transcripts save directly in the browser Downloads folder.';
}

async function refreshLastTranscriptFolderButton() {
    if (!UI_ELEMENTS.openLastTranscriptFolder) return;
    const { lastCompletedDownload } = await chrome.storage.local.get('lastCompletedDownload');
    let available = false;
    if (Number.isInteger(lastCompletedDownload?.id)) {
        const matches = await chrome.downloads.search({id:lastCompletedDownload.id});
        available = matches[0]?.state === 'complete' && matches[0]?.exists !== false;
    }
    UI_ELEMENTS.openLastTranscriptFolder.disabled = !available;
    UI_ELEMENTS.downloadFolderStatus.textContent = available
        ? 'Opens the folder containing the last transcript saved by Better CaptionKeep.'
        : 'Save a transcript first to enable this button.';
}

function updateFilenamePreview() {
    if (!UI_ELEMENTS.filenamePreview || !UI_ELEMENTS.filenamePattern) {
        return;
    }

    const pattern = UI_ELEMENTS.filenamePattern.value || '{date}_{title}_{format}';
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
    const replacements = {
        '{date}': dateStr,
        '{time}': timeStr,
        '{datetime}': `${dateStr}_${timeStr}`,
        '{title}': 'Weekly Sync',
        '{format}': currentDefaultFormat,
        '{attendees}': '5_attendees'
    };

    let preview = pattern;
    for (const [token, value] of Object.entries(replacements)) {
        preview = preview.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    preview = preview.replace(/__+/g, '_').replace(/_+$/, '');

    const exampleName = preview || 'transcript';
    UI_ELEMENTS.filenamePreview.textContent = `Example: ${exampleName}.${currentDefaultFormat}`;
}

function getAiProviderCheckboxes() {
    if (!UI_ELEMENTS.aiProviderOptions) {
        return [];
    }
    return Array.from(UI_ELEMENTS.aiProviderOptions.querySelectorAll('input[type="checkbox"][data-provider]'));
}

function getSelectedAiProviders() {
    return getAiProviderCheckboxes()
        .filter(checkbox => checkbox.checked)
        .map(checkbox => checkbox.dataset.provider);
}

function updateAiProviderOptionsState(enabled, selectedProviders = []) {
    if (!UI_ELEMENTS.aiProviderOptions) {
        return;
    }

    const checkboxes = getAiProviderCheckboxes();
    UI_ELEMENTS.aiProviderOptions.style.display = enabled ? 'flex' : 'none';
    checkboxes.forEach(checkbox => {
        checkbox.disabled = !enabled;
        checkbox.checked = selectedProviders.includes(checkbox.dataset.provider);
    });

    if (UI_ELEMENTS.aiProviderHint) {
        UI_ELEMENTS.aiProviderHint.style.display = enabled ? 'block' : 'none';
    }

    if (UI_ELEMENTS.enterpriseDestinations) UI_ELEMENTS.enterpriseDestinations.style.display = enabled ? 'grid' : 'none';
    if (UI_ELEMENTS.enterpriseDestinationHint) UI_ELEMENTS.enterpriseDestinationHint.style.display = enabled ? 'block' : 'none';
    for (const input of getEnterpriseDestinationInputs()) input.disabled = !enabled;
}

function getEnterpriseDestinationInputs() {
    return [UI_ELEMENTS.chatgptWorkspaceUrl, UI_ELEMENTS.claudeWorkspaceUrl, UI_ELEMENTS.claudeConsoleUrl].filter(Boolean);
}

function configureEnterpriseDestinationInput(input, providerKey, settingKey) {
    input.addEventListener('change', async () => {
        const candidate = input.value.trim();
        const normalized = candidate ? CaptionKeepDestinations.normalizeCustomUrl(providerKey, candidate) : null;
        input.setCustomValidity(candidate && !normalized ? 'Use an HTTPS URL on the official provider domain.' : '');
        if (candidate && !normalized) {
            input.reportValidity();
            return;
        }
        input.value = normalized || '';
        await chrome.storage.sync.set({ [settingKey]: normalized || '' });
    });
}

async function renderSpeakerAliases(tab) {
    const { speakerAliasList } = UI_ELEMENTS;
    try {
        const response = await chrome.tabs.sendMessage(tab.id, { message: "get_unique_speakers" });
        if (!response?.speakers?.length) {
            speakerAliasList.innerHTML = '<p>No speakers detected yet.</p>';
            return;
        }

        const { speakerAliases = {} } = await chrome.storage.session.get('speakerAliases');
        speakerAliasList.innerHTML = ''; // Clear existing

        response.speakers.forEach(speaker => {
            const item = document.createElement('div');
            item.className = 'alias-item';
            item.innerHTML = `
                <label title="${escapeHtml(speaker)}">${escapeHtml(speaker)}</label>
                <input type="text" data-original-name="${escapeHtml(speaker)}" placeholder="Enter alias..." value="${escapeHtml(speakerAliases[speaker] || '')}">
            `;
            speakerAliasList.appendChild(item);
        });
    } catch (error) {
        console.error("Could not fetch or render speaker aliases:", error);
        speakerAliasList.innerHTML = '<p>Unable to load speakers. Please refresh the meeting tab and try again.</p>';
    }
}

// --- Settings Management ---
async function loadSettings() {
    const userSettings = await chrome.storage.sync.get([
        'autoEnableCaptions',
        'autoSaveOnEnd',
        'defaultSaveFormat',
        'saveAsType',
        'saveLocation',
        'trackCaptions',
        'trackAttendees',
        'autoOpenAttendees',
        'autoAISummary',
        'privacyScrubberEnabled',
        'profanityFilterEnabled',
        'customScrubTerms',
        'aiSummaryProviders',
        'chatgptWorkspaceUrl',
        'claudeWorkspaceUrl',
        'claudeConsoleUrl',
        'timestampFormat',
        'filenamePattern',
        'uiTheme'
    ]);
    Object.assign(userSettings, await CaptionKeepConfiguration.readGraphUserConfig());
    const managedPolicy = CaptionKeepConfiguration.applyPolicy(userSettings, await CaptionKeepConfiguration.readManaged());
    const policy = CaptionKeepConfiguration.applyGraphRuntimeConfig(
        managedPolicy,
        globalThis.CaptionKeepGraphRuntimeConfig,
        runtimeManifest
    );
    const settings = policy.settings;
    const locked = new Set(policy.locked);
    currentEnterprisePolicy = settings;
    applyGraphVisibility();
    updateGraphSetupControls(settings, locked);

    UI_ELEMENTS.autoEnableCaptionsToggle.checked = settings.autoEnableCaptions !== false;
    UI_ELEMENTS.autoSaveOnEndToggle.checked = !!settings.autoSaveOnEnd;
    UI_ELEMENTS.trackCaptionsToggle.checked = settings.trackCaptions !== false; // Default to true
    UI_ELEMENTS.trackAttendeesToggle.checked = settings.trackAttendees !== false; // Default to true
    UI_ELEMENTS.trackAttendeesToggle.disabled = locked.has('trackAttendees');
    if (UI_ELEMENTS.autoOpenAttendeesToggle) {
        UI_ELEMENTS.autoOpenAttendeesToggle.checked = settings.autoOpenAttendees !== false;
        UI_ELEMENTS.autoOpenAttendeesToggle.disabled = !UI_ELEMENTS.trackAttendeesToggle.checked || locked.has('autoOpenAttendees');
    }
    if (UI_ELEMENTS.autoAISummaryToggle) {
        UI_ELEMENTS.autoAISummaryToggle.checked = !!settings.autoAISummary;
        UI_ELEMENTS.autoAISummaryToggle.disabled = locked.has('autoAISummary');
    }
    if (UI_ELEMENTS.privacyScrubberToggle) {
        UI_ELEMENTS.privacyScrubberToggle.checked = settings.privacyScrubberEnabled !== false;
        UI_ELEMENTS.privacyScrubberToggle.disabled = locked.has('privacyScrubberEnabled');
    }
    if (settings.forceScrubbedExport) {
        UI_ELEMENTS.copyButton.textContent = 'Copy Cleaned Transcript';
    } else {
        UI_ELEMENTS.copyButton.textContent = 'Copy Transcript';
    }
    UI_ELEMENTS.copyOptions.querySelectorAll('[data-copy-type="standard"]').forEach(option => { option.hidden = !!settings.forceScrubbedExport; });
    UI_ELEMENTS.saveOptions.querySelectorAll('[data-format]:not([data-cleaned="true"])').forEach(option => { option.hidden = !!settings.forceScrubbedExport; });
    UI_ELEMENTS.copyButton.title = settings.disableClipboard ? 'Clipboard copy is disabled by your organization.' : '';
    UI_ELEMENTS.copyDropdownButton.title = settings.disableClipboard ? 'Clipboard copy is disabled by your organization.' : '';
    UI_ELEMENTS.saveButton.title = settings.disableFileExport ? 'File export is disabled by your organization.' : '';
    UI_ELEMENTS.saveDropdownButton.title = settings.disableFileExport ? 'File export is disabled by your organization.' : '';
    if (settings.disableFileExport) {
        UI_ELEMENTS.autoSaveOnEndToggle.checked = false;
    }
    UI_ELEMENTS.autoSaveOnEndToggle.disabled = !!settings.disableFileExport;
    if (UI_ELEMENTS.sessionHistory) UI_ELEMENTS.sessionHistory.hidden = !!settings.disableSessionHistory;
    if (UI_ELEMENTS.profanityFilterToggle) {
        UI_ELEMENTS.profanityFilterToggle.checked = !!settings.profanityFilterEnabled;
        UI_ELEMENTS.profanityFilterToggle.disabled = locked.has('profanityFilterEnabled');
    }
    if (UI_ELEMENTS.customScrubTerms) {
        UI_ELEMENTS.customScrubTerms.value = CaptionKeepConfiguration.normalizeTerms(settings.customScrubTerms).join('\n');
        UI_ELEMENTS.customScrubTerms.disabled = locked.has('customScrubTerms');
    }
    updateAiProviderOptionsState(
        !!settings.autoAISummary,
        Array.isArray(settings.aiSummaryProviders) ? settings.aiSummaryProviders : []
    );
    if (locked.has('aiSummaryProviders')) {
        getAiProviderCheckboxes().forEach(checkbox => { checkbox.disabled = true; });
    }
    if (UI_ELEMENTS.chatgptWorkspaceUrl) UI_ELEMENTS.chatgptWorkspaceUrl.value = settings.chatgptWorkspaceUrl || '';
    if (UI_ELEMENTS.claudeWorkspaceUrl) UI_ELEMENTS.claudeWorkspaceUrl.value = settings.claudeWorkspaceUrl || '';
    if (UI_ELEMENTS.claudeConsoleUrl) UI_ELEMENTS.claudeConsoleUrl.value = settings.claudeConsoleUrl || '';
    for (const [key, input] of [['chatgptWorkspaceUrl', UI_ELEMENTS.chatgptWorkspaceUrl], ['claudeWorkspaceUrl', UI_ELEMENTS.claudeWorkspaceUrl], ['claudeConsoleUrl', UI_ELEMENTS.claudeConsoleUrl]]) {
        if (input && locked.has(key)) input.disabled = true;
    }
    UI_ELEMENTS.timestampFormat.value = settings.timestampFormat || '12hr';
    UI_ELEMENTS.filenamePattern.value = settings.filenamePattern || '{date}_{title}_{format}';
    if (UI_ELEMENTS.themeSelect) {
        UI_ELEMENTS.themeSelect.value = CaptionKeepTheme.apply(settings.uiTheme);
    }
    UI_ELEMENTS.manualStartInfo.style.display = settings.autoEnableCaptions !== false ? 'none' : 'block';

    const allowedFormats = ['txt', 'md', 'docx'];
    currentDefaultFormat = settings.defaultSaveFormat || 'txt';
    if (!allowedFormats.includes(currentDefaultFormat)) {
        currentDefaultFormat = 'txt';
    }
    UI_ELEMENTS.defaultSaveFormatSelect.value = currentDefaultFormat;
    updateSaveButtonText(currentDefaultFormat);
    updateFilenamePreview();

    if (UI_ELEMENTS.saveAsTypeSelect) {
        // 4.6 stored "default" for the browser Downloads folder.
        const normalizedSaveAsType = settings.saveAsType === 'default' ? 'downloads' : settings.saveAsType;
        const saveAsType = ['prompt','downloads','custom'].includes(normalizedSaveAsType)
            ? normalizedSaveAsType
            : 'prompt';
        UI_ELEMENTS.saveAsTypeSelect.value = saveAsType;
        updateSaveBehaviorHint(saveAsType);
        if (settings.saveAsType === 'default') chrome.storage.sync.set({saveAsType});
    }
    if (UI_ELEMENTS.saveLocationInput) UI_ELEMENTS.saveLocationInput.value = settings.saveLocation || '';
    await refreshLastTranscriptFolderButton();
}

// --- Event Handling ---
function setupEventListeners() {
    document.getElementById('meetingExtrasButton').addEventListener('click', () => openMeetingExtras(false));
    document.getElementById('meetingScreenshotButton').addEventListener('click', () => openMeetingExtras(true));
    UI_ELEMENTS.graphJoinUrl?.addEventListener('input', () => {
        markSelectedGraphMeeting();
        setGraphBusy(false);
    });
    UI_ELEMENTS.graphUseCurrentMeeting?.addEventListener('click', () => populateCurrentTeamsMeeting());
    UI_ELEMENTS.graphRefreshMeetings?.addEventListener('click', () => refreshRecentGraphMeetings());
    UI_ELEMENTS.graphConnectButton?.addEventListener('click', async () => {
        setGraphBusy(true);
        UI_ELEMENTS.graphConnectionStatus.textContent = 'Requesting Microsoft 365 access…';
        try {
            const access = await requestMicrosoft365HostAccess();
            if (!access.granted) {
                UI_ELEMENTS.graphConnectionStatus.textContent = 'Microsoft 365 access was not granted. Local caption capture still works.';
                setGraphBusy(false);
                return;
            }
            if (access.continuesInWorker) {
                UI_ELEMENTS.graphConnectionStatus.textContent = 'Access approved. Opening Microsoft sign-in…';
                return;
            }
            UI_ELEMENTS.graphConnectionStatus.textContent = 'Opening Microsoft sign-in…';
            await sendGraphMessage({message:'graph_connect'});
            await refreshGraphStatus();
            await refreshRecentGraphMeetings();
        } catch (error) {
            graphConnected = false;
            UI_ELEMENTS.graphConnectionStatus.textContent = graphErrorMessage(error);
            setGraphBusy(false);
        }
    });
    UI_ELEMENTS.graphSaveSetup?.addEventListener('click', async () => {
        const tenantId = UI_ELEMENTS.graphTenantId.value.trim().toLowerCase();
        const clientId = UI_ELEMENTS.graphClientId.value.trim().toLowerCase();
        if (!isGraphGuid(tenantId) || !isGraphGuid(clientId)) {
            UI_ELEMENTS.graphSetupStatus.textContent = 'Enter valid GUID values for both the tenant ID and client ID.';
            return;
        }
        if (graphConnected) await sendGraphMessage({message:'graph_disconnect'});
        await chrome.storage.local.set({enableGraphTranscriptImport:true, graphTenantId:tenantId, graphClientId:clientId});
        graphConnected = false;
        await loadSettings();
        await refreshGraphStatus();
    });
    UI_ELEMENTS.graphClearSetup?.addEventListener('click', async () => {
        if (graphConnected) await sendGraphMessage({message:'graph_disconnect'});
        await chrome.storage.local.remove(CaptionKeepConfiguration.GRAPH_USER_KEYS);
        graphConnected = false;
        await loadSettings();
        await refreshGraphStatus();
    });
    UI_ELEMENTS.graphDisconnectButton?.addEventListener('click', async () => {
        setGraphBusy(true);
        try {
            await sendGraphMessage({message:'graph_disconnect'});
            graphConnected = false;
            UI_ELEMENTS.graphConnectionStatus.textContent = 'Disconnected. Tenant consent was not changed.';
            UI_ELEMENTS.graphJoinUrl.value = '';
            renderRecentGraphMeetings([]);
        } catch (error) {
            UI_ELEMENTS.graphConnectionStatus.textContent = `Could not disconnect: ${graphErrorMessage(error)}`;
        }
        setGraphBusy(false);
    });
    UI_ELEMENTS.graphImportButton?.addEventListener('click', async () => {
        const joinUrl = UI_ELEMENTS.graphJoinUrl.value.trim();
        await importGraphTranscript(joinUrl);
    });
    document.getElementById('exportSettings').addEventListener('click', () => chrome.tabs.create({url:chrome.runtime.getURL('export.html')}));
    UI_ELEMENTS.openLastTranscriptFolder?.addEventListener('click', async () => {
        try {
            const { lastCompletedDownload } = await chrome.storage.local.get('lastCompletedDownload');
            if (!Number.isInteger(lastCompletedDownload?.id)) throw new Error('Save a transcript first.');
            await chrome.downloads.show(lastCompletedDownload.id);
            UI_ELEMENTS.downloadFolderStatus.textContent = 'Opened the last transcript folder.';
        } catch (error) {
            UI_ELEMENTS.downloadFolderStatus.textContent = `Could not open the transcript folder: ${error.message}`;
            await refreshLastTranscriptFolderButton();
        }
    });
    UI_ELEMENTS.liveWorkspaceButton?.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
            if (!tab?.windowId) throw new Error('No active browser window is available.');
            await chrome.sidePanel.setOptions({enabled: true, path: 'sidepanel.html'});
            await chrome.sidePanel.open({windowId: tab.windowId});
            window.close();
        } catch (error) {
            console.error('[Better CaptionKeep] Could not open the live workspace:', error);
            chrome.tabs.create({url: chrome.runtime.getURL('sidepanel.html')});
        }
    });
    if (UI_ELEMENTS.themeSelect) {
        UI_ELEMENTS.themeSelect.addEventListener('change', async (event) => {
            await CaptionKeepTheme.set(event.target.value);
        });
    }
    UI_ELEMENTS.defaultSaveFormatSelect.addEventListener('change', (e) => {
        currentDefaultFormat = e.target.value;
        chrome.storage.sync.set({ defaultSaveFormat: currentDefaultFormat });
        updateSaveButtonText(currentDefaultFormat);
        updateFilenamePreview();
    });

    if (UI_ELEMENTS.saveAsTypeSelect) {
        UI_ELEMENTS.saveAsTypeSelect.addEventListener('change', async (e) => {
            const selectedType = e.target.value;
            await chrome.storage.sync.set({ saveAsType:selectedType });
            updateSaveBehaviorHint(selectedType);
        });
    }
    UI_ELEMENTS.saveLocationInput?.addEventListener('input', async event => {
        const saveLocation = event.target.value.trim();
        await chrome.storage.sync.set({saveLocation, saveAsType:'custom'});
    });

    UI_ELEMENTS.trackCaptionsToggle.addEventListener('change', (e) => {
        chrome.storage.sync.set({ trackCaptions: e.target.checked });
        if (!e.target.checked) {
            UI_ELEMENTS.autoEnableCaptionsToggle.checked = false;
            UI_ELEMENTS.autoEnableCaptionsToggle.disabled = true;
            chrome.storage.sync.set({ autoEnableCaptions: false });
        } else {
            UI_ELEMENTS.autoEnableCaptionsToggle.disabled = false;
        }
    });

    UI_ELEMENTS.autoEnableCaptionsToggle.addEventListener('change', (e) => {
        chrome.storage.sync.set({ autoEnableCaptions: e.target.checked });
        UI_ELEMENTS.manualStartInfo.style.display = e.target.checked ? 'none' : 'block';
    });

    UI_ELEMENTS.autoSaveOnEndToggle.addEventListener('change', (e) => {
        chrome.storage.sync.set({ autoSaveOnEnd: e.target.checked });
    });

    UI_ELEMENTS.trackAttendeesToggle.addEventListener('change', (e) => {
        chrome.storage.sync.set({ trackAttendees: e.target.checked });
        if (UI_ELEMENTS.autoOpenAttendeesToggle) {
            if (!e.target.checked) {
                UI_ELEMENTS.autoOpenAttendeesToggle.checked = false;
                UI_ELEMENTS.autoOpenAttendeesToggle.disabled = true;
                chrome.storage.sync.set({ autoOpenAttendees: false });
            } else {
                UI_ELEMENTS.autoOpenAttendeesToggle.disabled = false;
            }
        }
    });

    if (UI_ELEMENTS.autoOpenAttendeesToggle) {
        UI_ELEMENTS.autoOpenAttendeesToggle.addEventListener('change', (e) => {
            chrome.storage.sync.set({ autoOpenAttendees: e.target.checked });
        });
    }

    if (UI_ELEMENTS.autoAISummaryToggle) {
        UI_ELEMENTS.autoAISummaryToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            chrome.storage.sync.set({ autoAISummary: enabled });
            updateAiProviderOptionsState(enabled, getSelectedAiProviders());
        });
    }

    if (UI_ELEMENTS.privacyScrubberToggle) {
        UI_ELEMENTS.privacyScrubberToggle.addEventListener('change', (event) => {
            chrome.storage.sync.set({ privacyScrubberEnabled: event.target.checked });
        });
    }

    if (UI_ELEMENTS.profanityFilterToggle) {
        UI_ELEMENTS.profanityFilterToggle.addEventListener('change', (event) => {
            chrome.storage.sync.set({ profanityFilterEnabled: event.target.checked });
        });
    }

    if (UI_ELEMENTS.customScrubTerms) {
        UI_ELEMENTS.customScrubTerms.addEventListener('change', (event) => {
            chrome.storage.sync.set({ customScrubTerms: CaptionKeepConfiguration.normalizeTerms(event.target.value) });
        });
    }

    UI_ELEMENTS.exportConfiguration?.addEventListener('click', async () => {
        const settings = await chrome.storage.sync.get(CaptionKeepConfiguration.USER_KEYS);
        const content = CaptionKeepConfiguration.createExport(settings);
        const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'better-captionkeep-settings.json';
        anchor.click();
        URL.revokeObjectURL(url);
        UI_ELEMENTS.configurationStatus.textContent = 'Settings exported. Transcript history was not included.';
    });

    UI_ELEMENTS.importConfiguration?.addEventListener('click', () => UI_ELEMENTS.configurationFile?.click());
    UI_ELEMENTS.configurationFile?.addEventListener('change', async (event) => {
        try {
            const file = event.target.files?.[0];
            if (!file) return;
            const settings = CaptionKeepConfiguration.parseImport(await file.text());
            await chrome.storage.sync.set(settings);
            UI_ELEMENTS.configurationStatus.textContent = 'Settings imported.';
            await loadSettings();
        } catch (error) {
            UI_ELEMENTS.configurationStatus.textContent = error.message;
        } finally {
            event.target.value = '';
        }
    });

    getAiProviderCheckboxes().forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const selectedProviders = getSelectedAiProviders();
            chrome.storage.sync.set({ aiSummaryProviders: selectedProviders });
        });
    });

    if (UI_ELEMENTS.chatgptWorkspaceUrl) configureEnterpriseDestinationInput(UI_ELEMENTS.chatgptWorkspaceUrl, 'chatgpt', 'chatgptWorkspaceUrl');
    if (UI_ELEMENTS.claudeWorkspaceUrl) configureEnterpriseDestinationInput(UI_ELEMENTS.claudeWorkspaceUrl, 'claude', 'claudeWorkspaceUrl');
    if (UI_ELEMENTS.claudeConsoleUrl) configureEnterpriseDestinationInput(UI_ELEMENTS.claudeConsoleUrl, 'claude_console', 'claudeConsoleUrl');

    if (UI_ELEMENTS.trackCaptionsToggle) {
        UI_ELEMENTS.autoEnableCaptionsToggle.disabled = !UI_ELEMENTS.trackCaptionsToggle.checked;
    }

    UI_ELEMENTS.timestampFormat.addEventListener('change', (e) => {
        chrome.storage.sync.set({ timestampFormat: e.target.value });
    });

    UI_ELEMENTS.filenamePattern.addEventListener('input', (e) => {
        chrome.storage.sync.set({ filenamePattern: e.target.value });
        updateFilenamePreview();
    });

    UI_ELEMENTS.speakerAliasList.addEventListener('change', async (e) => {
        if (e.target.tagName === 'INPUT') {
            const { originalName } = e.target.dataset;
            const newAlias = e.target.value.trim();
            const { speakerAliases = {} } = await chrome.storage.session.get('speakerAliases');
            speakerAliases[originalName] = newAlias;
            await chrome.storage.session.set({ speakerAliases });
        }
    });

    UI_ELEMENTS.saveButton.addEventListener('click', async () => {
        await refreshEnterprisePolicy();
        if (currentEnterprisePolicy.disableFileExport) return;
        const tab = await getActiveMeetingTab();
        if (tab) {
            chrome.tabs.sendMessage(tab.id, { message: "return_transcript", format: currentDefaultFormat });
        }
    });

    setupDropdown(UI_ELEMENTS.copyButton, UI_ELEMENTS.copyDropdownButton, UI_ELEMENTS.copyOptions, handleCopy);
    setupDropdown(null, UI_ELEMENTS.saveDropdownButton, UI_ELEMENTS.saveOptions, handleSave);

    document.addEventListener('click', () => {
        UI_ELEMENTS.copyOptions.style.display = 'none';
        UI_ELEMENTS.saveOptions.style.display = 'none';
    });
}

async function openMeetingExtras(withScreenshot) {
    try {
        await refreshEnterprisePolicy();
        if (currentEnterprisePolicy.disableSessionHistory) throw new Error('Local meeting retention is disabled by your organization.');
        if (withScreenshot && (currentEnterprisePolicy.forceScrubbedExport || currentEnterprisePolicy.disableFileExport)) {
            throw new Error('Screenshots are unavailable under your organization’s export/privacy policy.');
        }
        const tab = await getActiveMeetingTab();
        if (!tab) throw new Error('Open a supported meeting first.');
        const status = await chrome.tabs.sendMessage(tab.id, {message:'get_status'});
        const context = await chrome.tabs.sendMessage(tab.id, {message:'get_evidence_context'});
        if (!status?.isInMeeting || !context?.sessionId) throw new Error('Start capture in the meeting first.');
        const query = new URLSearchParams({tab:String(tab.id)});
        if (withScreenshot) {
            const [active] = await chrome.tabs.query({active:true, currentWindow:true});
            if (active?.id !== tab.id) throw new Error('Capture screenshots from the extension popup on the active meeting tab.');
            const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {format:'png'});
            const [after] = await chrome.tabs.query({active:true, currentWindow:true});
            if (after?.id !== tab.id || after?.url !== tab.url || after?.pendingUrl) throw new Error('The active tab changed or navigated. Screenshot was discarded.');
            if (screenshot.length > 6000000) throw new Error('Screenshot is too large. Reduce the browser window and try again.');
            const key = `extras_preview_${crypto.randomUUID()}`;
            await chrome.storage.session.set({[key]:{sessionId:context.sessionId, screenshot}});
            query.set('pending', key);
            try { await chrome.tabs.create({url:chrome.runtime.getURL(`extras.html?${query}`)}); }
            catch (error) { await chrome.storage.session.remove(key); throw error; }
        } else await chrome.tabs.create({url:chrome.runtime.getURL(`extras.html?${query}`)});
    } catch (error) { UI_ELEMENTS.statusMessage.textContent = error.message; }
}

function setupDropdown(mainButton, dropdownButton, optionsContainer, actionHandler) {
    if (mainButton) {
        mainButton.addEventListener('click', () => optionsContainer.firstElementChild.click());
    }
    dropdownButton.addEventListener('click', (e) => {
        e.stopPropagation();
        optionsContainer.style.display = 'block';
    });
    optionsContainer.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        actionHandler(e.target);
        optionsContainer.style.display = 'none';
    });
}

async function handleCopy(target) {
    if (!target.dataset.copyType) return;
    await refreshEnterprisePolicy();
    if (currentEnterprisePolicy.disableClipboard) {
        UI_ELEMENTS.statusMessage.textContent = 'Clipboard copy is disabled by your organization.';
        return;
    }

    const tab = await getActiveMeetingTab();
    if (!tab) return;

    UI_ELEMENTS.statusMessage.textContent = "Preparing text to copy...";
    try {
        const response = await chrome.tabs.sendMessage(tab.id, { message: "get_transcript_for_copying" });
        if (response?.transcriptArray) {
            const { speakerAliases = {} } = await chrome.storage.session.get('speakerAliases');
            const formattedText = await formatTranscript(response.transcriptArray, speakerAliases);
            const output = target.dataset.copyType === 'cleaned' || currentEnterprisePolicy.forceScrubbedExport
                ? CaptionKeepPrivacyScrubber.scrub(formattedText, await getScrubOptions())
                : { text: formattedText, replacements: [] };
            await navigator.clipboard.writeText(output.text);
            UI_ELEMENTS.statusMessage.textContent = target.dataset.copyType === 'cleaned'
                ? `Copied cleaned transcript (${output.replacements.length} masked).`
                : 'Copied transcript to clipboard!';
            UI_ELEMENTS.statusMessage.style.color = 'var(--ck-success)';
        }
    } catch (error) {
        UI_ELEMENTS.statusMessage.textContent = "Copy failed.";
        UI_ELEMENTS.statusMessage.style.color = 'var(--ck-danger)';
    }
}

async function handleSave(target) {
    const format = target.dataset.format;
    if (!format) return;
    await refreshEnterprisePolicy();
    if (currentEnterprisePolicy.disableFileExport) {
        UI_ELEMENTS.statusMessage.textContent = 'File export is disabled by your organization.';
        return;
    }
    
    const tab = await getActiveMeetingTab();
    if (tab) {
        UI_ELEMENTS.statusMessage.textContent = `Saving as ${format.toUpperCase()}...`;
        if (target.dataset.cleaned !== 'true' && !currentEnterprisePolicy.forceScrubbedExport) {
            chrome.tabs.sendMessage(tab.id, { message: "return_transcript", format });
            return;
        }
        const response = await chrome.tabs.sendMessage(tab.id, { message: 'get_transcript_for_copying' });
        const cleaned = CaptionKeepPrivacyScrubber.scrubTranscript(response?.transcriptArray || [], await getScrubOptions());
        const result = await chrome.runtime.sendMessage({ message: 'download_captions', transcriptArray: cleaned.transcript,
            format, meetingTitle: tab.title || 'Meeting transcript' });
        UI_ELEMENTS.statusMessage.textContent = result?.ok
            ? `Cleaned export ready (${cleaned.replacements.length} masked).`
            : 'Could not prepare cleaned export.';
    }
}

// --- Session History Management ---
async function initializeSessionHistory() {
    try {
        // Load SessionManager script
        const script = document.createElement('script');
        script.src = 'sessionManager.js';
        document.head.appendChild(script);
        
        // Wait for script to load
        await new Promise(resolve => {
            script.onload = resolve;
            setTimeout(resolve, 100); // Fallback timeout
        });
        
        // Always show session history button
        UI_ELEMENTS.sessionHistory.style.display = 'flex';
        
        // Setup history button click handler
        UI_ELEMENTS.historyButton.addEventListener('click', async () => {
            const isVisible = UI_ELEMENTS.sessionList.style.display !== 'none';
            UI_ELEMENTS.sessionList.style.display = isVisible ? 'none' : 'block';
            
            if (!isVisible) {
                await loadSessionList();
            }
        });
        
        // Check if we have saved sessions and update button text
        const sessionManager = new SessionManager();
        const sessions = await sessionManager.getSessionIndex();
        
        if (sessions && sessions.length > 0) {
            UI_ELEMENTS.historyButton.innerHTML = `📁 View Previous Sessions (${sessions.length})`;
        } else {
            UI_ELEMENTS.historyButton.innerHTML = '📁 No Previous Sessions';
        }
    } catch (error) {
        console.log('[Session History] Initialization skipped:', error.message);
    }
}

async function loadSessionList() {
    try {
        const sessionManager = new SessionManager();
        const sessions = await sessionManager.getSessionIndex();
        const stats = await sessionManager.getStorageStats();
        const {archive_last_error: archiveError} = await chrome.storage.local.get('archive_last_error');
        
        if (!sessions || sessions.length === 0) {
            UI_ELEMENTS.sessionList.innerHTML = '<div style="text-align: center; color: var(--ck-text-muted);">No saved sessions</div>';
            return;
        }
        
        let html = archiveError?.retryable
            ? `<div class="error-message">A completed transcript could not be archived. Its recovery snapshot was retained; use Retry archive below.</div>`
            : '';
        for (const session of sessions) {
            const timeAgo = getTimeAgo(new Date(session.timestamp));
            html += `
                <div class="session-item" data-id="${session.id}">
                    <div class="session-title">${escapeHtml(session.title)}</div>
                    <div class="session-meta">
                        <span>${session.date} • ${session.duration} • ${session.captionCount} captions</span>
                        <span>${session.speakers.length} speakers</span>
                    </div>
                    <div class="session-meta" style="margin-top: 4px;">
                        <span style="font-size: 11px; color: var(--ck-text-muted);">${timeAgo}</span>
                    </div>
                    <div class="session-actions">
                        <button class="session-btn view-btn" data-id="${session.id}">View</button>
                        <button class="session-btn export-btn" data-id="${session.id}">Export</button>
                        ${session.id.startsWith('backup_') ? `<button class="session-btn retry-btn" data-id="${session.id}">Retry archive</button>` : ''}
                        <button class="session-btn delete" data-id="${session.id}">Delete</button>
                    </div>
                </div>
            `;
        }
        
        // Add storage info
        html += `
            <div class="storage-info">
                Local archive: ${stats.usedMB} MB used. Capacity is managed by this browser profile.
                <button id="clearAllSessions" style="margin-left: 10px; font-size: 11px; color: var(--ck-danger); background: none; border: none; cursor: pointer; text-decoration: underline;">Clear All</button>
            </div>
        `;
        
        UI_ELEMENTS.sessionList.innerHTML = html;
        
        // Add event listeners for session actions
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => viewSession(e.target.dataset.id));
        });
        
        document.querySelectorAll('.export-btn').forEach(btn => {
            btn.addEventListener('click', (e) => exportSession(e.target.dataset.id));
        });
        document.querySelectorAll('.retry-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const button = e.currentTarget;
                button.disabled = true;
                try {
                    await new SessionManager().retryRecovery(button.dataset.id);
                    await loadSessionList();
                } catch (error) {
                    alert(error.message);
                    button.disabled = false;
                }
            });
        });
        
        document.querySelectorAll('.session-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => deleteSession(e.target.dataset.id));
        });
        
        document.getElementById('clearAllSessions')?.addEventListener('click', clearAllSessions);
        
    } catch (error) {
        console.error('[Session History] Failed to load sessions:', error);
        UI_ELEMENTS.sessionList.innerHTML = '<div style="text-align: center; color: var(--ck-danger);">Error loading sessions</div>';
    }
}

async function viewSession(sessionId) {
    try {
        const sessionManager = new SessionManager();
        await sessionManager.loadSession(sessionId);
        
        window.open(chrome.runtime.getURL(`viewer.html?session=${encodeURIComponent(sessionId)}`), '_blank');

    } catch (error) {
        console.error('[Session History] Failed to view session:', error);
        alert('Failed to load session. It may have been corrupted.');
    }
}

async function exportSession(sessionId) {
    try {
        const sessionManager = new SessionManager();
        const sessionData = await sessionManager.loadSession(sessionId);
        
        // Use existing export logic - correct message type
        const format = currentDefaultFormat;
        const result = await chrome.runtime.sendMessage({
            message: "download_captions",  // Fixed: was "save_transcript"
            transcriptArray: sessionData.transcript,
            format: format,
            meetingTitle: sessionData.metadata.title,
            attendeeReport: sessionData.attendeeReport,
            recordingStartTime: sessionData.metadata.timestamp
        });
        
        if (!result?.ok) throw new Error(result?.error || 'Export could not be prepared');
        // Visual feedback
        const btn = document.querySelector(`.export-btn[data-id="${sessionId}"]`);
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = 'Ready to save';
            btn.style.background = 'var(--ck-success)';
            btn.style.color = 'white';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
                btn.style.color = '';
            }, 2000);
        }
        
    } catch (error) {
        console.error('[Session History] Failed to export session:', error);
        alert('Failed to export session.');
    }
}

async function deleteSession(sessionId) {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    
    try {
        const sessionManager = new SessionManager();
        await sessionManager.deleteSession(sessionId);
        await loadSessionList(); // Refresh the list
    } catch (error) {
        console.error('[Session History] Failed to delete session:', error);
    }
}

async function clearAllSessions() {
    if (!confirm('Delete ALL saved sessions? This cannot be undone.')) return;
    
    try {
        const sessionManager = new SessionManager();
        await sessionManager.clearAllSessions();
        UI_ELEMENTS.sessionList.style.display = 'none';
        UI_ELEMENTS.sessionHistory.style.display = 'none';
    } catch (error) {
        console.error('[Session History] Failed to clear sessions:', error);
    }
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };
    
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
        }
    }
    return 'just now';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// --- Initialization ---
async function initializePopup() {
    if (isFullSettingsPage) {
        document.querySelector('.settings-header').textContent = 'All settings';
        document.querySelector('.settings-intro').textContent = 'Your preferences save as you change them. Organization-managed controls remain enforced. Microsoft 365 connection and all advanced controls are available here.';
    }
    await loadSettings();
    setupEventListeners();
    await refreshGraphStatus();
    await initializeSessionHistory(); // Initialize session history

    const tab = await getActiveMeetingTab();
    if (!tab) {
        UI_ELEMENTS.statusMessage.textContent = 'Open Teams, Zoom Web, or Google Meet to begin.';
        UI_ELEMENTS.statusMessage.style.color = 'var(--ck-text-muted)';
        return;
    }

    await populateCurrentTeamsMeeting(tab, true);
    if (graphConnected) await refreshRecentGraphMeetings(true);

    try {
        const status = await chrome.tabs.sendMessage(tab.id, { message: "get_status" });
        if (status) {
            await updateStatusUI(status);
            // Enable buttons if we have either captions or attendees
            const hasData = status.captionCount > 0 || (status.attendeeCount > 0 && status.isInMeeting === false);
            updateButtonStates(hasData);
            if (status.captionCount > 0) {
                renderSpeakerAliases(tab);
            }
        }
    } catch (error) {
        // This error is expected when content script isn't loaded yet
        if (error.message.includes("Could not establish connection")) {
            console.log("Content script not ready. This is normal if the meeting page was just opened.");
            UI_ELEMENTS.statusMessage.innerHTML = 'Please refresh your meeting tab (F5) to activate the extension.';
            UI_ELEMENTS.statusMessage.style.color = 'var(--ck-warning)';
            
        } else {
            console.error("Unexpected error:", error.message);
            UI_ELEMENTS.statusMessage.textContent = "Connection error. Please refresh your meeting tab and try again.";
            UI_ELEMENTS.statusMessage.style.color = 'var(--ck-danger)';
        }
    }
}

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
    if (isFullSettingsPage) return;
    // Ctrl/Cmd + S for save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!UI_ELEMENTS.saveButton.disabled) {
            UI_ELEMENTS.saveButton.click();
        }
    }
    
    // Ctrl/Cmd + C for copy
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        if (!UI_ELEMENTS.copyButton.disabled) {
            UI_ELEMENTS.copyButton.click();
        }
    }
});

document.addEventListener('DOMContentLoaded', initializePopup);

chrome.storage.onChanged.addListener((changes, areaName) => {
    const graphChanged = areaName === 'local'
        && CaptionKeepConfiguration.GRAPH_USER_KEYS.some(key => Object.hasOwn(changes, key));
    if (areaName === 'managed' || graphChanged) void loadSettings().catch(error => {
        UI_ELEMENTS.statusMessage.textContent = `Could not refresh managed settings: ${error.message}`;
    });
});
