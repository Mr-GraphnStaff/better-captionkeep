(() => {
    'use strict';

    const STORAGE_KEY = 'evidenceBoardMarkersV1';
    const MAX_MARKERS = 500;
    const POLL_INTERVAL_MS = 1200;
    const board = globalThis.CaptionKeepEvidenceBoard;
    const elements = {
        captureState: document.getElementById('capture-state'),
        closePanel: document.getElementById('close-panel'),
        meetingTitle: document.getElementById('meeting-title'),
        meetingProvider: document.getElementById('meeting-provider'),
        meetingSourceControls: document.getElementById('meeting-source-controls'),
        meetingSourceStatus: document.getElementById('meeting-source-status'),
        enableLiveCaptions: document.getElementById('enable-live-captions'),
        openAttendeePanel: document.getElementById('open-attendee-panel'),
        requestTeamsTranscription: document.getElementById('request-teams-transcription'),
        latestCaption: document.getElementById('latest-caption'),
        latestMeta: document.getElementById('latest-meta'),
        transcriptTab: document.getElementById('transcript-tab'),
        momentsTab: document.getElementById('moments-tab'),
        notesTab: document.getElementById('notes-tab'),
        evidenceTab: document.getElementById('evidence-tab'),
        askTab: document.getElementById('ask-tab'),
        templatesTab: document.getElementById('templates-tab'),
        transcriptView: document.getElementById('transcript-view'),
        momentsView: document.getElementById('moments-view'),
        notesView: document.getElementById('notes-view'),
        evidenceView: document.getElementById('evidence-view'),
        askView: document.getElementById('ask-view'),
        templatesView: document.getElementById('templates-view'),
        workspaceTemplateSelect: document.getElementById('workspace-template-select'),
        workspaceTemplateVersion: document.getElementById('workspace-template-version'),
        workspaceTemplatePreview: document.getElementById('workspace-template-preview'),
        workspaceTemplateUse: document.getElementById('workspace-template-use'),
        transcriptCount: document.getElementById('transcript-count'),
        transcriptSearch: document.getElementById('transcript-search'),
        followLatest: document.getElementById('follow-latest'),
        transcriptWindowNote: document.getElementById('transcript-window-note'),
        transcriptList: document.getElementById('transcript-list'),
        markerKind: document.getElementById('marker-kind'),
        markerNote: document.getElementById('marker-note'),
        markLatest: document.getElementById('mark-latest'),
        boardStatus: document.getElementById('board-status'),
        markerCount: document.getElementById('marker-count'),
        markerSession: document.getElementById('marker-session'),
        markerList: document.getElementById('marker-list'),
        actionReceiptCount: document.getElementById('action-receipt-count'),
        actionReceiptList: document.getElementById('action-receipt-list'),
        copyBoard: document.getElementById('copy-board'),
        downloadBoard: document.getElementById('download-board'),
        emailBoard: document.getElementById('email-board'),
        downloadBundle: document.getElementById('download-bundle'),
        openTranscript: document.getElementById('open-transcript'),
        captureMoment: document.getElementById('capture-moment'),
        captureMomentSecondary: document.getElementById('capture-moment-secondary'),
        momentCount: document.getElementById('moment-count'),
        momentList: document.getElementById('moment-list'),
        noteCount: document.getElementById('note-count'),
        notesDraft: document.getElementById('notes-draft'),
        notesList: document.getElementById('notes-list'),
        generateNotes: document.getElementById('generate-notes'),
        saveNotes: document.getElementById('save-notes'),
        clearNotes: document.getElementById('clear-notes'),
        rollingNotesState: document.getElementById('rolling-notes-state'),
        rollingNotesToggle: document.getElementById('rolling-notes-toggle'),
        rollingNotesUpdate: document.getElementById('rolling-notes-update'),
        rollingNotesInterval: document.getElementById('rolling-notes-interval'),
        rollingNotesStatus: document.getElementById('rolling-notes-status'),
        rollingNotesDraft: document.getElementById('rolling-notes-draft'),
        rollingNotesReview: document.getElementById('rolling-notes-review'),
        rollingNotesRevisions: document.getElementById('rolling-notes-revisions'),
        askQuestion: document.getElementById('ask-question'),
        prepareQuestion: document.getElementById('prepare-question'),
        answerCount: document.getElementById('answer-count'),
        answerDraft: document.getElementById('answer-draft'),
        answerList: document.getElementById('answer-list'),
        saveAnswer: document.getElementById('save-answer'),
        clearAnswer: document.getElementById('clear-answer'),
        onTheFlyBar: document.getElementById('on-the-fly-bar'),
        onTheFlyLabel: document.getElementById('on-the-fly-label'),
        onTheFlyPreview: document.getElementById('on-the-fly-preview'),
        clearOnTheFly: document.getElementById('clear-on-the-fly'),
        reviewOnTheFly: document.getElementById('review-on-the-fly'),
        onTheFlyDialog: document.getElementById('on-the-fly-dialog'),
        onTheFlyTask: document.getElementById('on-the-fly-task'),
        onTheFlyQuestion: document.getElementById('on-the-fly-question'),
        onTheFlyEvidence: document.getElementById('on-the-fly-evidence'),
        cancelOnTheFly: document.getElementById('cancel-on-the-fly'),
        prepareOnTheFly: document.getElementById('prepare-on-the-fly')
    };
    let currentContext = null;
    let allMarkers = [];
    let persistedMarkers = new Map();
    let selectedSessionId = '';
    let polling = false;
    let transcriptSignature = '';
    let enterprisePolicy = {};
    let enterpriseLocked = new Set();
    let scrubOptions = {};
    let onTheFlyEvidence = null;
    let selectedCaptionIndex = null;
    let followLatest = true;
    let autoScrollUntil = 0;
    let conversationWindowStart = 0;
    let derivedArtifacts = [];
    let rollingNotesState = null;
    let rollingNotesBusy = false;
    let rollingPreparedInput = null;
    let rollingPreparedSource = null;
    let rollingCatchupTimer = null;
    let workspaceTemplates = [];
    let draftSessionId = '';
    let lastContextError = '';
    const meetingDrafts = new Map();
    const rollingNotesStore = CaptionKeepRollingNotesStore.create({storage:chrome.storage, readPolicy:refreshEnterprisePolicy});

    async function refreshEnterprisePolicy() {
        const user = await chrome.storage.sync.get([
            'privacyScrubberEnabled', 'profanityFilterEnabled', 'customScrubTerms',
            'aiSummaryProviders', 'onTheFlyAiDestination', 'chatgptWorkspaceUrl', 'claudeWorkspaceUrl',
            'claudeConsoleUrl', 'webmailDestination'
        ]);
        const policy = CaptionKeepConfiguration.applyPolicy(user, await CaptionKeepConfiguration.readManaged());
        enterprisePolicy = policy.settings;
        enterpriseLocked = new Set(policy.locked);
        scrubOptions = {
            profanityFilterEnabled: !!enterprisePolicy.profanityFilterEnabled,
            customTerms: enterprisePolicy.customScrubTerms || []
        };
        return enterprisePolicy;
    }

    function setStatus(message) {
        if (elements.boardStatus.textContent !== message) elements.boardStatus.textContent = message;
    }

    function switchView(view) {
        const views = {
            transcript: [elements.transcriptTab, elements.transcriptView],
            moments: [elements.momentsTab, elements.momentsView],
            notes: [elements.notesTab, elements.notesView],
            evidence: [elements.evidenceTab, elements.evidenceView],
            templates: [elements.templatesTab, elements.templatesView],
            ask: [elements.askTab, elements.askView]
        };
        for (const [name, [tab, panel]] of Object.entries(views)) {
            const active = name === view;
            panel.hidden = !active;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
        }
        if (document.activeElement?.closest('.workspace-view[hidden]')) views[view]?.[0].focus();
    }

    function switchDraftSession(sessionId) {
        if (draftSessionId === sessionId) return;
        if (draftSessionId) meetingDrafts.set(draftSessionId, {notes:elements.notesDraft.value, question:elements.askQuestion.value, answer:elements.answerDraft.value});
        const drafts = meetingDrafts.get(sessionId) || {};
        elements.notesDraft.value = drafts.notes || '';
        elements.askQuestion.value = drafts.question || '';
        elements.answerDraft.value = drafts.answer || '';
        draftSessionId = sessionId || '';
        if (meetingDrafts.size > 50) meetingDrafts.delete(meetingDrafts.keys().next().value);
    }

    function selectedWorkspaceTemplate() {
        return workspaceTemplates.find(template => template.id === elements.workspaceTemplateSelect.value);
    }

    function showWorkspaceTemplate() {
        const template = selectedWorkspaceTemplate();
        elements.workspaceTemplatePreview.value = template?.instructions || '';
        elements.workspaceTemplateVersion.textContent = template ? `Version ${template.version} · saved instructions are read-only here` : 'No template selected.';
    }

    async function loadWorkspaceTemplates() {
        const selected = elements.workspaceTemplateSelect.value;
        const stored = await chrome.storage.local.get(CaptionKeepPromptTemplates.STORAGE_KEY);
        workspaceTemplates = [...CaptionKeepPromptTemplates.BUILT_INS, ...CaptionKeepPromptTemplates.sanitize(stored[CaptionKeepPromptTemplates.STORAGE_KEY])];
        elements.workspaceTemplateSelect.replaceChildren();
        for (const template of workspaceTemplates) {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = `${template.name} · v${template.version}`;
            elements.workspaceTemplateSelect.append(option);
        }
        if (workspaceTemplates.some(template => template.id === selected)) elements.workspaceTemplateSelect.value = selected;
        showWorkspaceTemplate();
    }

    function reviewSnapshotKey(mode, sessionId) {
        return `review_source_${mode}_${encodeURIComponent(sessionId)}`;
    }

    async function reviewedSource(mode, question = '') {
        const fallback = currentContext ? structuredClone(currentContext) : null;
        if (!fallback?.sessionId || !chrome.storage.session) return fallback;
        const key = reviewSnapshotKey(mode, fallback.sessionId);
        const snapshot = (await chrome.storage.session.get(key))[key];
        if (!snapshot) return fallback;
        if (snapshot.context?.sessionId !== fallback.sessionId || !Array.isArray(snapshot.context.transcriptArray)
            || !Number.isFinite(snapshot.createdAt) || Date.now() - snapshot.createdAt < 0 || Date.now() - snapshot.createdAt > 60 * 60 * 1000
            || (mode === 'transcript_qa' && snapshot.question !== board.cleanInline(question))) {
            throw new Error('This reviewed handoff expired or its question changed. Prepare a new handoff before keeping this draft.');
        }
        return snapshot.context;
    }

    function selectedMarkers() {
        if (!selectedSessionId) return [];
        return allMarkers.filter(marker => marker.sessionId === selectedSessionId);
    }

    function renderSessionChoices() {
        const previousValue = selectedSessionId;
        const sessions = new Map();
        for (const marker of allMarkers) {
            sessions.set(marker.sessionId, {
                meetingTitle: marker.meetingTitle,
                providerLabel: marker.providerLabel,
                createdAt: marker.createdAt
            });
        }
        if (currentContext?.sessionId && !sessions.has(currentContext.sessionId)) {
            sessions.set(currentContext.sessionId, {
                meetingTitle: currentContext.meetingTitle,
                providerLabel: currentContext.providerLabel,
                createdAt: new Date().toISOString()
            });
        }
        const ordered = [...sessions.entries()].sort((left, right) =>
            String(right[1].createdAt).localeCompare(String(left[1].createdAt)));
        elements.markerSession.replaceChildren();
        if (!ordered.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No evidence boards yet';
            elements.markerSession.append(option);
            selectedSessionId = '';
            return;
        }
        for (const [sessionId, metadata] of ordered) {
            const option = document.createElement('option');
            option.value = sessionId;
            option.textContent = `${metadata.meetingTitle || 'Meeting'} — ${metadata.providerLabel || 'Meeting platform'}`;
            elements.markerSession.append(option);
        }
        selectedSessionId = ordered.some(([sessionId]) => sessionId === previousValue)
            ? previousValue
            : (currentContext?.sessionId || ordered[0][0]);
        elements.markerSession.value = selectedSessionId;
    }

    async function activeMeetingTab() {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        return tab;
    }

    async function closePanel() {
        await CaptionKeepBrowserCompat.closeWorkspace();
    }

    async function requestContext() {
        const tab = await activeMeetingTab();
        if (!tab?.id) throw new Error('No active meeting tab is available.');
        const response = await chrome.tabs.sendMessage(tab.id, {message: 'get_evidence_context'});
        if (!response?.providerLabel) throw new Error('This tab is not a supported meeting surface.');
        return {...response, tabId: tab.id};
    }

    function renderMeetingSourceControls() {
        const provider = currentContext?.providerLabel || '';
        const supported = ['Microsoft Teams', 'Google Meet', 'Zoom Web'].includes(provider);
        const controls = currentContext?.meetingControls || {};
        const inMeeting = currentContext?.isInMeeting === true;
        const isTeams = provider === 'Microsoft Teams';
        elements.meetingSourceControls.hidden = !supported;
        elements.openAttendeePanel.hidden = !isTeams;
        elements.requestTeamsTranscription.hidden = !isTeams;
        elements.enableLiveCaptions.disabled = !inMeeting || controls.liveCaptions === true;
        elements.enableLiveCaptions.textContent = controls.liveCaptions ? 'Live captions enabled' : 'Enable live captions';
        const attendeePanelOpen = controls.attendeePanelOpen === true;
        elements.openAttendeePanel.disabled = !inMeeting || (!attendeePanelOpen && controls.attendeeAllowed === false);
        elements.openAttendeePanel.textContent = attendeePanelOpen ? 'Close attendee panel' : 'Open attendee panel';
        elements.openAttendeePanel.setAttribute('aria-expanded', String(attendeePanelOpen));
        elements.requestTeamsTranscription.disabled = !inMeeting || ['checking', 'running', 'requested'].includes(controls.transcriptionState);
        elements.requestTeamsTranscription.textContent = controls.transcriptionState === 'running'
            ? 'Teams transcript running'
            : controls.transcriptionState === 'requested'
                ? 'Teams transcript requested'
                : 'Request Teams transcript';
        if (!inMeeting) elements.meetingSourceStatus.textContent = 'Join the meeting, then choose which meeting sources to enable.';
        else if (isTeams && controls.transcriptionDetail && controls.transcriptionState !== 'unchecked') {
            elements.meetingSourceStatus.textContent = controls.transcriptionDetail;
        } else if (controls.liveCaptions) elements.meetingSourceStatus.textContent = 'Live captions are available for local capture.';
        else elements.meetingSourceStatus.textContent = 'Opening this panel does not change the meeting.';
    }

    function renderContext() {
        const transcript = currentContext?.transcriptArray || [];
        const latest = transcript.at(-1);
        const rawCaptureState = currentContext?.captureState || 'not connected';
        const ready = rawCaptureState === 'capturing';
        const paused = rawCaptureState === 'paused';
        const failed = rawCaptureState === 'source unavailable';
        document.body.classList.toggle('capture-ready', ready);
        document.body.classList.toggle('capture-paused', paused);
        document.body.classList.toggle('capture-error', failed);
        elements.captureState.textContent = ready ? 'Live'
            : failed ? 'Needs attention'
                : paused ? 'Off'
                    : ['ended', 'meeting ended'].includes(rawCaptureState) ? 'Ended' : 'Connecting';
        elements.captureState.title = rawCaptureState;
        elements.meetingTitle.textContent = currentContext?.meetingTitle || 'Open Teams, Meet, or Zoom Web.';
        elements.meetingProvider.textContent = currentContext?.providerLabel
            ? `${currentContext.providerLabel} · ${rawCaptureState}`
            : '';
        renderMeetingSourceControls();
        elements.latestCaption.textContent = latest?.Text || 'Waiting for a stable captured caption…';
        elements.latestCaption.hidden = true;
        elements.latestMeta.textContent = latest
            ? `${board.evidenceId(transcript.length - 1)} · ${latest.Time || 'time unavailable'} · ${latest.Name || 'Unknown speaker'}`
            : '';
        elements.markLatest.disabled = selectedCaptionIndex === null;
        elements.captureMoment.disabled = !currentContext?.isInMeeting;
        elements.captureMomentSecondary.disabled = !currentContext?.isInMeeting;
        elements.generateNotes.disabled = !transcript.length;
        elements.workspaceTemplateUse.disabled = !transcript.length || !!enterprisePolicy.disableAiHandoff;
        elements.saveNotes.disabled = !transcript.length;
        elements.prepareQuestion.disabled = !transcript.length;
        renderRollingNotes();
    }

    function rollingNotesEmptyState() {
        return CaptionKeepRollingNotes.emptyState(currentContext?.sessionId || 'unavailable');
    }

    function renderRollingNotes() {
        const state = rollingNotesState || rollingNotesEmptyState();
        const hasMeeting = Boolean(currentContext?.sessionId);
        const hasTranscript = Boolean(currentContext?.transcriptArray?.length);
        const label = !state.enabled ? 'Off' : state.paused ? 'Paused' : state.failureCount >= 3 ? 'Needs attention' : 'Running';
        elements.rollingNotesState.textContent = label;
        elements.rollingNotesToggle.disabled = !hasMeeting || rollingNotesBusy;
        elements.rollingNotesToggle.textContent = !state.enabled ? 'Start rolling notes' : state.paused ? 'Resume rolling notes' : 'Pause rolling notes';
        elements.rollingNotesUpdate.disabled = !hasTranscript || !state.enabled || rollingNotesBusy;
        elements.rollingNotesInterval.disabled = !hasMeeting || rollingNotesBusy;
        elements.rollingNotesInterval.value = String(state.intervalMs);
        elements.rollingNotesDraft.value = state.draft;
        elements.rollingNotesReview.disabled = !state.draft;
        const status = state.lastError
            ? `${state.lastError} (${state.failureCount}/3 attempts)`
            : state.lastUpdatedAt
                ? `Last updated ${artifactTime(state.lastUpdatedAt)} · ${state.processedCaptionCount} captions processed.`
                : state.enabled ? 'Waiting for enough new captions.' : 'Start when you want local rolling evidence notes.';
        elements.rollingNotesStatus.textContent = status;
        elements.rollingNotesRevisions.replaceChildren();
        if (!state.revisions.length) {
            const empty = document.createElement('li');
            empty.className = 'empty';
            empty.textContent = 'No rolling updates yet.';
            elements.rollingNotesRevisions.append(empty);
            return;
        }
        for (const revision of [...state.revisions].reverse()) {
            const item = document.createElement('li');
            item.textContent = `${artifactTime(revision.createdAt)} · ${revision.evidenceIds[0]}–${revision.evidenceIds.at(-1)}${revision.status === 'superseded' ? ' · Superseded by corrected source' : ''}`;
            elements.rollingNotesRevisions.append(item);
        }
    }

    async function saveRollingNotesState() {
        if (!currentContext?.sessionId || !rollingNotesState) return;
        await rollingNotesStore.save(CaptionKeepRollingNotes.storageKey(currentContext.sessionId), rollingNotesState);
    }

    async function loadRollingNotesState() {
        if (!currentContext?.sessionId) {
            rollingNotesState = null;
            renderRollingNotes();
            return;
        }
        const key = CaptionKeepRollingNotes.storageKey(currentContext.sessionId);
        const stored = await rollingNotesStore.load(key);
        rollingNotesState = CaptionKeepRollingNotes.normalizeState(stored, currentContext.sessionId);
        renderRollingNotes();
    }

    async function updateRollingNotes({force = false, catchup = false} = {}) {
        if (rollingNotesBusy || !currentContext?.sessionId || !rollingNotesState?.enabled) return;
        const transcript = currentContext.transcriptArray || [];
        if (rollingPreparedInput !== transcript) {
            rollingPreparedInput = transcript;
            rollingPreparedSource = CaptionKeepRollingNotes.prepareSource(transcript);
        }
        const sourceChanged = CaptionKeepRollingNotes.processedSourceChanged(rollingPreparedSource, rollingNotesState);
        if (!force && !catchup && !sourceChanged && rollingNotesState.lastUpdatedAt
            && Date.now() - Date.parse(rollingNotesState.lastUpdatedAt) < rollingNotesState.intervalMs) return;
        rollingNotesBusy = true;
        renderRollingNotes();
        try {
            const result = CaptionKeepRollingNotes.update(rollingPreparedSource, rollingNotesState, {force});
            rollingNotesState = result.state;
            if (result.changed || result.reason === 'duplicate' || result.reason === 'empty') await saveRollingNotesState();
            if (result.changed && !rollingNotesState.paused && rollingNotesState.processedCaptionCount < transcript.length) {
                clearTimeout(rollingCatchupTimer);
                rollingCatchupTimer = setTimeout(() => void updateRollingNotes({catchup:true}).catch(error => setStatus(error.message)), 0);
            }
        } catch (error) {
            rollingNotesState = CaptionKeepRollingNotes.recordFailure(rollingNotesState, error);
            await saveRollingNotesState().catch(() => {});
        } finally {
            rollingNotesBusy = false;
            renderRollingNotes();
        }
    }

    async function toggleRollingNotes() {
        if (!currentContext?.sessionId) throw new Error('Connect to a captured meeting first.');
        if (!rollingNotesState) await loadRollingNotesState();
        if (!rollingNotesState.enabled) {
            rollingNotesState = {...rollingNotesState, enabled:true, paused:false, failureCount:0, lastError:''};
            await saveRollingNotesState();
            await updateRollingNotes({force:true});
            return;
        }
        rollingNotesState = {...rollingNotesState, paused:!rollingNotesState.paused, failureCount:0, lastError:''};
        await saveRollingNotesState();
        if (!rollingNotesState.paused) await updateRollingNotes({force:true});
        renderRollingNotes();
    }

    async function runMeetingControl(message, pendingMessage) {
        const tab = await activeMeetingTab();
        if (!tab?.id) throw new Error('No active meeting tab is available.');
        const buttonByMessage = {
            enable_live_captions: elements.enableLiveCaptions,
            open_attendee_panel: elements.openAttendeePanel,
            close_attendee_panel: elements.openAttendeePanel,
            request_teams_transcription: elements.requestTeamsTranscription
        };
        const button = buttonByMessage[message];
        if (button) button.disabled = true;
        elements.meetingSourceStatus.textContent = pendingMessage;
        try {
            const response = await chrome.tabs.sendMessage(tab.id, {message});
            if (!response?.ok) throw new Error(response?.error || 'The meeting control was not available.');
            elements.meetingSourceStatus.textContent = response.detail || 'Request accepted. The meeting remains under your control.';
            await pollContext();
        } finally {
            renderMeetingSourceControls();
        }
    }

    function captionNode(caption, index) {
        const item = document.createElement('li');
        item.dataset.captionKey = String(caption.key || index);
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'caption-select';
        choose.dataset.captionIndex = String(index);
        choose.tabIndex = -1;
        choose.setAttribute('aria-pressed', 'false');
        choose.title = `${board.evidenceId(index)} · Choose this caption`;
        const heading = document.createElement('span');
        heading.className = 'caption-heading';
        const speaker = document.createElement('span');
        speaker.className = 'caption-speaker';
        speaker.textContent = caption.Name || 'Unknown speaker';
        const time = document.createElement('span');
        time.className = 'caption-time';
        time.textContent = caption.Time || '';
        heading.append(speaker, time);
        const text = document.createElement('span');
        text.className = 'caption-text';
        text.dataset.captionIndex = String(index);
        text.textContent = caption.Text;
        choose.append(heading, text);
        item.append(choose);
        return item;
    }

    function setFollowLatest(enabled, {scroll = false} = {}) {
        followLatest = enabled;
        elements.followLatest.setAttribute('aria-pressed', String(enabled));
        elements.followLatest.title = enabled ? 'Pause automatic scrolling to new captions.' : 'Resume following new captions.';
        if (enabled && scroll && !elements.transcriptView.hidden) {
            autoScrollUntil = Date.now() + 300;
            elements.transcriptList.lastElementChild?.scrollIntoView({block:'end', behavior:'auto'});
        }
    }

    function selectForOnTheFly(captionIndex, selectedText = '') {
        const caption = currentContext?.transcriptArray?.[captionIndex];
        const text = board.cleanInline(selectedText || caption?.Text);
        if (!caption || !text) return;
        onTheFlyEvidence = {
            evidenceId: board.evidenceId(captionIndex),
            speaker: caption.Name || 'Unknown speaker',
            time: caption.Time || 'time unavailable',
            text,
            sourceKey:caption.key || '',
            sourceFingerprint:CaptionKeepRollingNotes.sourceRevision([caption])
        };
        selectedCaptionIndex = captionIndex;
        setFollowLatest(false);
        elements.onTheFlyLabel.textContent = onTheFlyEvidence.speaker;
        elements.onTheFlyPreview.textContent = text;
        elements.onTheFlyBar.hidden = false;
        elements.markLatest.disabled = false;
        for (const button of elements.transcriptList.querySelectorAll('.caption-select')) {
            const selected = Number(button.dataset.captionIndex) === captionIndex;
            button.setAttribute('aria-pressed', String(selected));
            button.closest('li').classList.toggle('selected', selected);
            button.tabIndex = selected ? 0 : -1;
        }
    }

    function clearOnTheFly({restoreFocus = false} = {}) {
        const index = selectedCaptionIndex;
        onTheFlyEvidence = null;
        selectedCaptionIndex = null;
        elements.onTheFlyBar.hidden = true;
        elements.onTheFlyQuestion.value = '';
        elements.markerNote.value = '';
        for (const details of elements.onTheFlyBar.querySelectorAll('details')) details.open = false;
        const selection = window.getSelection();
        if (selection?.rangeCount && elements.transcriptList.contains(selection.anchorNode)) selection.removeAllRanges();
        elements.markLatest.disabled = true;
        const buttons = [...elements.transcriptList.querySelectorAll('.caption-select')];
        for (const [position, button] of buttons.entries()) {
            button.setAttribute('aria-pressed', 'false');
            button.closest('li').classList.remove('selected');
            button.tabIndex = Number(button.dataset.captionIndex) === index || (index === null && position === 0) ? 0 : -1;
        }
        if (restoreFocus) (buttons.find(button => Number(button.dataset.captionIndex) === index) || elements.transcriptSearch).focus({preventScroll:true});
    }

    function openOnTheFlyDialog() {
        if (!onTheFlyEvidence) return;
        elements.onTheFlyEvidence.textContent = `${onTheFlyEvidence.evidenceId} · ${onTheFlyEvidence.time} · ${onTheFlyEvidence.speaker}\n“${onTheFlyEvidence.text}”`;
        elements.onTheFlyDialog.showModal();
    }

    function selectionRequestSnapshot() {
        if (!onTheFlyEvidence || !currentContext?.sessionId) throw new Error('Choose a caption or select its words first.');
        return {context:{sessionId:currentContext.sessionId, meetingTitle:currentContext.meetingTitle, providerLabel:currentContext.providerLabel},
            evidence:structuredClone(onTheFlyEvidence)};
    }

    function selectionStillMatches(request) {
        if (currentContext?.sessionId !== request.context.sessionId || !onTheFlyEvidence
            || onTheFlyEvidence.evidenceId !== request.evidence.evidenceId || onTheFlyEvidence.text !== request.evidence.text) return false;
        const index = Number.parseInt(request.evidence.evidenceId.slice(1), 10) - 1;
        const caption = request.evidence.sourceKey ? currentContext.transcriptArray?.find(item => item.key === request.evidence.sourceKey)
            : currentContext.transcriptArray?.[index];
        return !!caption && CaptionKeepRollingNotes.sourceRevision([caption]) === request.evidence.sourceFingerprint;
    }

    function assertSelectionRequest(request) {
        if (!selectionStillMatches(request)) throw new Error('The selected words or active meeting changed. Choose the current caption and try again.');
    }

    function buildOnTheFlyPrompt(taskId, question = '', request = selectionRequestSnapshot()) {
        const prompt = CaptionKeepAiTasks.buildPrompt({
            taskId,
            question,
            meetingTitle: request.context.meetingTitle || 'Meeting',
            providerLabel: request.context.providerLabel || 'Meeting platform',
            evidence: [request.evidence]
        });
        const scrub = enterprisePolicy.privacyScrubberEnabled !== false || enterprisePolicy.forceScrubbedExport;
        return scrub ? CaptionKeepPrivacyScrubber.scrub(prompt, scrubOptions).text : prompt;
    }

    function preferredAiDestination() {
        const configured = Array.isArray(enterprisePolicy.aiSummaryProviders)
            ? enterprisePolicy.aiSummaryProviders
            : [];
        const preferred = enterprisePolicy.onTheFlyAiDestination;
        if (!preferred && !configured.length && enterpriseLocked.has('aiSummaryProviders')) {
            throw new Error('Your organization has not enabled an AI destination.');
        }
        const provider = preferred || configured[0] || 'chatgpt';
        const destination = CaptionKeepDestinations.resolve(provider, enterprisePolicy);
        if (!destination) throw new Error('Choose an AI destination in Settings.');
        return destination;
    }

    async function runQuickAiTask(taskId) {
        const request = selectionRequestSnapshot();
        await refreshEnterprisePolicy();
        assertSelectionRequest(request);
        if (enterprisePolicy.disableAiHandoff) throw new Error('AI handoff is disabled by your organization.');
        if (enterprisePolicy.disableClipboard) throw new Error('Clipboard actions are disabled by your organization.');
        if (!onTheFlyEvidence) throw new Error('Select meeting words or choose a caption first.');
        const destination = preferredAiDestination();
        const prompt = buildOnTheFlyPrompt(taskId, '', request);
        await navigator.clipboard.writeText(CaptionKeepPromptTemplates.reviewedHandoffText(prompt));
        await chrome.tabs.create({url:destination.url});
        if (selectionStillMatches(request)) clearOnTheFly();
        setStatus(`${CaptionKeepAiTasks.task(taskId).label} copied and ${destination.name} opened. Paste, review, and send when ready.`);
    }

    async function openOnTheFlyEmail() {
        const request = selectionRequestSnapshot();
        await refreshEnterprisePolicy();
        assertSelectionRequest(request);
        if (enterprisePolicy.disableEvidenceEmail) throw new Error('Evidence email is disabled by your organization.');
        if (!onTheFlyEvidence) throw new Error('Select meeting words or choose a caption first.');
        const rawSubject = `Follow-up: ${request.context.meetingTitle || 'Meeting'}`;
        const rawBody = [
            'Follow-up from the meeting:',
            '',
            `[${request.evidence.evidenceId}] ${request.evidence.time} — ${request.evidence.speaker}`,
            request.evidence.text,
            '',
            'Review this draft, add recipients, and edit before sending.'
        ].join('\n');
        const scrub = enterprisePolicy.privacyScrubberEnabled !== false || enterprisePolicy.forceScrubbedExport;
        const subject = scrub ? CaptionKeepPrivacyScrubber.scrub(rawSubject, scrubOptions).text : rawSubject;
        const body = scrub ? CaptionKeepPrivacyScrubber.scrub(rawBody, scrubOptions).text : rawBody;
        const destination = CaptionKeepWebMail.compose(enterprisePolicy.webmailDestination || 'outlook_work', {subject, body});
        await chrome.tabs.create({url:destination.url});
        if (selectionStillMatches(request)) clearOnTheFly();
        setStatus(`Draft opened in ${destination.name}. Add recipients, review, and send when ready.`);
    }

    async function prepareOnTheFly() {
        const request = selectionRequestSnapshot();
        const taskId = elements.onTheFlyTask.value;
        const question = board.cleanInline(elements.onTheFlyQuestion.value);
        await refreshEnterprisePolicy();
        assertSelectionRequest(request);
        if (enterprisePolicy.disableAiHandoff) throw new Error('AI handoff is disabled by your organization.');
        if (!onTheFlyEvidence) throw new Error('Select meeting words or choose a caption first.');
        const settings = await chrome.storage.sync.get('aiSummaryProviders');
        assertSelectionRequest(request);
        const providers = Array.isArray(settings.aiSummaryProviders) && settings.aiSummaryProviders.length
            ? settings.aiSummaryProviders
            : ['chatgpt', 'claude', 'copilot', 'gemini'];
        const handoffId = `handoff_${crypto.randomUUID()}`;
        await chrome.storage.local.set({
            [handoffId]: {
                mode: 'on_the_fly',
                taskId,
                question,
                evidence: [request.evidence],
                transcript: [{
                    Time: request.evidence.time,
                    Name: request.evidence.speaker,
                    Text: request.evidence.text
                }],
                providers,
                meetingTitle: request.context.meetingTitle || 'Meeting',
                providerLabel: request.context.providerLabel || 'Meeting platform',
                sessionId: request.context.sessionId,
                warnings: ['Selected meeting text only. Nothing has been sent.']
            }
        });
        try { assertSelectionRequest(request); }
        catch (error) {await chrome.storage.local.remove(handoffId); throw error;}
        elements.onTheFlyDialog.close();
        await chrome.tabs.create({url: chrome.runtime.getURL(`handoff.html?id=${encodeURIComponent(handoffId)}`)});
        if (selectionStillMatches(request)) clearOnTheFly();
        setStatus('Review opened. Nothing is sent until you choose to copy it.');
    }

    function renderTranscript() {
        const transcript = currentContext?.transcriptArray || [];
        const query = board.cleanInline(elements.transcriptSearch.value).toLocaleLowerCase();
        const matches = transcript
            .map((caption, index) => ({caption, index}))
            .filter(({caption}) => !query || `${caption.Name || ''} ${caption.Text || ''}`.toLocaleLowerCase().includes(query));
        elements.transcriptCount.textContent = String(transcript.length);
        elements.transcriptWindowNote.hidden = matches.length <= 150;
        if (!matches.length) {
            if (onTheFlyEvidence) clearOnTheFly();
            elements.transcriptList.replaceChildren();
            const empty = document.createElement('li');
            empty.className = 'empty';
            empty.textContent = transcript.length ? 'No captions match.' : 'Connect to a supported meeting to see captions.';
            elements.transcriptList.append(empty);
            return;
        }
        const selectedCaption = selectedCaptionIndex === null ? null : transcript[selectedCaptionIndex];
        if (onTheFlyEvidence && (!selectedCaption || CaptionKeepRollingNotes.sourceRevision([selectedCaption]) !== onTheFlyEvidence.sourceFingerprint)) {
            clearOnTheFly();
            setStatus('The selected caption changed. Select its updated words before using an action.');
        }
        // Reading focus is authoritative even while an asynchronous poll or programmatic
        // scroll is settling. Never evict a focused row merely because more words arrive.
        const readingRow = document.activeElement?.closest('.caption-select')?.closest('li');
        if (readingRow && elements.transcriptList.contains(readingRow)
            && matches.some(({caption, index}) => String(caption.key || index) === readingRow.dataset.captionKey)) setFollowLatest(false);
        if (followLatest) conversationWindowStart = Math.max(0, matches.length - 150);
        conversationWindowStart = Math.min(conversationWindowStart, Math.max(0, matches.length - 1));
        const visible = matches.slice(conversationWindowStart, conversationWindowStart + 150);
        elements.transcriptWindowNote.textContent = `Showing captions ${visible[0].index + 1}–${visible.at(-1).index + 1} of ${transcript.length}. Follow latest for new words, or open Full transcript for all captions.`;
        if (selectedCaptionIndex !== null && !visible.some(item => item.index === selectedCaptionIndex)) {
            const selected = matches.find(item => item.index === selectedCaptionIndex);
            if (selected) visible.unshift(selected);
        }
        const existing = new Map([...elements.transcriptList.children].map(item => [item.dataset.captionKey, item]));
        const anchor = [...elements.transcriptList.children].find(item => item.getBoundingClientRect().bottom > 0);
        const anchorTop = anchor?.getBoundingClientRect().top;
        const wanted = new Set();
        const focusedKey = document.activeElement?.closest('.caption-select')?.closest('li').dataset.captionKey;
        let reference = elements.transcriptList.firstElementChild;
        for (const [{caption, index}, position] of visible.map((value, index) => [value, index])) {
            const key = String(caption.key || index);
            const item = existing.get(key) || captionNode(caption, index);
            const choose = item.querySelector('.caption-select');
            const speaker = item.querySelector('.caption-speaker');
            const time = item.querySelector('.caption-time');
            const text = item.querySelector('.caption-text');
            if (speaker.textContent !== (caption.Name || 'Unknown speaker')) speaker.textContent = caption.Name || 'Unknown speaker';
            if (time.textContent !== (caption.Time || '')) time.textContent = caption.Time || '';
            if (text.textContent !== caption.Text) text.textContent = caption.Text;
            choose.dataset.captionIndex = String(index);
            choose.title = `${board.evidenceId(index)} · Choose this caption`;
            text.dataset.captionIndex = String(index);
            const selected = index === selectedCaptionIndex;
            choose.setAttribute('aria-pressed', String(selected));
            choose.tabIndex = selected || (selectedCaptionIndex === null && (focusedKey ? key === focusedKey : position === 0)) ? 0 : -1;
            item.classList.toggle('selected', selected);
            wanted.add(item);
            if (item !== reference) elements.transcriptList.insertBefore(item, reference);
            reference = item.nextElementSibling;
        }
        for (const item of [...elements.transcriptList.children]) if (!wanted.has(item)) item.remove();
        if (!followLatest && anchor?.isConnected && Number.isFinite(anchorTop)) {
            const adjustment = anchor.getBoundingClientRect().top - anchorTop;
            if (adjustment) window.scrollBy({top:adjustment, behavior:'auto'});
        }
        const selection = window.getSelection();
        if (followLatest && !query && !elements.transcriptView.hidden && !selection?.toString()) setFollowLatest(true, {scroll:true});
    }

    function markerNode(marker) {
        const item = document.createElement('li');
        const header = document.createElement('div');
        header.className = 'marker-header';
        const label = document.createElement('span');
        label.className = 'marker-kind';
        label.textContent = marker.kind;
        const remove = document.createElement('button');
        remove.className = 'delete-marker';
        remove.type = 'button';
        remove.dataset.markerId = marker.id;
        remove.setAttribute('aria-label', `Delete ${marker.kind} marker ${marker.evidenceId}`);
        remove.textContent = 'Delete';
        header.append(label, remove);

        const quote = document.createElement('p');
        quote.className = 'marker-quote';
        quote.textContent = `“${marker.text}”`;
        const meta = document.createElement('div');
        meta.className = 'muted';
        meta.textContent = `${marker.evidenceId} · ${marker.time} · ${marker.speaker}`;
        item.append(header, quote, meta);
        if (marker.note) {
            const note = document.createElement('p');
            note.className = 'marker-note';
            note.textContent = marker.note;
            item.append(note);
        }
        return item;
    }

    function renderMarkers() {
        renderSessionChoices();
        const markers = selectedMarkers();
        elements.markerList.replaceChildren();
        if (!markers.length) {
            const empty = document.createElement('li');
            empty.className = 'empty';
            empty.textContent = 'No markers for this meeting yet.';
            elements.markerList.append(empty);
        } else {
            for (const marker of [...markers].reverse()) elements.markerList.append(markerNode(marker));
        }
        elements.markerCount.textContent = String(markers.length);
        elements.copyBoard.disabled = !markers.length || !!enterprisePolicy.disableClipboard;
        elements.downloadBoard.disabled = !markers.length || !!enterprisePolicy.disableFileExport;
        elements.emailBoard.disabled = !markers.length || !!enterprisePolicy.disableEvidenceEmail;
        elements.downloadBundle.disabled = !markers.length || !!enterprisePolicy.disableFileExport;
    }

    async function saveMarkers() {
        allMarkers = allMarkers.slice(-MAX_MARKERS);
        const currentIds = new Set(allMarkers.map(marker => marker.id));
        const upserts = allMarkers.filter(marker => persistedMarkers.get(marker.id) !== JSON.stringify(marker));
        const removeIds = [...persistedMarkers.keys()].filter(id => !currentIds.has(id));
        const result = await chrome.runtime.sendMessage({message:'update_evidence_markers', upserts, removeIds});
        if (!result?.ok) throw new Error(result?.error || 'Evidence markers could not be saved.');
        allMarkers = result.markers || [];
        persistedMarkers = new Map(allMarkers.map(marker => [marker.id, JSON.stringify(marker)]));
        if (result.rejected?.length) throw new Error(result.rejected[0].reason || 'The source is no longer available; its evidence was not retained.');
    }

    async function loadMarkers() {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        allMarkers = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
        persistedMarkers = new Map(allMarkers.map(marker => [marker.id, JSON.stringify(marker)]));
        renderMarkers();
    }

    async function pollContext() {
        if (polling) return;
        polling = true;
        try {
            const next = await requestContext();
            const sessionChanged = currentContext?.sessionId !== next.sessionId;
            if (sessionChanged) {
                switchDraftSession(next.sessionId);
                clearOnTheFly();
                setFollowLatest(true);
            }
            currentContext = next;
            if (sessionChanged) {
                selectedSessionId = next.sessionId;
                await loadDerivedArtifacts();
                await loadRollingNotesState();
            }
            const reconciliation = board.reconcileMarkers(allMarkers, next);
            if (reconciliation.changed) {
                allMarkers = reconciliation.markers;
                await saveMarkers();
            }
            renderContext();
            const captions = next.transcriptArray || [];
            if (rollingPreparedInput !== captions) {
                rollingPreparedInput = captions;
                rollingPreparedSource = CaptionKeepRollingNotes.prepareSource(captions);
            }
            const nextSignature = `${next.sessionId}:${CaptionKeepRollingNotes.sourceRevision(rollingPreparedSource)}`;
            if (nextSignature !== transcriptSignature) {
                transcriptSignature = nextSignature;
                renderTranscript();
            }
            if (sessionChanged || reconciliation.changed) renderMarkers();
            await updateRollingNotes();
            if (lastContextError && elements.boardStatus.textContent === lastContextError) setStatus('');
            lastContextError = '';
        } catch (error) {
            switchDraftSession('');
            currentContext = null;
            derivedArtifacts = [];
            rollingNotesState = null;
            renderContext();
            renderDerivedArtifacts();
            renderRollingNotes();
            transcriptSignature = '';
            renderTranscript();
            renderMarkers();
            lastContextError = error.message;
            setStatus(error.message);
        } finally {
            polling = false;
        }
    }

    async function markCaption(captionIndex) {
        try {
            const marker = board.createMarker(currentContext, {
                captionIndex,
                kind: elements.markerKind.value,
                note: elements.markerNote.value
            });
            allMarkers.push(marker);
            selectedSessionId = marker.sessionId;
            await saveMarkers();
            elements.markerNote.value = '';
            renderMarkers();
            setStatus(`${marker.kind} saved locally as ${marker.evidenceId}.`);
        } catch (error) {
            setStatus(error.message);
        }
    }

    async function markLatest() {
        if (selectedCaptionIndex === null) throw new Error('Choose a caption first.');
        await markCaption(selectedCaptionIndex);
    }

    async function deleteMarker(markerId) {
        allMarkers = allMarkers.filter(marker => marker.id !== markerId);
        await saveMarkers();
        renderMarkers();
        setStatus('Evidence marker deleted. The transcript was not changed.');
    }

    function boardMarkdown() {
        const markers = selectedMarkers();
        const first = markers[0];
        const context = selectedSessionId === currentContext?.sessionId
            ? currentContext
            : {meetingTitle: first?.meetingTitle, providerLabel: first?.providerLabel};
        return board.toMarkdown(markers, context || {});
    }

    function selectedContext() {
        const markers = selectedMarkers();
        const first = markers[0];
        return selectedSessionId === currentContext?.sessionId
            ? currentContext
            : {
                sessionId: selectedSessionId,
                meetingTitle: first?.meetingTitle,
                providerLabel: first?.providerLabel,
                transcriptArray: []
            };
    }

    async function sha256Hex(value) {
        const bytes = new TextEncoder().encode(value);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function derivedRequest(message, extra = {}) {
        if (!currentContext?.sessionId) throw new Error('Connect to a captured meeting first.');
        const response = await chrome.runtime.sendMessage({message, sessionId:currentContext.sessionId, historical:false, ...extra});
        if (!response?.ok) throw new Error(response?.error || 'The meeting artifact request failed.');
        return response;
    }

    function artifactTime(value) {
        const parsed = new Date(value);
        return Number.isNaN(parsed.valueOf()) ? 'time unavailable' : parsed.toLocaleString();
    }

    function artifactDeleteButton(artifact) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.artifactId = artifact.id;
        button.setAttribute('aria-label', `Delete ${artifact.kind} created ${artifactTime(artifact.createdAt)}`);
        button.textContent = 'Delete';
        return button;
    }

    function renderDerivedArtifacts() {
        const receipts = derivedArtifacts.filter(item => item.kind === 'action-result' && item.status === 'user-confirmed'
            && item.generator === 'byomcp-verified-action' && item.payload?.receipt?.jobId === item.payload.jobId
            && /^[a-f0-9]{64}$/.test(item.payload.receipt.receiptDigest || ''));
        elements.actionReceiptCount.textContent = String(receipts.length);
        elements.actionReceiptList.replaceChildren();
        if (!receipts.length) {
            const empty = document.createElement('li'); empty.className = 'empty';
            empty.textContent = 'No verified action receipts kept for this meeting.';
            elements.actionReceiptList.append(empty);
        }
        for (const artifact of [...receipts].reverse()) {
            const item = document.createElement('li'); item.className = 'artifact-card';
            const header = document.createElement('div'); header.className = 'artifact-card-header';
            const title = document.createElement('strong'); title.textContent = 'Verified action result';
            header.append(title, artifactDeleteButton(artifact));
            const body = document.createElement('p'); body.className = 'note-body'; body.textContent = artifact.payload.text || '';
            const meta = document.createElement('p'); meta.className = 'artifact-meta';
            meta.textContent = `${artifactTime(artifact.payload.receipt.observedAt)} · Citations: ${artifact.evidenceIds.join(', ')} · transcript ${artifact.sourceTranscriptSha256.slice(0,12)}…`;
            item.append(header, body, meta); elements.actionReceiptList.append(item);
        }
        const moments = derivedArtifacts.filter(item => item.kind === 'moment' && item.status !== 'deleted');
        const notes = derivedArtifacts.filter(item => item.kind === 'live-notes' && item.status !== 'deleted');
        const answers = derivedArtifacts.filter(item => item.kind === 'answer' && item.status !== 'deleted');
        elements.momentCount.textContent = String(moments.length);
        elements.noteCount.textContent = String(notes.length);
        elements.answerCount.textContent = String(answers.length);
        elements.momentList.replaceChildren();
        if (!moments.length) {
            const empty = document.createElement('li');
            empty.className = 'empty';
            empty.textContent = 'No Moments kept for this meeting.';
            elements.momentList.append(empty);
        } else {
            for (const artifact of [...moments].reverse()) {
                const item = document.createElement('li');
                item.className = 'moment-card artifact-card';
                if (artifact.payload.screenshot) {
                    const image = document.createElement('img');
                    image.src = artifact.payload.screenshot;
                    image.alt = artifact.payload.altText || artifact.payload.note || 'Reviewed meeting Moment';
                    item.append(image);
                }
                const content = document.createElement('div');
                const header = document.createElement('div');
                header.className = 'artifact-card-header';
                const title = document.createElement('strong');
                title.textContent = artifact.payload.note || 'Meeting Moment';
                header.append(title, artifactDeleteButton(artifact));
                if (artifact.payload.screenshot) {
                    const exportButton = document.createElement('button');
                    exportButton.type = 'button';
                    exportButton.dataset.exportMomentId = artifact.id;
                    exportButton.textContent = 'Export PNG';
                    exportButton.disabled = !!enterprisePolicy.disableFileExport || !!enterprisePolicy.forceScrubbedExport;
                    header.append(exportButton);
                }
                const meta = document.createElement('p');
                meta.className = 'artifact-meta';
                meta.textContent = `${artifactTime(artifact.createdAt)} · ${artifact.sourceCaptionCount} captions · ${artifact.sourceTranscriptSha256.slice(0, 12)}…`;
                const refs = document.createElement('p');
                refs.className = 'artifact-meta';
                refs.textContent = artifact.evidenceIds.length ? `Evidence: ${artifact.evidenceIds.join(', ')}` : 'No Evidence Board markers linked.';
                content.append(header, meta, refs);
                item.append(content);
                elements.momentList.append(item);
            }
        }
        elements.notesList.replaceChildren();
        if (!notes.length) {
            const empty = document.createElement('li');
            empty.className = 'empty';
            empty.textContent = 'No reviewed notes kept for this meeting.';
            elements.notesList.append(empty);
        } else {
            for (const artifact of [...notes].reverse()) {
                const item = document.createElement('li');
                item.className = 'artifact-card';
                const header = document.createElement('div');
                header.className = 'artifact-card-header';
                const title = document.createElement('strong');
                title.textContent = `Reviewed notes · ${artifactTime(artifact.createdAt)}`;
                header.append(title, artifactDeleteButton(artifact));
                const body = document.createElement('p');
                body.className = 'note-body';
                body.textContent = artifact.payload.text || '';
                const meta = document.createElement('p');
                meta.className = 'artifact-meta';
                meta.textContent = `Citations: ${artifact.evidenceIds.join(', ')} · transcript ${artifact.sourceTranscriptSha256.slice(0, 12)}…`;
                const promote = document.createElement('div');
                promote.className = 'artifact-promote-actions';
                for (const [kind, label] of [['Decision', 'Citations → Decisions'], ['Action item', 'Citations → Actions']]) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.dataset.promoteArtifactId = artifact.id;
                    button.dataset.promoteKind = kind;
                    button.textContent = label;
                    promote.append(button);
                }
                item.append(header, body, meta, promote);
                elements.notesList.append(item);
            }
        }
        elements.answerList.replaceChildren();
        if (!answers.length) {
            const empty = document.createElement('li');
            empty.className = 'empty';
            empty.textContent = 'No reviewed answers kept for this meeting.';
            elements.answerList.append(empty);
        } else {
            for (const artifact of [...answers].reverse()) {
                const item = document.createElement('li');
                item.className = 'artifact-card answer-card';
                const header = document.createElement('div');
                header.className = 'artifact-card-header';
                const title = document.createElement('strong');
                title.textContent = artifact.payload.question || 'Transcript question';
                header.append(title, artifactDeleteButton(artifact));
                const body = document.createElement('p');
                body.className = 'note-body';
                body.textContent = artifact.payload.text || '';
                const meta = document.createElement('p');
                meta.className = 'artifact-meta';
                meta.textContent = `${artifactTime(artifact.createdAt)} · Citations: ${artifact.evidenceIds.join(', ')} · transcript ${artifact.sourceTranscriptSha256.slice(0, 12)}…`;
                item.append(header, body, meta);
                elements.answerList.append(item);
            }
        }
    }

    async function loadDerivedArtifacts() {
        if (!currentContext?.sessionId) {
            derivedArtifacts = [];
            renderDerivedArtifacts();
            return;
        }
        const response = await derivedRequest('get_derived_artifacts');
        derivedArtifacts = CaptionKeepDerivedArtifacts.normalizeCollection(response.artifacts);
        renderDerivedArtifacts();
    }

    async function deleteDerivedArtifact(artifactId) {
        const response = await derivedRequest('delete_derived_artifact', {artifactId});
        derivedArtifacts = CaptionKeepDerivedArtifacts.normalizeCollection(response.artifacts);
        renderDerivedArtifacts();
        setStatus('Derived artifact deleted. The source transcript was not changed.');
    }

    async function promoteArtifactCitations(artifactId, kind) {
        const artifact = derivedArtifacts.find(item => item.id === artifactId && item.kind === 'live-notes');
        if (!artifact) throw new Error('The reviewed notes artifact is no longer available.');
        if (artifact.sessionId !== currentContext?.sessionId) {
            throw new Error('These reviewed notes belong to a different meeting. Reopen their source meeting before promoting citations.');
        }
        if (!board.MARKER_KINDS.includes(kind)) throw new Error('Choose a supported Evidence marker type.');
        const transcript = currentContext?.transcriptArray || [];
        const pendingMarkers = [];
        for (const evidenceId of artifact.evidenceIds) {
            const captionIndex = Number.parseInt(evidenceId.slice(1), 10) - 1;
            const caption = transcript[captionIndex];
            if (!caption) throw new Error(`${evidenceId} is no longer available. Review updated notes before promoting that citation.`);
            const original = artifact.payload.sourceEvidence?.find(item => item.evidenceId === evidenceId);
            if (original && (original.caption.key !== caption.key || original.caption.Text !== caption.Text)) {
                throw new Error(`${evidenceId} changed after these notes were reviewed. Review updated notes before promoting that citation.`);
            }
            const alreadyMarked = allMarkers.some(marker => marker.sessionId === currentContext.sessionId
                && marker.kind === kind && marker.sourceKey === caption.key);
            if (alreadyMarked) continue;
            pendingMarkers.push(board.createMarker(currentContext, {
                captionIndex,
                kind,
                note:`Promoted from reviewed Live Notes ${artifact.id}.`
            }));
        }
        const added = pendingMarkers.length;
        if (!added) throw new Error(`Every cited caption is already marked as ${kind.toLowerCase()}.`);
        allMarkers.push(...pendingMarkers);
        selectedSessionId = currentContext.sessionId;
        await saveMarkers();
        renderMarkers();
        setStatus(`${added} cited caption${added === 1 ? '' : 's'} promoted to ${kind.toLowerCase()} evidence.`);
    }

    async function saveReviewedNotes() {
        const clickedSessionId = currentContext?.sessionId;
        const text = elements.notesDraft.value.trim();
        await refreshEnterprisePolicy();
        if (currentContext?.sessionId !== clickedSessionId) throw new Error('The active meeting changed. Return to the original meeting before keeping these notes.');
        if (enterprisePolicy.disableSessionHistory) throw new Error('Local meeting retention is disabled by your organization.');
        const sourceContext = await reviewedSource('live_notes');
        const transcript = sourceContext?.transcriptArray || [];
        if (!transcript.length) throw new Error('Capture at least one caption before keeping notes.');
        const evidenceIds = CaptionKeepDerivedArtifacts.assertCitations(text, transcript.length);
        const sourceIndexes = evidenceIds.map(id => Number.parseInt(id.slice(1), 10) - 1);
        const sourceTranscriptSha256 = await sha256Hex(board.canonicalTranscript(sourceContext));
        const templateKey = `handoff_template_${encodeURIComponent(sourceContext.sessionId)}`;
        const handoffTemplate = (await chrome.storage.session.get(templateKey))[templateKey];
        const handoffCreatedAt = Date.parse(handoffTemplate?.createdAt || '');
        const templateSnapshot = handoffTemplate?.sourceTranscriptSha256 === sourceTranscriptSha256
            && handoffTemplate.sessionId === sourceContext.sessionId
            && Number.isFinite(handoffCreatedAt) && Date.now() - handoffCreatedAt >= 0
            && Date.now() - handoffCreatedAt < 60 * 60 * 1000 ? handoffTemplate.templateSnapshot : null;
        const artifact = CaptionKeepDerivedArtifacts.normalize({
            kind:'live-notes',
            sessionId:sourceContext.sessionId,
            sourceTranscriptSha256,
            sourceCaptionCount:transcript.length,
            sourceRevision:`${transcript.length}:${transcript.at(-1)?.key || ''}`,
            sourceKeys:sourceIndexes.map(index => transcript[index]?.key).filter(Boolean),
            evidenceIds,
            createdBy:'user',
            generator:'reviewed-live-notes-v1',
            templateId:templateSnapshot?.id || '',
            templateVersion:templateSnapshot ? (templateSnapshot.state === 'draft' ? `draft based on v${templateSnapshot.basedOnVersion}` : String(templateSnapshot.version)) : '',
            status:'user-confirmed',
            payload:{text, sourceEvidence:sourceIndexes.map(index => ({evidenceId:board.evidenceId(index), caption:transcript[index]})),
                ...(templateSnapshot ? {reviewedHandoffTemplate:templateSnapshot} : {})}
        });
        if (currentContext?.sessionId !== sourceContext.sessionId) throw new Error('The active meeting changed. Return to the original meeting before keeping these notes.');
        const response = await derivedRequest('save_derived_artifact', {artifact, sessionId:sourceContext.sessionId});
        if (currentContext?.sessionId !== sourceContext.sessionId) {setStatus('Notes were kept for the previous meeting.'); return;}
        derivedArtifacts = CaptionKeepDerivedArtifacts.normalizeCollection(response.artifacts);
        elements.notesDraft.value = '';
        renderDerivedArtifacts();
        setStatus(`Reviewed notes kept with ${evidenceIds.length} source citation${evidenceIds.length === 1 ? '' : 's'}.`);
    }

    async function saveReviewedAnswer() {
        const clickedSessionId = currentContext?.sessionId;
        const question = board.cleanInline(elements.askQuestion.value);
        const text = elements.answerDraft.value.trim();
        await refreshEnterprisePolicy();
        if (currentContext?.sessionId !== clickedSessionId) throw new Error('The active meeting changed. Return to the original meeting before keeping this answer.');
        if (enterprisePolicy.disableSessionHistory) throw new Error('Local meeting retention is disabled by your organization.');
        if (!question) throw new Error('Enter the question this answer responds to.');
        const sourceContext = await reviewedSource('transcript_qa', question);
        const transcript = sourceContext?.transcriptArray || [];
        if (!transcript.length) throw new Error('Capture at least one caption before keeping an answer.');
        const notEstablished = text === 'The transcript does not establish an answer.';
        const evidenceIds = notEstablished ? [] : CaptionKeepDerivedArtifacts.assertCitations(text, transcript.length);
        const sourceIndexes = evidenceIds.map(id => Number.parseInt(id.slice(1), 10) - 1);
        const artifact = CaptionKeepDerivedArtifacts.normalize({
            kind:'answer',
            sessionId:sourceContext.sessionId,
            sourceTranscriptSha256:await sha256Hex(board.canonicalTranscript(sourceContext)),
            sourceCaptionCount:transcript.length,
            sourceRevision:`${transcript.length}:${transcript.at(-1)?.key || ''}`,
            sourceKeys:sourceIndexes.map(index => transcript[index]?.key).filter(Boolean),
            evidenceIds,
            createdBy:'user',
            generator:'reviewed-transcript-answer-v1',
            status:'user-confirmed',
            payload:{question, text, notEstablished, sourceEvidence:sourceIndexes.map(index => ({evidenceId:board.evidenceId(index), caption:transcript[index]}))}
        });
        if (currentContext?.sessionId !== sourceContext.sessionId) throw new Error('The active meeting changed. Return to the original meeting before keeping this answer.');
        const response = await derivedRequest('save_derived_artifact', {artifact, sessionId:sourceContext.sessionId});
        if (currentContext?.sessionId !== sourceContext.sessionId) {setStatus('The answer was kept for the previous meeting.'); return;}
        derivedArtifacts = CaptionKeepDerivedArtifacts.normalizeCollection(response.artifacts);
        elements.answerDraft.value = '';
        renderDerivedArtifacts();
        setStatus(`Reviewed answer kept with ${evidenceIds.length} source citation${evidenceIds.length === 1 ? '' : 's'}.`);
    }

    async function openTranscriptHandoff(mode, question = '', template = null) {
        const sourceContext = currentContext ? structuredClone(currentContext) : null;
        await refreshEnterprisePolicy();
        if (currentContext?.sessionId !== sourceContext?.sessionId) throw new Error('The active meeting changed. Return to the original meeting before preparing its handoff.');
        if (enterprisePolicy.disableAiHandoff) throw new Error('AI handoff is disabled by your organization.');
        const transcript = sourceContext?.transcriptArray || [];
        if (!transcript.length) throw new Error('Capture at least one caption first.');
        if (mode === 'transcript_qa' && !board.cleanInline(question)) throw new Error('Enter a question before preparing its handoff.');
        const settings = await chrome.storage.sync.get('aiSummaryProviders');
        const providers = Array.isArray(settings.aiSummaryProviders) && settings.aiSummaryProviders.length
            ? settings.aiSummaryProviders
            : ['chatgpt', 'claude', 'copilot', 'gemini'];
        const handoffId = `handoff_${crypto.randomUUID()}`;
        await chrome.storage.local.set({
            [handoffId]: {
                mode,
                taskId:mode === 'live_notes' ? 'live_notes' : 'transcript_qa',
                question:board.cleanInline(question),
                evidence:transcript.map((caption, index) => ({
                    evidenceId:board.evidenceId(index),
                    speaker:caption.Name || 'Unknown speaker',
                    time:caption.Time || 'time unavailable',
                    text:caption.Text || ''
                })),
                transcript:transcript.map(caption => ({Time:caption.Time, Name:caption.Name, Text:caption.Text})),
                providers,
                meetingTitle:sourceContext.meetingTitle || 'Meeting',
                providerLabel:sourceContext.providerLabel || 'Meeting platform',
                sessionId:sourceContext.sessionId,
                sourceTranscriptSha256:await sha256Hex(board.canonicalTranscript(sourceContext)),
                selectedTemplate:template ? CaptionKeepPromptTemplates.snapshot(template) : null,
                warnings:['Transcript snapshot only. Nothing has been sent.', `Snapshot contains ${transcript.length} captions.`]
            }
        });
        if (currentContext?.sessionId !== sourceContext.sessionId) {
            await chrome.storage.local.remove(handoffId);
            throw new Error('The active meeting changed. Return to the original meeting before preparing its handoff.');
        }
        try {
            if (chrome.storage.session) await chrome.storage.session.set({[reviewSnapshotKey(mode, sourceContext.sessionId)]:{
                context:sourceContext, question:board.cleanInline(question), createdAt:Date.now()
            }});
            await chrome.tabs.create({url:chrome.runtime.getURL(`handoff.html?id=${encodeURIComponent(handoffId)}`)});
        } catch (error) {
            await chrome.storage.local.remove(handoffId);
            throw error;
        }
        setStatus(mode === 'live_notes' ? 'Cited notes handoff opened for review.' : 'Transcript question opened for review.');
    }

    function safeExportTitle() {
        return board.cleanInline(selectedContext()?.meetingTitle, 'meeting')
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
            .slice(0, 80);
    }

    async function saveTextFile(text, type, suffix) {
        const url = URL.createObjectURL(new Blob([text], {type}));
        try {
            await chrome.downloads.download({url, filename: `${safeExportTitle()}-${suffix}`, saveAs: true});
        } finally {
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        }
    }

    async function copyBoard() {
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableClipboard) throw new Error('Clipboard copy is disabled by your organization.');
        const markdown = boardMarkdown();
        const output = enterprisePolicy.forceScrubbedExport
            ? CaptionKeepPrivacyScrubber.scrub(markdown, scrubOptions).text
            : markdown;
        await navigator.clipboard.writeText(output);
        setStatus('Evidence brief copied.');
    }

    async function downloadBoard() {
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableFileExport) throw new Error('File export is disabled by your organization.');
        const markdown = boardMarkdown();
        const output = enterprisePolicy.forceScrubbedExport
            ? CaptionKeepPrivacyScrubber.scrub(markdown, scrubOptions).text
            : markdown;
        await saveTextFile(output, 'text/markdown;charset=utf-8', 'evidence-board.md');
        setStatus('Evidence brief ready to save.');
    }

    async function emailBoard() {
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableEvidenceEmail) {
            setStatus('Evidence email is disabled by your organization.');
            return;
        }
        const rawSubject = `Evidence brief: ${selectedContext()?.meetingTitle || 'Meeting'}`;
        const rawMarkdown = boardMarkdown();
        const subject = enterprisePolicy.forceScrubbedExport
            ? CaptionKeepPrivacyScrubber.scrub(rawSubject, scrubOptions).text
            : rawSubject;
        const markdown = enterprisePolicy.forceScrubbedExport
            ? CaptionKeepPrivacyScrubber.scrub(rawMarkdown, scrubOptions).text
            : rawMarkdown;
        const body = markdown.length > 12000
            ? `${markdown.slice(0, 12000)}\n\n[Brief shortened for email. Attach the saved Markdown for the complete evidence board.]`
            : markdown;
        const destination = CaptionKeepWebMail.compose(enterprisePolicy.webmailDestination || 'outlook_work', {subject, body});
        await chrome.tabs.create({url:destination.url});
        setStatus(`Follow-up opened in ${destination.name}. Review the brief and choose recipients before sending.`);
    }

    async function downloadBundle() {
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableFileExport) throw new Error('File export is disabled by your organization.');
        const context = selectedContext();
        const transcriptSha256 = context?.transcriptArray?.length
            ? await sha256Hex(board.canonicalTranscript(context))
            : '';
        const bundle = board.createEvidenceBundle(selectedMarkers(), context, {
            generatedAt: new Date().toISOString(),
            transcriptSha256
        });
        const output = enterprisePolicy.forceScrubbedExport
            ? CaptionKeepPrivacyScrubber.scrubEvidenceBundle(bundle, scrubOptions).value
            : bundle;
        await saveTextFile(`${JSON.stringify(output, null, 2)}\n`, 'application/json;charset=utf-8', 'provenance.json');
        setStatus(bundle.source.transcriptIncluded
            ? `Provenance saved with transcript fingerprint ${transcriptSha256.slice(0, 12)}…`
            : 'Marker provenance saved. Reopen the source meeting to include its transcript fingerprint.');
    }

    async function openTranscript() {
        const tab = await activeMeetingTab();
        if (!tab?.id) throw new Error('No active meeting tab is available.');
        await chrome.tabs.sendMessage(tab.id, {message: 'get_captions_for_viewing'});
    }

    async function captureMoment() {
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableSessionHistory) throw new Error('Local meeting retention is disabled by your organization.');
        if (enterprisePolicy.forceScrubbedExport || enterprisePolicy.disableFileExport) {
            throw new Error('Capture Moment is unavailable under your organization’s export/privacy policy.');
        }
        const tab = await activeMeetingTab();
        if (!tab?.id || tab.id !== currentContext?.tabId || !currentContext?.sessionId) {
            throw new Error('Return to the active captured meeting before creating a moment.');
        }
        const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, {format: 'png'});
        const [after] = await chrome.tabs.query({active: true, currentWindow: true});
        if (after?.id !== tab.id || after?.url !== tab.url || after?.pendingUrl) {
            throw new Error('The active tab changed or navigated. The moment was discarded.');
        }
        if (screenshot.length > 6000000) throw new Error('This moment is too large. Reduce the browser window and try again.');
        const transcript = currentContext.transcriptArray || [];
        const transcriptSha256 = await sha256Hex(board.canonicalTranscript(currentContext));
        const sourceKeys = transcript.slice(-12).map(caption => caption.key).filter(Boolean);
        const evidenceIds = selectedMarkers().slice(-12).map(marker => marker.evidenceId).filter(Boolean);
        const pendingKey = `extras_preview_${crypto.randomUUID()}`;
        await chrome.storage.session.set({[pendingKey]: {
            artifactId: `moment-${crypto.randomUUID()}`,
            sessionId: currentContext.sessionId,
            screenshot,
            sourceTranscriptSha256: transcriptSha256,
            sourceCaptionCount: transcript.length,
            sourceRevision: `${transcript.length}:${transcript.at(-1)?.key || ''}`,
            sourceKeys,
            evidenceIds,
            capturedAt: new Date().toISOString()
        }});
        const query = new URLSearchParams({tab: String(tab.id), pending: pendingKey, mode: 'moment'});
        try {
            await chrome.tabs.create({url: chrome.runtime.getURL(`extras.html?${query}`)});
            setStatus('Moment captured locally. Review it before keeping it.');
        } catch (error) {
            await chrome.storage.session.remove(pendingKey);
            throw error;
        }
    }

    for (const kind of board.MARKER_KINDS) {
        const option = document.createElement('option');
        option.value = kind;
        option.textContent = kind;
        elements.markerKind.append(option);
    }

    for (const [taskId, task] of Object.entries(CaptionKeepAiTasks.TASKS)) {
        const option = document.createElement('option');
        option.value = taskId;
        option.textContent = task.label;
        elements.onTheFlyTask.append(option);
    }

    elements.markLatest.addEventListener('click', () => void markLatest());
    elements.closePanel.addEventListener('click', () => void closePanel().catch(error => setStatus(error.message)));
    elements.copyBoard.addEventListener('click', () => void copyBoard().catch(error => setStatus(error.message)));
    elements.downloadBoard.addEventListener('click', () => void downloadBoard().catch(error => setStatus(error.message)));
    elements.emailBoard.addEventListener('click', () => void emailBoard().catch(error => setStatus(error.message)));
    elements.downloadBundle.addEventListener('click', () => void downloadBundle().catch(error => setStatus(error.message)));
    elements.openTranscript.addEventListener('click', () => void openTranscript().catch(error => setStatus(error.message)));
    elements.captureMoment.addEventListener('click', () => void captureMoment().catch(error => setStatus(error.message)));
    elements.captureMomentSecondary.addEventListener('click', () => void captureMoment().catch(error => setStatus(error.message)));
    elements.generateNotes.addEventListener('click', () => void openTranscriptHandoff('live_notes').catch(error => setStatus(error.message)));
    elements.workspaceTemplateSelect.addEventListener('change', showWorkspaceTemplate);
    elements.workspaceTemplateUse.addEventListener('click', () => void openTranscriptHandoff('live_notes', '', selectedWorkspaceTemplate()).catch(error => setStatus(error.message)));
    elements.saveNotes.addEventListener('click', () => void saveReviewedNotes().catch(error => setStatus(error.message)));
    elements.clearNotes.addEventListener('click', () => {
        elements.notesDraft.value = '';
        if (chrome.storage.session && currentContext?.sessionId) void chrome.storage.session.remove([
            reviewSnapshotKey('live_notes', currentContext.sessionId), `handoff_template_${encodeURIComponent(currentContext.sessionId)}`
        ]).catch(error => setStatus(error.message));
        setStatus('Notes draft cleared. Saved notes were not changed.');
    });
    elements.rollingNotesToggle.addEventListener('click', () => void toggleRollingNotes().catch(error => {
        elements.rollingNotesStatus.textContent = error.message;
    }));
    elements.rollingNotesUpdate.addEventListener('click', () => void updateRollingNotes({force:true}).catch(error => {
        elements.rollingNotesStatus.textContent = error.message;
    }));
    elements.rollingNotesInterval.addEventListener('change', () => void (async () => {
        if (!rollingNotesState) return;
        rollingNotesState = CaptionKeepRollingNotes.normalizeState({
            ...rollingNotesState,
            intervalMs:Number(elements.rollingNotesInterval.value)
        }, currentContext?.sessionId);
        await saveRollingNotesState();
        renderRollingNotes();
    })().catch(error => { elements.rollingNotesStatus.textContent = error.message; }));
    elements.rollingNotesReview.addEventListener('click', () => {
        if (!rollingNotesState?.draft) return;
        elements.notesDraft.value = rollingNotesState.draft;
        if (chrome.storage.session && currentContext?.sessionId) void chrome.storage.session.set({[reviewSnapshotKey('live_notes', currentContext.sessionId)]:{
            context:structuredClone(currentContext), question:'', createdAt:Date.now()
        }}).catch(error => setStatus(error.message));
        elements.notesDraft.focus();
        setStatus('Rolling notes copied into the reviewed draft. Edit and keep only after checking the citations.');
    });
    elements.prepareQuestion.addEventListener('click', () => void openTranscriptHandoff('transcript_qa', elements.askQuestion.value)
        .catch(error => setStatus(error.message)));
    elements.saveAnswer.addEventListener('click', () => void saveReviewedAnswer().catch(error => setStatus(error.message)));
    document.getElementById('answer-not-established').addEventListener('click', () => {
        elements.answerDraft.value = 'The transcript does not establish an answer.';
        elements.answerDraft.focus();
        setStatus('No-answer draft selected. Keep it only after checking that this transcript does not answer the question.');
    });
    elements.clearAnswer.addEventListener('click', () => {
        elements.answerDraft.value = '';
        if (chrome.storage.session && currentContext?.sessionId) void chrome.storage.session.remove(reviewSnapshotKey('transcript_qa', currentContext.sessionId)).catch(error => setStatus(error.message));
        setStatus('Answer draft cleared. Saved answers were not changed.');
    });
    elements.momentList.addEventListener('click', event => {
        const button = event.target.closest('button[data-artifact-id]');
        if (button) void deleteDerivedArtifact(button.dataset.artifactId).catch(error => setStatus(error.message));
        const exportButton = event.target.closest('button[data-export-moment-id]');
        if (exportButton) void (async () => {
            await refreshEnterprisePolicy();
            if (enterprisePolicy.disableFileExport || enterprisePolicy.forceScrubbedExport) throw new Error('Moment image export is unavailable under your organization’s export/privacy policy.');
            const artifact = derivedArtifacts.find(item => item.kind === 'moment' && item.id === exportButton.dataset.exportMomentId);
            if (!artifact?.payload.screenshot) throw new Error('The reviewed Moment image is no longer available.');
            await chrome.downloads.download({url:artifact.payload.screenshot, filename:`${safeExportTitle()}-moment.png`, saveAs:true});
            setStatus('Reviewed Moment PNG export started.');
        })().catch(error => setStatus(error.message));
    });
    elements.notesList.addEventListener('click', event => {
        const button = event.target.closest('button[data-artifact-id]');
        if (button) void deleteDerivedArtifact(button.dataset.artifactId).catch(error => setStatus(error.message));
        const promote = event.target.closest('button[data-promote-artifact-id]');
        if (promote) void promoteArtifactCitations(promote.dataset.promoteArtifactId, promote.dataset.promoteKind)
            .catch(error => setStatus(error.message));
    });
    elements.answerList.addEventListener('click', event => {
        const button = event.target.closest('button[data-artifact-id]');
        if (button) void deleteDerivedArtifact(button.dataset.artifactId).catch(error => setStatus(error.message));
    });
    elements.actionReceiptList.addEventListener('click', event => {
        const button = event.target.closest('button[data-artifact-id]');
        if (button) void deleteDerivedArtifact(button.dataset.artifactId).catch(error => setStatus(error.message));
    });
    elements.clearOnTheFly.addEventListener('click', () => clearOnTheFly({restoreFocus:true}));
    elements.reviewOnTheFly.addEventListener('click', openOnTheFlyDialog);
    elements.onTheFlyBar.addEventListener('click', event => {
        const quickTask = event.target.closest('button[data-quick-task]')?.dataset.quickTask;
        if (!quickTask) return;
        const action = quickTask === 'email' ? openOnTheFlyEmail() : runQuickAiTask(quickTask);
        void action.catch(error => setStatus(error.message));
    });
    elements.cancelOnTheFly.addEventListener('click', () => elements.onTheFlyDialog.close());
    elements.prepareOnTheFly.addEventListener('click', () => void prepareOnTheFly().catch(error => setStatus(error.message)));
    elements.enableLiveCaptions.addEventListener('click', () => void runMeetingControl('enable_live_captions', 'Requesting live captions…').catch(error => setStatus(error.message)));
    elements.openAttendeePanel.addEventListener('click', () => {
        const open = currentContext?.meetingControls?.attendeePanelOpen === true;
        void runMeetingControl(open ? 'close_attendee_panel' : 'open_attendee_panel',
            open ? 'Closing the attendee panel…' : 'Opening the attendee panel…').catch(error => setStatus(error.message));
    });
    elements.requestTeamsTranscription.addEventListener('click', () => void runMeetingControl('request_teams_transcription', 'Requesting the tenant transcript…').catch(error => setStatus(error.message)));
    elements.markerList.addEventListener('click', event => {
        const button = event.target.closest('button[data-marker-id]');
        if (button) void deleteMarker(button.dataset.markerId);
    });
    elements.markerSession.addEventListener('change', event => {
        selectedSessionId = event.target.value;
        renderMarkers();
    });
    elements.transcriptList.addEventListener('click', event => {
        const choose = event.target.closest('.caption-select');
        const selection = window.getSelection();
        if (!choose || (selection?.toString() && choose.contains(selection.anchorNode))) return;
        const index = Number.parseInt(choose.dataset.captionIndex, 10);
        if (index === selectedCaptionIndex) clearOnTheFly({restoreFocus:true});
        else selectForOnTheFly(index);
    });
    elements.transcriptList.addEventListener('keydown', event => {
        const choose = event.target.closest('.caption-select');
        if (!choose || !['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
        event.preventDefault();
        setFollowLatest(false);
        const buttons = [...elements.transcriptList.querySelectorAll('.caption-select')];
        const position = buttons.indexOf(choose);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
            : Math.max(0, Math.min(buttons.length - 1, position + (event.key === 'ArrowDown' ? 1 : -1)));
        for (const button of buttons) button.tabIndex = -1;
        buttons[next].tabIndex = 0;
        buttons[next].focus({preventScroll:true});
        buttons[next].scrollIntoView({block:'nearest'});
    });
    elements.transcriptList.addEventListener('focusin', event => {
        if (event.target.closest('.caption-select')) setFollowLatest(false);
    });
    elements.transcriptList.addEventListener('mouseup', event => {
        const textNode = event.target.closest('.caption-text');
        if (!textNode) return;
        const selection = window.getSelection();
        const text = board.cleanInline(selection?.toString());
        if (!text || !selection?.rangeCount || !textNode.contains(selection.anchorNode) || !textNode.contains(selection.focusNode)) return;
        selectForOnTheFly(Number.parseInt(textNode.dataset.captionIndex, 10), text);
    });
    document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        const text = board.cleanInline(selection?.toString());
        const textNode = selection?.anchorNode?.parentElement?.closest('.caption-text');
        if (!text || !textNode || !elements.transcriptList.contains(textNode) || !textNode.contains(selection.focusNode)) return;
        selectForOnTheFly(Number.parseInt(textNode.dataset.captionIndex, 10), text);
    });
    elements.followLatest.addEventListener('click', () => {
        const next = !followLatest;
        // Explicit resume leaves reading focus behind, including keyboard/programmatic activation.
        elements.followLatest.focus({preventScroll:true});
        if (next) clearOnTheFly();
        setFollowLatest(next);
        if (next) renderTranscript();
    });
    const pauseFollowing = () => {if (Date.now() >= autoScrollUntil && followLatest) setFollowLatest(false);};
    window.addEventListener('wheel', event => {if (event.deltaY < 0) setFollowLatest(false);}, {passive:true});
    window.addEventListener('scroll', () => {
        if (Date.now() < autoScrollUntil) return;
        const bottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
        if (bottom > 100) pauseFollowing();
    }, {passive:true});
    elements.transcriptSearch.addEventListener('input', () => {clearOnTheFly(); setFollowLatest(false); conversationWindowStart = 0; renderTranscript();});
    elements.transcriptTab.addEventListener('click', () => switchView('transcript'));
    elements.momentsTab.addEventListener('click', () => switchView('moments'));
    elements.notesTab.addEventListener('click', () => switchView('notes'));
    elements.evidenceTab.addEventListener('click', () => switchView('evidence'));
    elements.askTab.addEventListener('click', () => switchView('ask'));
    elements.templatesTab.addEventListener('click', () => switchView('templates'));
    document.querySelector('.workspace-tabs').addEventListener('keydown', event => {
        const tabs = [...document.querySelectorAll('.workspace-tabs [role="tab"]')];
        const currentIndex = tabs.indexOf(document.activeElement);
        if (currentIndex < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
            : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[nextIndex].click();
        tabs[nextIndex].focus();
        tabs[nextIndex].scrollIntoView({block:'nearest', inline:'nearest'});
    });
    chrome.tabs.onActivated.addListener(() => void pollContext());
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
        if (changeInfo.status === 'complete') void pollContext();
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes[CaptionKeepPromptTemplates.STORAGE_KEY]) void loadWorkspaceTemplates().catch(error => setStatus(error.message));
        if (areaName === 'local' && changes[STORAGE_KEY]) {
            allMarkers = Array.isArray(changes[STORAGE_KEY].newValue) ? changes[STORAGE_KEY].newValue : [];
            persistedMarkers = new Map(allMarkers.map(marker => [marker.id, JSON.stringify(marker)]));
            renderMarkers();
        }
        if (areaName === 'local' && currentContext?.sessionId
            && changes[CaptionKeepDerivedArtifacts.storageKey(currentContext.sessionId)]) {
            void loadDerivedArtifacts().catch(error => setStatus(error.message));
            return;
        }
        if (areaName !== 'managed') return;
        void (async () => {
            await refreshEnterprisePolicy();
            await saveRollingNotesState();
            renderMarkers();
        })().catch(error => setStatus(error.message));
    });

    void (async () => {
        await refreshEnterprisePolicy();
        await loadWorkspaceTemplates();
        await loadMarkers();
        await pollContext();
    })().catch(error => setStatus(error.message));
    setInterval(() => void pollContext(), POLL_INTERVAL_MS);
})();
