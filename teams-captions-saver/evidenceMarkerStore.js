(function initializeEvidenceMarkerStore(root) {
    'use strict';

    const MAX_MARKERS = 500;
    const KINDS = ['Decision', 'Action item', 'Question', 'Risk', 'Follow-up', 'Important moment'];
    const clean = (value, limit) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
    const evidenceId = index => `C${String(index + 1).padStart(4, '0')}`;

    // The worker must also queue these operations with archive deletion/retention.
    // A delta merges into current storage, never into a panel's stale cached list.
    function create({readStored, writeStored, findSource, readPolicy, now = () => new Date()}) {
        for (const callback of [readStored, writeStored, findSource, readPolicy]) {
            if (typeof callback !== 'function') throw new TypeError('Evidence marker storage callbacks are required.');
        }
        let queue = Promise.resolve();
        const denied = policy => Boolean((policy?.settings || policy)?.disableSessionHistory);

        async function mutate({upserts = [], removeIds = []} = {}) {
            if (!Array.isArray(upserts) || !Array.isArray(removeIds)
                || upserts.length > MAX_MARKERS || removeIds.length > MAX_MARKERS) {
                throw new TypeError('Evidence marker changes must contain at most 500 updates or removals.');
            }
            if (upserts.length && denied(await readPolicy())) {
                throw new Error('Evidence marker retention is disabled by your organization.');
            }
            const stored = await readStored();
            const previous = Array.isArray(stored) ? stored : [];
            const removed = new Set(removeIds.map(id => clean(id, 240)).filter(Boolean));
            const markers = new Map(previous.filter(item => item?.id && !removed.has(String(item.id)))
                .map(item => [String(item.id), item]));
            const sources = new Map();
            const rejected = [];
            for (const requested of upserts) {
                const id = clean(requested?.id, 240);
                const sessionId = clean(requested?.sessionId, 240);
                const reject = reason => rejected.push({id, reason});
                if (!id || !sessionId || removed.has(id)) {
                    reject('A marker ID and source session are required; removal takes precedence.');
                    continue;
                }
                if (!sources.has(sessionId)) sources.set(sessionId, await findSource(sessionId));
                const source = sources.get(sessionId);
                const transcript = source?.transcript;
                if (!Array.isArray(transcript)) {
                    reject('The source transcript is no longer available.');
                    continue;
                }
                const sourceKey = clean(requested.sourceKey, 500);
                let index;
                if (sourceKey) {
                    index = transcript.findIndex(caption => clean(caption?.key, 500) === sourceKey);
                } else {
                    const match = /^C([0-9]{1,8})$/.exec(String(requested.evidenceId || ''));
                    const citedIndex = match ? Number(match[1]) - 1 : -1;
                    index = Number.isInteger(requested.captionIndex) ? requested.captionIndex : citedIndex;
                    if (match && citedIndex !== index) index = -1;
                }
                const caption = transcript[index];
                if (!Number.isInteger(index) || index < 0 || !caption || !clean(caption.Text, 12000)) {
                    reject('The cited source caption is no longer available.');
                    continue;
                }
                const existing = markers.get(id);
                const canonicalKey = clean(caption.key, 500);
                if (existing && (existing.sessionId !== sessionId
                    || (existing.sourceKey && existing.sourceKey !== canonicalKey)
                    || (!existing.sourceKey && existing.evidenceId !== evidenceId(index)))) {
                    reject('An existing marker cannot be moved to another source.');
                    continue;
                }
                const text = clean(caption.Text, 12000);
                const normalized = {
                    version:1, id, sessionId,
                    meetingTitle:clean(source.meetingTitle || requested.meetingTitle, 300) || 'Meeting',
                    providerLabel:clean(source.providerLabel || requested.providerLabel, 120) || 'Meeting platform',
                    kind:KINDS.includes(requested.kind) ? requested.kind : 'Important moment',
                    evidenceId:evidenceId(index), sourceKey:canonicalKey,
                    speaker:clean(caption.Name, 200) || 'Unknown speaker',
                    time:clean(caption.Time, 120) || 'time unavailable',
                    capturedAt:clean(caption.capturedAt, 80), text,
                    markedText:existing ? clean(existing.markedText || existing.text, 12000) : text,
                    note:clean(requested.note, 2000),
                    createdAt:existing ? clean(existing.createdAt, 80) : new Date(now()).toISOString()
                };
                markers.delete(id);
                markers.set(id, normalized);
            }
            if (upserts.length && denied(await readPolicy())) {
                throw new Error('Evidence marker retention is disabled by your organization.');
            }
            const result = [...markers.values()].slice(-MAX_MARKERS);
            if (JSON.stringify(result) !== JSON.stringify(previous)) await writeStored(result);
            return {markers:result, rejected};
        }

        function apply(changes) {
            const operation = queue.then(() => mutate(changes));
            queue = operation.catch(() => {});
            return operation;
        }
        return Object.freeze({apply});
    }

    root.CaptionKeepEvidenceMarkerStore = Object.freeze({create, MAX_MARKERS});
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepEvidenceMarkerStore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
