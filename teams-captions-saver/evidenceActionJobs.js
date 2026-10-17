(function initializeEvidenceActionJobs(root) {
    'use strict';
    const KEY = 'byomcp_jobs_v1';
    const LIMITS = Object.freeze({records:50, bytes:8 * 1024 * 1024, coreReserve:16 * 1024 * 1024, lifetime:86400000});
    const clone = value => structuredClone(value);
    const size = value => new TextEncoder().encode(JSON.stringify(value)).length;
    const HASH = /^[a-f0-9]{64}$/;

    // One privileged worker owns this store. Revision checks are not a claim
    // that chrome.storage provides a transaction/CAS primitive across writers.
    function create(options = {}) {
        const contracts = options.contracts || root.CaptionKeepEvidenceActionContracts;
        const storage = options.storage;
        if (!contracts || !storage?.get || !storage?.set) throw new Error('jobs-storage-unavailable');
        const now = options.now || (() => Date.now());
        const createId = options.createId || (() => root.crypto.randomUUID());
        const getSource = options.getSource || (async () => null);
        const getReviewedProfile = options.getReviewedProfile || (async () => null);
        const getPolicy = options.getPolicy || (async () => ({disabled:true}));
        const prepareRelease = options.prepareRelease || (async () => null);
        const verifyOperation = options.verifyOperation || (async () => false);
        const verifyApproveIntent = options.verifyApproveIntent || (async () => false);
        const verifyPinIntent = options.verifyPinIntent || (async () => false);
        const verifyResultProof = options.verifyResultProof || (async () => null);
        const getCapacity = options.getCapacity || (async () => null);
        const authorityRevision = options.getAuthorityRevision || (() => null);
        const transport = options.transport || {};
        const controllers = new Map();
        let tail = Promise.resolve();
        function serialize(action) {
            const prior = tail;
            const result = (async () => {await prior; return action();})();
            tail = result.catch(() => {});
            return result;
        }
        function epoch() {
            const value = authorityRevision();
            if (!Number.isSafeInteger(value) || value < 0) throw new Error('authority-unavailable');
            return value;
        }
        function unchanged(expected) {if (epoch() !== expected) throw new Error('authority-changed');}
        async function checked(promise, expected) {const value = await promise; unchanged(expected); return value;}
        async function read() {
            const stored = (await storage.get(KEY))[KEY];
            if (!stored) return {version:1, revision:0, jobs:{}};
            if (stored.version !== 1 || !Number.isSafeInteger(stored.revision) || !stored.jobs
                || Array.isArray(stored.jobs) || typeof stored.jobs !== 'object') throw new Error('jobs-store-invalid');
            return clone(stored);
        }
        async function save(ledger) {ledger.revision += 1; await storage.set({[KEY]:ledger});}
        function publicStatus(record) {
            return clone({jobId:record.approval.payload.jobId, revision:record.revision, state:record.state,
                attempts:record.attempts, result:['verified','pinned'].includes(record.state) ? record.result : null,
                proof:['verified','pinned'].includes(record.state) ? record.proof : null,
                ...(record.state === 'draft' ? {approvalDigest:record.approval.approvalDigest, preview:record.approval.payload} : {})});
        }
        function requirePolicy(policy, operation) {
            if (policy?.disabled !== false || policy.disableSessionHistory !== false) throw new Error('policy-denied');
            if (operation === 'write' && policy.allowWrites !== true) throw new Error('write-denied');
        }
        function connection(profile) {
            return {id:profile.id, revision:profile.revision, transport:profile.transport,
                profileDigest:profile.profileDigest, tools:clone(profile.tools)};
        }
        function selection(source, keys) {
            if (!source || !Array.isArray(source.captions) || !Array.isArray(keys) || !keys.length
                || keys.length > contracts.LIMITS.captions || new Set(keys).size !== keys.length) throw new Error('source-unavailable');
            const captions = keys.map(key => source.captions.find(caption => caption.key === key));
            if (captions.some(caption => !caption)) throw new Error('source-unavailable');
            return {sessionId:source.sessionId, sourceDigest:source.sourceDigest, revision:source.revision, captions:clone(captions)};
        }
        async function guard(record, {activeApproval = true} = {}) {
            if (record.expiresAt <= now()) throw new Error('record-expired');
            const expected = epoch();
            const payload = record.approval.payload;
            const source = await checked(getSource(payload.source.sessionId), expected);
            const selected = selection(source, payload.source.captions.map(caption => caption.key));
            if (await checked(contracts.digest(selected), expected) !== record.sourceWitness) throw new Error('source-changed');
            const profile = await checked(getReviewedProfile(payload.connection.id), expected);
            if (!profile) throw new Error('profile-unavailable');
            const policy = await checked(getPolicy(), expected);
            requirePolicy(policy, payload.operation);
            await checked(contracts.verifyApproval(record.approval, connection(profile), {
                disabled:false, requireScrubbed:policy.requireScrubbed !== false,
                now:activeApproval ? now : Date.parse(payload.createdAt)
            }), expected);
            if (!await checked(verifyOperation(clone(profile), clone(record.approval)), expected)) throw new Error('operation-unapproved');
            unchanged(expected);
            if (record.expiresAt <= now()) throw new Error('record-expired');
            if (activeApproval && now() >= Date.parse(payload.expiresAt)) throw new Error('approval-expired');
            return {expected, profile, policy};
        }
        async function getStatus(jobId) {
            const record = (await read()).jobs[jobId];
            if (!record) return {jobId, revision:null, state:'deleted', result:null};
            if (record.expiresAt <= now()) return expireStatus(jobId, record);
            try {await guard(record, {activeApproval:false});}
            catch {
                if (record.expiresAt <= now()) return expireStatus(jobId, record);
                await purgeDenied(jobId);
                return {jobId, revision:record.revision, state:'blocked', result:null, proof:null};
            }
            if (record.expiresAt <= now()) return expireStatus(jobId, record);
            return publicStatus(record);
        }
        async function expireStatus(jobId, record) {
            try {
                await serialize(async () => {
                    const ledger = await read(), current = ledger.jobs[jobId];
                    if (current?.revision === record.revision && current.expiresAt <= now()) {
                        controllers.get(jobId)?.abort(); delete ledger.jobs[jobId]; await save(ledger);
                    }
                });
            } catch { /* Storage failure cannot extend disclosure; recovery can retry cleanup. */ }
            return {jobId, revision:record.revision, state:'expired', result:null, proof:null};
        }
        async function mutate(jobId, expectedRevision, action, authorityExpected) {
            return serialize(async () => {
                const ledger = await read();
                const record = ledger.jobs[jobId];
                if (!record) throw new Error('job-unavailable');
                if (expectedRevision !== undefined && record.revision !== expectedRevision) throw new Error('job-changed');
                action(record, ledger);
                record.revision += 1;
                await save(ledger);
                if (authorityExpected !== undefined && epoch() !== authorityExpected) {
                    const current = await read();
                    const saved = current.jobs[jobId];
                    if (saved?.revision === record.revision) {
                        saved.state = 'outcome-unknown'; saved.result = null; saved.proof = null; saved.revision += 1;
                        await save(current);
                    }
                    throw new Error('authority-changed');
                }
                return clone(record);
            });
        }
        async function purgeDenied(jobId) {
            try {
                const policy = await getPolicy();
                if (policy?.disabled !== true && policy?.disableSessionHistory !== true) return;
                await serialize(async () => {
                    const ledger = await read();
                    if (ledger.jobs[jobId]) {delete ledger.jobs[jobId]; await save(ledger);}
                });
            } catch { /* Do not destroy recoverable data on an unknown policy/storage error. */ }
        }
        async function prepare(request) {
            request = clone(request);
            const expected = epoch();
            const source = selection(await checked(getSource(request.sourceId), expected), request.captionKeys);
            const profile = await checked(getReviewedProfile(request.profileId), expected);
            if (!profile) throw new Error('profile-unavailable');
            const policy = await checked(getPolicy(), expected);
            requirePolicy(policy, request.operation);
            const release = await checked(prepareRelease({source:clone(source), arguments:clone(request.arguments),
                privacyMode:request.privacyMode, policy:clone(policy)}), expected);
            if (!release?.source || release.source.sessionId !== source.sessionId || release.source.sourceDigest !== source.sourceDigest
                || release.source.revision !== source.revision || !Array.isArray(release.source.captions)
                || release.source.captions.length !== source.captions.length || release.source.captions.some((caption,index) =>
                    ['key','evidenceId','observedAt'].some(field => caption[field] !== source.captions[index][field]))) throw new Error('release-invalid');
            const created = now();
            const approval = await checked(contracts.sealApproval({jobId:createId(), connection:connection(profile),
                tool:request.tool, operation:request.operation, arguments:release.arguments, source:release.source,
                privacyMode:release.privacyMode, createdAt:new Date(created).toISOString(), expiresAt:new Date(created + 900000).toISOString()}), expected);
            const record = {approval, sourceWitness:await checked(contracts.digest(source), expected), revision:1,
                state:'draft', attempts:0, createdAt:created, expiresAt:created + LIMITS.lifetime, result:null, proof:null};
            await guard(record);
            return serialize(async () => {
                unchanged(expected);
                const ledger = await checked(read(), expected);
                if (ledger.jobs[approval.payload.jobId]) throw new Error('job-conflict');
                const reserved = Object.values(ledger.jobs).reduce((sum, job) => sum + (job.result ? 0 : contracts.LIMITS.resultBytes), 0);
                const free = await checked(getCapacity(), expected);
                const projected = {...ledger, jobs:{...ledger.jobs, [approval.payload.jobId]:record}};
                if (!Number.isFinite(free) || free < LIMITS.coreReserve + size(record) + contracts.LIMITS.resultBytes
                    || Object.keys(ledger.jobs).length >= LIMITS.records || size(projected) + reserved + contracts.LIMITS.resultBytes > LIMITS.bytes) throw new Error('optional-capacity');
                ledger.jobs[approval.payload.jobId] = record;
                await save(ledger);
                if (epoch() !== expected) {
                    // A policy/source revocation during persistence may not leave
                    // the newly prepared source excerpt behind.
                    const current = await read();
                    if (current.jobs[approval.payload.jobId]?.revision === 1) {delete current.jobs[approval.payload.jobId]; await save(current);}
                    throw new Error('authority-changed');
                }
                return publicStatus(record);
            });
        }
        async function approveAndDispatch({jobId, expectedRevision, approvalDigest}) {
            let record = (await read()).jobs[jobId];
            if (!record) throw new Error('job-unavailable');
            if (record.state !== 'draft') return getStatus(jobId); // no automatic retry; no stale disclosure
            if (record.revision !== expectedRevision || record.approval.approvalDigest !== approvalDigest) throw new Error('job-changed');
            const gate = await guard(record);
            if (!await checked(verifyApproveIntent(publicStatus(record)), gate.expected)) throw new Error('consent-unverified');
            try {
                record = await mutate(jobId, expectedRevision, value => {
                    unchanged(gate.expected);
                    value.state = 'running'; value.attempts += 1;
                    value.attemptId = createId(); value.attemptAt = now();
                }, gate.expected); // successful persistence precedes ALL transport I/O
            } catch (error) {await purgeDenied(jobId); throw error;}
            const attemptRevision = record.revision;
            const controller = new AbortController();
            controllers.set(jobId, controller);
            try {
                const assertDispatch = async () => {
                    const current = (await read()).jobs[jobId];
                    if (controller.signal.aborted || !current || current.revision !== attemptRevision || current.state !== 'running') throw new Error('job-changed');
                    const dispatchGate = await guard(current);
                    const after = (await read()).jobs[jobId];
                    unchanged(dispatchGate.expected);
                    if (!after || after.revision !== attemptRevision || controller.signal.aborted) throw new Error('job-changed');
                };
                await assertDispatch();
                if (typeof transport.invoke !== 'function') throw new Error('transport-unavailable');
                const currentGate = await guard(record);
                const response = await transport.invoke(clone(currentGate.profile), clone(record.approval), controller.signal, {assertDispatch});
                const candidate = contracts.validateResult(record.approval, response);
                const resultGate = await guard(record, {activeApproval:false});
                const proof = await checked(verifyResultProof(clone(record.approval), clone(candidate), clone(resultGate.profile)), resultGate.expected);
                if (!proof || proof.verified !== true || proof.jobId !== jobId || proof.approvalDigest !== record.approval.approvalDigest
                    || proof.sourceDigest !== record.approval.payload.source.sourceDigest || !HASH.test(proof.receiptDigest)
                    || Object.keys(proof).sort().join('|') !== 'approvalDigest|jobId|receiptDigest|sourceDigest|verified') throw new Error('result-unverified');
                const finalGate = await guard(record, {activeApproval:false});
                await mutate(jobId, attemptRevision, value => {
                    unchanged(finalGate.expected);
                    if (controller.signal.aborted || value.state !== 'running') throw new Error('job-changed');
                    value.result = clone(candidate); value.proof = clone(proof); value.state = 'verified';
                }, finalGate.expected);
            } catch {
                // Never expose free-form upstream errors or claim an unobserved
                // external operation failed/rolled back. No automatic resend.
                try {await mutate(jobId, attemptRevision, value => {value.state = 'outcome-unknown'; value.result = null; value.proof = null;});} catch {}
                await purgeDenied(jobId);
            } finally {controllers.delete(jobId);}
            return getStatus(jobId);
        }
        async function cancel({jobId, expectedRevision}) {
            if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error('job-revision-required');
            const record = await mutate(jobId, expectedRevision, value => {
                if (['verified','pinned'].includes(value.state)) throw new Error('job-already-completed');
                value.state = 'cancelled'; value.result = null; value.proof = null;
            });
            controllers.get(jobId)?.abort();
            return publicStatus(record);
        }
        async function pin({jobId, expectedRevision}) {
            if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new Error('job-revision-required');
            try {
                const record = (await read()).jobs[jobId];
                if (!record || record.state !== 'verified' || !record.proof) throw new Error('result-unverified');
                const gate = await guard(record, {activeApproval:false});
                if (!await checked(verifyPinIntent(publicStatus(record)), gate.expected)) throw new Error('pin-consent-unverified');
                await mutate(jobId, expectedRevision, value => {
                    unchanged(gate.expected);
                    if (value.state !== 'verified' || !value.proof) throw new Error('job-changed');
                    value.state = 'pinned'; value.pinnedAt = now();
                }, gate.expected);
                return getStatus(jobId);
            } catch (error) {
                await purgeDenied(jobId);
                const current = (await read()).jobs[jobId];
                if (current && current.expiresAt <= now()) await expireStatus(jobId, current);
                throw error;
            }
        }
        async function removeSource(sourceId) {
            return serialize(async () => {
                const ledger = await read(); let removed = 0;
                for (const [id,record] of Object.entries(ledger.jobs)) {
                    if (record.approval.payload.source.sessionId !== sourceId) continue;
                    controllers.get(id)?.abort(); delete ledger.jobs[id]; removed += 1;
                }
                if (removed) await save(ledger);
                return {removed};
            });
        }
        async function recover() {
            const identities = await serialize(async () => {
                const ledger = await read(); const expected = epoch();
                const policy = await checked(getPolicy(), expected);
                if (!policy || ![true,false].includes(policy.disabled) || ![true,false].includes(policy.disableSessionHistory)) throw new Error('policy-unavailable');
                let changed = false;
                for (const [id,record] of Object.entries(ledger.jobs)) {
                    if (policy.disabled !== false || policy.disableSessionHistory !== false || record.expiresAt <= now()) {
                        controllers.get(id)?.abort(); delete ledger.jobs[id]; changed = true; continue;
                    }
                    if (record.state === 'running') {record.state = 'outcome-unknown'; record.result = null; record.proof = null; record.revision += 1; changed = true;}
                    else if (record.state === 'draft' && Date.parse(record.approval.payload.expiresAt) <= now()) {record.state = 'expired'; record.revision += 1; changed = true;}
                }
                if (changed) {unchanged(expected); await save(ledger);}
                return Object.keys(ledger.jobs);
            });
            // Fresh status validation may purge denied records, so perform it
            // outside the storage queue rather than deadlocking that queue.
            return Promise.all(identities.map(getStatus));
        }
        return Object.freeze({prepare, approveAndDispatch, cancel, pin, getStatus, recover, removeSource});
    }
    root.CaptionKeepEvidenceActionJobs = Object.freeze({create, KEY, LIMITS});
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepEvidenceActionJobs;
})(globalThis);
