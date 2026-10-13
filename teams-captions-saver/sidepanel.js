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
        transcriptView: document.getElementById('transcript-view'),
        momentsView: document.getElementById('moments-view'),
        notesView: document.getElementById('notes-view'),
        evidenceView: document.getElementById('evidence-view'),
        askView: document.getElementById('ask-view'),
        transcriptCount: document.getElementById('transcript-count'),
        transcriptSearch: document.getElementById('transcript-search'),
        transcriptList: document.getElementById('transcript-list'),
        markerKind: document.getElementById('marker-kind'),
        markerNote: document.getElementById('marker-note'),
        markLatest: document.getElementById('mark-latest'),
        boardStatus: document.getElementById('board-status'),
        markerCount: document.getElementById('marker-count'),
        markerSession: document.getElementById('marker-session'),
        markerList: document.getElementById('marker-list'),
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
    let selectedSessionId = '';
    let polling = false;
    let transcriptSignature = '';
    let enterprisePolicy = {};
    let enterpriseLocked = new Set();
    let scrubOptions = {};
    let onTheFlyEvidence = null;
    let derivedArtifacts = [];

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
        elements.boardStatus.textContent = message;
    }

    function switchView(view) {
        const views = {
            transcript: [elements.transcriptTab, elements.transcriptView],
            moments: [elements.momentsTab, elements.momentsView],
            notes: [elements.notesTab, elements.notesView],
            evidence: [elements.evidenceTab, elements.evidenceView],
            ask: [elements.askTab, elements.askView]
        };
        for (const [name, [tab, panel]] of Object.entries(views)) {
            const active = name === view;
            panel.hidden = !active;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
        }
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
        elements.openAttendeePanel.disabled = !inMeeting || controls.attendeeAllowed === false || controls.attendees === true;
        elements.openAttendeePanel.textContent = controls.attendees ? 'Attendee capture enabled' : 'Open attendee panel';
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
        document.body.classList.toggle('capture-ready', ready);
        elements.captureState.textContent = ready ? 'Ready' : 'Not ready';
        elements.captureState.title = rawCaptureState;
        elements.meetingTitle.textContent = currentContext?.meetingTitle || 'Open Teams, Meet, or Zoom Web.';
        elements.meetingProvider.textContent = currentContext?.providerLabel
            ? `${currentContext.providerLabel} · ${rawCaptureState}`
            : '';
        renderMeetingSourceControls();
        elements.latestCaption.textContent = latest?.Text || 'Waiting for a stable captured caption…';
        elements.latestMeta.textContent = latest
            ? `${board.evidenceId(transcript.length - 1)} · ${latest.Time || 'time unavailable'} · ${latest.Name || 'Unknown speaker'}`
            : '';
        elements.markLatest.disabled = !latest;
        elements.captureMoment.disabled = !currentContext?.isInMeeting;
        elements.captureMomentSecondary.disabled = !currentContext?.isInMeeting;
        elements.generateNotes.disabled = !transcript.length;
        elements.saveNotes.disabled = !transcript.length;
        elements.prepareQuestion.disabled = !transcript.length;
    }

    async function runMeetingControl(message, pendingMessage) {
        const tab = await activeMeetingTab();
        if (!tab?.id) throw new Error('No active meeting tab is available.');
        const buttonByMessage = {
            enable_live_captions: elements.enableLiveCaptions,
            open_attendee_panel: elements.openAttendeePanel,
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
        const heading = document.createElement('div');
        heading.className = 'caption-heading';
        const meta = document.createElement('span');
        meta.className = 'caption-id';
        meta.textContent = `${board.evidenceId(index)} · ${caption.Time || 'time unavailable'} · ${caption.Name || 'Unknown speaker'}`;
        const mark = document.createElement('button');
        mark.type = 'button';
        mark.className = 'caption-mark';
        mark.dataset.captionIndex = String(index);
        mark.textContent = 'Mark';
        const onTheFly = document.createElement('button');
        onTheFly.type = 'button';
        onTheFly.className = 'caption-research';
        onTheFly.dataset.onTheFlyIndex = String(index);
        onTheFly.textContent = 'On the Fly';
        const actions = document.createElement('div');
        actions.className = 'caption-row-actions';
        actions.append(mark, onTheFly);
        heading.append(meta, actions);
        const text = document.createElement('p');
        text.className = 'caption-text';
        text.dataset.captionIndex = String(index);
        text.textContent = caption.Text;
        item.append(heading, text);
        return item;
    }

    function selectForOnTheFly(captionIndex, selectedText = '') {
        const caption = currentContext?.transcriptArray?.[captionIndex];
        const text = board.cleanInline(selectedText || caption?.Text);
        if (!caption || !text) return;
        onTheFlyEvidence = {
            evidenceId: board.evidenceId(captionIndex),
            speaker: caption.Name || 'Unknown speaker',
            time: caption.Time || 'time unavailable',
            text
        };
        elements.onTheFlyLabel.textContent = `${onTheFlyEvidence.evidenceId} · ${onTheFlyEvidence.speaker}`;
        elements.onTheFlyPreview.textContent = text;
        elements.onTheFlyBar.hidden = false;
        setStatus('On the Fly selection is local. Choose a task when ready.');
    }

    function clearOnTheFly() {
        onTheFlyEvidence = null;
        elements.onTheFlyBar.hidden = true;
        elements.onTheFlyQuestion.value = '';
    }

    function openOnTheFlyDialog() {
        if (!onTheFlyEvidence) return;
        elements.onTheFlyEvidence.textContent = `${onTheFlyEvidence.evidenceId} · ${onTheFlyEvidence.time} · ${onTheFlyEvidence.speaker}\n“${onTheFlyEvidence.text}”`;
        elements.onTheFlyDialog.showModal();
    }

    function buildOnTheFlyPrompt(taskId, question = '') {
        const prompt = CaptionKeepAiTasks.buildPrompt({
            taskId,
            question,
            meetingTitle: currentContext?.meetingTitle || 'Meeting',
            providerLabel: currentContext?.providerLabel || 'Meeting platform',
            evidence: [onTheFlyEvidence]
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
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableAiHandoff) throw new Error('AI handoff is disabled by your organization.');
        if (enterprisePolicy.disableClipboard) throw new Error('Clipboard actions are disabled by your organization.');
        if (!onTheFlyEvidence) throw new Error('Select meeting words or choose a caption first.');
        const destination = preferredAiDestination();
        const prompt = buildOnTheFlyPrompt(taskId);
        await navigator.clipboard.writeText(prompt);
        await chrome.tabs.create({url:destination.url});
        clearOnTheFly();
        setStatus(`${CaptionKeepAiTasks.task(taskId).label} copied and ${destination.name} opened. Paste, review, and send when ready.`);
    }

    async function openOnTheFlyEmail() {
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableEvidenceEmail) throw new Error('Evidence email is disabled by your organization.');
        if (!onTheFlyEvidence) throw new Error('Select meeting words or choose a caption first.');
        const rawSubject = `Follow-up: ${currentContext?.meetingTitle || 'Meeting'}`;
        const rawBody = [
            'Follow-up from the meeting:',
            '',
            `[${onTheFlyEvidence.evidenceId}] ${onTheFlyEvidence.time} — ${onTheFlyEvidence.speaker}`,
            onTheFlyEvidence.text,
            '',
            'Review this draft, add recipients, and edit before sending.'
        ].join('\n');
        const scrub = enterprisePolicy.privacyScrubberEnabled !== false || enterprisePolicy.forceScrubbedExport;
        const subject = scrub ? CaptionKeepPrivacyScrubber.scrub(rawSubject, scrubOptions).text : rawSubject;
        const body = scrub ? CaptionKeepPrivacyScrubber.scrub(rawBody, scrubOptions).text : rawBody;
        const destination = CaptionKeepWebMail.compose(enterprisePolicy.webmailDestination || 'outlook_work', {subject, body});
        await chrome.tabs.create({url:destination.url});
        clearOnTheFly();
        setStatus(`Draft opened in ${destination.name}. Add recipients, review, and send when ready.`);
    }

    async function prepareOnTheFly() {
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableAiHandoff) throw new Error('AI handoff is disabled by your organization.');
        if (!onTheFlyEvidence) throw new Error('Select meeting words or choose a caption first.');
        const settings = await chrome.storage.sync.get('aiSummaryProviders');
        const providers = Array.isArray(settings.aiSummaryProviders) && settings.aiSummaryProviders.length
            ? settings.aiSummaryProviders
            : ['chatgpt', 'claude', 'copilot', 'gemini'];
        const handoffId = `handoff_${crypto.randomUUID()}`;
        const taskId = elements.onTheFlyTask.value;
        await chrome.storage.local.set({
            [handoffId]: {
                mode: 'on_the_fly',
                taskId,
                question: board.cleanInline(elements.onTheFlyQuestion.value),
                evidence: [onTheFlyEvidence],
                transcript: [{
                    Time: onTheFlyEvidence.time,
                    Name: onTheFlyEvidence.speaker,
                    Text: onTheFlyEvidence.text
                }],
                providers,
                meetingTitle: currentContext?.meetingTitle || 'Meeting',
                providerLabel: currentContext?.providerLabel || 'Meeting platform',
                sessionId: currentContext?.sessionId || '',
                warnings: ['Selected meeting text only. Nothing has been sent.']
            }
        });
        elements.onTheFlyDialog.close();
        await chrome.tabs.create({url: chrome.runtime.getURL(`handoff.html?id=${encodeURIComponent(handoffId)}`)});
        clearOnTheFly();
        setStatus('Review opened. Nothing is sent until you choose to copy it.');
    }

    function renderTranscript() {
        const transcript = currentContext?.transcriptArray || [];
        const query = board.cleanInline(elements.transcriptSearch.value).toLocaleLowerCase();
        const matches = transcript
            .map((caption, index) => ({caption, index}))
            .filter(({caption}) => !query || `${caption.Name || ''} ${caption.Text || ''}`.toLocaleLowerCase().includes(query));
        elements.transcriptCount.textContent = String(transcript.length);
        elements.transcriptList.replaceChildren();
        if (!matches.length) {
            const empty = document.createElement('li');
            empty.className = 'empty';
            empty.textContent = transcript.length ? 'No captions match.' : 'Connect to a supported meeting to see captions.';
            elements.transcriptList.append(empty);
            return;
        }
        for (const {caption, index} of matches.slice(-150).reverse()) {
            elements.transcriptList.append(captionNode(caption, index));
        }
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
        await chrome.storage.local.set({[STORAGE_KEY]: allMarkers});
    }

    async function loadMarkers() {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        allMarkers = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
        renderMarkers();
    }

    async function pollContext() {
        if (polling) return;
        polling = true;
        try {
            const next = await requestContext();
            const sessionChanged = currentContext?.sessionId !== next.sessionId;
            currentContext = next;
            if (sessionChanged) {
                selectedSessionId = next.sessionId;
                await loadDerivedArtifacts();
            }
            const reconciliation = board.reconcileMarkers(allMarkers, next);
            if (reconciliation.changed) {
                allMarkers = reconciliation.markers;
                await saveMarkers();
            }
            renderContext();
            const latest = next.transcriptArray?.at(-1);
            const nextSignature = `${next.sessionId}:${next.transcriptArray?.length || 0}:${latest?.key || ''}:${latest?.Text || ''}`;
            if (nextSignature !== transcriptSignature) {
                transcriptSignature = nextSignature;
                renderTranscript();
            }
            if (sessionChanged || reconciliation.changed) renderMarkers();
            setStatus('');
        } catch (error) {
            currentContext = null;
            derivedArtifacts = [];
            renderContext();
            renderDerivedArtifacts();
            transcriptSignature = '';
            renderTranscript();
            renderMarkers();
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
        const transcript = currentContext?.transcriptArray || [];
        await markCaption(transcript.length - 1);
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
                    image.alt = artifact.payload.note || 'Reviewed meeting Moment';
                    item.append(image);
                }
                const content = document.createElement('div');
                const header = document.createElement('div');
                header.className = 'artifact-card-header';
                const title = document.createElement('strong');
                title.textContent = artifact.payload.note || 'Meeting Moment';
                header.append(title, artifactDeleteButton(artifact));
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
        if (!board.MARKER_KINDS.includes(kind)) throw new Error('Choose a supported Evidence marker type.');
        const transcript = currentContext?.transcriptArray || [];
        let added = 0;
        for (const evidenceId of artifact.evidenceIds) {
            const captionIndex = Number.parseInt(evidenceId.slice(1), 10) - 1;
            const caption = transcript[captionIndex];
            if (!caption) continue;
            const alreadyMarked = allMarkers.some(marker => marker.sessionId === currentContext.sessionId
                && marker.kind === kind && marker.sourceKey === caption.key);
            if (alreadyMarked) continue;
            allMarkers.push(board.createMarker(currentContext, {
                captionIndex,
                kind,
                note:`Promoted from reviewed Live Notes ${artifact.id}.`
            }));
            added += 1;
        }
        if (!added) throw new Error(`Every cited caption is already marked as ${kind.toLowerCase()}.`);
        selectedSessionId = currentContext.sessionId;
        await saveMarkers();
        renderMarkers();
        setStatus(`${added} cited caption${added === 1 ? '' : 's'} promoted to ${kind.toLowerCase()} evidence.`);
    }

    async function saveReviewedNotes() {
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableSessionHistory) throw new Error('Local meeting retention is disabled by your organization.');
        const transcript = currentContext?.transcriptArray || [];
        if (!transcript.length) throw new Error('Capture at least one caption before keeping notes.');
        const text = elements.notesDraft.value.trim();
        const evidenceIds = CaptionKeepDerivedArtifacts.assertCitations(text, transcript.length);
        const sourceIndexes = evidenceIds.map(id => Number.parseInt(id.slice(1), 10) - 1);
        const artifact = CaptionKeepDerivedArtifacts.normalize({
            kind:'live-notes',
            sessionId:currentContext.sessionId,
            sourceTranscriptSha256:await sha256Hex(board.canonicalTranscript(currentContext)),
            sourceCaptionCount:transcript.length,
            sourceRevision:`${transcript.length}:${transcript.at(-1)?.key || ''}`,
            sourceKeys:sourceIndexes.map(index => transcript[index]?.key).filter(Boolean),
            evidenceIds,
            createdBy:'user',
            generator:'reviewed-live-notes-v1',
            status:'user-confirmed',
            payload:{text}
        });
        const response = await derivedRequest('save_derived_artifact', {artifact});
        derivedArtifacts = CaptionKeepDerivedArtifacts.normalizeCollection(response.artifacts);
        elements.notesDraft.value = '';
        renderDerivedArtifacts();
        setStatus(`Reviewed notes kept with ${evidenceIds.length} source citation${evidenceIds.length === 1 ? '' : 's'}.`);
    }

    async function saveReviewedAnswer() {
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableSessionHistory) throw new Error('Local meeting retention is disabled by your organization.');
        const transcript = currentContext?.transcriptArray || [];
        if (!transcript.length) throw new Error('Capture at least one caption before keeping an answer.');
        const question = board.cleanInline(elements.askQuestion.value);
        if (!question) throw new Error('Enter the question this answer responds to.');
        const text = elements.answerDraft.value.trim();
        const evidenceIds = CaptionKeepDerivedArtifacts.assertCitations(text, transcript.length);
        const sourceIndexes = evidenceIds.map(id => Number.parseInt(id.slice(1), 10) - 1);
        const artifact = CaptionKeepDerivedArtifacts.normalize({
            kind:'answer',
            sessionId:currentContext.sessionId,
            sourceTranscriptSha256:await sha256Hex(board.canonicalTranscript(currentContext)),
            sourceCaptionCount:transcript.length,
            sourceRevision:`${transcript.length}:${transcript.at(-1)?.key || ''}`,
            sourceKeys:sourceIndexes.map(index => transcript[index]?.key).filter(Boolean),
            evidenceIds,
            createdBy:'user',
            generator:'reviewed-transcript-answer-v1',
            status:'user-confirmed',
            payload:{question, text}
        });
        const response = await derivedRequest('save_derived_artifact', {artifact});
        derivedArtifacts = CaptionKeepDerivedArtifacts.normalizeCollection(response.artifacts);
        elements.answerDraft.value = '';
        renderDerivedArtifacts();
        setStatus(`Reviewed answer kept with ${evidenceIds.length} source citation${evidenceIds.length === 1 ? '' : 's'}.`);
    }

    async function openTranscriptHandoff(mode, question = '') {
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableAiHandoff) throw new Error('AI handoff is disabled by your organization.');
        const transcript = currentContext?.transcriptArray || [];
        if (!transcript.length) throw new Error('Capture at least one caption first.');
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
                meetingTitle:currentContext.meetingTitle || 'Meeting',
                providerLabel:currentContext.providerLabel || 'Meeting platform',
                sessionId:currentContext.sessionId,
                warnings:['Transcript snapshot only. Nothing has been sent.', `Snapshot contains ${transcript.length} captions.`]
            }
        });
        await chrome.tabs.create({url:chrome.runtime.getURL(`handoff.html?id=${encodeURIComponent(handoffId)}`)});
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
    elements.saveNotes.addEventListener('click', () => void saveReviewedNotes().catch(error => setStatus(error.message)));
    elements.clearNotes.addEventListener('click', () => {
        elements.notesDraft.value = '';
        setStatus('Notes draft cleared. Saved notes were not changed.');
    });
    elements.prepareQuestion.addEventListener('click', () => void openTranscriptHandoff('transcript_qa', elements.askQuestion.value)
        .catch(error => setStatus(error.message)));
    elements.saveAnswer.addEventListener('click', () => void saveReviewedAnswer().catch(error => setStatus(error.message)));
    elements.clearAnswer.addEventListener('click', () => {
        elements.answerDraft.value = '';
        setStatus('Answer draft cleared. Saved answers were not changed.');
    });
    elements.momentList.addEventListener('click', event => {
        const button = event.target.closest('button[data-artifact-id]');
        if (button) void deleteDerivedArtifact(button.dataset.artifactId).catch(error => setStatus(error.message));
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
    elements.clearOnTheFly.addEventListener('click', clearOnTheFly);
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
    elements.openAttendeePanel.addEventListener('click', () => void runMeetingControl('open_attendee_panel', 'Opening the attendee panel…').catch(error => setStatus(error.message)));
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
        const markButton = event.target.closest('button[data-caption-index]');
        if (markButton) void markCaption(Number.parseInt(markButton.dataset.captionIndex, 10));
        const onTheFlyButton = event.target.closest('button[data-on-the-fly-index]');
        if (onTheFlyButton) selectForOnTheFly(Number.parseInt(onTheFlyButton.dataset.onTheFlyIndex, 10));
    });
    elements.transcriptList.addEventListener('mouseup', event => {
        const textNode = event.target.closest('.caption-text');
        if (!textNode) return;
        const selection = window.getSelection();
        const text = board.cleanInline(selection?.toString());
        if (!text || !selection?.rangeCount || !textNode.contains(selection.anchorNode) || !textNode.contains(selection.focusNode)) return;
        selectForOnTheFly(Number.parseInt(textNode.dataset.captionIndex, 10), text);
    });
    elements.transcriptSearch.addEventListener('input', renderTranscript);
    elements.transcriptTab.addEventListener('click', () => switchView('transcript'));
    elements.momentsTab.addEventListener('click', () => switchView('moments'));
    elements.notesTab.addEventListener('click', () => switchView('notes'));
    elements.evidenceTab.addEventListener('click', () => switchView('evidence'));
    elements.askTab.addEventListener('click', () => switchView('ask'));
    chrome.tabs.onActivated.addListener(() => void pollContext());
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
        if (changeInfo.status === 'complete') void pollContext();
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && currentContext?.sessionId
            && changes[CaptionKeepDerivedArtifacts.storageKey(currentContext.sessionId)]) {
            void loadDerivedArtifacts().catch(error => setStatus(error.message));
            return;
        }
        if (areaName !== 'managed') return;
        void (async () => {
            await refreshEnterprisePolicy();
            renderMarkers();
        })().catch(error => setStatus(error.message));
    });

    void (async () => {
        await refreshEnterprisePolicy();
        await loadMarkers();
        await pollContext();
    })().catch(error => setStatus(error.message));
    setInterval(() => void pollContext(), POLL_INTERVAL_MS);
})();
