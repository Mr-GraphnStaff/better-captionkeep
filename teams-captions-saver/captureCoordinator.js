(function initializeCaptureCoordinator(root) {
    'use strict';

    const DEFAULT_CHECKPOINT_TTL_MS = 4 * 60 * 60 * 1000;

    function meetingPageKey(value) {
        const url = value instanceof URL ? value : new URL(String(value));
        return `${url.origin}${url.pathname}`;
    }

    function cloneTranscript(items) {
        return items.map(item => ({...item}));
    }

    function create(options = {}) {
        const providerId = String(options.providerId || '').trim().toLowerCase();
        if (!/^[a-z][a-z0-9-]*$/.test(providerId)) throw new TypeError('Capture coordinator requires a provider id.');
        if (typeof options.normalizeCaption !== 'function') throw new TypeError('Capture coordinator requires caption normalization.');
        if (!options.storage?.get || !options.storage?.set || !options.storage?.remove) {
            throw new TypeError('Capture coordinator requires local storage.');
        }
        if (typeof options.sendMessage !== 'function') throw new TypeError('Capture coordinator requires message dispatch.');

        const now = typeof options.now === 'function' ? options.now : () => new Date();
        const createId = typeof options.createId === 'function' ? options.createId : () => crypto.randomUUID();
        const checkpointTtlMs = Number(options.checkpointTtlMs) || DEFAULT_CHECKPOINT_TTL_MS;
        const storage = options.storage;
        const sendMessage = options.sendMessage;
        const activeCaptureKey = `active_capture_v2_${providerId}`;
        let documentSessionId = createId();
        let backupKey = `backup_${documentSessionId}`;
        let recordingStartTime = now();
        let pageUrl = String(options.pageUrl || '');
        let meetingTitle = String(options.meetingTitle || 'Meeting').trim() || 'Meeting';
        let captureState = 'initializing';
        let checkpointError = '';
        let restoredFromCheckpoint = false;
        let finalizing = false;
        let finalized = false;
        let pending = Promise.resolve();
        const transcript = [];
        const captionIndex = new Map();

        function snapshot() {
            return {
                version: 2,
                providerId,
                pageKey: meetingPageKey(pageUrl),
                pageUrl,
                meetingTitle,
                recordingStartTime: recordingStartTime.toISOString(),
                lastBackup: now().toISOString(),
                documentSessionId,
                backupKey,
                transcript: cloneTranscript(transcript)
            };
        }

        async function writeCheckpoint() {
            if (!transcript.length || finalized) return false;
            const value = snapshot();
            await storage.set({[backupKey]: value, [activeCaptureKey]: value});
            checkpointError = '';
            return true;
        }

        function enqueue(task) {
            pending = pending.catch(() => {}).then(task).catch(error => {
                checkpointError = `Recovery save failed: ${error.message}`;
                throw error;
            });
            return pending;
        }

        function persistCheckpoint() {
            return enqueue(writeCheckpoint);
        }

        async function restore() {
            try {
                const stored = await storage.get(activeCaptureKey);
                const value = stored?.[activeCaptureKey];
                const age = now().getTime() - Date.parse(value?.lastBackup || '');
                if (!value || value.providerId !== providerId || value.pageKey !== meetingPageKey(pageUrl)
                    || !Array.isArray(value.transcript) || !value.transcript.length
                    || !Number.isFinite(age) || age < 0 || age > checkpointTtlMs) return false;

                transcript.splice(0, transcript.length, ...cloneTranscript(value.transcript));
                captionIndex.clear();
                transcript.forEach((caption, index) => captionIndex.set(caption.key, index));
                meetingTitle = String(value.meetingTitle || meetingTitle);
                const restoredStart = new Date(value.recordingStartTime || '');
                if (!Number.isNaN(restoredStart.getTime())) recordingStartTime = restoredStart;
                if (/^[a-f0-9-]+$/i.test(value.documentSessionId || '')) {
                    documentSessionId = value.documentSessionId;
                    backupKey = `backup_${documentSessionId}`;
                }
                restoredFromCheckpoint = true;
                captureState = 'recovering';
                checkpointError = 'Capture resumed from a recovery checkpoint. The reload interval may be incomplete.';
                return true;
            } catch (error) {
                checkpointError = `Recovery check failed: ${error.message}`;
                return false;
            }
        }

        function broadcastCaption(caption, type) {
            sendMessage({
                message: 'live_caption_update',
                sessionId: recordingStartTime.toISOString(),
                type,
                caption
            }).catch(() => {});
        }

        function upsertCaption(record) {
            const caption = options.normalizeCaption(record);
            const existingIndex = captionIndex.get(caption.key);
            if (existingIndex === undefined) {
                captionIndex.set(caption.key, transcript.length);
                transcript.push(caption);
                broadcastCaption(caption, 'new');
            } else {
                transcript[existingIndex] = caption;
                broadcastCaption(caption, 'update');
            }
            persistCheckpoint().catch(() => {});
            return caption;
        }

        function finalize() {
            if (finalizing || finalized) return pending;
            finalizing = true;
            captureState = 'meeting ended';
            sendMessage({message: 'meeting_ended', sessionId: recordingStartTime.toISOString()}).catch(() => {});
            return enqueue(async () => {
                try {
                    await writeCheckpoint();
                    if (transcript.length) {
                        const historyResult = await sendMessage({
                            message: 'save_session_history',
                            backupKey,
                            recordingStartTime: recordingStartTime.toISOString(),
                            transcriptArray: cloneTranscript(transcript),
                            meetingTitle,
                            attendeeReport: null
                        });
                        if (!historyResult?.ok) throw new Error(historyResult?.error || 'History save failed');
                        await storage.remove(activeCaptureKey);
                        finalized = true;
                        checkpointError = '';
                        sendMessage({
                            message: 'save_on_leave',
                            transcriptArray: cloneTranscript(transcript),
                            meetingTitle,
                            recordingStartTime: recordingStartTime.toISOString(),
                            attendeeReport: null
                        }).catch(error => {
                            checkpointError = `Automatic export failed: ${error.message}`;
                        });
                    } else {
                        await storage.remove(activeCaptureKey);
                        finalized = true;
                    }
                } finally {
                    finalizing = false;
                }
            });
        }

        function handleProviderEvent(event = {}) {
            switch (event.type) {
                case 'caption-source-available':
                    captureState = 'capturing';
                    break;
                case 'caption-source-unavailable':
                    captureState = 'source unavailable';
                    persistCheckpoint().catch(() => {});
                    break;
                case 'caption-upsert':
                    if (event.caption) upsertCaption(event.caption);
                    break;
                case 'meeting-ended':
                    finalize().catch(() => {});
                    break;
            }
        }

        function pause() {
            captureState = 'paused';
            persistCheckpoint().catch(() => {});
        }

        function resume() {
            if (!finalized) captureState = transcript.length ? 'recovering' : 'initializing';
        }

        function getState() {
            return Object.freeze({
                providerId,
                captureState,
                checkpointError,
                captionCount: transcript.length,
                recordingStartTime: recordingStartTime.toISOString(),
                restoredFromCheckpoint,
                finalized
            });
        }

        return Object.freeze({
            activeCaptureKey,
            finalize,
            getSpeakers: () => [...new Set(transcript.map(item => item.Name).filter(Boolean))],
            getState,
            getTranscript: () => cloneTranscript(transcript),
            handleProviderEvent,
            pause,
            persistCheckpoint,
            restore,
            resume,
            whenIdle: () => pending
        });
    }

    root.CaptionKeepCaptureCoordinator = Object.freeze({create, meetingPageKey});
})(globalThis);
