(function (root) {
    'use strict';

    // Retention-disabled notes are temporary browser-session data, never local history.
    function create({storage, readPolicy}) {
        let queue = Promise.resolve();
        const serialized = operation => {
            const result = queue.then(operation);
            queue = result.catch(() => {});
            return result;
        };
        const areaFor = policy => policy.disableSessionHistory ? storage.session : storage.local;
        async function save(key, state) {
            return serialized(async () => {
                const policy = await readPolicy();
                const area = areaFor(policy);
                if (policy.disableSessionHistory) await storage.local.remove(key);
                if (!area) {
                    await storage.local.remove(key);
                    throw new Error('Temporary notes storage is unavailable in this browser.');
                }
                await area.set({[key]:state});
                const latestPolicy = await readPolicy();
                if (latestPolicy.disableSessionHistory) {
                    try {
                        if (!storage.session) throw new Error('Temporary notes storage is unavailable in this browser.');
                        if (area !== storage.session) await storage.session.set({[key]:state});
                    } finally {
                        await storage.local.remove(key);
                    }
                } else if (area === storage.local && storage.session) {
                    await storage.session.remove(key);
                }
            });
        }
        async function load(key) {
            return serialized(async () => {
                const policy = await readPolicy();
                if (policy.disableSessionHistory) {
                    await storage.local.remove(key);
                    return storage.session ? (await storage.session.get(key))[key] : undefined;
                }
                return (await storage.local.get(key))[key];
            });
        }
        return Object.freeze({save, load});
    }
    root.CaptionKeepRollingNotesStore = Object.freeze({create});
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepRollingNotesStore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
