(() => {
    'use strict';

    const STORAGE_KEY = 'uiTheme';
    const DEFAULT_THEME = 'captionkeep';
    const VALID_THEMES = new Set(['captionkeep', 'light', 'midnight', 'slate', 'high-contrast', 'system']);
    const systemAppearance = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    let preference = DEFAULT_THEME;

    function normalize(theme) {
        return VALID_THEMES.has(theme) ? theme : DEFAULT_THEME;
    }

    function apply(theme) {
        const selected = normalize(theme);
        preference = selected;
        document.documentElement.dataset.themePreference = selected;
        document.documentElement.dataset.theme = selected === 'system'
            ? (systemAppearance?.matches ? 'captionkeep' : 'light') : selected;
        return selected;
    }

    systemAppearance?.addEventListener('change', () => {
        if (preference === 'system') apply('system');
    });

    async function set(theme) {
        const selected = normalize(theme);
        await chrome.storage.sync.set({ [STORAGE_KEY]: selected });
        try {
            const managed = await chrome.storage.managed.get(STORAGE_KEY);
            if (VALID_THEMES.has(managed[STORAGE_KEY])) return apply(managed[STORAGE_KEY]);
        } catch { /* No organization appearance policy. */ }
        return apply(selected);
    }

    async function load() {
        try {
            const settings = await chrome.storage.sync.get(STORAGE_KEY);
            try {
                const managed = await chrome.storage.managed.get(STORAGE_KEY);
                if (VALID_THEMES.has(managed[STORAGE_KEY])) settings[STORAGE_KEY] = managed[STORAGE_KEY];
            } catch { /* No organization appearance policy. */ }
            return apply(settings[STORAGE_KEY]);
        } catch (error) {
            console.error('[Better CaptionKeep] Unable to load theme:', error);
            return apply(DEFAULT_THEME);
        }
    }

    globalThis.CaptionKeepTheme = Object.freeze({
        DEFAULT_THEME,
        VALID_THEMES: Object.freeze([...VALID_THEMES]),
        apply,
        load,
        set
    });

    const previewTheme = globalThis.location?.protocol === 'file:'
        ? new URLSearchParams(globalThis.location.search).get('theme')
        : null;
    apply(previewTheme || DEFAULT_THEME);

    if (!globalThis.chrome?.storage?.sync) {
        return;
    }

    void load();
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if ((areaName === 'sync' || areaName === 'managed') && changes[STORAGE_KEY]) {
            if (!chrome.storage.managed && areaName === 'sync') apply(changes[STORAGE_KEY].newValue);
            else void load();
        }
    });
})();
