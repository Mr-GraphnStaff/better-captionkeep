const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {webcrypto} = require('node:crypto');
const root = path.join(__dirname,'../teams-captions-saver');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const readProject = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const clone = data => JSON.parse(JSON.stringify(data));
function harness() {
    const data = {}; const callbacks=[]; const messages=[]; const tabs=[];
    const area = {
        async get(keys) { if (keys===null) return clone(data); const out={}; for(const k of (Array.isArray(keys)?keys:[keys])) if(k in data)out[k]=clone(data[k]); return out; },
        async set(values) { if (area.fail) throw new Error('QUOTA_BYTES exceeded'); Object.assign(data,clone(values)); },
        async remove(keys) { for(const key of (Array.isArray(keys)?keys:[keys])) delete data[key]; },
        async getBytesInUse() { return JSON.stringify(data).length; }
    };
    const chrome={storage:{local:area,session:area,sync:area,onChanged:{addListener(fn){callbacks.push(fn);}}},
        runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,sendMessage:async m=>{messages.push(m);return {ok:true};},
            onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(fn){chrome.listener=fn;}}},
        tabs:{create:async tab=>tabs.push(tab),query:async()=>[]},action:{setBadgeText(){},setBadgeBackgroundColor(){}}};
    const document={hidden:false,title:'Synthetic meeting',body:{},querySelector:()=>null,contains:()=>true,addEventListener(){}};
    const context=vm.createContext({chrome,document,crypto:webcrypto,Blob,URL,console:{log(){},warn(){},error(){}},
        window:{location:{href:'https://teams.microsoft.com/'},addEventListener(){}},
        setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},MutationObserver:class{observe(){} disconnect(){}},
        importScripts(name){vm.runInContext(read(name),context);}});
    return {data,area,chrome,context,document,callbacks,messages,tabs,run:code=>vm.runInContext(code,context)};
}

