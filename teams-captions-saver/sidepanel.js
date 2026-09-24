(() => {
    'use strict';

    const STORAGE_KEY = 'evidenceBoardMarkersV1';
    const MAX_MARKERS = 500;
    const POLL_INTERVAL_MS = 1200;
    const board = globalThis.CaptionKeepEvidenceBoard;
    const elements = {
        captureState: document.getElementById('capture-state'),
        meetingTitle: document.getElementById('meeting-title'),
        meetingProvider: document.getElementById('meeting-provider'),
        latestCaption: document.getElementById('latest-caption'),
        latestMeta: document.getElementById('latest-meta'),
        markerKind: document.getElementById('marker-kind'),
        markerNote: document.getElementById('marker-note'),
        markLatest: document.getElementById('mark-latest'),
        boardStatus: document.getElementById('board-status'),
        markerCount: document.getElementById('marker-count'),
        markerSession: document.getElementById('marker-session'),
        markerList: document.getElementById('marker-list'),
        copyBoard: document.getElementById('copy-board'),
        downloadBoard: document.getElementById('download-board'),
        openTranscript: document.getElementById('open-transcript')
    };
    let currentContext = null;
    let allMarkers = [];
    let selectedSessionId = '';
    let polling = false;

    function setStatus(message) {
        elements.boardStatus.textContent = message;
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
        elements.copyBoard.disabled = !markers.length;
        elements.downloadBoard.disabled = !markers.length;
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
            if (sessionChanged || reconciliation.changed) renderMarkers();
            setStatus('');
        } catch (error) {
            currentContext = null;
            renderContext();
            renderMarkers();
            setStatus(error.message);
        } finally {
            polling = false;
        }
    }

    async function markLatest() {
        try {
            const marker = board.createMarker(currentContext, {
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

    async function copyBoard() {
        await navigator.clipboard.writeText(boardMarkdown());
        setStatus('Evidence brief copied.');
    }

    async function downloadBoard() {
        const text = boardMarkdown();
        const url = URL.createObjectURL(new Blob([text], {type: 'text/markdown;charset=utf-8'}));
        const selectedMarker = selectedMarkers()[0];
        const safeTitle = board.cleanInline(
            selectedSessionId === currentContext?.sessionId
                ? currentContext?.meetingTitle
                : selectedMarker?.meetingTitle,
            'meeting'
        )
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
            .slice(0, 80);
        try {
            await chrome.downloads.download({url, filename: `${safeTitle}-evidence-board.md`, saveAs: true});
            setStatus('Evidence brief ready to save.');
        } finally {
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        }
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
    elements.copyBoard.addEventListener('click', () => void copyBoard().catch(error => setStatus(error.message)));
    elements.downloadBoard.addEventListener('click', () => void downloadBoard().catch(error => setStatus(error.message)));
    elements.openTranscript.addEventListener('click', () => void openTranscript().catch(error => setStatus(error.message)));
    elements.markerList.addEventListener('click', event => {
        const button = event.target.closest('button[data-marker-id]');
        if (button) void deleteMarker(button.dataset.markerId);
    });
    elements.markerSession.addEventListener('change', event => {
        selectedSessionId = event.target.value;
        renderMarkers();
    });
    chrome.tabs.onActivated.addListener(() => void pollContext());
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
        if (changeInfo.status === 'complete') void pollContext();
    });

    void loadMarkers().then(pollContext);
    setInterval(() => void pollContext(), POLL_INTERVAL_MS);
})();
