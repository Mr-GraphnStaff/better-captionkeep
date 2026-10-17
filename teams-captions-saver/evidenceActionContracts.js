(function initializeEvidenceActionContracts(root) {
    'use strict';
    const VERSION = 1;
    const PROTOCOL_VERSION = '2026-07-28';
    // Reserve native response/status envelope overhead; native replies cap at 1 MiB.
    const LIMITS = Object.freeze({requestBytes:65536, resultBytes:1048576 - 32768, captions:12, depth:12, citations:100});
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const HASH = /^[a-f0-9]{64}$/;
    function sourceIdentityKind(value) {
        if (typeof value !== 'string') throw new Error('invalid-source-identity');
        if (UUID.test(value)) return 'document-uuid';
        if (/^session_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return 'archive-id';
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
            && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value) return 'recording-start';
        throw new Error('invalid-source-identity');
    }

    function canonical(value, depth = 0) {
        if (depth > LIMITS.depth) throw new Error('depth-limit');
        if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
        if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
        if (Array.isArray(value)) return `[${value.map(item => canonical(item, depth + 1)).join(',')}]`;
        if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('invalid-json');
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`).join(',')}}`;
    }
    function bytes(value) { return new TextEncoder().encode(canonical(value)).length; }
    async function digest(value) {
        const hash = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
        return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    function freeze(value) {
        if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
        return value;
    }
    function exactKeys(value, keys) {
        if (!value || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw new Error('unexpected-fields');
    }
    function checkProfile(profile) {
        if (!profile || !['stdio','remote'].includes(profile.transport) || typeof profile.id !== 'string'
            || !profile.id || !Number.isInteger(profile.revision) || profile.revision < 1
            || !HASH.test(profile.profileDigest) || !Array.isArray(profile.tools)) throw new Error('invalid-profile');
    }
    async function sealApproval(input) {
        exactKeys(input, ['jobId','connection','tool','operation','arguments','source','privacyMode','createdAt','expiresAt']);
        checkProfile(input.connection);
        if (!UUID.test(input.jobId) || !['scrubbed','reviewed-raw'].includes(input.privacyMode)) throw new Error('invalid-approval');
        const created = Date.parse(input.createdAt), expiry = Date.parse(input.expiresAt);
        if (!Number.isFinite(created) || !Number.isFinite(expiry) || expiry <= created || expiry - created > 900000) throw new Error('invalid-expiry');
        const grant = input.connection.tools.find(tool => tool.name === input.tool);
        if (!grant || !['read','write'].includes(input.operation) || grant.operation !== input.operation
            || (input.operation === 'read' && grant.readOnly !== true)
            || (input.operation === 'write' && grant.reviewedWrite !== true)
            || !HASH.test(grant.schemaDigest)) throw new Error('unapproved-tool');
        const source = input.source;
        exactKeys(source, ['sessionId','sourceDigest','revision','captions']);
        sourceIdentityKind(source.sessionId);
        if (!HASH.test(source.sourceDigest) || typeof source.revision !== 'string'
            || !source.revision || !Array.isArray(source.captions) || !source.captions.length
            || source.captions.length > LIMITS.captions) throw new Error('invalid-source');
        const keys = new Set();
        for (const caption of source.captions) {
            exactKeys(caption, ['key','evidenceId','text','observedAt']);
            if (typeof caption.key !== 'string' || !caption.key || keys.has(caption.key)
                || typeof caption.evidenceId !== 'string' || !caption.evidenceId || typeof caption.text !== 'string'
                || !caption.text || !Number.isFinite(Date.parse(caption.observedAt))) throw new Error('invalid-caption');
            keys.add(caption.key);
        }
        // All caller values are copied before the first asynchronous digest.
        const payload = JSON.parse(canonical(input));
        if (bytes(payload) > LIMITS.requestBytes) throw new Error('request-limit');
        return freeze({version:VERSION, protocolVersion:PROTOCOL_VERSION, payload, approvalDigest:await digest(payload)});
    }
    async function verifyApproval(approval, profile, {now = Date.now(), disabled = false, requireScrubbed = true} = {}) {
        approval = JSON.parse(canonical(approval));
        profile = JSON.parse(canonical(profile));
        if (disabled) throw new Error('policy-denied');
        exactKeys(approval, ['version','protocolVersion','payload','approvalDigest']);
        if (approval.version !== VERSION || approval.protocolVersion !== PROTOCOL_VERSION) throw new Error('unsupported-version');
        const sealed = await sealApproval(approval.payload);
        if (sealed.approvalDigest !== approval.approvalDigest) throw new Error('approval-tampered');
        const connection = approval.payload.connection;
        checkProfile(profile);
        if (connection.id !== profile.id || connection.revision !== profile.revision
            || connection.profileDigest !== profile.profileDigest || canonical(connection.tools) !== canonical(profile.tools)
            || connection.transport !== profile.transport) throw new Error('profile-changed');
        const checkedAt = typeof now === 'function' ? now() : now;
        if (checkedAt < Date.parse(approval.payload.createdAt) || checkedAt >= Date.parse(approval.payload.expiresAt)) throw new Error('approval-expired');
        if (requireScrubbed && approval.payload.privacyMode !== 'scrubbed') throw new Error('scrubbing-required');
        return sealed;
    }
    function validateResult(approval, result) {
        exactKeys(result, ['version','jobId','approvalDigest','sessionId','sourceDigest','status','answer','citations']);
        if (bytes(result) > LIMITS.resultBytes) throw new Error('result-limit');
        const source = approval.payload.source;
        if (result.version !== VERSION || result.jobId !== approval.payload.jobId || result.approvalDigest !== approval.approvalDigest
            || result.sessionId !== source.sessionId || result.sourceDigest !== source.sourceDigest
            || !['received','insufficient-evidence'].includes(result.status) || typeof result.answer !== 'string'
            || !Array.isArray(result.citations) || result.citations.length > LIMITS.citations) throw new Error('result-binding');
        const keys = new Set(source.captions.map(caption => caption.key));
        if (result.citations.some(key => typeof key !== 'string' || !keys.has(key))
            || (result.status === 'received' && result.answer && !result.citations.length)) throw new Error('invalid-citations');
        return freeze(JSON.parse(canonical(result)));
    }
    root.CaptionKeepEvidenceActionContracts = Object.freeze({VERSION, PROTOCOL_VERSION, LIMITS, canonical, bytes, digest, sourceIdentityKind, sealApproval, verifyApproval, validateResult});
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepEvidenceActionContracts;
})(globalThis);