test('all shipped scripts parse',()=>{
    for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.js'))) new vm.Script(read(name),{filename:name});
});
test('theme choices are shared by every extension page',()=>{
    const themeSource=read('theme.js');
    for(const choice of ['captionkeep','light','midnight','system']) assert(themeSource.includes(`'${choice}'`));
    for(const page of ['popup.html','viewer.html','export.html','handoff.html']) {
        const html=read(page);
        assert(html.includes('theme.css'),`${page} must load theme.css`);
        assert(html.includes('theme.js'),`${page} must load theme.js`);
    }
    const popup=read('popup.html');
    assert(popup.includes('id="themeSelect"'));
    assert.equal((popup.match(/<option value="(captionkeep|light|midnight|system)">/g)||[]).length,4);
});
test('theme selection is normalized, applied, and synced',async()=>{
    const saved=[];
    const listeners=[];
    const document={documentElement:{dataset:{}}};
    const chrome={storage:{sync:{
        async get(){return {uiTheme:'midnight'};},
        async set(value){saved.push(value);}
    },onChanged:{addListener(listener){listeners.push(listener);}}}};
    const context=vm.createContext({chrome,document,console:{error(){}},globalThis:null});
    context.globalThis=context;
    vm.runInContext(read('theme.js'),context);
    for(let i=0;i<4;i++) await Promise.resolve();
    assert.equal(document.documentElement.dataset.theme,'midnight');
    await context.CaptionKeepTheme.set('not-a-theme');
    assert.equal(document.documentElement.dataset.theme,'captionkeep');
    assert.equal(saved.length,1);
    assert.equal(saved[0].uiTheme,'captionkeep');
    listeners[0]({uiTheme:{newValue:'light'}},'sync');
    assert.equal(document.documentElement.dataset.theme,'light');
});
test('viewer includes branded header and purposeful empty state',()=>{
    const html=read('viewer.html');
    const script=read('viewer.js');
    assert(html.includes('Better CaptionKeep · by Señor Farris'));
    assert(html.includes('Scribble, the Better CaptionKeep listening mascot'));
    assert(html.includes('class="viewer-state"'));
    assert(script.includes('function renderViewerState'));
    assert(script.includes('Ready when your meeting is'));
});
test('eleventh history save evicts oldest and retains newest prior session',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    h.data.session_index=Array.from({length:10},(_,i)=>({id:'old_'+i,timestamp:new Date(2020,0,10-i).toISOString(),chunkCount:1}));
    const manager=h.run('new SessionManager(true)');
    await manager.saveSession([{Name:'A',Text:'Synthetic',Time:'10:00'}],'Test');
    assert.equal(h.data.session_index.length,10);
    assert(h.data.session_index.some(s=>s.id==='old_0'));
    assert(!h.data.session_index.some(s=>s.id==='old_9'));
});
test('quota rejection preserves existing history',async()=>{
    const h=harness();h.run(read('sessionManager.js'));h.data.session_index=[{id:'keep',chunkCount:1}];h.data.keep_chunk_0=[{Text:'keep'}];h.area.fail=true;
    await assert.rejects(h.run('new SessionManager(true)').saveSession([{Name:'A',Text:'new',Time:'10'}],'New'),/QUOTA/);
    assert.equal(h.data.session_index[0].id,'keep');assert.equal(h.data.keep_chunk_0[0].Text,'keep');
});
test('missing chunks are reported rather than silently omitted',async()=>{
    const h=harness();h.run(read('sessionManager.js'));h.data.session_index=[{id:'broken',chunkCount:2,captionCount:2}];h.data.broken_chunk_0=[];
    await assert.rejects(h.run('new SessionManager()').loadSession('broken'),/missing chunk/);
});
test('legacy and document recovery snapshots are discoverable and readable',async()=>{
    const h=harness();h.run(read('sessionManager.js'));h.data.backup_example={transcript:[{Name:'A',Text:'recovered'}],lastBackup:new Date().toISOString()};
    const manager=h.run('new SessionManager()');assert.equal((await manager.getSessionIndex())[0].id,'backup_example');
    assert.equal((await manager.loadSession('backup_example')).transcript[0].Text,'recovered');
});
test('worker acknowledges success and ignores unrelated messages',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    assert.equal(h.chrome.listener({message:'live_caption_update'},{id:'test'},()=>{}),false);
    const result=await new Promise(resolve=>h.chrome.listener({message:'reset_aliases'},{id:'test'},resolve));assert.equal(result.ok,true);
});
test('exports stage locally and navigate only to an internal save page',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    await h.run("downloadFile('CON.txt','Synthetic private words','text/plain',true)");
    const job=Object.values(h.data)[0];assert.equal(job.filename,'_CON.txt');assert.equal(job.browserFilename,'_CON.txt');assert.equal(job.content,'Synthetic private words');assert.equal(job.automatic,true);
    assert(h.tabs[0].url.startsWith('chrome-extension://test/export.html?job='));
});
test('manual Downloads subfolders survive export staging',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    await h.run("downloadFile('Transcripts/Teams/Test.txt','Synthetic','text/plain',false)");
    const job=Object.values(h.data)[0];
    assert.equal(job.filename,'Test.txt');
    assert.equal(job.browserFilename,'Transcripts/Teams/Test.txt');
    assert.equal(h.run("sanitizeSubfolderPath('../Transcripts/../Teams')"),'Transcripts/Teams');
});
test('export page keeps a usable manual fallback without the direct folder API',()=>{
    const html=read('export.html');
    const script=read('export.js');
    for(const id of ['manual-folder','remember-manual-folder','open-downloads-folder']) assert(html.includes(`id="${id}"`));
    assert(script.includes('chrome.downloads.showDefaultFolder()'));
    assert(script.includes("saveAsType:saveLocation ? 'custom' : 'downloads'"));
    assert(!script.includes("disabled = busy || !('showDirectoryPicker' in window)"));
});
test('legacy default save behavior migrates to the Downloads option',()=>{
    assert(read('popup.js').includes("settings.saveAsType === 'default' ? 'downloads'"));
    assert(read('service_worker.js').includes("settings.saveAsType === 'default' ? 'downloads'"));
});
test('AI handoff never navigates transcript text to a provider',async()=>{
    const h=harness();h.run(read('service_worker.js'));await h.run("openAiAssistantTabs(['chatgpt'],'Synthetic private words','Test')");
    assert(h.tabs[0].url.startsWith('chrome-extension://test/handoff.html?'));
    assert(!h.tabs[0].url.includes('private'));assert.equal(Object.values(h.data)[0].prompt,'Synthetic private words');
});
test('enterprise AI destinations accept only official HTTPS workspace URLs',()=>{
    const context=vm.createContext({URL,globalThis:null});context.globalThis=context;
    vm.runInContext(read('aiDestinations.js'),context);
    const destinations=context.CaptionKeepDestinations;
    assert.equal(destinations.normalizeCustomUrl('chatgpt','https://chatgpt.com/g/example'),'https://chatgpt.com/g/example');
    assert.equal(destinations.normalizeCustomUrl('claude','https://claude.ai/new'),'https://claude.ai/new');
    assert.equal(destinations.normalizeCustomUrl('chatgpt','http://chatgpt.com/'),null);
    assert.equal(destinations.normalizeCustomUrl('chatgpt','https://chatgpt.com.evil.example/'),null);
    assert.equal(destinations.normalizeCustomUrl('claude','javascript:alert(1)'),null);
    const configured=destinations.resolve('chatgpt',{chatgptWorkspaceUrl:'https://chatgpt.com/g/enterprise'});
    assert.equal(configured.configured,true);
    assert.equal(configured.url,'https://chatgpt.com/g/enterprise');
});
test('manifest supports both official Teams web hosts',()=>{
    const manifest=JSON.parse(read('manifest.json'));
    for(const host of ['https://teams.microsoft.com/*','https://teams.cloud.microsoft/*']) {
        assert(manifest.host_permissions.includes(host));
        assert(manifest.content_scripts.some(entry=>entry.matches.includes(host)));
    }
    assert.equal(manifest.storage.managed_schema,'managed-schema.json');
    assert.equal(manifest.content_scripts[0].js[0],'configuration.js');
});
test('Chrome and Edge test manifests preserve the shared runtime contract',()=>{
    const source=JSON.parse(read('manifest.json'));
    for(const target of ['chrome','edge']) {
        const manifest=JSON.parse(readProject(`manifests/manifest.${target}.json`));
        assert.equal(manifest.manifest_version,3);
        assert.equal(manifest.version,source.version);
        assert.deepEqual(manifest.permissions,source.permissions);
        assert.deepEqual(manifest.host_permissions,source.host_permissions);
        assert.deepEqual(manifest.background,source.background);
        assert.deepEqual(manifest.content_scripts,source.content_scripts);
        assert.deepEqual(manifest.storage,source.storage);
        assert(manifest.name.toLowerCase().includes(target));
        assert(manifest.version_name.toLowerCase().includes('release candidate'));
    }
});
test('Scrubby masks supported sensitive patterns with stable local placeholders',()=>{
    const context=vm.createContext({globalThis:null});context.globalThis=context;
    vm.runInContext(read('privacyScrubber.js'),context);
    const input='Email alex@example.com twice alex@example.com, SSN 123-45-6789, card 4111 1111 1111 1111, phone (312) 555-0199, IP 192.168.1.20.';
    const result=context.CaptionKeepPrivacyScrubber.scrub(input);
    assert.equal((result.text.match(/\[EMAIL_1\]/g)||[]).length,2);
    for(const placeholder of ['[SSN_1]','[PAYMENT_CARD_1]','[PHONE_1]','[IP_ADDRESS_1]']) assert(result.text.includes(placeholder));
    assert(!result.text.includes('alex@example.com'));
    assert.equal(result.replacements.length,6);
});
test('Scrubby rejects invalid SSNs cards and IP addresses',()=>{
    const context=vm.createContext({globalThis:null});context.globalThis=context;
    vm.runInContext(read('privacyScrubber.js'),context);
    const input='Invalid 000-00-0000, 4111 1111 1111 1112, and 999.168.1.20 remain.';
    const result=context.CaptionKeepPrivacyScrubber.scrub(input);
    assert.equal(result.text,input);
    assert.equal(result.replacements.length,0);
});
test('Scrubby supports labeled health identifiers, profanity, and custom terms',()=>{
    const context=vm.createContext({globalThis:null});context.globalThis=context;
    vm.runInContext(read('privacyScrubber.js'),context);
    const input='DOB: 04/12/1980, MRN A12345, Project Cobalt is damn sensitive.';
    const result=context.CaptionKeepPrivacyScrubber.scrub(input,{profanityFilterEnabled:true,customTerms:['Project Cobalt']});
    for(const placeholder of ['[DATE_OF_BIRTH_1]','[MEDICAL_ID_1]','[CUSTOM_TERM_1]','[PROFANITY_1]']) assert(result.text.includes(placeholder));
    const cleaned=context.CaptionKeepPrivacyScrubber.scrubTranscript([{Name:'alex@example.com',Text:'4111 1111 1111 1111'}]);
    assert.equal(cleaned.transcript[0].Name,'[EMAIL_1]');
    assert.equal(cleaned.transcript[0].Text,'[PAYMENT_CARD_1]');
});
test('configuration import is bounded and managed policy takes precedence',()=>{
    const context=vm.createContext({globalThis:null,chrome:{storage:{}}});context.globalThis=context;
    vm.runInContext(read('configuration.js'),context);
    const config=context.CaptionKeepConfiguration;
    const imported=config.parseImport(JSON.stringify({product:'Better CaptionKeep',version:1,settings:{privacyScrubberEnabled:false,customScrubTerms:[' Alpha ','Alpha'],unknown:'drop'}}));
    assert.equal(imported.privacyScrubberEnabled,false);
    assert.deepEqual([...imported.customScrubTerms],['Alpha']);
    assert.equal(Object.hasOwn(imported,'unknown'),false);
    const effective=config.applyPolicy(imported,{forcePrivacyScrubber:true,disableAiHandoff:true});
    assert.equal(effective.settings.privacyScrubberEnabled,true);
    assert.equal(effective.settings.autoAISummary,false);
    assert(effective.locked.includes('privacyScrubberEnabled'));
});
test('AI handoff requires workspace confirmation and supports saved enterprise destinations',()=>{
    const html=read('handoff.html');const script=read('handoff.js');
    assert(html.includes('Confirm the destination workspace'));
    assert(script.includes('Saved enterprise destination'));
    assert(script.includes('Confirm the active workspace before pasting'));
    assert(html.includes('privacyScrubber.js'));
    assert(script.includes('CaptionKeepPrivacyScrubber.scrub'));
    assert(!script.includes('const destinations ='));
});
test('Privacy Scrubber is visible, defaults on, and guards unmasked copying',()=>{
    const popup=read('popup.html');const popupScript=read('popup.js');
    const handoff=read('handoff.html');const handoffScript=read('handoff.js');
    assert(popup.includes('id="privacyScrubberToggle" checked'));
    assert(popupScript.includes('settings.privacyScrubberEnabled !== false'));
    assert(popupScript.includes('privacyScrubberEnabled: event.target.checked'));
    assert(handoff.includes('<h2 id="scrubberTitle">Privacy Scrubber</h2>'));
    assert(handoffScript.includes("copyButton.textContent = 'Copy cleaned prompt'"));
    assert(handoffScript.includes("copyButton.textContent = 'Copy unmasked prompt'"));
    assert(handoffScript.includes('!scrubberToggle.checked && !unmaskedCopyArmed'));
});
test('extension pages use only packaged scripts and settings use progressive disclosure',()=>{
    for(const page of ['popup.html','viewer.html','export.html','handoff.html','platform-coming-soon.html']) {
        const html=read(page);
        for(const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
            assert(!/^(?:https?:)?\/\//i.test(match[1]),`${page} must not load remote code`);
            assert(fs.existsSync(path.join(root,match[1])),`${page} references missing script ${match[1]}`);
        }
    }
    const popup=read('popup.html');
    assert(popup.includes('<details class="settings-group" open>'));
    for(const section of ['Appearance','Speaker aliases','Export and auto-save','AI handoff and privacy','Naming and timestamps','Configuration portability']) {
        assert(popup.includes(`<summary>${section}</summary>`));
    }
});
test('popup uses a compact three-platform launcher without an inline Teams warning link',()=>{
    const popup=read('popup.html');const script=read('popup.js');
    assert(popup.includes('class="platform-launchers"'));
    assert.equal((popup.match(/class="platform-launcher"/g)||[]).length,3);
    assert(popup.includes('aria-label="Open Microsoft Teams"'));
    assert(popup.includes('platform-coming-soon.html?platform=zoom'));
    assert(popup.includes('platform-coming-soon.html?platform=meet'));
    assert(script.includes("textContent = 'Teams is not open yet.'"));
    assert(!script.includes('open a Teams tab</a>'));
});
test('unsupported platform launchers open a bounded 5.0 coming-soon page',()=>{
    const html=read('platform-coming-soon.html');const script=read('platform-coming-soon.js');
    assert(html.includes('Better CaptionKeep 5.0'));
    assert(script.includes("zoom: 'Zoom'"));
    assert(script.includes("meet: 'Google Meet'"));
    assert(script.includes("UPCOMING_PLATFORMS[key] || 'More meeting platforms'"));
    assert(!html.includes('http://') && !html.includes('https://'));
});
async function contentHarness() {
    const h=harness();h.run(read('content_script.js'));for(let i=0;i<10;i++)await Promise.resolve();return h;
}
test('minimized source loss does not finalize an active session',async()=>{
    const h=await contentHarness();h.document.hidden=true;
    h.run("wasInMeeting=true;capturing=true;recordingStartTime=new Date();sourceMissingSince=Date.now()-60000;transcriptArray.push({Name:'A',Text:'preserve',Time:'10'});");
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('capturing'),true);assert.equal(h.run('transcriptArray.length'),1);assert.equal(h.run('captureState'),'source unavailable');
    assert(!h.messages.some(m=>m.message==='meeting_ended'));
});
test('disabling captions stops capture and preserves prior transcript',async()=>{
    const h=await contentHarness();h.run("capturing=true;recordingStartTime=new Date();transcriptArray.push({Name:'A',Text:'preserve',Time:'10'});");
    for(const cb of h.callbacks)cb({trackCaptions:{newValue:false}},'sync');
    assert.equal(h.run('capturing'),false);assert.equal(h.run('pausedByUser'),true);assert.equal(h.run('transcriptArray.length'),1);
    await h.run('processCaptionUpdates()');assert.equal(h.run('transcriptArray.length'),1);
});
test('visible transient DOM loss receives a grace interval',async()=>{
    const h=await contentHarness();h.run('wasInMeeting=true;capturing=true;sourceMissingSince=Date.now()-5000;');await h.run('handleMeetingStateChange()');
    assert.equal(h.run('capturing'),true);assert(!h.messages.some(m=>m.message==='meeting_ended'));
});
test('a recent same-page checkpoint restores captions and warns about the gap',async()=>{
    const h=harness();
    h.data.active_capture_v1={transcript:[{Name:'A',Text:'before reload',Time:'10:00'}],meetingTitle:'Synthetic meeting',
        recordingStartTime:new Date(Date.now()-60000).toISOString(),lastBackup:new Date().toISOString(),
        documentSessionId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',pageUrl:'https://teams.microsoft.com/'};
    h.run(read('content_script.js'));for(let i=0;i<12;i++)await Promise.resolve();
    assert.equal(h.run('transcriptArray.length'),1);
    assert.equal(h.run('documentSessionId'),'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    assert.match(h.run('checkpointError'),/resumed from a recovery checkpoint/i);
});
