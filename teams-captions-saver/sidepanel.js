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
        copyBoard: document.getElementById('copy-board'),
        downloadBoard: document.getElementById('download-board'),
        emailBoard: document.getElementById('email-board'),
        downloadBundle: document.getElementById('download-bundle'),
        openTranscript: document.getElementById('open-transcript')
    };
    let currentContext = null;
    let allMarkers = [];
    let selectedSessionId = '';
    let polling = false;
    let transcriptSignature = '';
    let enterprisePolicy = {};
    let scrubOptions = {};

    async function refreshEnterprisePolicy() {
        const user = await chrome.storage.sync.get(['profanityFilterEnabled', 'customScrubTerms']);
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
        if (!response?.sessionId) throw new Error('Caption capture has not started in this tab.');
        return {...response, tabId: tab.id};
    }

    function renderContext() {
        const transcript = currentContext?.transcriptArray || [];
        const latest = transcript.at(-1);
        elements.captureState.textContent = currentContext?.captureState || 'Not connected';
        elements.meetingTitle.textContent = currentContext?.meetingTitle || 'Open Teams, Meet, or Zoom Web.';
        elements.meetingProvider.textContent = currentContext?.providerLabel || '';
        elements.latestCaption.textContent = latest?.Text || 'Waiting for a stable captured caption…';
        elements.latestMeta.textContent = latest
            ? `${board.evidenceId(transcript.length - 1)} · ${latest.Time || 'time unavailable'} · ${latest.Name || 'Unknown speaker'}`
            : '';
        elements.markLatest.disabled = !latest;
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
        heading.append(meta, mark);
        const text = document.createElement('p');
        text.className = 'caption-text';
        text.textContent = caption.Text;
        item.append(heading, text);
        return item;
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
            if (sessionChanged) selectedSessionId = next.sessionId;
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
        const subject = `Evidence brief: ${selectedContext()?.meetingTitle || 'Meeting'}`;
        const rawMarkdown = boardMarkdown();
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
            ? CaptionKeepPrivacyScrubber.scrubObject(bundle, scrubOptions).value
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
    elements.markerList.addEventListener('click', event => {
        const button = event.target.closest('button[data-marker-id]');
        if (button) void deleteMarker(button.dataset.markerId);
    });
    elements.markerSession.addEventListener('change', event => {
        selectedSessionId = event.target.value;
        renderMarkers();
    });
    elements.transcriptList.addEventListener('click', event => {
        const button = event.target.closest('button[data-caption-index]');
        if (button) void markCaption(Number.parseInt(button.dataset.captionIndex, 10));
    });
    elements.transcriptSearch.addEventListener('input', renderTranscript);
    elements.transcriptTab.addEventListener('click', () => switchView('transcript'));
    elements.evidenceTab.addEventListener('click', () => switchView('evidence'));
    chrome.tabs.onActivated.addListener(() => void pollContext());
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
        if (changeInfo.status === 'complete') void pollContext();
    });
    chrome.storage.onChanged.addListener((_changes, areaName) => {
        if (areaName === 'managed') void refreshEnterprisePolicy().then(renderMarkers).catch(error => setStatus(error.message));
    });

    void (async () => {
        await refreshEnterprisePolicy();
        await loadMarkers();
        await pollContext();
    })().catch(error => setStatus(error.message));
    setInterval(() => void pollContext(), POLL_INTERVAL_MS);
})();
