(() => {
    'use strict';

    const STORAGE_KEY = 'evidenceBoardMarkersV1';
    const ACTION_DRAFT_KEY = 'evidenceActionDraftV1';
    const MAX_MARKERS = 500;
    const POLL_INTERVAL_MS = 1200;
    const board = globalThis.CaptionKeepEvidenceBoard;
    const evidenceActions = globalThis.CaptionKeepEvidenceActions;
    const evidenceActionJobs = globalThis.CaptionKeepEvidenceActionJobs;
    const connectorActionDrafts = globalThis.CaptionKeepConnectorActionDrafts;
    const evidenceJobRepository = evidenceActionJobs.createRepository(chrome.storage.local);
    const researchCardRepository = globalThis.CaptionKeepResearchCards.createRepository(chrome.storage.local);
    const connectorActionDraftRepository = connectorActionDrafts.createRepository(chrome.storage.local);
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
        evidenceTab: document.getElementById('evidence-tab'),
        transcriptView: document.getElementById('transcript-view'),
        evidenceView: document.getElementById('evidence-view'),
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
        evidenceJobList: document.getElementById('evidence-job-list'),
        researchCardList: document.getElementById('research-card-list'),
        connectorDraftList: document.getElementById('connector-draft-list'),
        copyBoard: document.getElementById('copy-board'),
        downloadBoard: document.getElementById('download-board'),
        emailBoard: document.getElementById('email-board'),
        downloadBundle: document.getElementById('download-bundle'),
        openTranscript: document.getElementById('open-transcript'),
        selectionCount: document.getElementById('selection-count'),
        clearSelection: document.getElementById('clear-selection'),
        researchSelected: document.getElementById('research-selected'),
        prepareWorkItem: document.getElementById('prepare-work-item'),
        actionDialog: document.getElementById('evidence-action-dialog'),
        actionForm: document.getElementById('evidence-action-form'),
        actionTitle: document.getElementById('evidence-action-title'),
        actionDescription: document.getElementById('evidence-action-description'),
        actionQuestionLabel: document.getElementById('evidence-question-label'),
        actionQuestion: document.getElementById('evidence-question'),
        actionDestinationRow: document.getElementById('evidence-destination-row'),
        actionDestination: document.getElementById('evidence-destination'),
        actionSourceScopeRow: document.getElementById('evidence-source-scope-row'),
        actionSourceScope: document.getElementById('evidence-source-scope'),
        actionPrivacyMode: document.getElementById('evidence-privacy-mode'),
        actionPreview: document.getElementById('evidence-action-preview'),
        saveActionDraft: document.getElementById('save-evidence-action-draft'),
        sendAction: document.getElementById('send-evidence-action'),
        cancelAction: document.getElementById('cancel-evidence-action'),
        instantResearchBar: document.getElementById('instant-research-bar'),
        instantResearchSource: document.getElementById('instant-research-source'),
        instantResearchExcerpt: document.getElementById('instant-research-excerpt'),
        researchTextSelection: document.getElementById('research-text-selection'),
        dismissInstantResearch: document.getElementById('dismiss-instant-research'),
        liveChatDialog: document.getElementById('live-chat-dialog'),
        liveChatDraft: document.getElementById('live-chat-draft'),
        copyLiveChat: document.getElementById('copy-live-chat'),
        cancelLiveChat: document.getElementById('cancel-live-chat')
    };
    let currentContext = null;
    let allMarkers = [];
    let allEvidenceJobs = [];
    let allResearchCards = [];
    let allConnectorDrafts = [];
    let selectedSessionId = '';
    let polling = false;
    let transcriptSignature = '';
    let enterprisePolicy = {};
    let scrubOptions = {};
    const selectedCaptionIndexes = new Set();
    const selectedCaptionExcerpts = new Map();
    let pendingTextSelection = null;
    let actionDraft = null;
    let currentActionIntent = 'research_reference';

    async function refreshEnterprisePolicy() {
        const user = await chrome.storage.sync.get(['profanityFilterEnabled', 'customScrubTerms']);
        Object.assign(user, await CaptionKeepConfiguration.readAssistantUserConfig());
        const policy = CaptionKeepConfiguration.applyPolicy(user, await CaptionKeepConfiguration.readManaged());
        enterprisePolicy = policy.settings;
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
        const showEvidence = view === 'evidence';
        elements.transcriptView.hidden = showEvidence;
        elements.evidenceView.hidden = !showEvidence;
        elements.transcriptTab.classList.toggle('active', !showEvidence);
        elements.evidenceTab.classList.toggle('active', showEvidence);
        elements.transcriptTab.setAttribute('aria-selected', String(!showEvidence));
        elements.evidenceTab.setAttribute('aria-selected', String(showEvidence));
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
        for (const card of allResearchCards) {
            const sessionId = card.provenance?.meetingSessionId;
            if (sessionId && !sessions.has(sessionId)) {
                sessions.set(sessionId, {meetingTitle:card.title, providerLabel:'Research card', createdAt:card.createdAt});
            }
        }
        for (const job of allEvidenceJobs) {
            const sessionId = job.action?.source?.sessionId;
            if (sessionId && !sessions.has(sessionId)) {
                sessions.set(sessionId, {
                    meetingTitle:job.action?.source?.meetingTitle || 'Meeting',
                    providerLabel:job.action?.source?.providerLabel || 'Evidence Action',
                    createdAt:job.createdAt
                });
            }
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

    function jobActionButton(label, operation, jobId) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.dataset.jobOperation = operation;
        button.dataset.jobId = jobId;
        return button;
    }

    function renderEvidenceJobs() {
        elements.evidenceJobList.replaceChildren();
        const jobs = allEvidenceJobs.filter(job => !selectedSessionId || job.action?.source?.sessionId === selectedSessionId);
        if (!jobs.length) {
            const empty = document.createElement('p');
            empty.className = 'empty';
            empty.textContent = 'No assistant requests for this meeting yet.';
            elements.evidenceJobList.append(empty);
            return;
        }
        for (const job of jobs) {
            const article = document.createElement('article');
            article.className = 'evidence-job';
            const header = document.createElement('header');
            const name = document.createElement('strong');
            name.textContent = job.action?.intent === 'prepare_work_item' ? 'Prepare work item' : 'Research reference';
            const state = document.createElement('span');
            state.className = 'job-state';
            state.textContent = job.state.replaceAll('_', ' ');
            header.append(name, state);
            article.append(header);
            if (job.action?.question) {
                const question = document.createElement('p');
                question.textContent = job.action.question;
                article.append(question);
            }
            const meta = document.createElement('p');
            meta.className = 'muted';
            meta.textContent = `${job.action?.selectedCaptions?.length || 0} selected caption(s) • attempt ${job.attempts}`;
            article.append(meta);
            if (job.lastError?.message) {
                const error = document.createElement('p');
                error.className = 'boundary-note';
                error.textContent = job.lastError.message;
                article.append(error);
            }
            const actions = document.createElement('div');
            actions.className = 'job-actions';
            if (job.state === 'reviewed') actions.append(jobActionButton('Send', 'dispatch', job.jobId));
            if (job.state === 'failed') actions.append(jobActionButton('Retry', 'dispatch', job.jobId));
            if (job.state === 'queued') actions.append(jobActionButton('Send', 'dispatch', job.jobId));
            if (['submitting', 'running', 'confirmation_required'].includes(job.state)) {
                actions.append(jobActionButton('Check status', 'status', job.jobId));
            }
            if (['queued', 'submitting', 'running', 'confirmation_required'].includes(job.state)) actions.append(jobActionButton('Cancel', 'cancel', job.jobId));
            if (job.receipt?.status === 'succeeded' && job.receipt.externalSystem) {
                const result = document.createElement('p');
                result.className = 'muted';
                result.append(document.createTextNode(`Confirmed in ${job.receipt.externalSystem}: `));
                if (job.receipt.externalRecordUrl?.startsWith('https://')) {
                    const link = document.createElement('a');
                    link.href = job.receipt.externalRecordUrl;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = job.receipt.externalRecordId || 'Open record';
                    result.append(link);
                } else result.append(document.createTextNode(job.receipt.externalRecordId || 'external record'));
                article.append(result);
            }
            if (actions.childElementCount) article.append(actions);
            elements.evidenceJobList.append(article);
        }
    }

    async function loadEvidenceJobs() {
        allEvidenceJobs = await evidenceJobRepository.list();
        renderSessionChoices();
        renderEvidenceJobs();
    }

    async function performJobAction(button) {
        const operation = button.dataset.jobOperation;
        const jobId = button.dataset.jobId;
        if (operation === 'cancel' && !confirm('Cancel this assistant request? A customer system may already be processing it.')) return;
        button.disabled = true;
        const messages = {
            dispatch:'evidence_action_dispatch',
            status:'evidence_action_status',
            cancel:'evidence_action_cancel'
        };
        try {
            const response = await chrome.runtime.sendMessage({message:messages[operation], jobId});
            if (!response?.ok) throw new Error(response?.error || 'The Evidence Action could not be updated.');
            await Promise.all([loadEvidenceJobs(), loadResearchCards(), loadConnectorDrafts()]);
            setStatus(`Evidence Action is ${response.job?.state || 'updated'}.`);
        } finally {
            button.disabled = false;
        }
    }

    function renderResearchCards() {
        elements.researchCardList.replaceChildren();
        const cards = allResearchCards.filter(card => !selectedSessionId || card.provenance?.meetingSessionId === selectedSessionId);
        if (!cards.length) {
            const empty = document.createElement('p');
            empty.className = 'empty';
            empty.textContent = 'No cited research results for this meeting yet.';
            elements.researchCardList.append(empty);
            return;
        }
        for (const card of cards) {
            const article = document.createElement('article');
            article.className = 'research-card';
            const title = document.createElement('h3');
            title.textContent = card.title;
            article.append(title);
            if (card.summary) {
                const summary = document.createElement('p');
                summary.className = 'card-summary';
                summary.textContent = card.summary;
                article.append(summary);
            }
            const claims = document.createElement('ol');
            for (const claim of card.claims) {
                const item = document.createElement('li');
                item.textContent = `${claim.text} [${claim.citationIds.join(', ')}]`;
                claims.append(item);
            }
            article.append(claims);
            const details = document.createElement('details');
            const heading = document.createElement('summary');
            heading.textContent = `${card.citations.length} citation${card.citations.length === 1 ? '' : 's'}`;
            details.append(heading);
            const sources = document.createElement('ol');
            for (const citation of card.citations) {
                const item = document.createElement('li');
                const label = `[${citation.citationId}] ${citation.sourceLabel}`;
                if (citation.sourceUrl) {
                    const link = document.createElement('a');
                    link.href = citation.sourceUrl;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = label;
                    item.append(link);
                } else item.textContent = label;
                sources.append(item);
            }
            details.append(sources);
            article.append(details);
            const note = document.createElement('p');
            note.className = 'derivative-note';
            note.textContent = `Assistant derivative • sealed ${card.sha256.slice(0, 12)}… • source transcript remains authoritative`;
            article.append(note);
            const actions = document.createElement('div');
            actions.className = 'research-card-actions';
            const prepareChat = document.createElement('button');
            prepareChat.type = 'button';
            prepareChat.dataset.liveChatCardId = card.cardId;
            prepareChat.textContent = 'Prepare live-chat reply';
            actions.append(prepareChat);
            article.append(actions);
            elements.researchCardList.append(article);
        }
    }

    async function openLiveChatDraft(cardId) {
        await refreshEnterprisePolicy();
        const card = allResearchCards.find(candidate => candidate.cardId === cardId);
        if (!card) throw new Error('The cited Research Card is no longer available.');
        const draft = globalThis.CaptionKeepResearchCards.toLiveChatDraft(card);
        elements.liveChatDraft.value = enterprisePolicy.forceScrubbedExport
            ? CaptionKeepPrivacyScrubber.scrub(draft, scrubOptions).text
            : draft;
        elements.copyLiveChat.disabled = !!enterprisePolicy.disableClipboard;
        elements.liveChatDialog.showModal();
        elements.liveChatDraft.focus();
    }

    async function copyLiveChatDraft() {
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableClipboard) throw new Error('Clipboard copy is disabled by your organization.');
        const draft = enterprisePolicy.forceScrubbedExport
            ? CaptionKeepPrivacyScrubber.scrub(elements.liveChatDraft.value, scrubOptions).text
            : elements.liveChatDraft.value;
        if (!board.cleanInline(draft)) throw new Error('The live-chat reply is empty.');
        await navigator.clipboard.writeText(draft);
        elements.liveChatDialog.close();
        setStatus('Live-chat reply copied. Paste it into the active meeting chat, review it, and press Send yourself.');
    }

    async function loadResearchCards() {
        allResearchCards = await researchCardRepository.list();
        renderSessionChoices();
        renderResearchCards();
    }

    function connectorProfileLabel(profile) {
        return ({
            jira:'Jira',
            azure_devops:'Azure DevOps',
            microsoft_365:'Microsoft 365',
            microsoft_planner:'Microsoft Planner',
            email:'Follow-up email',
            generic:'Customer-selected connector'
        })[profile] || 'Customer connector';
    }

    function renderConnectorDrafts() {
        elements.connectorDraftList.replaceChildren();
        const drafts = allConnectorDrafts.filter(draft => !selectedSessionId || draft.provenance?.meetingSessionId === selectedSessionId);
        if (!drafts.length) {
            const empty = document.createElement('p');
            empty.className = 'empty';
            empty.textContent = 'No connector drafts for this meeting yet.';
            elements.connectorDraftList.append(empty);
            return;
        }
        for (const draft of drafts) {
            const article = document.createElement('article');
            article.className = 'connector-draft';
            const title = document.createElement('h3');
            title.textContent = draft.title;
            article.append(title);
            const confirmation = document.createElement('p');
            confirmation.className = 'confirmation-note';
            confirmation.textContent = 'Awaiting confirmation in your customer assistant';
            article.append(confirmation);
            if (draft.description) {
                const description = document.createElement('p');
                description.textContent = draft.description;
                article.append(description);
            }
            const metadata = document.createElement('dl');
            const entries = [
                ['Connector', connectorProfileLabel(draft.targetProfile)],
                ['Evidence', draft.evidenceIds.join(', ')]
            ];
            for (const field of draft.fields) entries.push([field.name, field.value]);
            for (const [name, value] of entries) {
                const term = document.createElement('dt');
                term.textContent = name;
                const definition = document.createElement('dd');
                definition.textContent = value;
                metadata.append(term, definition);
            }
            article.append(metadata);
            const instruction = document.createElement('p');
            instruction.textContent = draft.reviewInstruction;
            article.append(instruction);
            if (draft.reviewUrl) {
                const review = document.createElement('a');
                review.href = draft.reviewUrl;
                review.target = '_blank';
                review.rel = 'noopener noreferrer';
                review.textContent = 'Open customer review ↗';
                article.append(review);
            }
            const note = document.createElement('p');
            note.className = 'derivative-note';
            note.textContent = `Draft only • sealed ${draft.sha256.slice(0, 12)}… • CaptionKeep cannot confirm or execute it`;
            article.append(note);
            elements.connectorDraftList.append(article);
        }
    }

    async function loadConnectorDrafts() {
        allConnectorDrafts = await connectorActionDraftRepository.list();
        renderSessionChoices();
        renderConnectorDrafts();
    }

    async function activeMeetingTab() {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        return tab;
    }

    async function closePanel() {
        const tab = await activeMeetingTab();
        if (!tab?.windowId) throw new Error('No active browser window is available.');
        if (typeof chrome.sidePanel.close === 'function') {
            await chrome.sidePanel.close({windowId: tab.windowId});
            return;
        }

        // Chrome/Edge versions before sidePanel.close() can close a global panel
        // by disabling it. The popup re-enables it before the next explicit open.
        await chrome.sidePanel.setOptions({enabled: false});
        window.close();
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
        elements.captureState.textContent = currentContext?.captureState || 'Not connected';
        elements.meetingTitle.textContent = currentContext?.meetingTitle || 'Open Teams, Meet, or Zoom Web.';
        elements.meetingProvider.textContent = currentContext?.providerLabel || '';
        renderMeetingSourceControls();
        elements.latestCaption.textContent = latest?.Text || 'Waiting for a stable captured caption…';
        elements.latestMeta.textContent = latest
            ? `${board.evidenceId(transcript.length - 1)} · ${latest.Time || 'time unavailable'} · ${latest.Name || 'Unknown speaker'}`
            : '';
        elements.markLatest.disabled = !latest;
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
        item.classList.toggle('selected', selectedCaptionIndexes.has(index));
        const heading = document.createElement('div');
        heading.className = 'caption-heading';
        const selectWrap = document.createElement('label');
        selectWrap.className = 'caption-select-wrap';
        const select = document.createElement('input');
        select.type = 'checkbox';
        select.className = 'caption-select';
        select.dataset.captionIndex = String(index);
        select.checked = selectedCaptionIndexes.has(index);
        select.setAttribute('aria-label', `Select caption ${board.evidenceId(index)} for an Evidence Action`);
        const meta = document.createElement('span');
        meta.className = 'caption-id';
        meta.textContent = `${board.evidenceId(index)} · ${caption.Time || 'time unavailable'} · ${caption.Name || 'Unknown speaker'}`;
        selectWrap.append(select, meta);
        const mark = document.createElement('button');
        mark.type = 'button';
        mark.className = 'caption-mark';
        mark.dataset.captionIndex = String(index);
        mark.textContent = 'Mark';
        const research = document.createElement('button');
        research.type = 'button';
        research.className = 'caption-research';
        research.dataset.researchCaptionIndex = String(index);
        research.textContent = 'Research';
        research.setAttribute('aria-label', `Research caption ${board.evidenceId(index)}`);
        const actions = document.createElement('div');
        actions.className = 'caption-row-actions';
        actions.append(mark, research);
        heading.append(selectWrap, actions);
        const text = document.createElement('p');
        text.className = 'caption-text';
        text.dataset.captionIndex = String(index);
        text.textContent = caption.Text;
        item.append(heading, text);
        return item;
    }

    function renderSelection() {
        const count = selectedCaptionIndexes.size;
        elements.selectionCount.textContent = String(count);
        elements.clearSelection.disabled = count === 0;
        const actionsDisabled = count === 0 || !!enterprisePolicy.disableAiHandoff || !!enterprisePolicy.disableEvidenceActions;
        const allowedIntents = Array.isArray(enterprisePolicy.assistantAllowedIntents)
            ? enterprisePolicy.assistantAllowedIntents
            : ['research_reference', 'prepare_work_item'];
        elements.researchSelected.disabled = actionsDisabled || !allowedIntents.includes('research_reference');
        elements.prepareWorkItem.disabled = actionsDisabled || !allowedIntents.includes('prepare_work_item');
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
            renderSelection();
            return;
        }
        for (const {caption, index} of matches.slice(-150).reverse()) {
            elements.transcriptList.append(captionNode(caption, index));
        }
        renderSelection();
    }

    function selectedTranscriptContext() {
        const indexes = [...selectedCaptionIndexes].sort((left, right) => left - right);
        const source = currentContext?.transcriptArray || [];
        if (elements.actionPrivacyMode.value !== 'scrubbed') return currentContext;
        const cleaned = CaptionKeepPrivacyScrubber.scrubTranscript(source, scrubOptions).transcript;
        return {...currentContext, transcriptArray:cleaned, selectedCaptionIndexes:indexes};
    }

    function actionExcerpts() {
        return [...selectedCaptionExcerpts.entries()].map(([index, text]) => ({
            index,
            text: elements.actionPrivacyMode.value === 'scrubbed'
                ? CaptionKeepPrivacyScrubber.scrub(text, scrubOptions).text
                : text
        }));
    }

    function buildActionDraft() {
        const context = selectedTranscriptContext();
        return evidenceActions.buildEnvelope(context, {
            selectedCaptionIndexes:[...selectedCaptionIndexes],
            selectedCaptionExcerpts:actionExcerpts(),
            question:elements.actionQuestion.value,
            sourceScope:elements.actionSourceScope.value,
            privacyMode:elements.actionPrivacyMode.value,
            intent:currentActionIntent,
            destinationId:currentActionIntent === 'prepare_work_item' ? elements.actionDestination.value : null
        });
    }

    function renderActionPreview() {
        try {
            actionDraft = buildActionDraft();
            elements.actionPreview.value = evidenceActions.previewText(actionDraft);
            elements.saveActionDraft.disabled = false;
            elements.sendAction.disabled = false;
        } catch (error) {
            actionDraft = null;
            elements.actionPreview.value = error.message;
            elements.saveActionDraft.disabled = true;
            elements.sendAction.disabled = true;
        }
    }

    async function openEvidenceAction(intent = 'research_reference') {
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableAiHandoff || enterprisePolicy.disableEvidenceActions) throw new Error('Evidence Actions are disabled by your organization.');
        if (!selectedCaptionIndexes.size) throw new Error('Select at least one caption for this Evidence Action.');
        const allowedIntents = Array.isArray(enterprisePolicy.assistantAllowedIntents)
            ? enterprisePolicy.assistantAllowedIntents
            : ['research_reference', 'prepare_work_item'];
        if (!allowedIntents.includes(intent)) throw new Error('This Evidence Action is not allowed by your organization.');
        currentActionIntent = intent;
        const isConnectorAction = intent === 'prepare_work_item';
        elements.actionTitle.textContent = isConnectorAction ? 'Prepare a work item' : 'On the Fly Research';
        elements.actionDescription.textContent = isConnectorAction
            ? 'Choose the intended destination and review the evidence. Your assistant must already have that connector and must show a separate draft and confirmation before creating anything.'
            : 'Review exactly what will be made available to your assistant.';
        if (!isConnectorAction && selectedCaptionExcerpts.size) {
            elements.actionDescription.textContent = 'Review the exact highlighted words and their source caption before they are made available to your assistant.';
        }
        elements.actionQuestionLabel.textContent = isConnectorAction ? 'What work should be prepared?' : 'What do you want to know?';
        elements.actionQuestion.placeholder = isConnectorAction
            ? 'Describe the issue, task, or follow-up the assistant should draft.'
            : 'Optional — explain the reference and why it matters to this discussion.';
        elements.actionDestinationRow.hidden = !isConnectorAction;
        elements.actionSourceScopeRow.hidden = isConnectorAction;
        elements.actionSourceScope.value = isConnectorAction ? 'organization' : 'both';
        elements.actionQuestion.value = '';
        elements.actionPrivacyMode.value = 'scrubbed';
        elements.actionPrivacyMode.disabled = !!enterprisePolicy.forceScrubbedExport || !!enterprisePolicy.forceScrubbedEvidenceActions;
        renderActionPreview();
        elements.actionDialog.showModal();
        elements.actionQuestion.focus();
    }

    async function saveReviewedAction({dispatch = false} = {}) {
        await refreshEnterprisePolicy();
        if (enterprisePolicy.disableAiHandoff || enterprisePolicy.disableEvidenceActions) throw new Error('Evidence Actions are disabled by your organization.');
        renderActionPreview();
        if (!actionDraft) throw new Error('The Evidence Action preview is not valid.');
        const sealed = await evidenceActions.sealEnvelope(actionDraft);
        await chrome.storage.local.set({[ACTION_DRAFT_KEY]:sealed});
        const {job, created} = await evidenceJobRepository.create(sealed);
        if (dispatch) {
            const response = await chrome.runtime.sendMessage({message:'evidence_action_dispatch', jobId:job.jobId});
            if (!response?.ok) throw Object.assign(new Error(response?.error || 'The customer assistant did not accept the request.'), {code:response?.code});
            await Promise.all([loadResearchCards(), loadConnectorDrafts(), loadEvidenceJobs()]);
            elements.actionDialog.close();
            setStatus(`Reviewed request ${sealed.actionId} sent. Assistant job state: ${response.job?.state || 'submitted'}.`);
            return;
        }
        elements.actionDialog.close();
        setStatus(created
            ? `Reviewed request ${sealed.actionId} saved locally as job ${job.jobId}. No assistant request was sent.`
            : `Reviewed request ${sealed.actionId} was already saved locally. No assistant request was sent.`);
    }

    async function saveActionDraft(event) {
        event.preventDefault();
        return saveReviewedAction();
    }

    function clearSelection() {
        selectedCaptionIndexes.clear();
        selectedCaptionExcerpts.clear();
        renderTranscript();
    }

    function dismissInstantResearch() {
        pendingTextSelection = null;
        elements.instantResearchBar.hidden = true;
        window.getSelection()?.removeAllRanges();
    }

    function captureTextSelection() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const start = range.startContainer.nodeType === Node.ELEMENT_NODE
            ? range.startContainer
            : range.startContainer.parentElement;
        const end = range.endContainer.nodeType === Node.ELEMENT_NODE
            ? range.endContainer
            : range.endContainer.parentElement;
        const startCaption = start?.closest?.('.caption-text[data-caption-index]');
        const endCaption = end?.closest?.('.caption-text[data-caption-index]');
        if (!startCaption || startCaption !== endCaption || !elements.transcriptList.contains(startCaption)) return;
        const index = Number.parseInt(startCaption.dataset.captionIndex, 10);
        const excerpt = board.cleanInline(selection.toString());
        const sourceText = board.cleanInline(currentContext?.transcriptArray?.[index]?.Text);
        if (!Number.isInteger(index) || !excerpt || !sourceText.includes(excerpt)) return;
        pendingTextSelection = {index, text:excerpt};
        elements.instantResearchSource.textContent = `Selected from ${board.evidenceId(index)}`;
        elements.instantResearchExcerpt.textContent = `“${excerpt}”`;
        elements.instantResearchBar.hidden = false;
    }

    async function researchCaption(index, excerpt = '') {
        selectedCaptionIndexes.clear();
        selectedCaptionExcerpts.clear();
        selectedCaptionIndexes.add(index);
        if (excerpt) selectedCaptionExcerpts.set(index, excerpt);
        renderTranscript();
        dismissInstantResearch();
        await openEvidenceAction('research_reference');
    }

    async function researchTextSelection() {
        if (!pendingTextSelection) throw new Error('Select text from one captured caption first.');
        const {index, text} = pendingTextSelection;
        await researchCaption(index, text);
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
        renderEvidenceJobs();
        renderResearchCards();
        renderConnectorDrafts();
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
                selectedCaptionIndexes.clear();
                selectedCaptionExcerpts.clear();
                dismissInstantResearch();
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
            renderContext();
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
        const link = document.createElement('a');
        link.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        link.click();
        setStatus('Email draft opened. Review the brief and choose recipients before sending.');
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

    for (const kind of board.MARKER_KINDS) {
        const option = document.createElement('option');
        option.value = kind;
        option.textContent = kind;
        elements.markerKind.append(option);
    }

    elements.markLatest.addEventListener('click', () => void markLatest());
    elements.closePanel.addEventListener('click', () => void closePanel().catch(error => setStatus(error.message)));
    elements.copyBoard.addEventListener('click', () => void copyBoard().catch(error => setStatus(error.message)));
    elements.downloadBoard.addEventListener('click', () => void downloadBoard().catch(error => setStatus(error.message)));
    elements.emailBoard.addEventListener('click', () => void emailBoard().catch(error => setStatus(error.message)));
    elements.downloadBundle.addEventListener('click', () => void downloadBundle().catch(error => setStatus(error.message)));
    elements.openTranscript.addEventListener('click', () => void openTranscript().catch(error => setStatus(error.message)));
    elements.enableLiveCaptions.addEventListener('click', () => void runMeetingControl('enable_live_captions', 'Requesting live captions…').catch(error => setStatus(error.message)));
    elements.openAttendeePanel.addEventListener('click', () => void runMeetingControl('open_attendee_panel', 'Opening the attendee panel…').catch(error => setStatus(error.message)));
    elements.requestTeamsTranscription.addEventListener('click', () => void runMeetingControl('request_teams_transcription', 'Requesting the tenant transcript…').catch(error => setStatus(error.message)));
    elements.markerList.addEventListener('click', event => {
        const button = event.target.closest('button[data-marker-id]');
        if (button) void deleteMarker(button.dataset.markerId);
    });
    elements.evidenceJobList.addEventListener('click', event => {
        const button = event.target.closest('button[data-job-operation]');
        if (button) void performJobAction(button).catch(error => setStatus(error.message));
    });
    elements.researchCardList.addEventListener('click', event => {
        const button = event.target.closest('button[data-live-chat-card-id]');
        if (button) void openLiveChatDraft(button.dataset.liveChatCardId).catch(error => setStatus(error.message));
    });
    elements.markerSession.addEventListener('change', event => {
        selectedSessionId = event.target.value;
        renderMarkers();
    });
    elements.transcriptList.addEventListener('click', event => {
        const research = event.target.closest('button[data-research-caption-index]');
        if (research) {
            void researchCaption(Number.parseInt(research.dataset.researchCaptionIndex, 10)).catch(error => setStatus(error.message));
            return;
        }
        const button = event.target.closest('button[data-caption-index]');
        if (button) void markCaption(Number.parseInt(button.dataset.captionIndex, 10));
    });
    elements.transcriptList.addEventListener('change', event => {
        const checkbox = event.target.closest('input[data-caption-index]');
        if (!checkbox) return;
        const index = Number.parseInt(checkbox.dataset.captionIndex, 10);
        selectedCaptionExcerpts.delete(index);
        if (checkbox.checked) selectedCaptionIndexes.add(index);
        else selectedCaptionIndexes.delete(index);
        renderTranscript();
    });
    elements.transcriptList.addEventListener('mouseup', captureTextSelection);
    elements.transcriptList.addEventListener('keyup', captureTextSelection);
    elements.researchTextSelection.addEventListener('click', () => void researchTextSelection().catch(error => setStatus(error.message)));
    elements.dismissInstantResearch.addEventListener('click', dismissInstantResearch);
    elements.copyLiveChat.addEventListener('click', () => void copyLiveChatDraft().catch(error => setStatus(error.message)));
    elements.cancelLiveChat.addEventListener('click', () => elements.liveChatDialog.close());
    elements.clearSelection.addEventListener('click', clearSelection);
    elements.researchSelected.addEventListener('click', () => void openEvidenceAction('research_reference').catch(error => setStatus(error.message)));
    elements.prepareWorkItem.addEventListener('click', () => void openEvidenceAction('prepare_work_item').catch(error => setStatus(error.message)));
    elements.cancelAction.addEventListener('click', () => elements.actionDialog.close());
    elements.sendAction.addEventListener('click', () => void saveReviewedAction({dispatch:true}).catch(error => setStatus(error.message)));
    elements.actionQuestion.addEventListener('input', renderActionPreview);
    elements.actionSourceScope.addEventListener('change', renderActionPreview);
    elements.actionDestination.addEventListener('change', renderActionPreview);
    elements.actionPrivacyMode.addEventListener('change', renderActionPreview);
    elements.actionForm.addEventListener('submit', event => void saveActionDraft(event).catch(error => setStatus(error.message)));
    elements.transcriptSearch.addEventListener('input', renderTranscript);
    elements.transcriptTab.addEventListener('click', () => switchView('transcript'));
    elements.evidenceTab.addEventListener('click', () => switchView('evidence'));
    chrome.tabs.onActivated.addListener(() => void pollContext());
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
        if (changeInfo.status === 'complete') void pollContext();
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && Object.hasOwn(changes, evidenceActionJobs.STORAGE_KEY)) {
            void loadEvidenceJobs().catch(error => setStatus(error.message));
        }
        if (areaName === 'local' && Object.hasOwn(changes, globalThis.CaptionKeepResearchCards.STORAGE_KEY)) {
            void loadResearchCards().catch(error => setStatus(error.message));
        }
        if (areaName === 'local' && Object.hasOwn(changes, connectorActionDrafts.STORAGE_KEY)) {
            void loadConnectorDrafts().catch(error => setStatus(error.message));
        }
        const assistantChanged = areaName === 'local'
            && CaptionKeepConfiguration.ASSISTANT_USER_KEYS.some(key => Object.hasOwn(changes, key));
        if (areaName !== 'managed' && !assistantChanged) return;
        void (async () => {
            await refreshEnterprisePolicy();
            renderMarkers();
        })().catch(error => setStatus(error.message));
    });

    void (async () => {
        await refreshEnterprisePolicy();
        await loadMarkers();
        await loadEvidenceJobs();
        await loadResearchCards();
        await loadConnectorDrafts();
        await pollContext();
    })().catch(error => setStatus(error.message));
    setInterval(() => void pollContext(), POLL_INTERVAL_MS);
})();
