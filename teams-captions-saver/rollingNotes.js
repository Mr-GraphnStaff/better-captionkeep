(function initializeRollingNotes(root) {
    'use strict';

    const VERSION = 2;
    const MAX_REVISIONS = 30;
    const MAX_BATCH_CAPTIONS = 24;
    const MAX_BATCH_CHARS = 12000;
    const MIN_AUTOMATIC_CAPTIONS = 3;
    const DEFAULT_INTERVAL_MS = 30000;
    const preparedSources = new WeakMap();

    function cleanInline(value, limit = 4000) {
        return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
    }

    function isoDate(value, fallback = '') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.valueOf())) return parsed.toISOString();
        if (!fallback) return '';
        const fallbackDate = new Date(fallback);
        return Number.isNaN(fallbackDate.valueOf()) ? '' : fallbackDate.toISOString();
    }

    function evidenceId(index) {
        return `C${String(index + 1).padStart(4, '0')}`;
    }

    function storageKey(sessionId) {
        const normalized = cleanInline(sessionId, 240);
        if (!normalized) throw new Error('A source meeting session is required for rolling notes.');
        return `rolling_notes_${encodeURIComponent(normalized)}`;
    }

    function sourceRevision(transcript) {
        const captions = Array.isArray(transcript) ? transcript : [];
        const prepared = preparedSources.get(captions);
        if (prepared) return prepared.revision;
        return `${captions.length}:${checksum(JSON.stringify(captions.map(captionFingerprint)))}`;
    }

    function prepareSource(transcript) {
        const captions = Object.freeze((Array.isArray(transcript) ? transcript : []).map(caption => Object.freeze({...caption})));
        const fingerprints = Object.freeze(captions.map(captionFingerprint));
        preparedSources.set(captions, {fingerprints, revision:`${captions.length}:${checksum(JSON.stringify(fingerprints))}`});
        return captions;
    }

    function processedSourceChanged(transcript, state) {
        const captions = Array.isArray(transcript) ? transcript : [];
        const fingerprints = preparedSources.get(captions)?.fingerprints || captions.map(captionFingerprint);
        return state.processedCaptionCount > captions.length || fingerprints.slice(0, state.processedCaptionCount)
            .some((fingerprint, index) => fingerprint !== state.sourceFingerprints?.[index]);
    }

    function captionFingerprint(caption) {
        // Change detection only; immutable evidence provenance uses the transcript SHA-256 elsewhere.
        return checksum(JSON.stringify([caption?.key || '', caption?.Name || '', caption?.Text || '', caption?.Time || '']));
    }

    function emptyState(sessionId) {
        return {
            version: VERSION,
            sessionId: cleanInline(sessionId, 240),
            enabled: false,
            paused: false,
            intervalMs: DEFAULT_INTERVAL_MS,
            processedCaptionCount: 0,
            sourceFingerprints: [],
            sourceRevision: '0::',
            lastUpdatedAt: '',
            failureCount: 0,
            lastError: '',
            revisions: [],
            draft: ''
        };
    }

    function normalizeState(value, sessionId) {
        const base = emptyState(sessionId);
        const input = value && typeof value === 'object' ? value : {};
        const revisions = Array.isArray(input.revisions)
            ? input.revisions.slice(-MAX_REVISIONS).map(item => ({
                id: cleanInline(item?.id, 240),
                createdAt: isoDate(item?.createdAt, Date.now()),
                fromCaption: Math.max(0, Number(item?.fromCaption) || 0),
                toCaption: Math.max(0, Number(item?.toCaption) || 0),
                evidenceIds: Array.isArray(item?.evidenceIds)
                    ? [...new Set(item.evidenceIds.map(id => cleanInline(id, 20)).filter(Boolean))].slice(0, MAX_BATCH_CAPTIONS)
                    : [],
                text: String(item?.text || '').slice(0, MAX_BATCH_CHARS + 2000),
                status: item?.status === 'superseded' ? 'superseded' : 'current',
                sourceRevision: cleanInline(item?.sourceRevision, 140)
            })).filter(item => item.id && item.text)
            : [];
        const intervalMs = Number(input.intervalMs);
        return {
            ...base,
            enabled: input.enabled === true,
            paused: input.paused === true,
            intervalMs: [30000, 60000, 120000].includes(intervalMs) ? intervalMs : DEFAULT_INTERVAL_MS,
            processedCaptionCount: Math.max(0, Number.parseInt(input.processedCaptionCount, 10) || 0),
            sourceFingerprints: Array.isArray(input.sourceFingerprints) ? input.sourceFingerprints.map(item => cleanInline(item, 16)) : [],
            sourceRevision: cleanInline(input.sourceRevision, 140) || base.sourceRevision,
            lastUpdatedAt: isoDate(input.lastUpdatedAt),
            failureCount: Math.min(3, Math.max(0, Number.parseInt(input.failureCount, 10) || 0)),
            lastError: cleanInline(input.lastError, 500),
            revisions,
            draft: String(input.draft || '').slice(0, 100000)
        };
    }

    function boundedBatch(transcript, state) {
        const captions = Array.isArray(transcript) ? transcript : [];
        let start = Math.min(state.processedCaptionCount, captions.length);
        if (start === captions.length && state.sourceRevision !== sourceRevision(captions) && captions.length) start -= 1;
        const selected = [];
        let characters = 0;
        for (let index = start; index < captions.length && selected.length < MAX_BATCH_CAPTIONS; index += 1) {
            const caption = captions[index] || {};
            const text = cleanInline(caption.Text);
            if (!text) continue;
            const line = `- [${evidenceId(index)}] ${cleanInline(caption.Name, 200) || 'Unknown speaker'}: ${text}`;
            if (selected.length && characters + line.length > MAX_BATCH_CHARS) break;
            characters += line.length;
            selected.push({index, line, evidenceId:evidenceId(index)});
        }
        const scannedThrough = selected.length ? selected.at(-1).index + 1 : captions.length;
        return {start, selected, scannedThrough};
    }

    function checksum(value) {
        let hash = 2166136261;
        for (const character of String(value)) {
            hash ^= character.codePointAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function update(transcript, previousState, options = {}) {
        let state = normalizeState(previousState, previousState?.sessionId);
        const captions = Array.isArray(transcript) ? transcript : [];
        const prepared = preparedSources.get(captions);
        const fingerprints = prepared?.fingerprints || captions.map(captionFingerprint);
        const revision = prepared?.revision || `${captions.length}:${checksum(JSON.stringify(fingerprints))}`;
        let changedIndex = -1;
        for (let index = 0; index < state.processedCaptionCount; index += 1) {
            if (state.sourceFingerprints[index] !== fingerprints[index]) { changedIndex = index; break; }
        }
        let invalidated = false;
        if (changedIndex >= 0) {
            // Keep history, but remove outdated batches from the current draft before bounded rebuilding.
            const affected = state.revisions.filter(item => item.status !== 'superseded' && item.toCaption >= changedIndex);
            const restartAt = Math.min(changedIndex, ...affected.map(item => item.fromCaption));
            const revisions = state.revisions.map(item => affected.includes(item) ? {...item, status:'superseded'} : item);
            state = {...state, processedCaptionCount:restartAt, sourceFingerprints:state.sourceFingerprints.slice(0, restartAt), revisions,
                draft:revisions.filter(item => item.status !== 'superseded').map(item => item.text).join('\n\n').slice(-100000)};
            invalidated = true;
        }
        // Pausing generation must not present known obsolete source text as a current draft.
        if (!state.enabled) return {state, changed:invalidated, reason:'disabled'};
        if (state.paused && !options.force) return {state, changed:invalidated, reason:'paused'};
        if (state.failureCount >= 3 && !options.force) return {state, changed:invalidated, reason:'retry-limit'};
        if (revision === state.sourceRevision && state.processedCaptionCount >= captions.length) {
            return {state, changed:false, reason:'current'};
        }
        const batch = boundedBatch(captions, state);
        if (!batch.selected.length) return {state:{...state, sourceRevision:revision, processedCaptionCount:captions.length, sourceFingerprints:fingerprints}, changed:invalidated, reason:'empty'};
        if (!options.force && !invalidated && batch.selected.length < MIN_AUTOMATIC_CAPTIONS) return {state, changed:false, reason:'waiting'};
        const createdAt = isoDate(options.now, Date.now());
        const text = [`Rolling update · ${createdAt}`, ...batch.selected.map(item => item.line)].join('\n');
        const id = `rolling-${batch.selected[0].index + 1}-${batch.selected.at(-1).index + 1}-${checksum(`${revision}:${state.revisions.at(-1)?.id || 'root'}:${batch.selected.map(item => item.line).join('\n')}`)}`;
        if (state.revisions.some(item => item.id === id && item.status !== 'superseded')) {
            return {state:{...state, sourceRevision:revision}, changed:false, reason:'duplicate'};
        }
        const nextRevision = {
            id,
            createdAt,
            fromCaption:batch.selected[0].index,
            toCaption:batch.selected.at(-1).index,
            evidenceIds:batch.selected.map(item => item.evidenceId),
            text,
            status:'current',
            sourceRevision:revision
        };
        const revisions = [...state.revisions, nextRevision].slice(-MAX_REVISIONS);
        return {
            changed:true,
            reason:'updated',
            revision:nextRevision,
            state:{
                ...state,
                processedCaptionCount:batch.selected.at(-1).index + 1,
                sourceFingerprints:fingerprints.slice(0, batch.selected.at(-1).index + 1),
                sourceRevision:revision,
                lastUpdatedAt:createdAt,
                failureCount:0,
                lastError:'',
                revisions,
                draft:revisions.filter(item => item.status !== 'superseded').map(item => item.text).join('\n\n').slice(-100000)
            }
        };
    }

    function recordFailure(previousState, error) {
        const state = normalizeState(previousState, previousState?.sessionId);
        return {...state, failureCount:Math.min(3, state.failureCount + 1), lastError:cleanInline(error?.message || error, 500)};
    }

    root.CaptionKeepRollingNotes = Object.freeze({
        VERSION, MAX_REVISIONS, MAX_BATCH_CAPTIONS, MAX_BATCH_CHARS, MIN_AUTOMATIC_CAPTIONS, DEFAULT_INTERVAL_MS,
        storageKey, sourceRevision, prepareSource, processedSourceChanged, emptyState, normalizeState, boundedBatch, update, recordFailure
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepRollingNotes;
})(typeof globalThis !== 'undefined' ? globalThis : this);
