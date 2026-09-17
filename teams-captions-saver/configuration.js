(() => {
    'use strict';

    const EXPORT_VERSION = 1;
    const USER_KEYS = Object.freeze([
        'autoEnableCaptions', 'autoSaveOnEnd', 'defaultSaveFormat', 'saveAsType',
        'saveLocation', 'trackCaptions', 'trackAttendees', 'autoOpenAttendees',
        'autoAISummary', 'privacyScrubberEnabled', 'profanityFilterEnabled',
        'customScrubTerms', 'aiSummaryProviders', 'chatgptWorkspaceUrl',
        'claudeWorkspaceUrl', 'claudeConsoleUrl', 'timestampFormat',
        'filenamePattern', 'uiTheme'
    ]);

    const POLICY_KEYS = Object.freeze([
        'forcePrivacyScrubber', 'disableAiHandoff', 'allowedAiProviders',
        'chatgptWorkspaceUrl', 'claudeWorkspaceUrl', 'claudeConsoleUrl',
        'forceProfanityFilter', 'customScrubTerms'
    ]);

    const ALLOWED_PROVIDERS = new Set(['chatgpt', 'claude', 'claude_console', 'copilot', 'gemini']);
    const BOOLEAN_KEYS = new Set(['autoEnableCaptions', 'autoSaveOnEnd', 'trackCaptions', 'trackAttendees', 'autoOpenAttendees', 'autoAISummary', 'privacyScrubberEnabled', 'profanityFilterEnabled']);
    const ENUMS = Object.freeze({
        defaultSaveFormat: new Set(['txt', 'md']),
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
        const locked = new Set();
        if (managed.forcePrivacyScrubber === true) {
            settings.privacyScrubberEnabled = true;
            locked.add('privacyScrubberEnabled');
        }
        if (managed.forceProfanityFilter === true) {
            settings.profanityFilterEnabled = true;
            locked.add('profanityFilterEnabled');
        }
        if (managed.disableAiHandoff === true) {
            settings.autoAISummary = false;
            locked.add('autoAISummary');
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
        return Object.freeze({ settings: Object.freeze(settings), locked: Object.freeze([...locked]) });
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

    globalThis.CaptionKeepConfiguration = Object.freeze({ USER_KEYS, POLICY_KEYS, normalizeTerms, sanitize, readManaged, applyPolicy, createExport, parseImport });
})();
