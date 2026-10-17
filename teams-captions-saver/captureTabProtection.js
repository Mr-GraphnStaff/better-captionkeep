(function initializeCaptureTabProtection(root) {
    'use strict';
    const STORAGE_KEY = 'capture_tab_protection_v1';
    const validSession = value => typeof value === 'string'
        && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
    function supported(url) {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:' && ['teams.microsoft.com','teams.cloud.microsoft'].includes(parsed.hostname);
        } catch {return false;}
    }

    function create({tabs, storage, readCaptureState}) {
        let queue = Promise.resolve();
        const knownOwners = new Map();
        const serialized = operation => {
            const result = queue.then(operation);
            queue = result.catch(() => {});
            return result;
        };
        async function records() {
            const data = (await storage.get(STORAGE_KEY))[STORAGE_KEY];
            const result = {};
            for (const [key, value] of Object.entries(data?.records || {})) {
                if (/^\d+$/.test(key) && Number.isSafeInteger(Number(key)) && Number(key) > 0
                    && typeof value?.previousAutoDiscardable === 'boolean') result[key] = value;
            }
            knownOwners.clear();
            for (const [key,value] of Object.entries(result)) knownOwners.set(Number(key),value.ownerSessionId);
            return result;
        }
        async function save(values) {
            if (Object.keys(values).length) await storage.set({[STORAGE_KEY]:{version:1,records:values}});
            else await storage.remove(STORAGE_KEY);
            knownOwners.clear();
            for (const [key,value] of Object.entries(values)) knownOwners.set(Number(key),value.ownerSessionId);
        }
        async function restore(tabId, values) {
            const owned = values[tabId];
            if (!owned) return {protected:false};
            const tab = await tabs.get(tabId);
            // Only undo the false value this guard wrote. Do not overwrite a
            // subsequent independent browser/user change to true.
            if (tab.autoDiscardable === false && owned.previousAutoDiscardable !== false) {
                await tabs.update(tabId,{autoDiscardable:owned.previousAutoDiscardable});
            }
            delete values[tabId];
            await save(values);
            return {protected:false,restored:true};
        }
        function apply(sender, active, ownerSessionId) {
            return serialized(async () => {
                const tabId = sender?.tab?.id;
                if (!Number.isInteger(tabId) || !supported(sender.url || sender.tab.url)
                    || (Number.isInteger(sender.frameId) && sender.frameId !== 0)) {
                    throw new Error('Capture tab protection requires its originating Teams content script.');
                }
                if (!validSession(ownerSessionId)) throw new Error('Capture tab protection requires its source session UUID.');
                const values = await records();
                if (typeof tabs.get !== 'function' || typeof tabs.update !== 'function') return {protected:false,unsupported:true};
                const tab = await tabs.get(tabId);
                if (!supported(tab.url) || typeof tab.autoDiscardable !== 'boolean') return {protected:false,unsupported:true};
                if (new URL(tab.url).href !== new URL(sender.url || sender.tab.url).href) {
                    return {protected:false,stale:true};
                }
                if (active !== true) {
                    if (values[tabId]?.ownerSessionId !== ownerSessionId) return {protected:!!values[tabId],stale:true};
                    return restore(tabId,values);
                }
                const status = await readCaptureState(tabId);
                if (status?.captureSessionActive !== true || status.captureSessionId !== ownerSessionId) {
                    return {protected:!!values[tabId],stale:true};
                }
                if (!values[tabId] || values[tabId].ownerSessionId !== ownerSessionId) {
                    values[tabId] = {...(values[tabId] || {previousAutoDiscardable:tab.autoDiscardable,createdAt:Date.now()}),ownerSessionId};
                    // Persist ownership before changing browser state, so a suspended
                    // worker can later restore the exact original value.
                    await save(values);
                }
                try {
                    if (tab.autoDiscardable !== false) await tabs.update(tabId,{autoDiscardable:false});
                } catch (error) {
                    // Retain the ledger if rollback also fails, for later recovery.
                    await restore(tabId,values).catch(() => {});
                    throw error;
                }
                return {protected:true};
            });
        }
        function release(tabId) {
            const observedOwner = knownOwners.get(tabId);
            return serialized(async () => {
                const values = await records();
                if (observedOwner && values[tabId]?.ownerSessionId !== observedOwner) return {protected:!!values[tabId],stale:true};
                // A cold worker has no scheduling-time owner. An earlier queued
                // acquire may already have installed a new session by now.
                if (!observedOwner && values[tabId]) {
                    const tab = await tabs.get(tabId);
                    if (supported(tab.url)) {
                        let status;
                        try {status = await readCaptureState(tabId);} catch {}
                        if (status?.captureSessionActive === true && validSession(status.captureSessionId)) {
                            if (values[tabId].ownerSessionId !== status.captureSessionId) {
                                values[tabId] = {...values[tabId],ownerSessionId:status.captureSessionId};
                                await save(values);
                            }
                            return {protected:true,stale:true};
                        }
                        // Unknown during navigation is not permission to undo a
                        // new acquire. The completed-navigation reconciliation
                        // resolves only this tab once its destination is known.
                        if (status?.captureSessionActive !== false) return {protected:true,deferred:true};
                    }
                }
                return restore(tabId,values);
            });
        }
        function forget(tabId) {
            return serialized(async () => {const values = await records(); delete values[tabId]; await save(values);});
        }
        function forgetAll() {return serialized(async () => {await storage.remove(STORAGE_KEY); knownOwners.clear();});}
        function reconcile({restoreUnreachable = false, onlyTabId} = {}) {
            return serialized(async () => {
                const values = await records();
                for (const key of Object.keys(values)) {
                    const tabId = Number(key);
                    if (Number.isInteger(onlyTabId) && tabId !== onlyTabId) continue;
                    try {
                        const tab = await tabs.get(tabId);
                        if (!supported(tab.url)) {await restore(tabId,values); continue;}
                        let status;
                        try {status = await readCaptureState(tabId);} catch {}
                        if (status?.captureSessionActive === true && validSession(status.captureSessionId)) {
                            if (values[tabId].ownerSessionId !== status.captureSessionId) {
                                values[tabId] = {...values[tabId],ownerSessionId:status.captureSessionId};
                                await save(values);
                            }
                            if (tab.autoDiscardable !== false) await tabs.update(tabId,{autoDiscardable:false});
                        } else if (status?.captureSessionActive === false || restoreUnreachable) await restore(tabId,values);
                        // Unknown state during normal worker suspension is not an end.
                    } catch { /* Preserve ownership for a later explicit event/retry. */ }
                }
            });
        }
        return Object.freeze({apply,release,forget,forgetAll,reconcile});
    }
    root.CaptionKeepCaptureTabProtection = Object.freeze({create,STORAGE_KEY,supported});
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepCaptureTabProtection;
})(typeof globalThis !== 'undefined' ? globalThis : this);
