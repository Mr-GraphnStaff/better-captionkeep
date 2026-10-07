(() => {
    'use strict';

    const EXPORT_VERSION = 1;
    const USER_KEYS = Object.freeze([
        'autoEnableCaptions', 'autoSaveOnEnd', 'defaultSaveFormat', 'saveAsType',
        'saveLocation', 'trackCaptions', 'trackAttendees', 'autoOpenAttendees',
        'autoAISummary', 'privacyScrubberEnabled', 'profanityFilterEnabled',
        'customScrubTerms', 'aiSummaryProviders', 'chatgptWorkspaceUrl',
        'claudeWorkspaceUrl', 'claudeConsoleUrl', 'timestampFormat',
        'filenamePattern', 'uiTheme', 'uiLocale'
    ]);
    const GRAPH_USER_KEYS = Object.freeze([
        'enableGraphTranscriptImport', 'graphTenantId', 'graphClientId'
    ]);
    const ASSISTANT_USER_KEYS = Object.freeze([
        'assistantBridgeMode', 'assistantEndpointUrl', 'assistantNativeHost',
        'assistantAuthorizationEndpoint', 'assistantTokenEndpoint',
        'assistantClientId', 'assistantScopes', 'assistantTimeoutSeconds'
    ]);

    const POLICY_KEYS = Object.freeze([
        'forcePrivacyScrubber', 'disableAiHandoff', 'allowedAiProviders',
        'chatgptWorkspaceUrl', 'claudeWorkspaceUrl', 'claudeConsoleUrl',
        'forceProfanityFilter', 'customScrubTerms', 'forceScrubbedExport',
        'disableClipboard', 'disableFileExport', 'disableEvidenceEmail',
        'disableAttendeeCapture', 'disableSessionHistory', 'maxStoredSessions',
        'sessionRetentionDays', 'enableGraphTranscriptImport', 'graphTenantId',
        'graphClientId', 'forceUiLocale', 'disableEvidenceActions',
        'forceScrubbedEvidenceActions', 'assistantBridgeMode',
        'assistantEndpointUrl', 'assistantNativeHost',
        'assistantAuthorizationEndpoint', 'assistantTokenEndpoint',
        'assistantClientId', 'assistantScopes', 'assistantTimeoutSeconds',
        'assistantAllowedIntents'
    ]);

    const ALLOWED_PROVIDERS = new Set(['chatgpt', 'claude', 'claude_console', 'copilot', 'gemini']);
    const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const NATIVE_HOST_PATTERN = /^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/;
    const ASSISTANT_INTENTS = new Set(['research_reference', 'prepare_work_item']);
    const BOOLEAN_KEYS = new Set(['autoEnableCaptions', 'autoSaveOnEnd', 'trackCaptions', 'trackAttendees', 'autoOpenAttendees', 'autoAISummary', 'privacyScrubberEnabled', 'profanityFilterEnabled']);
    const UI_LOCALES = new Set([
        'system', 'en', 'fr', 'fr-CA', 'es', 'es_419', 'de', 'pt_BR', 'pt_PT', 'it', 'nl', 'pl',
        'cs', 'el', 'ro', 'sv', 'uk', 'ru', 'tr', 'hi', 'bn', 'gu', 'kn', 'ml', 'mr', 'ta', 'te',
        'id', 'fil', 'ms', 'th', 'vi', 'ja', 'ko', 'zh_CN', 'zh_TW', 'ar', 'he', 'fa', 'sw'
    ]);
    const ENUMS = Object.freeze({
        defaultSaveFormat: new Set(['txt', 'md', 'docx']),
        saveAsType: new Set(['prompt', 'downloads', 'custom']),
        timestampFormat: new Set(['12hr', '24hr', 'relative']),
        uiTheme: new Set(['captionkeep', 'light', 'midnight', 'system'])
    });

    function normalizeTerms(value) {
        const input = Array.isArray(value) ? value : String(value || '').split(/[\r\n,]+/);
        return [...new Set(input.map(term => String(term).trim().slice(0, 80)).filter(term => term.length >= 2).slice(0, 100))];
    }

    function sanitize(settings = {}) {
        const output = {};
        for (const key of USER_KEYS) {
            if (!Object.hasOwn(settings, key)) continue;
            const value = settings[key];
            if (BOOLEAN_KEYS.has(key)) {
                if (typeof value === 'boolean') output[key] = value;
            } else if (ENUMS[key]) {
                if (ENUMS[key].has(value)) output[key] = value;
            } else if (key === 'uiLocale') {
                if (UI_LOCALES.has(value)) output[key] = value;
            } else if (['saveLocation', 'filenamePattern'].includes(key)) {
                if (typeof value === 'string') output[key] = value.slice(0, 200);
            } else if (['chatgptWorkspaceUrl', 'claudeWorkspaceUrl', 'claudeConsoleUrl'].includes(key)) {
                if (typeof value === 'string') output[key] = value.slice(0, 2048);
            } else {
                output[key] = value;
            }
        }
        if (Object.hasOwn(output, 'customScrubTerms')) output.customScrubTerms = normalizeTerms(output.customScrubTerms);
        if (Object.hasOwn(output, 'aiSummaryProviders')) {
            output.aiSummaryProviders = Array.isArray(output.aiSummaryProviders)
                ? [...new Set(output.aiSummaryProviders.filter(provider => ALLOWED_PROVIDERS.has(provider)))]
                : [];
        }
        return output;
    }

    function sanitizeGraphUserConfig(settings = {}) {
        const tenantId = String(settings.graphTenantId || '').trim().toLowerCase();
        const clientId = String(settings.graphClientId || '').trim().toLowerCase();
        if (settings.enableGraphTranscriptImport !== true || !GUID_PATTERN.test(tenantId) || !GUID_PATTERN.test(clientId)) {
            return {};
        }
        return { enableGraphTranscriptImport: true, graphTenantId: tenantId, graphClientId: clientId };
    }

    function safeHttpsUrl(value) {
        try {
            const url = new URL(String(value || '').trim());
            if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '';
            return url.toString().replace(/\/$/, '');
        } catch {
            return '';
        }
    }

    function sanitizeAssistantUserConfig(settings = {}) {
        const output = {};
        if (['disabled', 'local', 'remote'].includes(settings.assistantBridgeMode)) {
            output.assistantBridgeMode = settings.assistantBridgeMode;
        }
        for (const key of ['assistantEndpointUrl', 'assistantAuthorizationEndpoint', 'assistantTokenEndpoint']) {
            const value = safeHttpsUrl(settings[key]);
            if (value) output[key] = value;
        }
        const nativeHost = String(settings.assistantNativeHost || '').trim().toLowerCase();
        if (NATIVE_HOST_PATTERN.test(nativeHost)) output.assistantNativeHost = nativeHost;
        const clientId = String(settings.assistantClientId || '').trim();
        if (clientId && clientId.length <= 200 && /^[a-z0-9._~-]+$/i.test(clientId)) output.assistantClientId = clientId;
        if (Array.isArray(settings.assistantScopes)) {
            output.assistantScopes = [...new Set(settings.assistantScopes
                .map(scope => String(scope).trim())
                .filter(scope => scope.length >= 1 && scope.length <= 200 && /^[a-z0-9:/. _-]+$/i.test(scope))
                .slice(0, 20))];
        }
        if (Number.isInteger(settings.assistantTimeoutSeconds)
            && settings.assistantTimeoutSeconds >= 5 && settings.assistantTimeoutSeconds <= 60) {
            output.assistantTimeoutSeconds = settings.assistantTimeoutSeconds;
        }
        return output;
    }

    function validateAssistantProfile(settings = {}) {
        const sanitized = sanitizeAssistantUserConfig(settings);
        const mode = sanitized.assistantBridgeMode || 'disabled';
        const errors = [];
        if (mode === 'local' && !sanitized.assistantNativeHost) {
            errors.push('An enrolled native host is required for the local assistant bridge.');
        }
        if (mode === 'remote') {
            if (!sanitized.assistantEndpointUrl) errors.push('An HTTPS assistant endpoint is required.');
            if (!sanitized.assistantAuthorizationEndpoint) errors.push('An HTTPS authorization endpoint is required.');
            if (!sanitized.assistantTokenEndpoint) errors.push('An HTTPS token endpoint is required.');
            if (!sanitized.assistantClientId) errors.push('A public OAuth client ID is required.');
            if (!sanitized.assistantScopes?.length) errors.push('At least one delegated assistant scope is required.');
        }
        return Object.freeze({
            configured: mode !== 'disabled',
            valid: mode !== 'disabled' && errors.length === 0,
            errors: Object.freeze(errors),
            profile: Object.freeze({
                mode,
                endpointUrl: sanitized.assistantEndpointUrl || null,
                nativeHost: sanitized.assistantNativeHost || null,
                authorizationEndpoint: sanitized.assistantAuthorizationEndpoint || null,
                tokenEndpoint: sanitized.assistantTokenEndpoint || null,
                clientId: sanitized.assistantClientId || null,
                scopes: Object.freeze(sanitized.assistantScopes || []),
                timeoutMs: (sanitized.assistantTimeoutSeconds || 20) * 1000
            })
        });
    }

    async function readGraphUserConfig() {
        if (!chrome.storage?.local) return {};
        return sanitizeGraphUserConfig(await chrome.storage.local.get(GRAPH_USER_KEYS));
    }

    async function readAssistantUserConfig() {
        if (!chrome.storage?.local) return {};
        return sanitizeAssistantUserConfig(await chrome.storage.local.get(ASSISTANT_USER_KEYS));
    }

    async function readManaged() {
        if (!chrome.storage?.managed) return {};
        try {
            return await chrome.storage.managed.get(POLICY_KEYS);
        } catch {
            return {};
        }
    }

    function applyPolicy(userSettings = {}, managed = {}) {
        const settings = { ...userSettings };
        for (const key of GRAPH_USER_KEYS) delete settings[key];
        Object.assign(settings, sanitizeGraphUserConfig(userSettings));
        for (const key of ASSISTANT_USER_KEYS) delete settings[key];
        Object.assign(settings, sanitizeAssistantUserConfig(userSettings));
        const locked = new Set();
        if (managed.forcePrivacyScrubber === true) {
            settings.privacyScrubberEnabled = true;
            locked.add('privacyScrubberEnabled');
        }
        if (managed.forceScrubbedExport === true) {
            settings.forceScrubbedExport = true;
            settings.privacyScrubberEnabled = true;
            locked.add('privacyScrubberEnabled');
            locked.add('forceScrubbedExport');
        }
        if (managed.forceProfanityFilter === true) {
            settings.profanityFilterEnabled = true;
            locked.add('profanityFilterEnabled');
        }
        if (typeof managed.forceUiLocale === 'string' && UI_LOCALES.has(managed.forceUiLocale)) {
            settings.uiLocale = managed.forceUiLocale;
            locked.add('uiLocale');
        }
        if (managed.disableAiHandoff === true) {
            settings.disableAiHandoff = true;
            settings.autoAISummary = false;
            locked.add('autoAISummary');
            locked.add('disableAiHandoff');
        }
        if (managed.disableEvidenceActions === true) {
            settings.disableEvidenceActions = true;
            locked.add('disableEvidenceActions');
        }
        if (managed.forceScrubbedEvidenceActions === true) {
            settings.forceScrubbedEvidenceActions = true;
            locked.add('forceScrubbedEvidenceActions');
        }
        if (managed.disableAttendeeCapture === true) {
            settings.trackAttendees = false;
            settings.autoOpenAttendees = false;
            locked.add('trackAttendees');
            locked.add('autoOpenAttendees');
        }
        for (const key of ['disableClipboard', 'disableFileExport', 'disableEvidenceEmail', 'disableSessionHistory']) {
            if (managed[key] === true) {
                settings[key] = true;
                locked.add(key);
            }
        }
        for (const [key, minimum, maximum] of [['maxStoredSessions', 1, 10000], ['sessionRetentionDays', 1, 365]]) {
            if (Number.isInteger(managed[key]) && managed[key] >= minimum && managed[key] <= maximum) {
                settings[key] = managed[key];
                locked.add(key);
            }
        }
        if (typeof managed.enableGraphTranscriptImport === 'boolean') {
            for (const key of GRAPH_USER_KEYS) {
                delete settings[key];
                locked.add(key);
            }
            settings.enableGraphTranscriptImport = managed.enableGraphTranscriptImport;
            if (managed.enableGraphTranscriptImport) {
                const managedGraph = sanitizeGraphUserConfig(managed);
                if (managedGraph.enableGraphTranscriptImport) {
                    settings.graphTenantId = managedGraph.graphTenantId;
                    settings.graphClientId = managedGraph.graphClientId;
                }
            }
        }
        if (Array.isArray(managed.allowedAiProviders)) {
            const allowed = new Set(managed.allowedAiProviders.filter(provider => ALLOWED_PROVIDERS.has(provider)));
            settings.aiSummaryProviders = (Array.isArray(settings.aiSummaryProviders) ? settings.aiSummaryProviders : []).filter(provider => allowed.has(provider));
            locked.add('aiSummaryProviders');
        }
        for (const key of ['chatgptWorkspaceUrl', 'claudeWorkspaceUrl', 'claudeConsoleUrl']) {
            if (typeof managed[key] === 'string' && managed[key].trim()) {
                settings[key] = managed[key].trim();
                locked.add(key);
            }
        }
        if (Array.isArray(managed.customScrubTerms)) {
            settings.customScrubTerms = normalizeTerms(managed.customScrubTerms);
            locked.add('customScrubTerms');
        }
        const managedAssistant = sanitizeAssistantUserConfig(managed);
        for (const key of ASSISTANT_USER_KEYS) {
            if (!Object.hasOwn(managedAssistant, key)) continue;
            settings[key] = managedAssistant[key];
            locked.add(key);
        }
        if (Array.isArray(managed.assistantAllowedIntents)) {
            settings.assistantAllowedIntents = [...new Set(managed.assistantAllowedIntents
                .filter(intent => ASSISTANT_INTENTS.has(intent)))];
            locked.add('assistantAllowedIntents');
        }
        return Object.freeze({ settings: Object.freeze(settings), locked: Object.freeze([...locked]) });
    }

    function applyGraphRuntimeConfig(policy, runtimeConfig = {}, manifest = {}) {
        const versionName = String(manifest.version_name || '');
        const isCanonicalBuild = (manifest.name === 'Better CaptionKeep - Development'
                && /\bdevelopment\b/i.test(versionName))
            || (manifest.name === 'Better CaptionKeep - UAT Release Candidate'
                && /\buat release candidate\b/i.test(versionName));
        const sanitizedRuntimeConfig = sanitizeGraphUserConfig(runtimeConfig);
        if (!isCanonicalBuild || sanitizedRuntimeConfig.enableGraphTranscriptImport !== true) return policy;
        const graphKeys = ['enableGraphTranscriptImport', 'graphTenantId', 'graphClientId'];
        const locked = new Set(Array.isArray(policy.locked) ? policy.locked : []);
        const settings = { ...policy.settings };
        for (const key of graphKeys) {
            if (!locked.has(key)) settings[key] = sanitizedRuntimeConfig[key];
            locked.add(key);
        }
        return Object.freeze({
            settings: Object.freeze(settings),
            locked: Object.freeze([...locked])
        });
    }

    function createExport(settings) {
        return JSON.stringify({ product: 'Better CaptionKeep', version: EXPORT_VERSION, settings: sanitize(settings) }, null, 2);
    }

    function parseImport(text) {
        const parsed = JSON.parse(text);
        if (parsed?.product !== 'Better CaptionKeep' || parsed?.version !== EXPORT_VERSION || typeof parsed.settings !== 'object') {
            throw new Error('This is not a supported Better CaptionKeep settings file.');
        }
        return sanitize(parsed.settings);
    }

    globalThis.CaptionKeepConfiguration = Object.freeze({
        USER_KEYS, GRAPH_USER_KEYS, ASSISTANT_USER_KEYS, POLICY_KEYS, normalizeTerms, sanitize,
        sanitizeGraphUserConfig, sanitizeAssistantUserConfig, validateAssistantProfile,
        readGraphUserConfig, readAssistantUserConfig, readManaged, applyPolicy,
        applyGraphRuntimeConfig, createExport, parseImport
    });
})();
