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
    viewButton: document.getElementById('viewButton'),
    themeSelect: document.getElementById('themeSelect'),
    defaultSaveFormatSelect: document.getElementById('defaultSaveFormat'),
    saveAsTypeSelect: document.getElementById('saveAsType'),
    saveLocationInput: document.getElementById('saveLocation'),
    saveLocationRow: document.getElementById('saveLocationRow'),
    saveLocationHint: document.getElementById('saveLocationHint'),
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
    sessionList: document.getElementById('sessionList')
};


let currentDefaultFormat = 'txt';

// --- Error Handling ---
function safeExecute(fn, context = '', fallback = null) {
    try {
        return fn();
    } catch (error) {
        console.error(`[Teams Caption Saver] ${context}:`, error);
        return fallback;
    }
}

// --- Utility Functions ---
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function getActiveTeamsTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const teamsTab = tabs.find(tab => /^https:\/\/teams\.(?:microsoft\.com|cloud\.microsoft)(?:\/|$)/.test(tab.url || ''));
    return teamsTab || null;
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
async function updateStatusUI({ capturing, captionCount, isInMeeting, attendeeCount, captureState, checkpointError }) {
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
            if (attendeeCount > 0) {
                status += `, ${attendeeCount} attendees`;
            }
            status += ')';
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
    const buttons = [
        UI_ELEMENTS.copyButton, UI_ELEMENTS.copyDropdownButton,
        UI_ELEMENTS.saveButton, UI_ELEMENTS.saveDropdownButton,
        UI_ELEMENTS.viewButton
    ];
    buttons.forEach(btn => btn.disabled = !hasData);
}

function updateSaveButtonText(format) {
    UI_ELEMENTS.saveButton.textContent = `Save as ${format.toUpperCase()}`;
}

function updateSaveLocationVisibility(type) {
    const showCustom = type === 'custom';
    if (UI_ELEMENTS.saveLocationRow) {
        UI_ELEMENTS.saveLocationRow.style.display = showCustom ? 'flex' : 'none';
    }
    if (UI_ELEMENTS.saveLocationHint) {
        UI_ELEMENTS.saveLocationHint.style.display = showCustom ? 'block' : 'none';
    }
    if (UI_ELEMENTS.saveLocationInput) {
        UI_ELEMENTS.saveLocationInput.disabled = !showCustom;
    }
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
        speakerAliasList.innerHTML = '<p>Unable to load speakers. Please refresh the Teams tab and try again.</p>';
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
    const policy = CaptionKeepConfiguration.applyPolicy(userSettings, await CaptionKeepConfiguration.readManaged());
    const settings = policy.settings;
    const locked = new Set(policy.locked);

    UI_ELEMENTS.autoEnableCaptionsToggle.checked = !!settings.autoEnableCaptions;
    UI_ELEMENTS.autoSaveOnEndToggle.checked = !!settings.autoSaveOnEnd;
    UI_ELEMENTS.trackCaptionsToggle.checked = settings.trackCaptions !== false; // Default to true
    UI_ELEMENTS.trackAttendeesToggle.checked = settings.trackAttendees !== false; // Default to true
    if (UI_ELEMENTS.autoOpenAttendeesToggle) {
        UI_ELEMENTS.autoOpenAttendeesToggle.checked = !!settings.autoOpenAttendees;
        UI_ELEMENTS.autoOpenAttendeesToggle.disabled = !UI_ELEMENTS.trackAttendeesToggle.checked;
    }
    if (UI_ELEMENTS.autoAISummaryToggle) {
        UI_ELEMENTS.autoAISummaryToggle.checked = !!settings.autoAISummary;
        UI_ELEMENTS.autoAISummaryToggle.disabled = locked.has('autoAISummary');
    }
    if (UI_ELEMENTS.privacyScrubberToggle) {
        UI_ELEMENTS.privacyScrubberToggle.checked = settings.privacyScrubberEnabled !== false;
        UI_ELEMENTS.privacyScrubberToggle.disabled = locked.has('privacyScrubberEnabled');
    }
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
    UI_ELEMENTS.manualStartInfo.style.display = settings.autoEnableCaptions ? 'none' : 'block';

    const allowedFormats = ['txt', 'md'];
    currentDefaultFormat = settings.defaultSaveFormat || 'txt';
    if (!allowedFormats.includes(currentDefaultFormat)) {
        currentDefaultFormat = 'txt';
    }
    UI_ELEMENTS.defaultSaveFormatSelect.value = currentDefaultFormat;
    updateSaveButtonText(currentDefaultFormat);
    updateFilenamePreview();

    if (UI_ELEMENTS.saveAsTypeSelect) {
        // 4.6 stored "default" for the browser Downloads folder.
        const saveAsType = settings.saveAsType === 'default' ? 'downloads' : (settings.saveAsType || 'prompt');
        UI_ELEMENTS.saveAsTypeSelect.value = saveAsType;
        updateSaveLocationVisibility(saveAsType);
        if (settings.saveAsType === 'default') chrome.storage.sync.set({saveAsType});
    }

    if (UI_ELEMENTS.saveLocationInput) {
        UI_ELEMENTS.saveLocationInput.value = settings.saveLocation || '';
    }
}

