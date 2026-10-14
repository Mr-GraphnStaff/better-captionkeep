const {test} = require('node:test');
const assert = require('node:assert/strict');
const {existsSync} = require('node:fs');
const {mkdtemp, rm} = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

test('rendered surface gate rejects hidden, clipped and unreachable interface checks', async () => {
    const {validateSurfaceResult} = await import('../scripts/rendered-surface-checks.mjs');
    for (const name of ['Settings main is visible','Popup has no horizontal overflow','Settings navigation opens #saving-settings']) {
        assert.throws(() => validateSurfaceResult({checks:[{name,passed:false}]}), error => error.message.includes(name));
    }
    assert.throws(() => validateSurfaceResult({checks:[]}), /No rendered assertions/);
    assert.throws(() => validateSurfaceResult({checks:[{name:'visible',passed:true}]}, ['ReferenceError: broken']), /Browser script exception/);
    assert.equal(validateSurfaceResult({checks:[{name:'visible',passed:true}]}).checks.length,1);
});

test('theme observation waits for media listeners and native fields without changing the app', async () => {
    const {observeThemeState} = await import('../scripts/rendered-surface-checks.mjs');
    const expected = {preference:'system',theme:'light',native:'light',nativeField:'light'};
    let reads = 0;
    const cdp = {async send(method, {expression}) {
        assert.equal(method,'Runtime.evaluate');
        assert(!expression.includes('CaptionKeepTheme.apply'), 'Observation must not repair the application');
        reads++;
        const actual = reads === 1 ? {...expected,theme:'captionkeep',native:'dark',nativeField:'dark'}
            : reads === 2 ? {...expected,nativeField:'dark'} : expected;
        return {result:{value:actual}};
    }};
    const result = await observeThemeState(cdp,expected,{timeoutMs:100,intervalMs:1});
    assert.equal(result.passed,true);
    assert.equal(reads,3);
});

test('theme observation preserves permanent failures and reports the actual state', async () => {
    const {observeThemeState,validateSurfaceResult} = await import('../scripts/rendered-surface-checks.mjs');
    const actual = {preference:'system',theme:'captionkeep',native:'dark',nativeField:'dark'};
    const cdp = {async send() {return {result:{value:actual}};}};
    const observed = await observeThemeState(cdp,{theme:'light'},{timeoutMs:0});
    assert.equal(observed.passed,false);
    assert.throws(() => validateSurfaceResult({checks:[{name:'light theme',...observed}]}), /actual:.*captionkeep/);
});

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
test('rendered surfaces verify system/native themes, viewer tools, and empty handoff actions',
    {skip:!existsSync(chrome)}, async () => {
        const {runChromiumSurface} = await import('../scripts/rendered-surface-checks.mjs');
        const temporary = await mkdtemp(path.join(os.tmpdir(),'captionkeep-positive-render-'));
        try {
            const result = await runChromiumSurface(chrome,path.resolve(__dirname,'../teams-captions-saver'),path.join(temporary,'settings.png'));
            for (const surface of ['settings','popup','viewer','handoff','workspace']) {
                assert(result.checks.some(check => check.name === surface+' system theme follows light' && check.passed));
                assert(result.checks.some(check => check.name === surface+' system theme follows dark' && check.passed));
            }
            assert(result.checks.some(check => check.name === 'Viewer secondary tools collapsed initially' && check.passed));
            assert(result.checks.some(check => check.name === 'Handoff workspace hidden with no payload' && check.passed));
        } finally {await rm(temporary,{recursive:true,force:true});}
    });
test('actual rendered gate rejects blank Settings, horizontal clipping, and browser exceptions',
    {skip:!existsSync(chrome)}, async () => {
        const {runChromiumSurface} = await import('../scripts/rendered-surface-checks.mjs');
        const temporary = await mkdtemp(path.join(os.tmpdir(),'captionkeep-negative-render-'));
        try {
            const directory = path.resolve(__dirname,'../teams-captions-saver');
            await assert.rejects(runChromiumSurface(chrome,directory,path.join(temporary,'blank.png'), {
                beforeAssertions:"document.querySelector('.popup-main').style.display='none'"
            }), /Settings main is visible/);
            await assert.rejects(runChromiumSurface(chrome,directory,path.join(temporary,'clipped.png'), {
                beforeAssertions:"document.body.style.minWidth='2000px'"
            }), /horizontal overflow/);
            await assert.rejects(runChromiumSurface(chrome,directory,path.join(temporary,'exception.png'), {
                beforeAssertions:"throw new Error('intentional browser exception')"
            }), /Browser script exception/);
            await assert.rejects(runChromiumSurface(chrome,directory,path.join(temporary,'broken-theme.png'), {
                beforeAssertions:"matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => { if (event.matches && document.documentElement.dataset.themePreference === 'light') document.documentElement.dataset.theme = 'captionkeep'; })"
            }), /explicit light stays light on dark OS/);
        } finally {await rm(temporary,{recursive:true,force:true});}
    });
