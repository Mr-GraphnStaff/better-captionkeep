const {test} = require('node:test');
const assert = require('node:assert/strict');
const {mkdtemp, rm, mkdir, writeFile} = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
async function evaluate(cdp, expression) {
    const result = await cdp.send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
}
async function waitForExtrasReady(cdp,{timeoutMs=5000,intervalMs=25}={}) {
    const deadline=Date.now()+timeoutMs;
    do {
        const ready=await evaluate(cdp,`location.pathname.endsWith('/extras.html') &&
            new URLSearchParams(location.search).get('session') === 'synthetic-moment' &&
            document.readyState === 'complete' && typeof preview === 'function' &&
            typeof globalThis.CaptionKeepMeetingExtras?.normalize === 'function' &&
            document.getElementById('meeting')?.textContent === 'Saved meeting' &&
            document.getElementById('load-extras')?.disabled === false &&
            !!document.getElementById('image-confirm') && !!document.getElementById('export-image')`);
        if(ready) return;
        if(Date.now()>=deadline) break;
        await new Promise(resolve=>setTimeout(resolve,intervalMs));
    } while(true);
    throw new Error('Expected Capture Moment document and initialized extras controls did not become ready.');
}
test('extras readiness waits for the navigated document and preserves permanent failure',async()=>{
    let reads=0;
    await waitForExtrasReady({async send(){return {result:{value:++reads===3}};}},{timeoutMs:100,intervalMs:1});
    assert.equal(reads,3);
    await assert.rejects(waitForExtrasReady({async send(){return {result:{value:false}};}},{timeoutMs:0}),/did not become ready/);
    await assert.rejects(waitForExtrasReady({async send(){return {exceptionDetails:{text:'synthetic readiness exception'}};}}),/synthetic readiness exception/);
});
const workspaceChecks = `(async () => {
    const checks = [];
    const add = (name, passed) => checks.push({name, passed:!!passed});
    const settleTheme = async () => {await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})));};
    const key = value => document.querySelector('.workspace-tabs').dispatchEvent(new KeyboardEvent('keydown', {key:value, bubbles:true, cancelable:true}));
    document.getElementById('transcript-tab').focus(); key('End');
    add('Workspace End key selects Ask', document.activeElement.id === 'ask-tab' && !document.getElementById('ask-view').hidden);
    key('ArrowLeft');
    add('Workspace arrow key selects Templates', document.activeElement.id === 'templates-tab' && !document.getElementById('templates-view').hidden);
    add('Templates exposes versioned instructions', document.getElementById('workspace-template-select').options.length >= 5 && /Version 1/.test(document.getElementById('workspace-template-version').textContent));
    key('Home');
    add('Workspace Home key restores Transcript', document.activeElement.id === 'transcript-tab' && !document.getElementById('transcript-view').hidden);
    add('Selection actions are hidden until a caption is chosen', document.getElementById('on-the-fly-bar').hidden);
    add('Narrow workspace has no document overflow', document.documentElement.scrollWidth <= innerWidth + 1);
    const luminance = color => {
      const values = color.match(/[\\d.]+/g).slice(0,3).map(Number).map(value => value/255).map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
      return values.reduce((sum,value,index) => sum + value*[.2126,.7152,.0722][index], 0);
    };
    const contrast = (a,b) => { const x=luminance(a), y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
    const card = document.querySelector('.rolling-notes-card');
    const light = getComputedStyle(card);
    const endpoints = light.backgroundImage.match(/rgb\\([^)]+\\)/g) || [];
    add('Light Rolling Notes text has contrasting gradient endpoints', endpoints.length > 0 && endpoints.every(color => contrast(light.color, color) >= 4.5));
    CaptionKeepTheme.apply('captionkeep');
    await settleTheme();
    const primary = getComputedStyle(document.getElementById('generate-notes'));
    add('Dark primary button text has adequate contrast', contrast(primary.color, primary.backgroundColor) >= 4.5);
    for (const preset of ['slate','high-contrast']) {
        CaptionKeepTheme.apply(preset);
        await settleTheme();
        const control = getComputedStyle(document.getElementById('generate-notes'));
        const body = getComputedStyle(document.body);
        add(preset+' has native dark scheme and contrasting primary text', getComputedStyle(document.documentElement).colorScheme === 'dark'
          && contrast(control.color, control.backgroundColor) >= 4.5 && contrast(body.color, body.backgroundColor) >= 7);
    }
    const records = {}, requests = [];
    const storageArea = {async get(key) {return typeof key === 'string' ? {[key]:records[key]} : {};}, async set(values) {Object.assign(records, structuredClone(values));}, async remove(key) {delete records[key];}};
    chrome.storage.local = {...storageArea}; chrome.storage.session = {...storageArea};
    const caption = (key, text) => ({key, Name:'Synthetic speaker', Text:text, Time:'10:00', capturedAt:'2026-10-14T10:00:00Z'});
    const live = {sessionId:'synthetic-a', meetingTitle:'Synthetic test', providerLabel:'Google Meet', isInMeeting:true, capturing:true,
      captureState:'capturing',
      transcriptArray:[caption('one','First'),caption('two','Second')]};
    globalThis.__workspaceTestLive = live;
    chrome.tabs.query = async () => [{id:23, url:'https://meet.google.com/abc-defg-hij'}];
    chrome.tabs.sendMessage = async () => structuredClone(live);
    chrome.tabs.create = async () => ({});
    chrome.runtime.sendMessage = async message => { if (message.message === 'save_derived_artifact') requests.push(structuredClone(message)); return {ok:true, artifacts:message.artifact ? [message.artifact] : [], markers:[]}; };
    await new Promise(resolve => setTimeout(resolve,1350));
    const rows = [...document.querySelectorAll('.caption-select')];
    add('Conversation reads in source chronology', rows.map(row => row.dataset.captionIndex).join(',') === '0,1');
    add('No per-row Mark or On the Fly action clutter', document.querySelectorAll('.caption-mark,.caption-research').length === 0);
    const row = rows[0]; row.focus(); row.click();
    const boundary = document.querySelector('main').getBoundingClientRect();
    const mark = document.getElementById('mark-latest').getBoundingClientRect();
    add('Narrow selected-caption action stays inside workspace', mark.left >= boundary.left && mark.right <= boundary.right && mark.width > 0);
    add('Caption selection pauses Follow latest', document.getElementById('follow-latest').getAttribute('aria-pressed') === 'false');
    document.getElementById('clear-on-the-fly').click();
    add('Clear selection restores caption keyboard focus', document.activeElement === row && document.getElementById('on-the-fly-bar').hidden);
    document.getElementById('workspace-template-select').value = 'actions';
    document.getElementById('workspace-template-select').dispatchEvent(new Event('change'));
    document.getElementById('workspace-template-use').click();
    await new Promise(resolve => setTimeout(resolve,100));
    const handoffs = Object.values(records).filter(value => value?.mode === 'live_notes');
    add('Selected template version reaches real handoff handler', handoffs.some(value => value.selectedTemplate?.id === 'actions' && value.selectedTemplate?.version === 1));
    document.getElementById('ask-question').value = 'What happened?';
    document.getElementById('prepare-question').click();
    await new Promise(resolve => setTimeout(resolve,100));
    live.transcriptArray.push(caption('three','Later'));
    await new Promise(resolve => setTimeout(resolve,1350));
    document.getElementById('answer-draft').value = 'Reviewed [C0003]';
    document.getElementById('save-answer').click();
    await new Promise(resolve => setTimeout(resolve,75));
    const rejectedStatus = document.getElementById('board-status').textContent;
    add('Rendered answer rejects captions absent from original Ask (requests='+requests.length+', status='+rejectedStatus+')', requests.length === 0 && /not present/.test(rejectedStatus));
    document.getElementById('answer-draft').value = 'Reviewed [C0002]';
    document.getElementById('save-answer').click();
    await new Promise(resolve => setTimeout(resolve,75));
    add('Rendered answer retains original Ask caption count', requests.at(-1)?.artifact.sourceCaptionCount === 2);
    document.getElementById('notes-draft').value = 'Source A draft';
    const original = structuredClone(live);
    live.sessionId = 'synthetic-b'; live.transcriptArray = [caption('other','Other')];
    await new Promise(resolve => setTimeout(resolve,1350));
    add('Rendered meeting switch separates draft text', document.getElementById('notes-draft').value === '');
    Object.assign(live, original);
    await new Promise(resolve => setTimeout(resolve,1350));
    add('Rendered return restores original meeting draft', document.getElementById('notes-draft').value === 'Source A draft');
    return {checks};
})()`;
const readingChecks = `(async () => {
    const checks = [], add = (name,passed) => checks.push({name,passed:!!passed});
    const waitFor = async predicate => {const deadline=Date.now()+6000; while (!predicate()) {if(Date.now()>deadline) throw new Error('Workspace fixture did not reach its expected caption state'); await new Promise(resolve=>setTimeout(resolve,30));}};
    const live = globalThis.__workspaceTestLive;
    live.transcriptArray = Array.from({length:150}, (_,index) => ({key:'reading-'+index, Name:index % 2 ? 'Speaker B' : 'Speaker A',
      Text:'Synthetic caption '+(index+1)+': reviewing the proposal and next steps.', Time:'10:00', capturedAt:'2026-10-14T10:00:00Z'}));
    if (document.getElementById('follow-latest').getAttribute('aria-pressed') !== 'true') document.getElementById('follow-latest').click();
    await waitFor(()=>document.querySelectorAll('.caption-select').length===150 && document.querySelector('.caption-select')?.closest('li').dataset.captionKey==='reading-0');
    const oldest = document.querySelector('.caption-select'); oldest.focus();
    add('Caption focus immediately pauses even after automatic following (active='+document.activeElement?.className+', docfocus='+document.hasFocus()+')',document.getElementById('follow-latest').getAttribute('aria-pressed')==='false');
    const initialY = scrollY;
    live.transcriptArray.push({key:'reading-150',Name:'Speaker A',Text:'Synthetic new caption 151.',Time:'10:01'});
    await waitFor(()=>document.getElementById('transcript-count').textContent==='151');
    add('Focused unselected oldest row survives caption 151',oldest.isConnected && document.activeElement === oldest && oldest.getAttribute('aria-pressed') === 'false');
    add('Conversation keeps one caption keyboard entry point',document.querySelectorAll('.caption-select[tabindex="0"]').length === 1);
    add('Paused reading keeps scroll position on new captions',Math.abs(scrollY-initialY) < 5);
    add('Long conversation explains bounded window and full transcript',!document.getElementById('transcript-window-note').hidden && /Full transcript/.test(document.getElementById('transcript-window-note').textContent));
    const text = oldest.querySelector('.caption-text').firstChild;
    const range = document.createRange(); range.setStart(text,0); range.setEnd(text,17);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    await new Promise(resolve => setTimeout(resolve,35));
    const chosenText = selection.toString(), chosenY = scrollY;
    live.transcriptArray.push({key:'reading-151',Name:'Speaker B',Text:'Synthetic new caption 152.',Time:'10:01'});
    await waitFor(()=>document.getElementById('transcript-count').textContent==='152');
    add('Highlighted words survive new caption polling',selection.toString() === chosenText && chosenText.length > 0);
    add('Word selection pauses scrolling without losing place',document.getElementById('follow-latest').getAttribute('aria-pressed') === 'false' && Math.abs(scrollY-chosenY) < 5);
    add('Conversation uses document scrolling without nested transcript scroller',getComputedStyle(document.getElementById('transcript-list')).overflowY === 'visible');
    document.getElementById('clear-on-the-fly').click();
    document.getElementById('follow-latest').click();
    add('Explicit Follow latest resumes after reading focus',document.getElementById('follow-latest').getAttribute('aria-pressed')==='true' && document.activeElement.id==='follow-latest' && document.querySelector('.caption-select').dataset.captionIndex==='2');
    document.getElementById('follow-latest').click();
    // Restore the oldest bounded reading window for subsequent real keyboard checks.
    document.getElementById('transcript-search').value='Synthetic';
    document.getElementById('transcript-search').dispatchEvent(new Event('input'));
    return {checks};
})()`;

