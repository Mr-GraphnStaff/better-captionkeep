(function initializeResearchCards(root) {
    'use strict';

    const FORMAT = 'better-captionkeep-research-card';
    const VERSION = 1;
    const STORAGE_KEY = 'researchCardsV1';
    const MAX_CARDS = 100;
    const MAX_CLAIMS = 50;
    const MAX_CITATIONS = 100;
    const SOURCE_TYPES = Object.freeze(['meeting_caption', 'organization', 'public_web']);

    function clean(value, maximum = 1000) {
        return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);
    }

    function httpsUrl(value) {
        if (!value) return null;
        try {
            const url = new URL(String(value));
            if (url.protocol !== 'https:' || url.username || url.password) return null;
            url.hash = '';
            return url.toString();
        } catch {
            return null;
        }
    }

    function canonicalize(value) {
        if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
        if (value && typeof value === 'object') {
            return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
        }
        return JSON.stringify(value);
    }

    async function sha256Hex(value) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalize(value)));
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function buildCard(job, input = {}, options = {}) {
        if (!job?.jobId || !job?.actionId || job.action?.intent !== 'research_reference') {
            throw new TypeError('A research Evidence Action job is required.');
        }
        const selectedEvidence = new Set((job.action.selectedCaptions || []).map(caption => clean(caption.evidenceId, 80)));
        const citations = (Array.isArray(input.citations) ? input.citations : []).slice(0, MAX_CITATIONS).map((citation, index) => {
            const citationId = clean(citation?.citationId, 80) || `S${String(index + 1).padStart(3, '0')}`;
            const sourceType = SOURCE_TYPES.includes(citation?.sourceType) ? citation.sourceType : '';
            const evidenceId = clean(citation?.evidenceId, 80) || null;
            const sourceUrl = httpsUrl(citation?.sourceUrl);
            if (!sourceType) throw new TypeError(`Citation ${citationId} has an unsupported source type.`);
            if (sourceType === 'meeting_caption' && (!evidenceId || !selectedEvidence.has(evidenceId))) {
                throw new TypeError(`Citation ${citationId} does not reference selected meeting evidence.`);
            }
            if (sourceType !== 'meeting_caption' && !sourceUrl) {
                throw new TypeError(`Citation ${citationId} requires an HTTPS source URL.`);
            }
            return Object.freeze({
                citationId,
                sourceType,
                evidenceId,
                sourceLabel:clean(citation?.sourceLabel, 300) || (evidenceId ? `Meeting caption ${evidenceId}` : 'Source'),
                sourceUrl,
                excerpt:clean(citation?.excerpt, 1000) || null,
                retrievedAt:clean(citation?.retrievedAt, 100) || null
            });
        });
        const citationIds = new Set(citations.map(citation => citation.citationId));
        if (!citations.length) throw new TypeError('A Research Card requires at least one citation.');
        if (citationIds.size !== citations.length) throw new TypeError('Research Card citation IDs must be unique.');
        const claims = (Array.isArray(input.claims) ? input.claims : []).slice(0, MAX_CLAIMS).map((claim, index) => {
            const text = clean(claim?.text, 2000);
            const references = [...new Set((Array.isArray(claim?.citationIds) ? claim.citationIds : [])
                .map(value => clean(value, 80)).filter(Boolean))];
            if (!text) throw new TypeError(`Research claim ${index + 1} has no text.`);
            if (!references.length || references.some(reference => !citationIds.has(reference))) {
                throw new TypeError(`Research claim ${index + 1} is not fully cited.`);
            }
            return Object.freeze({claimId:`R${String(index + 1).padStart(3, '0')}`, text, citationIds:Object.freeze(references)});
        });
        if (!claims.length) throw new TypeError('A Research Card requires at least one cited claim.');
        const createdAt = (typeof options.now === 'function' ? options.now() : new Date()).toISOString();
        const createId = typeof options.createId === 'function' ? options.createId : () => crypto.randomUUID();
        return Object.freeze({
            format:FORMAT,
            version:VERSION,
            cardId:clean(createId(), 100),
            jobId:job.jobId,
            actionId:job.actionId,
            createdAt,
            title:clean(input.title, 300) || 'Research result',
            summary:clean(input.summary, 4000) || null,
            claims:Object.freeze(claims),
            citations:Object.freeze(citations),
            provenance:Object.freeze({
                meetingSessionId:clean(job.action.source?.sessionId, 200) || null,
                evidenceActionSha256:job.envelopeSha256,
                sourceTranscriptAuthority:'The captured transcript remains authoritative. This Research Card is a derivative.'
            })
        });
    }

    async function sealCard(card) {
        return Object.freeze({...card, sha256:await sha256Hex(card)});
    }

    function validateCard(card) {
        const errors = [];
        if (card?.format !== FORMAT || card?.version !== VERSION) errors.push('Research Card format is not supported.');
        if (!clean(card?.cardId, 100) || !clean(card?.jobId, 100) || !clean(card?.actionId, 100)) errors.push('Research Card identity is incomplete.');
        if (!Array.isArray(card?.claims) || !card.claims.length) errors.push('Research Card has no claims.');
        if (!Array.isArray(card?.citations) || !card.citations.length) errors.push('Research Card has no citations.');
        if (!/^[a-f0-9]{64}$/i.test(clean(card?.sha256, 64))) errors.push('Research Card seal is invalid.');
        return Object.freeze({valid:errors.length === 0, errors:Object.freeze(errors)});
    }

    function toLiveChatDraft(card) {
        const validation = validateCard(card);
        if (!validation.valid) throw new TypeError(validation.errors.join(' '));
        const citations = new Map(card.citations.map(citation => [citation.citationId, citation]));
        const claims = card.claims.slice(0, 3);
        const usedCitationIds = [...new Set(claims.flatMap(claim => claim.citationIds))];
        const lines = [
            `Research update — ${clean(card.title, 300)}`,
            ...(card.summary ? ['', clean(card.summary, 1200)] : []),
            '',
            ...claims.map(claim => {
                const labels = claim.citationIds.map(id => clean(citations.get(id)?.sourceLabel, 120) || id);
                return `• ${clean(claim.text, 1000)} [${labels.join('; ')}]`;
            }),
            '',
            'Sources:',
            ...usedCitationIds.map(id => {
                const citation = citations.get(id);
                const label = clean(citation?.sourceLabel, 180) || id;
                return citation?.sourceUrl ? `• ${label}: ${citation.sourceUrl}` : `• ${label}`;
            }),
            '',
            'AI-assisted research. Review the cited sources before relying on this reply.'
        ];
        return lines.join('\n').slice(0, 4000);
    }

    async function verifyCard(card) {
        const validation = validateCard(card);
        if (!validation.valid) return validation;
        const unsigned = Object.fromEntries(Object.entries(card).filter(([key]) => key !== 'sha256'));
        const errors = await sha256Hex(unsigned) === clean(card.sha256, 64).toLowerCase()
            ? []
            : ['Research Card content does not match its seal.'];
        return Object.freeze({valid:errors.length === 0, errors:Object.freeze(errors)});
    }

    function createRepository(storageArea, options = {}) {
        if (!storageArea?.get || !storageArea?.set) throw new TypeError('A storage area is required.');
        const storageKey = clean(options.storageKey, 200) || STORAGE_KEY;
        async function list() {
            const stored = await storageArea.get(storageKey);
            const verified = [];
            for (const card of (Array.isArray(stored?.[storageKey]) ? stored[storageKey] : [])) {
                if ((await verifyCard(card)).valid) verified.push(card);
            }
            return verified.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
        }
        async function save(card) {
            const validation = await verifyCard(card);
            if (!validation.valid) throw new TypeError(validation.errors.join(' '));
            const remaining = (await list()).filter(existing => existing.cardId !== card.cardId && existing.jobId !== card.jobId);
            await storageArea.set({[storageKey]:[card, ...remaining].slice(0, MAX_CARDS)});
            return card;
        }
        return Object.freeze({storageKey, list, save});
    }

    root.CaptionKeepResearchCards = Object.freeze({
        FORMAT, VERSION, STORAGE_KEY, MAX_CARDS, MAX_CLAIMS, MAX_CITATIONS, SOURCE_TYPES,
        buildCard, sealCard, validateCard, verifyCard, createRepository, canonicalize, sha256Hex, toLiveChatDraft
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepResearchCards;
})(typeof globalThis !== 'undefined' ? globalThis : this);
