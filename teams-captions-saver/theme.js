(() => {
    'use strict';

    const STORAGE_KEY = 'uiTheme';
    const DEFAULT_THEME = 'captionkeep';
    const VALID_THEMES = new Set(['captionkeep', 'light', 'midnight', 'system']);

    function normalize(theme) {
        return VALID_THEMES.has(theme) ? theme : DEFAULT_THEME;
    }

    function apply(theme) {
        const selected = normalize(theme);
        document.documentElement.dataset.theme = selected;
        return selected;
    }

    async function set(theme) {
        const selected = apply(theme);
        await chrome.storage.sync.set({ [STORAGE_KEY]: selected });
        return selected;
    }

    async function load() {
        try {
            const settings = await chrome.storage.sync.get(STORAGE_KEY);
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
        if (areaName === 'sync' && changes[STORAGE_KEY]) {
            apply(changes[STORAGE_KEY].newValue);
        }
    });
})();
