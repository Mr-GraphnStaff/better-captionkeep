(function initializeByomcpNativeClient(root) {
    'use strict';
    const HOST_NAME = 'com.daftech.captionkeep.byomcp';
    const BINDING_KEY = 'byomcp_native_binding_v1';
    const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
    const IDENTIFIER = /^[a-zA-Z0-9._-]{1,100}$/;
    const HASH = /^[a-f0-9]{64}$/;
    // Browser-owned native messaging errors are classified, never forwarded.
    // Unknown/localized errors deliberately reveal no path, command or provider text.
    const DISCONNECT_CODES = new Map([
        ['Specified native messaging host not found.','native-host-not-found'],
        ['Failed to start native messaging host.','native-host-start-failed'],
        ['Access to the specified native messaging host is forbidden.','native-host-forbidden'],
        ['Native host has exited.','native-host-exited'],
        ['Error when communicating with the native messaging host.','native-communication-error']
    ]);
    const CONNECTION_CODES = new Set([...DISCONNECT_CODES.values(),'native-timeout','enrollment-mismatch','configuration-required','permission-denied','native-connection-failed']);
    function connectionFailure(error) {
        const message = typeof error?.message === 'string' ? error.message : '';
        const code = CONNECTION_CODES.has(error?.code) ? error.code
            : CONNECTION_CODES.has(message) ? message
            : message === 'permission-denied' ? 'permission-denied'
            : ['invalid-challenge','enrollment-unverified','invalid-helper-status','invalid-helper-profile','profile-binding'].includes(message)
                ? 'enrollment-mismatch' : 'native-connection-failed';
        // Keep only our own bounded handshake labels, never upstream errors.
        const safe = new Error(['invalid-challenge','enrollment-unverified','invalid-helper-status','invalid-helper-profile','profile-binding'].includes(message) ? message : code);
        safe.code = code;
        return safe;
    }
    function bounded(value, limit) {
        function inspect(item, depth) {
            if (depth > 12) throw new Error('native-depth');
            if (item && typeof item === 'object') Object.values(item).forEach(child => inspect(child, depth + 1));
        }
        inspect(value, 0);
        if (new TextEncoder().encode(JSON.stringify(value)).length > limit) throw new Error('native-limit');
    }
    function validateStatus(status) {
        if (!status || status.protocolVersion !== 1 || status.enrollmentVerified !== true || status.mcpProtocolVersion !== '2026-07-28'
            || status.enabled !== false || typeof status.helperVersion !== 'string' || status.helperVersion.length > 40
            || !Array.isArray(status.profiles) || status.profiles.length > 20) throw new Error('invalid-helper-status');
        const ids = new Set();
        for (const profile of status.profiles) {
            if (!IDENTIFIER.test(profile.id) || ids.has(profile.id) || !['stdio','streamable-http'].includes(profile.transport)
                || !Number.isSafeInteger(profile.revision) || profile.revision < 1 || !HASH.test(profile.profileDigest)
                || profile.verified !== true || profile.enrolled !== true || typeof profile.inventoryVerified !== 'boolean'
                || typeof profile.label !== 'string' || profile.label.length > 120) throw new Error('invalid-helper-profile');
            ids.add(profile.id);
        }
        return structuredClone(status);
    }
    function create(options = {}) {
        const api = options.chrome || root.chrome;
        const storage = options.storage || api?.storage?.local;
        const browserTarget = options.browserTarget || 'unsupported';
        const verifyEnrollment = options.verifyEnrollment || (async () => false);
        const policySnapshot = options.getPolicySnapshot || (() => ({disabled:true}));
        const readPolicy = options.readPolicy || (async () => ({disabled:true}));
        const onRevoked = options.onRevoked || (() => {});
        const timeoutMs = Math.max(1,Math.min(options.timeoutMs || 15000,60000));
        const pending = new Map(), resultProofs = new Map();
        let port = null, binding = null, generation = 0;
        function senderAllowed(sender, metadataOnly = false) {
            if (!sender || sender.id !== api.runtime.id) return false;
            try {
                const url = new URL(sender.url), base = new URL(api.runtime.getURL(''));
                const pages = metadataOnly ? ['/popup.html','/settings.html','/sidepanel.html','/viewer.html'] : ['/popup.html','/settings.html'];
                return url.protocol === base.protocol && url.host === base.host && pages.includes(url.pathname);
            } catch {return false;}
        }
        function supported() {return ['chrome','edge','brave','opera','firefox'].includes(browserTarget) && typeof api?.runtime?.connectNative === 'function';}
        function stop(code) {
            generation += 1; binding = null; resultProofs.clear();
            const old = port; port = null;
            for (const entry of pending.values()) {clearTimeout(entry.timer);entry.removeAbort?.();entry.reject(new Error(code));}
            pending.clear();
            if (old) {try {old.disconnect();} catch {}}
            try {onRevoked(code);} catch {}
        }
        function receive(reply) {
            try {
                bounded(reply,1048576);
                if (!reply || reply.version !== 1 || !UUID.test(reply.requestId) || typeof reply.ok !== 'boolean'
                    || Object.keys(reply).some(key => !['version','requestId','ok','result','error'].includes(key))) throw new Error('invalid-reply');
                const entry = pending.get(reply.requestId);
                if (!entry) throw new Error('unknown-reply');
                pending.delete(reply.requestId);clearTimeout(entry.timer);entry.removeAbort?.();
                if (!reply.ok) entry.reject(new Error('helper-rejected'));
                else entry.resolve(structuredClone(reply.result));
            } catch {stop('invalid-helper-reply');}
        }
        function request(operation, fields = {}, signal) {
            if (!port || pending.size >= 8 || signal?.aborted) return Promise.reject(new Error('native-unavailable'));
            const requestId = root.crypto.randomUUID();
            const message = {version:1,requestId,operation,...fields};
            try {bounded(message,98304);} catch (error) {return Promise.reject(error);}
            return new Promise((resolve,reject) => {
                const timer = setTimeout(() => stop('native-timeout'),timeoutMs);
                const abort = () => stop('native-cancelled');
                signal?.addEventListener('abort',abort,{once:true});
                pending.set(requestId,{resolve,reject,timer,removeAbort:() => signal?.removeEventListener('abort',abort)});
                try {port.postMessage(message);} catch {stop('native-send-failed');}
            });
        }
        async function allowed(expected) {
            const policy = await readPolicy();
            if (expected !== generation || policy.disabled !== false) throw new Error('policy-denied');
        }
        async function localStatus() {
            if (binding && port) return structuredClone(binding.status);
            // Read local metadata only. A restarted worker never launches or trusts a stale host.
            const stored = storage?.get ? (await storage.get(BINDING_KEY))[BINDING_KEY] : null;
            return {protocolVersion:1,enrollmentVerified:false,enabled:false,profiles:[],
                code:stored ? 'reenrollment-required' : 'not-connected',supported:supported()};
        }
        function connectFromGesture(sender, onStage = () => {}) {
            if (!senderAllowed(sender)) return Promise.reject(new Error('sender-denied'));
            if (!supported()) return Promise.reject(new Error('unsupported-native-browser'));
            if (policySnapshot()?.disabled !== false) return Promise.reject(new Error('policy-denied'));
            let permission;
            // Intentionally synchronous before any await: preserve the Connect user gesture.
            try {permission = api.permissions.request({permissions:['nativeMessaging']});}
            catch {return Promise.reject(new Error('permission-denied'));}
            return connect(permission,onStage);
        }
        function connectGranted(sender, onStage = () => {}) {
            if (!senderAllowed(sender)) return Promise.reject(new Error('sender-denied'));
            if (!supported()) return Promise.reject(new Error('unsupported-native-browser'));
            if (policySnapshot()?.disabled !== false) return Promise.reject(new Error('policy-denied'));
            // The packaged page requested permission synchronously in its Connect gesture.
            // Recheck the browser grant; a message's claimed permission is never trusted.
            return connect(Promise.resolve(true),onStage);
        }
        async function connect(permission,onStage) {
            // Stage callbacks contain fixed labels only, never host/provider text.
            const stage = name => {try {onStage(name);} catch {}};
            stage('permission-check');
            if (!await permission) throw new Error('permission-denied');
            if (!await api.permissions.contains({permissions:['nativeMessaging']})) throw new Error('permission-denied');
            stop('reconnecting');const expected = generation;
            await allowed(expected);
            try {
                stage('configuration-check');
                if (typeof options.verifyConfiguration === 'function') await options.verifyConfiguration();
                await allowed(expected);
                let opened;
                stage('native-opening');
                try {opened = api.runtime.connectNative(HOST_NAME);}
                catch (error) {throw new Error(DISCONNECT_CODES.get(error?.message) || 'native-connection-failed');}
                port = opened;
                opened.onMessage.addListener(reply => {if (port === opened && generation === expected) receive(reply);});
                opened.onDisconnect.addListener(() => {
                    const code = DISCONNECT_CODES.get(api.runtime.lastError?.message) || 'native-connection-failed';
                    if (port === opened) stop(code);
                });
                stage('challenge');
                const challenge = await request('enrollment-challenge');
                if (!challenge || challenge.hostName !== HOST_NAME || !HASH.test(challenge.nonce)
                    || !Number.isFinite(challenge.expiresAt) || challenge.expiresAt <= Date.now()
                    || !Array.isArray(challenge.profileIds) || !challenge.profileIds.length || challenge.profileIds.length > 20
                    || challenge.profileIds.some(id => !IDENTIFIER.test(id))) throw new Error('invalid-challenge');
                await allowed(expected);
                stage('enrollment');
                const enrollment = await request('enrollment-complete',{nonce:challenge.nonce});
                if (!enrollment || enrollment.hostName !== HOST_NAME || !UUID.test(enrollment.enrollmentId)
                    || JSON.stringify(enrollment.profileIds) !== JSON.stringify(challenge.profileIds)
                    || !await verifyEnrollment(structuredClone({challenge,enrollment}))) throw new Error('enrollment-unverified');
                const status = validateStatus(enrollment.status);
                if (JSON.stringify(status.profiles.map(profile => profile.id)) !== JSON.stringify(challenge.profileIds)) throw new Error('profile-binding');
                await allowed(expected);
                binding = {enrollmentId:enrollment.enrollmentId,status};
                await storage.set({[BINDING_KEY]:{version:1,hostName:HOST_NAME,enrollmentId:enrollment.enrollmentId,
                    profileIds:[...challenge.profileIds],verifiedAt:Date.now()}});
                await allowed(expected);
                stage('connected');
                return structuredClone(status);
            } catch (error) {stop('enrollment-failed');throw connectionFailure(error);}
        }
        async function inventory(profileId,revision,sender) {
            if (!senderAllowed(sender,true)) throw new Error('sender-denied');
            const expected = generation;
            await allowed(expected);
            const profile = binding?.status.profiles.find(item => item.id === profileId && item.revision === revision);
            if (!profile || !port) throw new Error('profile-unavailable');
            const result = await request('inventory',{enrollmentId:binding.enrollmentId,profileId});
            if (!result || result.profileId !== profileId || result.revision !== revision || !Array.isArray(result.tools) || result.tools.length > 100
                || result.tools.some(tool => !IDENTIFIER.test(tool.name) || !IDENTIFIER.test(tool.profileGrantId) || !HASH.test(tool.schemaDigest)
                    || tool.compatible !== true || tool.approved !== true || !['read','write'].includes(tool.effect))) throw new Error('invalid-inventory');
            await allowed(expected);return structuredClone(result);
        }
        async function disconnect(sender) {
            if (!senderAllowed(sender)) throw new Error('sender-denied');
            try {if (binding && port) await request('disconnect',{enrollmentId:binding.enrollmentId});}
            finally {stop('user-disconnected');if (storage?.remove) await storage.remove(BINDING_KEY);}
            return {protocolVersion:1,enrollmentVerified:false,enabled:false,profiles:[]};
        }
        async function getCapacity() {
            const expected=generation;await allowed(expected);
            if(!binding || !port) return null;
            const result=await request('capacity',{enrollmentId:binding.enrollmentId});
            await allowed(expected);
            return Number.isSafeInteger(result?.availableBytes) && result.availableBytes>=0 ? result.availableBytes : null;
        }
        const transport = Object.freeze({async invoke(profile,approval,signal,{assertDispatch} = {}) {
            const expected = generation;
            await allowed(expected);
            if (!binding || !port || !binding.status.profiles.some(item => item.id === profile.id && item.revision === profile.revision
                && item.profileDigest === profile.profileDigest) || typeof assertDispatch !== 'function') throw new Error('profile-unavailable');
            await allowed(expected);await assertDispatch();
            if (generation !== expected || policySnapshot()?.disabled !== false || signal?.aborted) throw new Error('policy-denied');
            const outcome = await request('invoke',{enrollmentId:binding.enrollmentId,profileId:profile.id,approval},signal);
            await allowed(expected);
            if (!outcome || outcome.jobId !== approval.payload.jobId || outcome.state !== 'verified' || !outcome.result) throw new Error('outcome-unverified');
            // Proof is supplied only by the enrolled native helper, not by a UI
            // message or tool answer. The runtime independently validates its
            // typed readback, bindings and digest before exposing a result.
            if (outcome.proof && resultProofs.size < 50) resultProofs.set(outcome.jobId,structuredClone(outcome.proof));
            return structuredClone(outcome.result);
        }});
        api?.permissions?.onRemoved?.addListener(removed => {if (removed.permissions?.includes('nativeMessaging')) stop('permission-revoked');});
        function takeResultProof(jobId) {const proof=resultProofs.get(jobId);resultProofs.delete(jobId);return proof ? structuredClone(proof) : null;}
        return Object.freeze({localStatus,connectFromGesture,connectGranted,inventory,disconnect,transport,takeResultProof,getCapacity});
    }
    root.CaptionKeepByomcpNativeClient = Object.freeze({HOST_NAME,BINDING_KEY,create,validateStatus});
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepByomcpNativeClient;
})(globalThis);
