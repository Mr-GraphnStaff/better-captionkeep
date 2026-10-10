(() => {
    'use strict';

    const LOCALES = Object.freeze([
        'en', 'fr', 'es', 'es_419', 'de', 'pt_BR', 'pt_PT', 'it', 'nl', 'pl',
        'cs', 'el', 'ro', 'sv', 'uk', 'ru', 'tr', 'hi', 'bn', 'gu', 'kn', 'ml', 'mr',
        'ta', 'te', 'id', 'fil', 'ms', 'th', 'vi', 'ja', 'ko', 'zh_CN', 'zh_TW',
        'ar', 'he', 'fa', 'sw'
    ]);
    const RTL_LOCALES = new Set(['ar', 'he', 'fa']);
    const LOCALE_LABELS = Object.freeze({
        en:'English', fr:'Français canadien', es:'Español', es_419:'Español latinoamericano',
        de:'Deutsch', pt_BR:'Português do Brasil', pt_PT:'Português', it:'Italiano', nl:'Nederlands',
        pl:'Polski', cs:'Čeština', el:'Ελληνικά', ro:'Română', sv:'Svenska', uk:'Українська', ru:'Русский',
        tr:'Türkçe', hi:'हिन्दी', bn:'বাংলা', gu:'ગુજરાતી', kn:'ಕನ್ನಡ', ml:'മലയാളം', mr:'मराठी',
        ta:'தமிழ்', te:'తెలుగు', id:'Bahasa Indonesia', fil:'Filipino', ms:'Bahasa Melayu',
        th:'ไทย', vi:'Tiếng Việt', ja:'日本語', ko:'한국어', zh_CN:'简体中文', zh_TW:'繁體中文',
        ar:'العربية', he:'עברית', fa:'فارسی', sw:'Kiswahili'
    });
    let activeLocale = 'en';
    let activeMessages = {};
    let englishMessages = {};

    function normalizeLocale(value) {
        const raw = String(value || '').trim().replace('-', '_');
        if (!raw || raw === 'system') return 'system';
        if (raw.toLowerCase() === 'fr_ca') return 'fr';
        const exact = LOCALES.find(locale => locale.toLowerCase() === raw.toLowerCase());
        if (exact) return exact;
        const language = raw.split('_')[0].toLowerCase();
        return LOCALES.find(locale => locale.toLowerCase() === language) || 'en';
    }

    async function readManagedLocale() {
        try {
            const managed = await chrome.storage.managed.get('forceUiLocale');
            return normalizeLocale(managed.forceUiLocale);
        } catch {
            return 'system';
        }
    }

    async function resolveUiLocale() {
        const [managed, user] = await Promise.all([
            readManagedLocale(),
            chrome.storage.sync.get('uiLocale').catch(() => ({}))
        ]);
        const requested = managed !== 'system' ? managed : normalizeLocale(user.uiLocale);
        if (requested !== 'system') return requested;
        return normalizeLocale(chrome.i18n?.getUILanguage?.() || navigator.language || 'en');
    }

    async function loadCatalog(locale) {
        const response = await fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`));
        if (!response.ok) throw new Error(`Locale catalog ${locale} is unavailable.`);
        return response.json();
    }

    function messageValue(catalog, key) {
        return String(catalog?.[key]?.message || '');
    }

    function getMessage(key, substitutions = [], fallback = '') {
        const values = Array.isArray(substitutions) ? substitutions : [substitutions];
        let output = messageValue(activeMessages, key) || messageValue(englishMessages, key) || fallback;
        values.forEach((value, index) => { output = output.replaceAll(`$${index + 1}`, String(value)); });
        return output;
    }

    function translateStaticText(root = document) {
        const translations = new Map();
        for (const [key, record] of Object.entries(englishMessages)) {
            const source = String(record?.message || '').trim();
            const translated = messageValue(activeMessages, key).trim();
            if (source && translated && source !== translated) translations.set(source, translated);
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
            if (['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName)) continue;
            const original = node.nodeValue || '';
            const trimmed = original.trim();
            if (translations.has(trimmed)) node.nodeValue = original.replace(trimmed, translations.get(trimmed));
        }
        root.querySelectorAll?.('[data-i18n]').forEach(element => {
            element.textContent = getMessage(element.dataset.i18n, [], element.textContent);
        });
        for (const attribute of ['aria-label', 'title', 'placeholder']) {
            root.querySelectorAll?.(`[${attribute}]`).forEach(element => {
                const current = element.getAttribute(attribute)?.trim();
                if (translations.has(current)) element.setAttribute(attribute, translations.get(current));
            });
        }
    }

    function addPreviewNotice() {
        if (activeLocale === 'en' || messageValue(activeMessages, 'localizationQuality') !== 'preview') return;
        if (document.getElementById('localization-preview-notice')) return;
        const notice = document.createElement('aside');
        notice.id = 'localization-preview-notice';
        notice.setAttribute('role', 'note');
        notice.style.cssText = 'box-sizing:border-box;margin:8px;padding:8px 10px;border:1px solid #b7791f;border-radius:8px;background:#fff8db;color:#3d2d00;font:12px/1.35 system-ui,sans-serif;';
        const text = document.createElement('span');
        text.textContent = getMessage('translationPreviewNotice', [], 'AI-assisted translation preview.');
        const report = document.createElement('a');
        report.textContent = getMessage('reportTranslation', [], 'Report this translation');
        report.href = `https://github.com/Mr-GraphnStaff/better-captionkeep/issues/new?template=localization_report.yml&title=${encodeURIComponent(`[Localization ${activeLocale}] `)}`;
        report.target = '_blank';
        report.rel = 'noopener noreferrer';
        notice.append(text, document.createTextNode(' '), report);
        document.body.prepend(notice);
    }

    function populateLocaleSelect(select) {
        if (!select) return;
        select.replaceChildren();
        const system = document.createElement('option');
        system.value = 'system';
        system.textContent = getMessage('followBrowserLanguage', [], 'Follow browser language');
        select.append(system);
        for (const locale of LOCALES) {
            const option = document.createElement('option');
            option.value = locale;
            option.textContent = LOCALE_LABELS[locale];
            select.append(option);
        }
    }

    async function initialize() {
        activeLocale = await resolveUiLocale();
        englishMessages = await loadCatalog('en');
        try {
            activeMessages = activeLocale === 'en' ? englishMessages : await loadCatalog(activeLocale);
        } catch (error) {
            console.warn('[Better CaptionKeep] Falling back to English localization:', error);
            activeLocale = 'en';
            activeMessages = englishMessages;
        }
        document.documentElement.lang = activeLocale.replace('_', '-');
        document.documentElement.dir = RTL_LOCALES.has(activeLocale) ? 'rtl' : 'ltr';
        translateStaticText(document);
        addPreviewNotice();
        document.dispatchEvent(new CustomEvent('captionkeep:localized', {detail:{locale:activeLocale}}));
        return activeLocale;
    }

    globalThis.CaptionKeepLocalization = Object.freeze({
        LOCALES, LOCALE_LABELS, normalizeLocale, resolveUiLocale, getMessage,
        translateStaticText, populateLocaleSelect, initialize,
        get activeLocale() { return activeLocale; }
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void initialize(), {once:true});
    else void initialize();
})();
