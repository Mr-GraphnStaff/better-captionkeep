(() => {
    'use strict';

    const PROVIDERS = Object.freeze({
        chatgpt: Object.freeze({ name: 'ChatGPT', defaultUrl: 'https://chatgpt.com/', settingKey: 'chatgptWorkspaceUrl', allowedHosts: Object.freeze(['chatgpt.com']) }),
        claude: Object.freeze({ name: 'Claude', defaultUrl: 'https://claude.ai/', settingKey: 'claudeWorkspaceUrl', allowedHosts: Object.freeze(['claude.ai']) }),
        claude_console: Object.freeze({ name: 'Claude Console', defaultUrl: 'https://console.anthropic.com/', settingKey: 'claudeConsoleUrl', allowedHosts: Object.freeze(['console.anthropic.com']) }),
        copilot: Object.freeze({ name: 'Microsoft Copilot', defaultUrl: 'https://m365.cloud.microsoft/chat/', settingKey: null, allowedHosts: Object.freeze(['m365.cloud.microsoft']) }),
        gemini: Object.freeze({ name: 'Gemini', defaultUrl: 'https://gemini.google.com/', settingKey: null, allowedHosts: Object.freeze(['gemini.google.com']) })
    });

    function normalizeCustomUrl(providerKey, candidate) {
        const provider = PROVIDERS[providerKey];
        if (!provider || typeof candidate !== 'string' || !candidate.trim()) return null;
        try {
            const parsed = new URL(candidate.trim());
            if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
            if (!provider.allowedHosts.includes(parsed.hostname.toLowerCase())) return null;
            return parsed.href;
        } catch {
            return null;
        }
    }

    function resolve(providerKey, settings = {}) {
        const provider = PROVIDERS[providerKey];
        if (!provider) return null;
        const configuredUrl = provider.settingKey ? normalizeCustomUrl(providerKey, settings[provider.settingKey]) : null;
        return Object.freeze({
            name: provider.name,
            url: configuredUrl || provider.defaultUrl,
            configured: Boolean(configuredUrl),
            requiresWorkspaceConfirmation: ['chatgpt', 'claude'].includes(providerKey)
        });
    }

    globalThis.CaptionKeepDestinations = Object.freeze({ PROVIDERS, normalizeCustomUrl, resolve });
})();