// --- Event Handling ---
function setupEventListeners() {
    document.getElementById('exportSettings').addEventListener('click', () => chrome.tabs.create({url:chrome.runtime.getURL('export.html')}));
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
        UI_ELEMENTS.saveAsTypeSelect.addEventListener('change', (e) => {
            const selectedType = e.target.value;
            chrome.storage.sync.set({ saveAsType: selectedType });
            updateSaveLocationVisibility(selectedType);
        });
    }

    if (UI_ELEMENTS.saveLocationInput) {
        UI_ELEMENTS.saveLocationInput.addEventListener('input', (e) => {
            chrome.storage.sync.set({ saveLocation: e.target.value.trim() });
        });
    }

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
        const tab = await getActiveTeamsTab();
        if (tab) {
            chrome.tabs.sendMessage(tab.id, { message: "return_transcript", format: currentDefaultFormat });
        }
    });

    UI_ELEMENTS.viewButton.addEventListener('click', async () => {
        const tab = await getActiveTeamsTab();
        if (tab) {
            chrome.tabs.sendMessage(tab.id, { message: "get_captions_for_viewing" });
        }
    });

    setupDropdown(UI_ELEMENTS.copyButton, UI_ELEMENTS.copyDropdownButton, UI_ELEMENTS.copyOptions, handleCopy);
    setupDropdown(null, UI_ELEMENTS.saveDropdownButton, UI_ELEMENTS.saveOptions, handleSave);

    document.addEventListener('click', () => {
        UI_ELEMENTS.copyOptions.style.display = 'none';
        UI_ELEMENTS.saveOptions.style.display = 'none';
    });
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

    const tab = await getActiveTeamsTab();
    if (!tab) return;

    UI_ELEMENTS.statusMessage.textContent = "Preparing text to copy...";
    try {
        const response = await chrome.tabs.sendMessage(tab.id, { message: "get_transcript_for_copying" });
        if (response?.transcriptArray) {
            const { speakerAliases = {} } = await chrome.storage.session.get('speakerAliases');
            const formattedText = await formatTranscript(response.transcriptArray, speakerAliases);
            const output = target.dataset.copyType === 'cleaned'
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
    
    const tab = await getActiveTeamsTab();
    if (tab) {
        UI_ELEMENTS.statusMessage.textContent = `Saving as ${format.toUpperCase()}...`;
        if (target.dataset.cleaned !== 'true') {
            chrome.tabs.sendMessage(tab.id, { message: "return_transcript", format });
            return;
        }
        const response = await chrome.tabs.sendMessage(tab.id, { message: 'get_transcript_for_copying' });
        const cleaned = CaptionKeepPrivacyScrubber.scrubTranscript(response?.transcriptArray || [], await getScrubOptions());
        const result = await chrome.runtime.sendMessage({ message: 'download_captions', transcriptArray: cleaned.transcript,
            format, meetingTitle: tab.title || 'Teams Meeting' });
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
        
        if (!sessions || sessions.length === 0) {
            UI_ELEMENTS.sessionList.innerHTML = '<div style="text-align: center; color: var(--ck-text-muted);">No saved sessions</div>';
            return;
        }
        
        let html = '';
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
                        <button class="session-btn delete" data-id="${session.id}">Delete</button>
                    </div>
                </div>
            `;
        }
        
        // Add storage info
        html += `
            <div class="storage-info">
                Storage: ${stats.usedMB}MB / ${stats.quotaMB}MB (${stats.percentUsed}%)
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
    await loadSettings();
    setupEventListeners();
    await initializeSessionHistory(); // Initialize session history

    const tab = await getActiveTeamsTab();
    if (!tab) {
        UI_ELEMENTS.statusMessage.textContent = 'Teams is not open yet.';
        UI_ELEMENTS.statusMessage.style.color = 'var(--ck-text-muted)';
        return;
    }

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
            console.log("Content script not ready. This is normal if the Teams page was just opened.");
            UI_ELEMENTS.statusMessage.innerHTML = 'Please refresh your Teams tab (F5) to activate the extension.';
            UI_ELEMENTS.statusMessage.style.color = 'var(--ck-warning)';
            
        } else {
            console.error("Unexpected error:", error.message);
            UI_ELEMENTS.statusMessage.textContent = "Connection error. Please refresh your Teams tab and try again.";
            UI_ELEMENTS.statusMessage.style.color = 'var(--ck-danger)';
        }
    }
}

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
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
    
    // Ctrl/Cmd + V for view
    if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        if (!UI_ELEMENTS.viewButton.disabled) {
            UI_ELEMENTS.viewButton.click();
        }
    }
});

document.addEventListener('DOMContentLoaded', initializePopup);
