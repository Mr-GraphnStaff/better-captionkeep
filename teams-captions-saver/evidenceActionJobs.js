(function initializeEvidenceActionJobs(root) {
    'use strict';

    const FORMAT = 'better-captionkeep-evidence-action-job';
    const RECEIPT_FORMAT = 'better-captionkeep-evidence-action-receipt';
    const VERSION = 1;
    const STORAGE_KEY = 'evidenceActionJobsV1';
    const MAX_JOBS = 100;
    const STATES = Object.freeze([
        'reviewed', 'queued', 'submitting', 'running', 'confirmation_required',
        'succeeded', 'failed', 'cancelled', 'expired'
    ]);
    const FINAL_STATES = new Set(['succeeded', 'cancelled', 'expired']);
    const TRANSITIONS = Object.freeze({
        reviewed: Object.freeze(['queued', 'cancelled', 'expired']),
        queued: Object.freeze(['submitting', 'cancelled', 'expired']),
        submitting: Object.freeze(['running', 'confirmation_required', 'succeeded', 'failed', 'cancelled', 'expired']),
        running: Object.freeze(['confirmation_required', 'succeeded', 'failed', 'cancelled', 'expired']),
        confirmation_required: Object.freeze(['running', 'succeeded', 'failed', 'cancelled', 'expired']),
        failed: Object.freeze(['queued', 'cancelled', 'expired']),
        succeeded: Object.freeze([]),
        cancelled: Object.freeze([]),
        expired: Object.freeze([])
    });

    function clean(value, maximum = 500) {
        return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);
    }

    function isoDate(value, label) {
        const parsed = new Date(value);
        if (!Number.isFinite(parsed.getTime())) throw new TypeError(`${label} is not a valid date.`);
        return parsed.toISOString();
    }

    function nowIso(options = {}) {
        const now = typeof options.now === 'function' ? options.now() : new Date();
        return isoDate(now, 'Current time');
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

    function createJob(sealedEnvelope, options = {}) {
        if (!sealedEnvelope || typeof sealedEnvelope !== 'object') {
            throw new TypeError('A sealed Evidence Action is required.');
        }
        const actionId = clean(sealedEnvelope.actionId, 100);
        const envelopeSha256 = clean(sealedEnvelope.sha256, 64);
        if (!actionId || !/^[a-f0-9]{64}$/i.test(envelopeSha256)) {
            throw new TypeError('The Evidence Action must have an action ID and SHA-256 seal.');
        }
        const createdAt = nowIso(options);
        const expiresAt = isoDate(sealedEnvelope.expiresAt, 'Evidence Action expiry');
        if (new Date(expiresAt).getTime() <= new Date(createdAt).getTime()) {
            throw new RangeError('The Evidence Action has expired.');
        }
        const createId = typeof options.createId === 'function' ? options.createId : () => crypto.randomUUID();
        const jobId = clean(createId(), 100);
        if (!jobId) throw new TypeError('Evidence Action job identity is required.');
        return Object.freeze({
            format: FORMAT,
            version: VERSION,
            jobId,
            actionId,
            envelopeSha256: envelopeSha256.toLowerCase(),
            idempotencyKey: `evidence-action:${actionId}:${envelopeSha256.toLowerCase()}`,
            state: 'reviewed',
            revision: 1,
            attempts: 0,
            remoteJobId: null,
            createdAt,
            updatedAt: createdAt,
            expiresAt,
            action: sealedEnvelope,
            receipt: null,
            lastError: null
        });
    }

    function validateJob(job) {
        const errors = [];
        if (!job || typeof job !== 'object' || Array.isArray(job)) errors.push('Job must be an object.');
        if (job?.format !== FORMAT || job?.version !== VERSION) errors.push('Job format is not supported.');
        if (!clean(job?.jobId, 100) || !clean(job?.actionId, 100)) errors.push('Job and action IDs are required.');
        if (!STATES.includes(job?.state)) errors.push('Job state is not supported.');
        if (!Number.isInteger(job?.revision) || job.revision < 1) errors.push('Job revision is invalid.');
        if (!Number.isInteger(job?.attempts) || job.attempts < 0) errors.push('Job attempt count is invalid.');
        if (job?.remoteJobId != null && (!clean(job.remoteJobId, 200) || String(job.remoteJobId).length > 200)) {
            errors.push('Remote job ID is invalid.');
        }
        if (!/^[a-f0-9]{64}$/i.test(clean(job?.envelopeSha256, 64))) errors.push('Envelope seal is invalid.');
        if (clean(job?.actionId, 100) !== clean(job?.action?.actionId, 100)) errors.push('Stored Evidence Action identity does not match the job.');
        if (clean(job?.action?.sha256, 64).toLowerCase() !== clean(job?.envelopeSha256, 64).toLowerCase()) {
            errors.push('Stored Evidence Action does not match the job seal.');
        }
        if (job?.idempotencyKey !== `evidence-action:${clean(job?.actionId, 100)}:${clean(job?.envelopeSha256, 64).toLowerCase()}`) {
            errors.push('Evidence Action idempotency key does not match the job seal.');
        }
        if (job?.action?.trust?.captionContent !== 'untrusted_data' || !clean(job?.action?.trust?.instructionBoundary, 1000)) {
            errors.push('Stored Evidence Action is missing its untrusted-data boundary.');
        }
        if (['succeeded', 'failed'].includes(job?.state) && job?.receipt?.status !== job.state) {
            errors.push('Completed job receipt does not match the job state.');
        }
        return Object.freeze({valid: errors.length === 0, errors: Object.freeze(errors)});
    }

    async function verifyJob(job) {
        const validation = validateJob(job);
        const errors = [...validation.errors];
        if (!errors.length) {
            const unsignedAction = Object.fromEntries(Object.entries(job.action).filter(([key]) => key !== 'sha256'));
            if (await sha256Hex(unsignedAction) !== job.envelopeSha256.toLowerCase()) {
                errors.push('Stored Evidence Action content does not match its seal.');
            }
            if (job.receipt) {
                if (job.receipt.format !== RECEIPT_FORMAT || job.receipt.version !== VERSION
                    || job.receipt.jobId !== job.jobId || job.receipt.actionId !== job.actionId
                    || job.receipt.idempotencyKey !== job.idempotencyKey
                    || !/^[a-f0-9]{64}$/i.test(clean(job.receipt.sha256, 64))) {
                    errors.push('Evidence Action receipt identity or seal is invalid.');
                } else {
                    const unsignedReceipt = Object.fromEntries(Object.entries(job.receipt).filter(([key]) => key !== 'sha256'));
                    if (await sha256Hex(unsignedReceipt) !== job.receipt.sha256.toLowerCase()) {
                        errors.push('Evidence Action receipt content does not match its seal.');
                    }
                }
            }
        }
        return Object.freeze({valid:errors.length === 0, errors:Object.freeze(errors)});
    }

    async function createReceipt(job, outcome = {}, options = {}) {
        const validation = validateJob(job);
        if (!validation.valid) throw new TypeError(validation.errors.join(' '));
        const status = outcome.status === 'succeeded' ? 'succeeded' : 'failed';
        const completedAt = nowIso(options);
        const createId = typeof options.createId === 'function' ? options.createId : () => crypto.randomUUID();
        const receiptId = clean(createId(), 100);
        if (!receiptId) throw new TypeError('Receipt identity is required.');
        const citations = Array.isArray(outcome.citations)
            ? outcome.citations.slice(0, 100).map(citation => Object.freeze({
                evidenceId: clean(citation?.evidenceId, 80) || null,
                sourceLabel: clean(citation?.sourceLabel, 300) || null,
                sourceUrl: clean(citation?.sourceUrl, 2048) || null
            }))
            : [];
        const receipt = Object.freeze({
            format: RECEIPT_FORMAT,
            version: VERSION,
            receiptId,
            jobId: job.jobId,
            actionId: job.actionId,
            idempotencyKey: job.idempotencyKey,
            status,
            completedAt,
            assistantId: clean(outcome.assistantId, 200) || null,
            remoteJobId: clean(outcome.remoteJobId, 200) || null,
            resultKind: clean(outcome.resultKind, 100) || null,
            resultReference: clean(outcome.resultReference, 2048) || null,
            resultSha256: /^[a-f0-9]{64}$/i.test(clean(outcome.resultSha256, 64))
                ? clean(outcome.resultSha256, 64).toLowerCase()
                : null,
            citations: Object.freeze(citations),
            customerConfirmed: outcome.customerConfirmed === true,
            externalSystem: clean(outcome.externalSystem, 200) || null,
            externalRecordId: clean(outcome.externalRecordId, 500) || null,
            externalRecordUrl: clean(outcome.externalRecordUrl, 2048) || null,
            actionTime: clean(outcome.actionTime, 100) || null,
            evidenceIds: Object.freeze((Array.isArray(outcome.evidenceIds) ? outcome.evidenceIds : [])
                .slice(0, 50).map(value => clean(value, 80)).filter(Boolean)),
            errorCode: status === 'failed' ? clean(outcome.errorCode, 100) || 'assistant_failed' : null,
            errorMessage: status === 'failed' ? clean(outcome.errorMessage, 500) || 'The assistant did not complete the request.' : null
        });
        return Object.freeze({...receipt, sha256:await sha256Hex(receipt)});
    }

    function transition(job, nextState, options = {}) {
        const validation = validateJob(job);
        if (!validation.valid) throw new TypeError(validation.errors.join(' '));
        if (!STATES.includes(nextState)) throw new TypeError('Job state is not supported.');
        if (!TRANSITIONS[job.state].includes(nextState)) {
            throw new Error(`Evidence Action job cannot move from ${job.state} to ${nextState}.`);
        }
        if (Number.isInteger(options.expectedRevision) && options.expectedRevision !== job.revision) {
            throw new Error('Evidence Action job changed before this update.');
        }
        const updatedAt = nowIso(options);
        const expired = new Date(job.expiresAt).getTime() <= new Date(updatedAt).getTime();
        if (expired && nextState !== 'expired') throw new RangeError('The Evidence Action has expired.');
        const receipt = options.receipt || null;
        if (nextState === 'succeeded' && receipt?.status !== 'succeeded') {
            throw new TypeError('A successful receipt is required to complete this job.');
        }
        if (nextState === 'failed' && receipt?.status !== 'failed') {
            throw new TypeError('A failure receipt is required to fail this job.');
        }
        if (['succeeded', 'failed'].includes(nextState) && !/^[a-f0-9]{64}$/i.test(clean(receipt?.sha256, 64))) {
            throw new TypeError('A sealed receipt is required to complete this job.');
        }
        return Object.freeze({
            ...job,
            state: nextState,
            revision: job.revision + 1,
            attempts: nextState === 'submitting' ? job.attempts + 1 : job.attempts,
            remoteJobId: clean(options.remoteJobId ?? job.remoteJobId, 200) || null,
            updatedAt,
            receipt: receipt || job.receipt,
            lastError: nextState === 'failed'
                ? Object.freeze({code: receipt.errorCode, message: receipt.errorMessage, at: updatedAt})
                : (nextState === 'queued' ? null : job.lastError)
        });
    }

    function createRepository(storageArea, options = {}) {
        if (!storageArea?.get || !storageArea?.set) throw new TypeError('A storage area is required.');
        const storageKey = clean(options.storageKey, 200) || STORAGE_KEY;

        async function list() {
            const stored = await storageArea.get(storageKey);
            const jobs = Array.isArray(stored?.[storageKey]) ? stored[storageKey] : [];
            const verified = [];
            for (const job of jobs) {
                if ((await verifyJob(job)).valid) verified.push(job);
            }
            return verified.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
        }

        async function get(jobId) {
            const normalized = clean(jobId, 100);
            return (await list()).find(job => job.jobId === normalized) || null;
        }

        async function save(job, options = {}) {
            const validation = await verifyJob(job);
            if (!validation.valid) throw new TypeError(validation.errors.join(' '));
            const jobs = await list();
            const existing = jobs.find(candidate => candidate.jobId === job.jobId);
            if (existing && Number.isInteger(options.expectedRevision) && existing.revision !== options.expectedRevision) {
                throw new Error('Evidence Action job changed before it could be saved.');
            }
            const remaining = jobs.filter(candidate => candidate.jobId !== job.jobId);
            const next = [job, ...remaining]
                .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
                .slice(0, MAX_JOBS);
            await storageArea.set({[storageKey]: next});
            return job;
        }

        async function create(sealedEnvelope, createOptions = {}) {
            const candidate = createJob(sealedEnvelope, createOptions);
            const duplicate = (await list()).find(job => job.idempotencyKey === candidate.idempotencyKey && !FINAL_STATES.has(job.state));
            if (duplicate) return Object.freeze({job: duplicate, created: false});
            await save(candidate);
            return Object.freeze({job: candidate, created: true});
        }

        async function move(jobId, nextState, moveOptions = {}) {
            const current = await get(jobId);
            if (!current) throw new Error('Evidence Action job was not found.');
            const updated = transition(current, nextState, {...moveOptions, expectedRevision: current.revision});
            await save(updated, {expectedRevision: current.revision});
            return updated;
        }

        return Object.freeze({storageKey, list, get, save, create, move});
    }

    root.CaptionKeepEvidenceActionJobs = Object.freeze({
        FORMAT,
        RECEIPT_FORMAT,
        VERSION,
        STORAGE_KEY,
        MAX_JOBS,
        STATES,
        FINAL_STATES: Object.freeze([...FINAL_STATES]),
        TRANSITIONS,
        createJob,
        createReceipt,
        transition,
        validateJob,
        verifyJob,
        canonicalize,
        sha256Hex,
        createRepository
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepEvidenceActionJobs;
})(typeof globalThis !== 'undefined' ? globalThis : this);
