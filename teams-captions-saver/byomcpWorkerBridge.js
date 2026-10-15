(function initializeByomcpWorkerBridge(root) {
    'use strict';
    const PAGES = new Set(['/popup.html','/settings.html','/sidepanel.html','/viewer.html']);
    const CONNECTION_CODES = new Set(['native-host-not-found','native-host-start-failed','native-host-forbidden','native-host-exited',
        'native-communication-error','native-timeout','enrollment-mismatch','configuration-required','permission-denied','native-connection-failed']);
    const CONNECTION_STAGES = new Set(['worker-received','policy-check','permission-check','configuration-check','native-opening','challenge','enrollment','connected']);
    const copy = value => structuredClone(value);
    async function describeSource(sessionId, transcript, recordedAt) {
        if (!Array.isArray(transcript) || !transcript.length) return null;
        const snapshot = copy(transcript), contracts = root.CaptionKeepEvidenceActionContracts;
        if (!contracts) throw new Error('contracts-unavailable');
        const captions = snapshot.map((caption,index) => {
            const observedAt = Number.isFinite(Date.parse(caption.capturedAt)) ? caption.capturedAt : recordedAt;
            if (!Number.isFinite(Date.parse(observedAt))) throw new Error('source-time-unavailable');
            return {key:root.CaptionKeepCorrections.sourceKey(caption,index), evidenceId:`C${String(index+1).padStart(4,'0')}`,
                text:String(caption.Text || ''), observedAt};
        });
        return {sessionId,sourceDigest:await contracts.digest({sessionId,transcript:snapshot}),
            revision:`${snapshot.length}:${snapshot.at(-1)?.key || ''}`,captions};
    }
    function create(options = {}) {
        const chrome = options.chrome || root.chrome, storage = chrome.storage.local;
        const jobsModule = options.jobsModule || root.CaptionKeepEvidenceActionJobs;
        const adapter = options.adapter || {};
        let revision = 0;
        const bump = () => ++revision;
        const readPolicy = options.readPolicy || (async () => ({disabled:true}));
        const source = options.getSource || (async () => null);
        const pendingIntents = new Set();
        const allow = sender => {
            if (sender?.id !== chrome.runtime.id) return false;
            try {
                const url = new URL(sender.url), base = new URL(chrome.runtime.getURL(''));
                return url.protocol === base.protocol && url.host === base.host && PAGES.has(url.pathname);
            } catch {return false;}
        };
        async function enabled() {
            const policy = await readPolicy();
            if (policy?.disabled !== false || policy.disableSessionHistory !== false) throw new Error('policy-denied');
            return policy;
        }
        async function profile(id) {
            if (typeof adapter.localStatus !== 'function' || typeof adapter.getReviewedProfile !== 'function') return null;
            const status = await adapter.localStatus();
            if (status?.enrollmentVerified !== true || status.enabled !== true) return null;
            return adapter.getReviewedProfile(id);
        }
        const jobs = jobsModule.create({storage,contracts:root.CaptionKeepEvidenceActionContracts,
            getAuthorityRevision:() => revision,getSource:source,getReviewedProfile:profile,getPolicy:readPolicy,
            getCapacity:async () => {
                if (typeof options.getCapacity === 'function') return options.getCapacity();
                // UnlimitedStorage is not a guarantee of free physical capacity.
                // A trusted host capacity signal is required for optional admission.
                return null;
            },
            prepareRelease:async ({source:raw,arguments:args,privacyMode,policy}) => {
                if (!root.CaptionKeepPrivacyScrubber || privacyMode !== 'scrubbed') return null;
                const scrubOptions = {profanityFilterEnabled:!!policy.profanityFilterEnabled,customTerms:policy.customScrubTerms || []};
                return {source:{...raw,captions:raw.captions.map(caption=>({...caption,
                    text:root.CaptionKeepPrivacyScrubber.scrub(caption.text,scrubOptions).text}))},
                    // Preserve exact typed operation targets. The adapter's strict
                    // allowlist validates fields before approval/dispatch; silently
                    // masking an IP/identifier would approve a different operation.
                    arguments:options.preserveTypedArguments === true ? copy(args)
                        : root.CaptionKeepPrivacyScrubber.scrubObject(args,scrubOptions).value,privacyMode:'scrubbed'};
            },
            verifyOperation:async (...args) => typeof adapter.verifyOperation === 'function' && await adapter.verifyOperation(...args) === true,
            verifyApproveIntent:async status => pendingIntents.delete(`approve:${status.jobId}:${status.revision}`),
            verifyPinIntent:async status => pendingIntents.delete(`pin:${status.jobId}:${status.revision}`),
            verifyResultProof:async (...args) => typeof adapter.verifyResultProof === 'function' ? adapter.verifyResultProof(...args) : null,
            transport:{invoke:async (...args) => {
                if (typeof adapter.transport?.invoke !== 'function') throw new Error('transport-unavailable');
                return adapter.transport.invoke(...args);
            }}
        });
        const unavailable = code => ({ok:true,code,status:{protocolVersion:1,enrollmentVerified:false,enabled:false,profiles:[]}});
        function exact(value, keys) {
            if (!value || typeof value !== 'object' || Array.isArray(value)
                || Object.keys(value).some(key=>!keys.includes(key))) throw new Error('request-invalid');
        }
        async function settings(message,sender,onStage) {
            exact(message,['message','operation','profileId','revision','configuration','enabled']);
            const setupOperation = ['configure','connect','allow-writes'].includes(message.operation);
            if (setupOperation) {
                const path = new URL(sender.url).pathname;
                if (!['/popup.html','/settings.html'].includes(path)) throw new Error('sender-denied');
                if (message.operation === 'connect') onStage('policy-check');
                const setupPolicy = await readPolicy();
                if (!setupPolicy || setupPolicy.setupDisabled === true || setupPolicy.disableSessionHistory === true
                    || (setupPolicy.disabled === true && setupPolicy.setupDisabled !== false)) throw new Error('policy-denied');
                if (message.operation === 'configure') {
                    exact(message,['message','operation','configuration']);
                    if (typeof options.configure !== 'function') throw new Error('configuration-unavailable');
                    if (JSON.stringify(message.configuration).length > 131072) throw new Error('configuration-too-large');
                    bump();await options.configure(copy(message.configuration),sender);await clearExcept();
                    return unavailable('not-connected');
                }
                if (message.operation === 'allow-writes') {
                    exact(message,['message','operation','enabled']);
                    if (typeof message.enabled !== 'boolean' || typeof options.setWritePermission !== 'function') throw new Error('write-permission-unavailable');
                    bump();await options.setWritePermission(message.enabled);
                    return {ok:true,enabled:message.enabled};
                }
                exact(message,['message','operation']);
                if (typeof options.setEnabled !== 'function' || typeof adapter.connectGranted !== 'function') throw new Error('helper-unavailable');
                await options.setEnabled(true);await enabled();
                try {const status = await adapter.connectGranted(sender,onStage);const policy = await enabled();return {ok:true,status:{...status,allowWrites:policy.allowWrites === true}};}
                catch (error) {await options.setEnabled(false);throw error;}
            }
            if (message.operation === 'disconnect') {
                bump();
                if (typeof adapter.disconnect === 'function') await adapter.disconnect(sender);
                if (typeof options.setEnabled === 'function') await options.setEnabled(false);
                await clearExcept();
                return unavailable('disconnected');
            }
            const expected = revision;
            try {await enabled();} catch {
                const policy = await readPolicy();
                if (message.operation === 'status' && policy?.setupDisabled === false) return unavailable('not-connected');
                return unavailable('policy-denied');
            }
            async function current() {
                await enabled();
                if (expected !== revision) throw new Error('authority-changed');
            }
            if (message.operation === 'status') {
                if (typeof adapter.localStatus !== 'function') return unavailable('not-installed');
                const status = await adapter.localStatus(); // local-only, never opens native host
                await current();const policy = await readPolicy();return {ok:true,status:{...status,allowWrites:policy.allowWrites === true}};
            }
            if (message.operation === 'inventory') {
                if (!/^[a-zA-Z0-9._-]{1,100}$/.test(message.profileId || '') || !Number.isSafeInteger(message.revision)) throw new Error('request-invalid');
                if (typeof adapter.inventory !== 'function') throw new Error('helper-unavailable');
                const inventory = await adapter.inventory(message.profileId,message.revision,sender);
                await current();return {ok:true,inventory};
            }
            throw new Error('operation-unavailable');
        }
        async function actions(message) {
            exact(message,['message','operation','request']);
            const request = copy(message.request);
            if (message.operation === 'prepare') {
                exact(request,['sourceSessionRef','profileId','tool','operation','arguments','captionKeys','privacyMode']);
                await enabled();
                return {ok:true,...await jobs.prepare({...request,sourceId:request.sourceSessionRef})};
            }
            if (message.operation === 'status') {
                exact(request,['jobId']);return {ok:true,...await jobs.getStatus(request.jobId)};
            }
            exact(request,message.operation === 'approve' ? ['jobId','expectedRevision','approvalDigest'] : ['jobId','expectedRevision']);
            if (message.operation === 'cancel') return {ok:true,...await jobs.cancel(request)};
            if (message.operation === 'approve') {
                const token = `approve:${request.jobId}:${request.expectedRevision}`;
                pendingIntents.add(token);
                try {return {ok:true,...await jobs.approveAndDispatch(request)};} finally {pendingIntents.delete(token);}
            }
            if (message.operation === 'pin') {
                // Receipt materialization is deliberately not inferred from a
                // ledger mark. No fabricated artifactId or retained-work claim.
                const status = await jobs.getStatus(request.jobId);
                if (!['verified','pinned'].includes(status.state) || status.revision !== request.expectedRevision) throw new Error('result-unverified');
                if (typeof options.materializeResult !== 'function') return {ok:true,...status,state:'unmaterialized',result:null,proof:null};
                const token = `pin:${request.jobId}:${request.expectedRevision}`;
                pendingIntents.add(token);
                try {
                    const pinned = status.state === 'pinned' ? status : await jobs.pin(request);
                    const retained = await options.materializeResult(copy(pinned));
                    if (!retained?.artifactId) return {ok:true,...pinned,state:'unmaterialized',result:null,proof:null};
                    return {ok:true,...pinned,artifactId:retained.artifactId};
                } finally {pendingIntents.delete(token);}
            }
            throw new Error('operation-unavailable');
        }
        async function handle(message,sender) {
            if (!allow(sender)) return {ok:false,error:'sender-denied'};
            const connecting = message?.message === 'byomcp_settings' && message.operation === 'connect';
            // Attempt-local metadata cannot accidentally reuse an earlier failure.
            let diagnostic = connecting ? {stage:'worker-received',at:Date.now(),code:'connecting'} : null;
            const onStage = stage => {if (diagnostic && CONNECTION_STAGES.has(stage)) diagnostic={stage,at:Date.now(),code:'connecting'};};
            try {
                if (message?.message === 'byomcp_settings') {
                    const response=await settings(message,sender,onStage);
                    return connecting ? {...response,diagnostic:{...diagnostic,code:'connected'}} : response;
                }
                if (message?.message === 'byomcp_action') return await actions(message);
                return {ok:false,error:'operation-unavailable'};
            } catch (error) {
                // Only setup Connect gets bounded diagnostic enums. Action/provider
                // failures retain the opaque response; raw messages never cross here.
                const code = CONNECTION_CODES.has(error?.code) ? error.code
                    : CONNECTION_CODES.has(error?.message) ? error.message : 'native-connection-failed';
                return {ok:false,error:'operation-not-verified',...(connecting ? {code,diagnostic:{...diagnostic,code}} : {})};
            }
        }
        function storageChanged(changes,area) {
            if (area !== 'local' || Object.keys(changes).some(key=>key !== jobsModule.KEY)) bump();
        }
        async function removeSources(identities) {
            bump();
            for (const id of new Set(identities)) await jobs.removeSource(String(id));
        }
        async function clearExcept(preserve = new Set()) {
            bump();
            const ledger = (await storage.get(jobsModule.KEY))[jobsModule.KEY];
            const identities = Object.values(ledger?.jobs || {}).map(record=>record?.approval?.payload?.source?.sessionId).filter(Boolean);
            await removeSources(identities.filter(id=>!preserve.has(id)));
        }
        async function reconcileSources() {
            const expected = revision;
            const ledger = (await storage.get(jobsModule.KEY))[jobsModule.KEY];
            for (const id of new Set(Object.values(ledger?.jobs || {}).map(record=>record?.approval?.payload?.source?.sessionId).filter(Boolean))) {
                const surviving = await source(id);
                if (expected !== revision) return; // a changing source is not proof of deletion
                if (!surviving) await jobs.removeSource(id);
            }
        }
        return Object.freeze({handle,allow,bump,storageChanged,removeSources,clearExcept,reconcileSources,recover:jobs.recover});
    }
    root.CaptionKeepByomcpWorkerBridge = Object.freeze({create,describeSource});
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepByomcpWorkerBridge;
})(globalThis);
