(function initializeCaptionProviderRegistry(root) {
    'use strict';

    const providerDefinitions = new Map();
    const REQUIRED_ADAPTER_METHODS = ['start', 'stop'];

    function requireFunction(value, label) {
        if (typeof value !== 'function') throw new TypeError(`${label} must be a function.`);
    }

    function normalizeProviderId(value) {
        const id = String(value || '').trim().toLowerCase();
        if (!/^[a-z][a-z0-9-]*$/.test(id)) {
            throw new TypeError('Provider id must use lowercase letters, numbers, and hyphens.');
        }
        return id;
    }

    function register(definition) {
        if (!definition || typeof definition !== 'object') {
            throw new TypeError('Provider definition must be an object.');
        }
        const id = normalizeProviderId(definition.id);
        requireFunction(definition.matches, `Provider "${id}" matches`);
        requireFunction(definition.create, `Provider "${id}" create`);
        if (providerDefinitions.has(id)) throw new Error(`Provider "${id}" is already registered.`);

        const registered = Object.freeze({id, matches: definition.matches, create: definition.create});
        providerDefinitions.set(id, registered);
        return registered;
    }

    function find(url) {
        const candidateUrl = url instanceof URL ? url : new URL(String(url));
        return Array.from(providerDefinitions.values())
            .find(definition => definition.matches(candidateUrl)) || null;
    }

    function create(url, context = {}) {
        const definition = find(url);
        if (!definition) return null;
        const adapter = definition.create(Object.freeze({
            ...context,
            providerId: definition.id,
            url: url instanceof URL ? url : new URL(String(url))
        }));
        if (!adapter || typeof adapter !== 'object') {
            throw new TypeError(`Provider "${definition.id}" did not create an adapter object.`);
        }
        for (const method of REQUIRED_ADAPTER_METHODS) {
            requireFunction(adapter[method], `Provider "${definition.id}" adapter ${method}`);
        }
        return adapter;
    }

    function list() {
        return Array.from(providerDefinitions.keys());
    }

    function normalizeCaption(record) {
        if (!record || typeof record !== 'object') throw new TypeError('Caption record must be an object.');
        const Name = String(record.Name || '').trim();
        const Text = String(record.Text || '').trim();
        const Time = String(record.Time || '').trim();
        const key = String(record.key || '').trim();
        const capturedAt = String(record.capturedAt || '').trim();
        if (!Text) throw new TypeError('Caption Text is required.');
        if (!key) throw new TypeError('Caption stable key is required.');
        if (!capturedAt || Number.isNaN(Date.parse(capturedAt))) {
            throw new TypeError('Caption capturedAt must be an ISO-compatible timestamp.');
        }
        return Object.freeze({Name, Text, Time, capturedAt, key});
    }

    root.CaptionKeepProviderRegistry = Object.freeze({create, find, list, normalizeCaption, register});
})(globalThis);
