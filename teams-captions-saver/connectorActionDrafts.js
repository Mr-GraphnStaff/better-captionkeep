(function initializeConnectorActionDrafts(root) {
    'use strict';

    const FORMAT = 'better-captionkeep-connector-action-draft';
    const VERSION = 1;
    const STORAGE_KEY = 'connectorActionDraftsV1';
    const MAX_DRAFTS = 100;
    const MAX_FIELDS = 30;
    const TARGET_PROFILES = Object.freeze(['jira', 'azure_devops', 'microsoft_365', 'microsoft_planner', 'email', 'generic']);

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

    function evidenceIdsFor(job, values) {
        const selected = new Set((job.action?.selectedCaptions || []).map(caption => clean(caption.evidenceId, 80)).filter(Boolean));
        const evidenceIds = [...new Set((Array.isArray(values) ? values : []).map(value => clean(value, 80)).filter(Boolean))];
        if (!evidenceIds.length || evidenceIds.some(value => !selected.has(value))) {
            throw new TypeError('The connector action must reference only selected caption evidence.');
        }
        return Object.freeze(evidenceIds);
    }

    function buildDraft(job, input = {}, options = {}) {
        if (!job?.jobId || !job?.actionId || job.action?.intent !== 'prepare_work_item') {
            throw new TypeError('A prepare-work-item Evidence Action job is required.');
        }
        const requestedProfile = clean(job.action.destinationId, 100) || 'generic';
        const returnedProfile = clean(input.targetProfile, 100) || null;
        if (returnedProfile && !TARGET_PROFILES.includes(returnedProfile)) {
            throw new TypeError('The assistant returned an unsupported connector profile.');
        }
        const targetProfile = returnedProfile || (TARGET_PROFILES.includes(requestedProfile) ? requestedProfile : 'generic');
        if (requestedProfile !== 'generic' && TARGET_PROFILES.includes(requestedProfile) && targetProfile !== requestedProfile) {
            throw new TypeError('The assistant returned a draft for a different connector profile.');
        }
        const title = clean(input.title, 300);
        if (!title) throw new TypeError('The connector action draft requires a title.');
        const fields = (Array.isArray(input.fields) ? input.fields : []).slice(0, MAX_FIELDS).map((field, index) => {
            const name = clean(field?.name, 100);
            const value = clean(field?.value, 2000);
            if (!name || !value) throw new TypeError(`Connector field ${index + 1} is incomplete.`);
            return Object.freeze({name, value});
        });
        const allowedReviewOrigin = httpsUrl(options.allowedReviewOrigin);
        const candidateReviewUrl = httpsUrl(input.reviewUrl);
        const reviewUrl = allowedReviewOrigin && candidateReviewUrl
            && new URL(allowedReviewOrigin).origin === new URL(candidateReviewUrl).origin
            ? candidateReviewUrl
            : null;
        const reviewInstruction = clean(input.reviewInstruction, 500)
            || (reviewUrl ? 'Open the customer assistant to review and confirm this draft.' : 'Review and confirm this draft in the customer assistant.');
        const createdAt = (typeof options.now === 'function' ? options.now() : new Date()).toISOString();
        const createId = typeof options.createId === 'function' ? options.createId : () => crypto.randomUUID();
        const draftId = clean(createId(), 100);
        if (!draftId) throw new TypeError('Connector action draft identity is required.');
        return Object.freeze({
            format:FORMAT,
            version:VERSION,
            draftId,
            jobId:job.jobId,
            actionId:job.actionId,
            createdAt,
            targetProfile,
            operation:'create',
            title,
            description:clean(input.description, 6000) || null,
            fields:Object.freeze(fields),
            evidenceIds:evidenceIdsFor(job, input.evidenceIds),
            reviewUrl,
            reviewInstruction,
            confirmation:Object.freeze({
                required:true,
                owner:'customer_assistant',
                state:'awaiting_customer_confirmation',
                captionKeepCanConfirm:false
            }),
            provenance:Object.freeze({
                meetingSessionId:clean(job.action.source?.sessionId, 200) || null,
                evidenceActionSha256:job.envelopeSha256,
                sourceTranscriptAuthority:'The captured transcript remains authoritative. This connector draft is a derivative.'
            })
        });
    }

    async function sealDraft(draft) {
        return Object.freeze({...draft, sha256:await sha256Hex(draft)});
    }

    function validateDraft(draft) {
        const errors = [];
        if (draft?.format !== FORMAT || draft?.version !== VERSION) errors.push('Connector action draft format is not supported.');
        if (!clean(draft?.draftId, 100) || !clean(draft?.jobId, 100) || !clean(draft?.actionId, 100)) errors.push('Connector action draft identity is incomplete.');
        if (!TARGET_PROFILES.includes(draft?.targetProfile)) errors.push('Connector target profile is not supported.');
        if (!clean(draft?.title, 300)) errors.push('Connector action draft title is missing.');
        if (!Array.isArray(draft?.evidenceIds) || !draft.evidenceIds.length) errors.push('Connector action draft has no evidence IDs.');
        if (draft?.confirmation?.required !== true || draft?.confirmation?.owner !== 'customer_assistant'
            || draft?.confirmation?.state !== 'awaiting_customer_confirmation' || draft?.confirmation?.captionKeepCanConfirm !== false) {
            errors.push('Customer-side confirmation boundary is missing.');
        }
        if (!/^[a-f0-9]{64}$/i.test(clean(draft?.sha256, 64))) errors.push('Connector action draft seal is invalid.');
        return Object.freeze({valid:errors.length === 0, errors:Object.freeze(errors)});
    }

    async function verifyDraft(draft) {
        const validation = validateDraft(draft);
        if (!validation.valid) return validation;
        const unsigned = Object.fromEntries(Object.entries(draft).filter(([key]) => key !== 'sha256'));
        const expected = await sha256Hex(unsigned);
        const errors = expected === clean(draft.sha256, 64).toLowerCase()
            ? []
            : ['Connector action draft content does not match its seal.'];
        return Object.freeze({valid:errors.length === 0, errors:Object.freeze(errors)});
    }

    function validateSuccessReceipt(job, input = {}) {
        if (job?.action?.intent !== 'prepare_work_item') throw new TypeError('A prepare-work-item job is required.');
        if (input.customerConfirmed !== true) throw new TypeError('The customer assistant did not attest explicit confirmation.');
        const externalSystem = clean(input.externalSystem, 200);
        const externalRecordId = clean(input.externalRecordId, 500) || null;
        const externalRecordUrl = httpsUrl(input.externalRecordUrl);
        if (!externalSystem || (!externalRecordId && !externalRecordUrl)) {
            throw new TypeError('The connector receipt must identify the external system and created record.');
        }
        const actionTime = new Date(input.actionTime);
        if (!Number.isFinite(actionTime.getTime())) throw new TypeError('The connector receipt action time is invalid.');
        const evidenceIds = evidenceIdsFor(job, input.evidenceIds);
        return Object.freeze({
            customerConfirmed:true,
            externalSystem,
            externalRecordId,
            externalRecordUrl,
            actionTime:actionTime.toISOString(),
            evidenceIds
        });
    }

    function createRepository(storageArea, options = {}) {
        if (!storageArea?.get || !storageArea?.set) throw new TypeError('A storage area is required.');
        const storageKey = clean(options.storageKey, 200) || STORAGE_KEY;
        async function list() {
            const stored = await storageArea.get(storageKey);
            const verified = [];
            for (const draft of (Array.isArray(stored?.[storageKey]) ? stored[storageKey] : [])) {
                if ((await verifyDraft(draft)).valid) verified.push(draft);
            }
            return verified.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
        }
        async function save(draft) {
            const validation = await verifyDraft(draft);
            if (!validation.valid) throw new TypeError(validation.errors.join(' '));
            const remaining = (await list()).filter(existing => existing.draftId !== draft.draftId && existing.jobId !== draft.jobId);
            await storageArea.set({[storageKey]:[draft, ...remaining].slice(0, MAX_DRAFTS)});
            return draft;
        }
        return Object.freeze({storageKey, list, save});
    }

    root.CaptionKeepConnectorActionDrafts = Object.freeze({
        FORMAT, VERSION, STORAGE_KEY, MAX_DRAFTS, MAX_FIELDS, TARGET_PROFILES,
        buildDraft, sealDraft, validateDraft, verifyDraft, validateSuccessReceipt, createRepository, canonicalize, sha256Hex
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepConnectorActionDrafts;
})(typeof globalThis !== 'undefined' ? globalThis : this);
