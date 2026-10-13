(function initializeDerivedArtifacts(root) {
    'use strict';

    const KINDS = Object.freeze(['moment', 'live-notes', 'template-run', 'answer']);
    const STATUSES = Object.freeze(['draft', 'user-confirmed', 'superseded', 'deleted']);
    const MAX_REFERENCES = 500;
    const MAX_PER_SESSION = 50;
    const MAX_PAYLOAD_CHARS = 6500000;

    function cleanText(value, limit = 200) {
        return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
    }

    function normalizeReferences(values) {
        if (!Array.isArray(values)) return [];
        return [...new Set(values.map(value => cleanText(value)).filter(Boolean))].slice(0, MAX_REFERENCES);
    }

    function normalizeHash(value) {
        const hash = cleanText(value, 64).toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('A valid source transcript SHA-256 is required.');
        return hash;
    }

    function normalizePayload(value) {
        const payload = value && typeof value === 'object' ? structuredClone(value) : {};
        const screenshot = payload.screenshot;
        if (screenshot && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(screenshot) || screenshot.length > 6000000)) {
            throw new Error('Moment screenshot must be a PNG smaller than 6 MB encoded.');
        }
        if (JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) throw new Error('Derived artifact payload is too large.');
        return payload;
    }

    function evidenceIdsInText(value) {
        return [...new Set([...String(value || '').matchAll(/\bC(\d{4,})\b/g)].map(match => `C${match[1]}`))];
    }

    function assertCitations(value, sourceCaptionCount) {
        const text = String(value || '').trim();
        if (!text) throw new Error('Enter a reviewed draft before saving.');
        const citations = evidenceIdsInText(text);
        if (!citations.length) throw new Error('Add at least one caption citation such as C0001 before saving.');
        for (const citation of citations) {
            const index = Number.parseInt(citation.slice(1), 10) - 1;
            if (index < 0 || index >= sourceCaptionCount) throw new Error(`${citation} is not present in this transcript snapshot.`);
        }
        return citations;
    }

    function normalize(input = {}) {
        const kind = cleanText(input.kind, 40);
        if (!KINDS.includes(kind)) throw new Error(`Unsupported derived artifact kind: ${kind || 'missing'}.`);
        const status = cleanText(input.status || 'draft', 40);
        if (!STATUSES.includes(status)) throw new Error(`Unsupported derived artifact status: ${status || 'missing'}.`);
        const sessionId = cleanText(input.sessionId);
        if (!sessionId) throw new Error('A source meeting session is required.');
        const sourceCaptionCount = Number(input.sourceCaptionCount);
        if (!Number.isInteger(sourceCaptionCount) || sourceCaptionCount < 0) {
            throw new Error('Source caption count must be a non-negative integer.');
        }
        const createdAt = new Date(input.createdAt || Date.now());
        if (Number.isNaN(createdAt.valueOf())) throw new Error('Derived artifact creation time is invalid.');
        const createdBy = input.createdBy === 'model' ? 'model' : 'user';
        return {
            version: 1,
            id: cleanText(input.id || root.crypto?.randomUUID?.() || `artifact-${Date.now()}`),
            kind,
            sessionId,
            sourceTranscriptSha256: normalizeHash(input.sourceTranscriptSha256),
            sourceRevision: cleanText(input.sourceRevision || String(sourceCaptionCount), 100),
            sourceCaptionCount,
            sourceKeys: normalizeReferences(input.sourceKeys),
            evidenceIds: normalizeReferences(input.evidenceIds),
            createdAt: createdAt.toISOString(),
            createdBy,
            generator: cleanText(input.generator || (createdBy === 'model' ? 'gateway' : 'local'), 100),
            templateId: cleanText(input.templateId, 100),
            templateVersion: cleanText(input.templateVersion, 100),
            payload: normalizePayload(input.payload),
            status
        };
    }

    function storageKey(sessionId) {
        const normalized = cleanText(sessionId);
        if (!normalized) throw new Error('A source meeting session is required.');
        return `derived_artifacts_${encodeURIComponent(normalized)}`;
    }

    function normalizeCollection(values) {
        if (!Array.isArray(values)) return [];
        return values.slice(-MAX_PER_SESSION).map(normalize);
    }

    function upsert(values, input) {
        const artifact = normalize(input);
        const previous = normalizeCollection(values);
        const next = previous.filter(item => item.id !== artifact.id);
        next.push(artifact);
        return next.slice(-MAX_PER_SESSION);
    }

    root.CaptionKeepDerivedArtifacts = Object.freeze({KINDS, STATUSES, MAX_REFERENCES, MAX_PER_SESSION, MAX_PAYLOAD_CHARS,
        normalize, normalizeCollection, storageKey, upsert, evidenceIdsInText, assertCitations});
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepDerivedArtifacts;
})(typeof globalThis !== 'undefined' ? globalThis : this);