test('real Chrome checks constrained workspace keyboard, source-bound reviewed actions, and native archive focus', async t => {
    const {installedBrowsers} = await import('../scripts/browser-platform.mjs');
    const chrome = (await installedBrowsers()).find(browser => browser.browser === 'chrome')?.binary;
    if (!chrome) {t.skip('Google Chrome is not installed on this host.'); return;}
    const {runChromiumSurface} = await import('../scripts/rendered-surface-checks.mjs');
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'captionkeep-advanced-render-'));
    try {
        const result = await runChromiumSurface(chrome, path.resolve(__dirname,'../teams-captions-saver'), path.join(temporary,'settings.png'), {
            viewportForSurface:surface => ({width:surface === 'workspace' ? 300 : surface === 'popup' ? 364 : 1280, height:surface === 'popup' ? 600 : 900}),
            afterSurface:async (surface, cdp) => {
                if (surface === 'workspace') {
                    const result = await evaluate(cdp, workspaceChecks);
                    result.checks.push(...(await evaluate(cdp, readingChecks)).checks);
                    await evaluate(cdp, "document.querySelector('.caption-select').focus()");
                    await cdp.send('Input.dispatchKeyEvent', {type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
                    await cdp.send('Input.dispatchKeyEvent', {type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
                    result.checks.push({name:'Actual arrow key moves caption focus without marking',passed:await evaluate(cdp,"document.activeElement.dataset.captionIndex === '1' && document.getElementById('on-the-fly-bar').hidden")});
                    await cdp.send('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
                    await cdp.send('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
                    await new Promise(resolve => setTimeout(resolve,60));
                    result.checks.push({name:'Actual Enter opens progressive caption actions',passed:await evaluate(cdp,"!document.getElementById('on-the-fly-bar').hidden && document.activeElement.getAttribute('aria-pressed') === 'true'")});
                    await cdp.send('Input.dispatchKeyEvent', {type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
                    await cdp.send('Input.dispatchKeyEvent', {type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
                    result.checks.push({name:'Caption keyboard selection reaches shared action bar',passed:await evaluate(cdp,"document.getElementById('on-the-fly-bar').contains(document.activeElement)")});
                    await evaluate(cdp,"document.getElementById('clear-on-the-fly').click(); window.scrollTo(0,0)");
                    const evidence = path.resolve(__dirname,'../output/qa'); await mkdir(evidence,{recursive:true});
                    await evaluate(cdp,"CaptionKeepTheme.apply('captionkeep'); document.activeElement.blur()");
                    for (const width of [400,300,1280]) {
                        await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
                        await evaluate(cdp,"window.scrollTo(0,0)");
                        await new Promise(resolve => setTimeout(resolve,60));
                        result.checks.push({name:'Populated '+width+'px workspace has no document overflow',passed:await evaluate(cdp,"document.documentElement.scrollWidth <= innerWidth")});
                        const shot = await cdp.send('Page.captureScreenshot',{format:'png'});
                        await writeFile(path.join(evidence,'workspace-reading-first-'+width+'.png'),Buffer.from(shot.data,'base64'));
                    }
                    await cdp.send('Emulation.setDeviceMetricsOverride',{width:400,height:900,deviceScaleFactor:1,mobile:false});
                    await evaluate(cdp,"document.querySelector('.caption-select').click(); window.scrollTo(0,0)");
                    await new Promise(resolve => setTimeout(resolve,150));
                    const selected = await cdp.send('Page.captureScreenshot',{format:'png'});
                    await writeFile(path.join(evidence,'workspace-reading-first-selection-400.png'),Buffer.from(selected.data,'base64'));
                    await evaluate(cdp,"chrome.tabs.sendMessage = async () => {throw new Error('Synthetic source disconnected')}");
                    await new Promise(resolve => setTimeout(resolve,1350));
                    result.checks.push({name:'Source disappearance clears progressive actions',passed:await evaluate(cdp,"document.getElementById('on-the-fly-bar').hidden && document.getElementById('mark-latest').disabled")});
                    return result;
                }
                if (surface === 'viewer') {
                    await evaluate(cdp, `document.getElementById('history-btn').focus(); document.getElementById('history-btn').click()`);
                    await new Promise(resolve => setTimeout(resolve,250));
                    const checks = await evaluate(cdp, `(() => { const dialog=document.getElementById('sessionModal'); document.getElementById('search-box').focus(); return {checks:[
                        {name:'Archive opens native modal',passed:dialog instanceof HTMLDialogElement && dialog.open},
                        {name:'Archive prevents focus behind modal',passed:dialog.contains(document.activeElement)}]}; })()`);
                    await cdp.send('Input.dispatchKeyEvent', {type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27});
                    await cdp.send('Input.dispatchKeyEvent', {type:'keyUp', key:'Escape', code:'Escape', windowsVirtualKeyCode:27});
                    const closed = await evaluate(cdp, `!document.getElementById('sessionModal').open && document.activeElement.id === 'history-btn'`);
                    checks.checks.push({name:'Archive Escape restores opener focus', passed:closed});
                    return checks;
                }
                if (surface === 'handoff') {
                    await cdp.send('Page.navigate', {url:await evaluate(cdp, "new URL('extras.html?session=synthetic-moment&historical=true',location.href).href")});
                    await waitForExtrasReady(cdp);
                    return evaluate(cdp, `(async () => {
                        const checks = [], downloads = [];
                        chrome.downloads.download = async request => {downloads.push(request); return 1;};
                        preview({screenshot:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', messages:[]});
                        const approval = document.getElementById('image-confirm'), button = document.getElementById('export-image');
                        checks.push({name:'Moment PNG export waits for explicit image approval',passed:button.disabled && downloads.length === 0});
                        approval.checked = true; approval.dispatchEvent(new Event('change'));
                        button.click(); await new Promise(resolve => setTimeout(resolve,60));
                        checks.push({name:'Approved Moment exports PNG through download API',passed:downloads.length === 1 && downloads[0].filename.endsWith('-moment.png') && downloads[0].saveAs === true});
                        chrome.storage.managed.get = async () => ({forceScrubbedExport:true});
                        button.click(); await new Promise(resolve => setTimeout(resolve,60));
                        checks.push({name:'Moment PNG export rechecks managed privacy denial',passed:downloads.length === 1 && /privacy policy/.test(document.getElementById('status').textContent)});
                        return {checks};
                    })()`);
                }
                return null;
            }
        });
        assert(result.checks.some(check => check.name === 'Rendered answer retains original Ask caption count' && check.passed));
        assert(result.checks.some(check => check.name === 'Archive Escape restores opener focus' && check.passed));
    } finally {await rm(temporary, {recursive:true,force:true});}
});
