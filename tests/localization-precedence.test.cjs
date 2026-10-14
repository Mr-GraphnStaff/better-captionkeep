const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../teams-captions-saver/localization.js'), 'utf8');

function helper({managed, user, browser = 'es', navigatorLanguage = 'en', managedFails = false, userFails = false}) {
    const context = vm.createContext({
        document: {readyState:'loading', addEventListener() {}},
        navigator: {language:navigatorLanguage},
        chrome: {
            storage: {
                managed: {async get() {if (managedFails) throw new Error('Unavailable'); return {forceUiLocale:managed};}},
                sync: {async get() {if (userFails) throw new Error('Unavailable'); return {uiLocale:user};}}
            },
            i18n: {getUILanguage:() => browser}
        }
    });
    vm.runInContext(source, context);
    return context.CaptionKeepLocalization;
}

test('absent, empty, invalid and mistyped managed locale do not override user choice', async () => {
    for (const managed of [undefined, null, '', 'nonsense', 'FR', 'fr_CA', 'en-US', 42, false, {}, ['fr']]) {
        assert.equal(await helper({managed, user:'fr-CA'}).resolveUiLocale(), 'fr', JSON.stringify(managed));
    }
});

test('every valid fixed managed locale overrides the user locale', async () => {
    const locales = helper({}).LOCALES;
    for (const managed of [...locales, 'fr-CA']) {
        const localization = helper({managed, user:'es'});
        assert.equal(await localization.resolveUiLocale(), localization.normalizeLocale(managed), managed);
    }
});

test('explicit managed system follows browser even when user selected another language', async () => {
    assert.equal(await helper({managed:'system', user:'fr-CA', browser:'es-MX'}).resolveUiLocale(), 'es');
    assert.equal(await helper({managed:'system', user:'es', browser:'fr-CA'}).resolveUiLocale(), 'fr');
});

test('user system/absent choice follows browser and unsupported browser falls back to English', async () => {
    for (const user of [undefined, '', 'system']) {
        assert.equal(await helper({user, browser:'pt-BR'}).resolveUiLocale(), 'pt_BR');
    }
    assert.equal(await helper({user:'system', browser:'unsupported'}).resolveUiLocale(), 'en');
    assert.equal(await helper({managed:'system', user:'es', browser:'', navigatorLanguage:'fr-CA'}).resolveUiLocale(), 'fr');
});

test('unavailable storage preserves valid policy or browser/user fallback', async () => {
    assert.equal(await helper({managedFails:true, user:'fr-CA'}).resolveUiLocale(), 'fr');
    assert.equal(await helper({managed:'fr-CA', userFails:true}).resolveUiLocale(), 'fr');
    assert.equal(await helper({managedFails:true, userFails:true, browser:'es'}).resolveUiLocale(), 'es');
});
