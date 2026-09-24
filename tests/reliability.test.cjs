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
test('provider registry resolves adapters without leaking provider selectors',()=>{
    const context=vm.createContext({URL,globalThis:null});
    context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    const registry=context.CaptionKeepProviderRegistry;
    registry.register({id:'google-meet',matches:url=>url.hostname==='meet.google.com',create:providerContext=>({providerContext,start(){},stop(){}})});
    assert.deepEqual(Array.from(registry.list()),['google-meet']);
    assert.equal(registry.find('https://teams.microsoft.com/'),null);
    const adapter=registry.create('https://meet.google.com/abc-defg-hij',{debug:true});
    assert.equal(adapter.providerContext.providerId,'google-meet');
    assert.equal(adapter.providerContext.url.hostname,'meet.google.com');
    assert.equal(adapter.providerContext.debug,true);
});
test('provider registry rejects malformed and duplicate adapters',()=>{
    const context=vm.createContext({URL,globalThis:null});
    context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    const registry=context.CaptionKeepProviderRegistry;
    assert.throws(()=>registry.register({id:'Google Meet'}),/Provider id/);
    registry.register({id:'teams',matches:()=>true,create:()=>({start(){},stop(){}})});
    assert.throws(()=>registry.register({id:'teams',matches:()=>true,create:()=>({})}),/already registered/);
    const brokenContext=vm.createContext({URL,globalThis:null});
    brokenContext.globalThis=brokenContext;
    vm.runInContext(read('providerRegistry.js'),brokenContext);
    brokenContext.CaptionKeepProviderRegistry.register({id:'broken',matches:()=>true,create:()=>({start(){}})});
    assert.throws(()=>brokenContext.CaptionKeepProviderRegistry.create('https://example.com/'),/adapter stop/);
});
test('provider captions require stable identity and capture time',()=>{
    const context=vm.createContext({URL,globalThis:null});
    context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    const normalize=context.CaptionKeepProviderRegistry.normalizeCaption;
    const caption=normalize({Name:' Speaker ',Text:' Hello ',Time:'10:30',capturedAt:'2026-09-13T15:30:00Z',key:' meet-1 '});
    assert.deepEqual({...caption},{Name:'Speaker',Text:'Hello',Time:'10:30',capturedAt:'2026-09-13T15:30:00Z',key:'meet-1'});
    assert.throws(()=>normalize({Text:'Hello',capturedAt:'2026-09-13T15:30:00Z'}),/stable key/);
    assert.throws(()=>normalize({Text:'Hello',key:'meet-1',capturedAt:'later'}),/timestamp/);
});
test('evidence summary feature cites captions and respects managed AI policy',async()=>{
    const context=vm.createContext({globalThis:null});context.globalThis=context;
    vm.runInContext(read('transcriptInsights.js'),context);
    const transcript=[
        {Time:'10:31',Name:'David',Text:'We will keep the archive local.'},
        {Time:'10:32',Name:'Mary',Text:'David will test the pilot on Friday.'}
    ];
    const prompt=context.CaptionKeepTranscriptInsights.buildEvidenceSummaryPrompt(transcript,{meetingTitle:'Architecture review',providerLabel:'Microsoft Teams'});
    assert.match(prompt,/\[C0001\].*David: We will keep the archive local\./);
    assert.match(prompt,/Cite every factual bullet/);
    const messages=[];
    const feature=context.CaptionKeepTranscriptInsights.createAiSummaryFeature({
        storage:{get:async()=>({autoAISummary:true,aiSummaryProviders:['copilot']})},
        readManaged:async()=>({disableAiHandoff:true}),
        applyPolicy:(settings,managed)=>({settings:{...settings,autoAISummary:managed.disableAiHandoff?false:settings.autoAISummary}}),
        sendMessage:async message=>messages.push(message)
    });
    const result=await feature.onMeetingEnded({transcript,sessionId:'meeting-1'});
    assert.equal(result.status,'disabled');
    assert.equal(messages.length,0);
});
test('Google Meet adapter uses the live semantic caption region and reports lifecycle changes',()=>{
    const observers=[];
    class FakeObserver {
        constructor(callback){this.callback=callback;observers.push(this);}
        observe(){}
        disconnect(){this.disconnected=true;}
    }
    const captionSource={};
    let currentSource=captionSource;
    const listeners={};
    const pageWindow={
        location:{href:'https://meet.google.com/abc-defg-hij'},
        addEventListener(type,callback){listeners[type]=callback;},
        removeEventListener(type){delete listeners[type];}
    };
    const pageDocument={body:{},querySelector(selector){
        assert.equal(selector,'[role="region"][aria-label="Captions"]');
        return currentSource;
    }};
    const context=vm.createContext({URL,Date,globalThis:null});context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    vm.runInContext(read('googleMeetProvider.js'),context);
    const adapter=context.CaptionKeepProviderRegistry.create(pageWindow.location.href,{document:pageDocument,window:pageWindow,MutationObserver:FakeObserver});
    const events=[];
    adapter.start(event=>events.push(event));
    assert.equal(adapter.isMeetingPresent(),true);
    assert.equal(adapter.getCaptionSource(),captionSource);
    assert.equal(events[0].type,'caption-source-available');
    currentSource=null;observers[0].callback();
    assert.equal(events.at(-1).type,'caption-source-unavailable');
    assert.equal(events.at(-1).recoverable,true);
    pageWindow.location.href='https://meet.google.com/';observers[0].callback();
    assert.equal(events.at(-1).type,'meeting-ended');
    adapter.stop();
    assert.equal(adapter.getCaptionSource(),null);
});
test('Google Meet manifest scope is exact and isolated from Teams capture',()=>{
    const manifest=JSON.parse(read('manifest.json'));
    assert(manifest.host_permissions.includes('https://meet.google.com/*'));
    const meetEntry=manifest.content_scripts.find(entry=>entry.matches.includes('https://meet.google.com/*'));
    assert.deepEqual(meetEntry.js,['providerRegistry.js','configuration.js','captureCoordinator.js','transcriptInsights.js','googleMeetProvider.js','googleMeetContentScript.js']);
    assert(!meetEntry.js.includes('content_script.js'));
});
test('Google Meet empty caption fixture contains structure but no meeting content',()=>{
    const fixture=JSON.parse(readProject('tests/fixtures/google-meet/captions-empty.json'));
    assert.equal(fixture.meetingContentIncluded,false);
    assert.equal(fixture.captionSource.role,'region');
    assert.equal(fixture.captionSource.ariaLabel,'Captions');
    assert.equal(fixture.captionSource.empty,true);
    assert(!JSON.stringify(fixture).includes('pxs-'));
    assert(!JSON.stringify(fixture).includes('@'));
});
test('Google Meet live speaker fixture is sanitized and records the semantic row boundary',()=>{
    const fixture=JSON.parse(readProject('tests/fixtures/google-meet/captions-speaker-row.json'));
    assert.equal(fixture.meetingContentIncluded,false);
    const row=fixture.captionSource.directChildren.find(child=>child.kind==='caption-row');
    assert.equal(row.children[0].kind,'speaker');
    assert.equal(row.children[0].containsImage,true);
    assert.equal(row.children[1].kind,'caption-text');
    const serialized=JSON.stringify(fixture);
    assert(!serialized.includes('zog-xfyq-djm'));
    assert(!serialized.includes('@'));
});
test('Google Meet parser emits semantic rows and updates one stable record across interim mutations',()=>{
    const observers=[];
    class FakeObserver {
        constructor(callback){this.callback=callback;observers.push(this);}
        observe(){}
        disconnect(){}
    }
    const image={tagName:'IMG',children:[],textContent:''};
    const speaker={tagName:'DIV',children:[image],textContent:'Test Speaker',querySelector:()=>image};
    const words={tagName:'DIV',children:[],textContent:'First interim phrase'};
    const row={tagName:'DIV',children:[speaker,words]};
    const source={children:[row,{tagName:'DIV',children:[]}]};
    const pageWindow={location:{href:'https://meet.google.com/abc-defg-hij'},addEventListener(){},removeEventListener(){}};
    const pageDocument={body:{},querySelector:()=>source};
    const context=vm.createContext({URL,Date,globalThis:null});context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    vm.runInContext(read('googleMeetProvider.js'),context);
    const adapter=context.CaptionKeepProviderRegistry.create(pageWindow.location.href,{document:pageDocument,window:pageWindow,MutationObserver:FakeObserver});
    const events=[];
    adapter.start(event=>events.push(event));
    let captions=events.filter(event=>event.type==='caption-upsert');
    assert.equal(captions.length,1);
    assert.equal(captions[0].caption.Name,'Test Speaker');
    assert.equal(captions[0].caption.Text,'First interim phrase');
    const stableKey=captions[0].caption.key;
    words.textContent='Completed test phrase';
    observers[1].callback();
    observers[1].callback();
    captions=events.filter(event=>event.type==='caption-upsert');
    assert.equal(captions.length,2);
    assert.equal(captions[1].caption.Text,'Completed test phrase');
    assert.equal(captions[1].caption.key,stableKey);
});
test('Google Meet remount reuses the active caption key without collapsing a later repeated phrase',()=>{
    const observers=[];
    class FakeObserver { constructor(callback){this.callback=callback;observers.push(this);} observe(){} disconnect(){} }
    let clock=new Date('2026-09-19T15:00:00Z');
    const makeRow=()=>{
        const image={tagName:'IMG',children:[],textContent:''};
        return {tagName:'DIV',children:[
            {tagName:'DIV',children:[image],textContent:'Test Speaker',querySelector:()=>image},
            {tagName:'DIV',children:[],textContent:'Repeatable phrase'}
        ]};
    };
    let source={children:[makeRow()]};
    const pageWindow={location:{href:'https://meet.google.com/abc-defg-hij'},addEventListener(){},removeEventListener(){}};
    const pageDocument={body:{},querySelector:()=>source};
    const context=vm.createContext({URL,Date,globalThis:null});context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    vm.runInContext(read('googleMeetProvider.js'),context);
    const adapter=context.CaptionKeepProviderRegistry.create(pageWindow.location.href,{document:pageDocument,window:pageWindow,MutationObserver:FakeObserver,now:()=>clock});
    const events=[];
    adapter.start(event=>events.push(event));
    const originalKey=events.find(event=>event.type==='caption-upsert').caption.key;
    source=null;observers[0].callback();
    clock=new Date('2026-09-19T15:00:05Z');
    source={children:[makeRow()]};observers[0].callback();
    source.children[0].children[1].textContent='Repeatable phrase extended';
    observers[2].callback();
    let captions=events.filter(event=>event.type==='caption-upsert');
    assert.equal(captions.length,2);
    assert.equal(captions[1].caption.key,originalKey);
    source=null;observers[0].callback();
    clock=new Date('2026-09-19T15:01:00Z');
    source={children:[makeRow()]};observers[0].callback();
    captions=events.filter(event=>event.type==='caption-upsert');
    assert.equal(captions.length,3);
    assert.notEqual(captions[2].caption.key,originalKey);
});
test('Zoom Web adapter uses the live subtitle overlay and reports recoverable source loss',()=>{
    const observers=[];
    class FakeObserver { constructor(callback){this.callback=callback;observers.push(this);} observe(){} disconnect(){this.disconnected=true;} }
    const marker={tagName:'DIV',textContent:'>>'};
    const words={tagName:'SPAN',textContent:'Synthetic Zoom words'};
    const captionSource={children:[marker,words]};
    let currentSource=captionSource;
    const listeners={};
    const pageWindow={
        location:{href:'https://app.zoom.us/wc/12345678901/join?fromPWA=1'},
        addEventListener(type,callback){listeners[type]=callback;},
        removeEventListener(type){delete listeners[type];}
    };
    const pageDocument={
        body:{},
        querySelector(selector){assert.equal(selector,'#live-transcription-subtitle');return currentSource;},
        querySelectorAll(){return [];}
    };
    const context=vm.createContext({URL,Date,globalThis:null});context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    vm.runInContext(read('zoomProvider.js'),context);
    const adapter=context.CaptionKeepProviderRegistry.create(pageWindow.location.href,{document:pageDocument,window:pageWindow,MutationObserver:FakeObserver});
    const events=[];
    adapter.start(event=>events.push(event));
    assert.equal(adapter.isMeetingPresent(),true);
    assert.equal(adapter.getCaptionSource(),captionSource);
    assert.equal(events[0].type,'caption-source-available');
    const firstCaption=events.find(event=>event.type==='caption-upsert').caption;
    assert.equal(firstCaption.Name,'Unknown speaker');
    assert.equal(firstCaption.Text,'Synthetic Zoom words');
    currentSource=null;observers[0].callback();
    assert.equal(events.at(-1).type,'caption-source-unavailable');
    assert.equal(events.at(-1).recoverable,true);
    pageWindow.location.href='https://app.zoom.us/wc/';observers[0].callback();
    assert.equal(events.at(-1).type,'meeting-ended');
    adapter.stop();
    assert.equal(adapter.getCaptionSource(),null);
});
test('Zoom Web auto-enable opens More, selects English, and confirms the caption dialog',()=>{
    const observers=[];
    class FakeObserver { constructor(callback){this.callback=callback;observers.push(this);} observe(){} disconnect(){} }
    const clicks=[];
    let currentSource=null;
    let dialog=null;
    let pageControls=[];
    const control=(label,onClick)=>({
        textContent:'',
        getAttribute(name){return name==='aria-label'?label:name==='aria-checked'&&this.checked?'true':null;},
        click(){clicks.push(label);onClick?.();}
    });
    const save=control('Save',()=>{currentSource={children:[{tagName:'DIV',textContent:'>>'},{tagName:'SPAN',textContent:''}]};});
    const english=control('English',()=>{english.checked=true;});
    const show=control('Show Captions',()=>{
        pageControls=[];
        dialog={textContent:'Select spoken language for captions',querySelectorAll:()=>[english,save]};
    });
    const more=control('More meeting control',()=>{pageControls=[show];});
    pageControls=[more];
    const pageDocument={
        body:{},
        querySelector:()=>currentSource,
        querySelectorAll(selector){return selector==='[role="dialog"]'?(dialog?[dialog]:[]):pageControls;}
    };
    const pageWindow={location:{href:'https://app.zoom.us/wc/12345678901/join'},addEventListener(){},removeEventListener(){}};
    const context=vm.createContext({URL,Date,globalThis:null});context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    vm.runInContext(read('zoomProvider.js'),context);
    const adapter=context.CaptionKeepProviderRegistry.create(pageWindow.location.href,{document:pageDocument,window:pageWindow,MutationObserver:FakeObserver});
    const events=[];adapter.start(event=>events.push(event));
    assert.deepEqual(clicks,['More meeting control']);
    observers[0].callback();
    assert.deepEqual(clicks,['More meeting control','Show Captions']);
    observers[0].callback();
    assert.deepEqual(clicks,['More meeting control','Show Captions','English']);
    observers[0].callback();
    assert.deepEqual(clicks,['More meeting control','Show Captions','English','Save']);
    observers[0].callback();
    assert.equal(adapter.getCaptionSource(),currentSource);
    assert(events.some(event=>event.type==='caption-source-available'));
});
test('Zoom Web manifest scope is exact and reaches the embedded meeting frame',()=>{
    const manifest=JSON.parse(read('manifest.json'));
    assert(manifest.host_permissions.includes('https://app.zoom.us/*'));
    assert(!manifest.host_permissions.includes('https://*.zoom.us/*'));
    const zoomEntry=manifest.content_scripts.find(entry=>entry.matches.includes('https://app.zoom.us/wc/*'));
    assert.equal(zoomEntry.all_frames,true);
    assert.deepEqual(zoomEntry.js,['providerRegistry.js','configuration.js','captureCoordinator.js','transcriptInsights.js','zoomProvider.js','zoomContentScript.js']);
    assert(!zoomEntry.js.includes('content_script.js'));
    const contentScript=read('zoomContentScript.js');
    assert(contentScript.includes('if (window.top === window) return;'));
});
test('Zoom Web live overlay fixture is sanitized and records the observed limitation',()=>{
    const fixture=JSON.parse(readProject('tests/fixtures/zoom/captions-overlay.json'));
    assert.equal(fixture.meetingContentIncluded,false);
    assert.equal(fixture.scope.host,'app.zoom.us');
    assert.equal(fixture.captionSource.id,'live-transcription-subtitle');
    assert.equal(fixture.captionSource.speakerAttributionAvailable,false);
    assert.equal(fixture.captionSource.directChildren[1].kind,'caption-text');
    assert.equal(fixture.captionSource.removedWhenCaptionsHidden,true);
    assert.equal(fixture.captionSource.restoredWhenCaptionsShown,true);
    const serialized=JSON.stringify(fixture);
    assert(!serialized.includes('00000000000'));
    assert(!serialized.includes('CaptionKeep Zoom test'));
    assert(!serialized.includes('@'));
});
test('Zoom Web parser updates interim text and starts a new record after a quiet gap',()=>{
    const observers=[];
    class FakeObserver { constructor(callback){this.callback=callback;observers.push(this);} observe(){} disconnect(){} }
    let clock=new Date('2026-09-21T15:00:00Z');
    const words={tagName:'SPAN',textContent:'First interim'};
    const source={children:[{tagName:'DIV',textContent:'>>'},words]};
    const pageWindow={location:{href:'https://app.zoom.us/wc/12345678901/join'},addEventListener(){},removeEventListener(){}};
    const pageDocument={body:{},querySelector:()=>source,querySelectorAll:()=>[]};
    const context=vm.createContext({URL,Date,globalThis:null});context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    vm.runInContext(read('zoomProvider.js'),context);
    const adapter=context.CaptionKeepProviderRegistry.create(pageWindow.location.href,{document:pageDocument,window:pageWindow,MutationObserver:FakeObserver,now:()=>clock});
    const events=[];adapter.start(event=>events.push(event));
    const first=events.find(event=>event.type==='caption-upsert').caption;
    clock=new Date('2026-09-21T15:00:00.500Z');words.textContent='First interim phrase';observers[1].callback();
    let captions=events.filter(event=>event.type==='caption-upsert');
    assert.equal(captions.at(-1).caption.key,first.key);
    clock=new Date('2026-09-21T15:00:03.000Z');words.textContent='Second segment';observers[1].callback();
    captions=events.filter(event=>event.type==='caption-upsert');
    assert.notEqual(captions.at(-1).caption.key,first.key);
    assert.equal(captions.at(-1).caption.Text,'Second segment');
});
test('Zoom Web remount reuses the current caption without duplicating it',()=>{
    const observers=[];
    class FakeObserver { constructor(callback){this.callback=callback;observers.push(this);} observe(){} disconnect(){} }
    let clock=new Date('2026-09-21T15:00:00Z');
    const makeSource=text=>({children:[{tagName:'DIV',textContent:'>>'},{tagName:'SPAN',textContent:text}]});
    let source=makeSource('Repeatable Zoom phrase');
    const pageWindow={location:{href:'https://app.zoom.us/wc/12345678901/join'},addEventListener(){},removeEventListener(){}};
    const pageDocument={body:{},querySelector:()=>source,querySelectorAll:()=>[]};
    const context=vm.createContext({URL,Date,globalThis:null});context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    vm.runInContext(read('zoomProvider.js'),context);
    const adapter=context.CaptionKeepProviderRegistry.create(pageWindow.location.href,{document:pageDocument,window:pageWindow,MutationObserver:FakeObserver,now:()=>clock});
    const events=[];adapter.start(event=>events.push(event));
    const original=events.find(event=>event.type==='caption-upsert').caption;
    source=null;observers[0].callback();
    clock=new Date('2026-09-21T15:00:05Z');source=makeSource('Repeatable Zoom phrase');observers[0].callback();
    assert.equal(events.filter(event=>event.type==='caption-upsert').length,1);
    clock=new Date('2026-09-21T15:00:05.500Z');source.children[1].textContent='Repeatable Zoom phrase extended';observers[2].callback();
    const captions=events.filter(event=>event.type==='caption-upsert');
    assert.equal(captions.length,2);
    assert.equal(captions[1].caption.key,original.key);
});
test('capture coordinator restores only the same recent meeting and finalizes history exactly once',async()=>{
    const data={};
    const storage={
        async get(key){return key in data?{[key]:clone(data[key])}:{};},
        async set(values){Object.assign(data,clone(values));},
        async remove(key){delete data[key];}
    };
    const messages=[];
    const createCoordinator=pageUrl=>{
        const context=vm.createContext({URL,crypto:webcrypto,Date,globalThis:null});context.globalThis=context;
        vm.runInContext(read('captureCoordinator.js'),context);
        return context.CaptionKeepCaptureCoordinator.create({
            providerId:'google-meet',pageUrl,meetingTitle:'Saturday test',storage,
            normalizeCaption:caption=>({...caption}),sendMessage:async message=>{messages.push(message);return {ok:true};},
            now:()=>new Date('2026-09-19T15:00:00Z'),createId:()=> 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
        });
    };
    const original=createCoordinator('https://meet.google.com/abc-defg-hij?authuser=0');
    original.handleProviderEvent({type:'caption-upsert',caption:{Name:'Tester',Text:'Checkpoint me',Time:'10:00',capturedAt:'2026-09-19T15:00:00Z',key:'google-meet-1'}});
    await original.whenIdle();
    const restored=createCoordinator('https://meet.google.com/abc-defg-hij?authuser=1');
    assert.equal(await restored.restore(),true);
    assert.equal(restored.getTranscript()[0].Text,'Checkpoint me');
    const other=createCoordinator('https://meet.google.com/xyz-abcd-uvw');
    assert.equal(await other.restore(),false);
    restored.handleProviderEvent({type:'meeting-ended'});
    restored.handleProviderEvent({type:'meeting-ended'});
    await restored.whenIdle();
    assert.equal(messages.filter(message=>message.message==='save_session_history').length,1);
    assert.equal(messages.filter(message=>message.message==='save_on_leave').length,1);
    assert.equal(data[restored.activeCaptureKey],undefined);
});
test('Google Meet auto-enables captions once and respects a later manual disable',()=>{
    const observers=[];
    class FakeObserver {
        constructor(callback){this.callback=callback;observers.push(this);}
        observe(){}
        disconnect(){}
    }
    let clickCount=0;
    let source=null;
    const captionButton={
        getAttribute:name=>name==='aria-label'?'Turn on captions':null,
        click(){clickCount++;}
    };
    const pageWindow={location:{href:'https://meet.google.com/abc-defg-hij'},addEventListener(){},removeEventListener(){}};
    const pageDocument={body:{},querySelector:()=>source,querySelectorAll:()=>[captionButton]};
    const context=vm.createContext({URL,Date,globalThis:null});context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    vm.runInContext(read('googleMeetProvider.js'),context);
    const adapter=context.CaptionKeepProviderRegistry.create(pageWindow.location.href,{document:pageDocument,window:pageWindow,MutationObserver:FakeObserver});
    const events=[];
    adapter.setAutoEnableCaptions(true);
    adapter.start(event=>events.push(event));
    assert.equal(clickCount,1);
    assert(events.some(event=>event.type==='caption-enable-requested'));
    observers[0].callback();
    assert.equal(clickCount,1);
    source={children:[]};
    observers[0].callback();
    source=null;
    observers[0].callback();
    assert.equal(clickCount,1);
});
test('Google Meet caption auto-enable can be disabled before adapter startup',()=>{
    class FakeObserver { constructor(callback){this.callback=callback;} observe(){} disconnect(){} }
    let clickCount=0;
    const pageWindow={location:{href:'https://meet.google.com/abc-defg-hij'},addEventListener(){},removeEventListener(){}};
    const pageDocument={
        body:{},querySelector:()=>null,
        querySelectorAll:()=>[{getAttribute:()=> 'Turn on captions',click(){clickCount++;}}]
    };
    const context=vm.createContext({URL,Date,globalThis:null});context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    vm.runInContext(read('googleMeetProvider.js'),context);
    const adapter=context.CaptionKeepProviderRegistry.create(pageWindow.location.href,{document:pageDocument,window:pageWindow,MutationObserver:FakeObserver});
    adapter.setAutoEnableCaptions(false);
    adapter.start(()=>{});
    assert.equal(clickCount,0);
});
test('Google Meet structure probe preserves shape without caption text or identifying attribute values',()=>{
    function element(tagName,attributes={},childNodes=[]){
        return {
            nodeType:1,tagName,childNodes,
            attributes:Object.keys(attributes).map(name=>({name})),
            getAttribute(name){return attributes[name]??null;}
        };
    }
    const liveTree=element('DIV',{role:'region','aria-label':'Captions',class:'generated'},[
        element('DIV',{'data-message-id':'opaque-123','aria-label':'Private Speaker Name'},[
            {nodeType:3,textContent:'Private Speaker Name'},
            element('SPAN',{},[{nodeType:3,textContent:'Sensitive spoken content'}])
        ])
    ]);
    const context=vm.createContext({URL,Date,globalThis:null});context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    vm.runInContext(read('googleMeetProvider.js'),context);
    const diagnostic=context.CaptionKeepGoogleMeet.sanitizeStructure(liveTree);
    const serialized=JSON.stringify(diagnostic);
    assert.equal(diagnostic.version,1);
    assert(serialized.includes('data-message-id'));
    assert(!serialized.includes('opaque-123'));
    assert(!serialized.includes('Private Speaker Name'));
    assert(!serialized.includes('Sensitive spoken content'));
    assert(!serialized.includes('generated'));
});
test('Google Meet coordinator exposes captured captions through the shared popup contract',async()=>{
    const messages=[];
    const localData={};
    const local={
        async get(key){return key in localData?{[key]:clone(localData[key])}:{};},
        async set(values){Object.assign(localData,clone(values));},
        async remove(key){delete localData[key];}
    };
    const storageListeners=[];
    let providerEventHandler;
    let messageHandler;
    const adapter={
        getSanitizedStructure:()=>({version:1,nodeCount:2,truncated:false,tree:{type:'element',tag:'DIV'}}),
        isMeetingPresent:()=>true,
        setAutoEnableCaptions(value){this.autoEnableCaptions=value;},
        start(handler){providerEventHandler=handler;this.startCount=(this.startCount||0)+1;},
        stop(){this.stopped=true;}
    };
    const registry={
        create:()=>adapter,
        normalizeCaption:caption=>Object.freeze({...caption})
    };
    const chrome={runtime:{
        sendMessage(message){messages.push(message);return Promise.resolve({ok:true});},
        onMessage:{addListener(handler){messageHandler=handler;}}
    },storage:{local,sync:{get:async()=>({trackCaptions:true})},onChanged:{addListener(handler){storageListeners.push(handler);}}}};
    const context=vm.createContext({
        CaptionKeepProviderRegistry:registry,chrome,console:{log(){},error(){}},Date,URL,crypto:webcrypto,MutationObserver:class{},
        document:{title:'Meet test'},window:{location:{href:'https://meet.google.com/abc-defg-hij'},addEventListener(){}},globalThis:null
    });
    context.globalThis=context;
    vm.runInContext(read('configuration.js'),context);
    vm.runInContext(read('captureCoordinator.js'),context);
    vm.runInContext(read('transcriptInsights.js'),context);
    vm.runInContext(read('googleMeetContentScript.js'),context);
    await new Promise(resolve=>setImmediate(resolve));
    providerEventHandler({type:'caption-source-available'});
    providerEventHandler({type:'caption-upsert',caption:{Name:'Tester',Text:'Synthetic words',Time:'08:12',capturedAt:'2026-09-14T13:12:00Z',key:'meet-1'}});
    let status;
    messageHandler({message:'get_status'},null,response=>{status=response;});
    assert.equal(status.capturing,true);
    assert.equal(status.captionCount,1);
    let viewer;
    messageHandler({message:'viewer_ready'},null,response=>{viewer=response;});
    assert.equal(viewer.streaming,true);
    let transcript;
    messageHandler({message:'get_transcript_for_copying'},null,response=>{transcript=response.transcriptArray;});
    assert.equal(transcript[0].Text,'Synthetic words');
    let diagnostic;
    messageHandler({message:'get_google_meet_diagnostic'},null,response=>{diagnostic=response.diagnostic;});
    assert.equal(diagnostic.version,1);
    assert.equal(diagnostic.tree.tag,'DIV');
    assert(messages.some(message=>message.message==='live_caption_update'&&message.type==='new'));
    providerEventHandler({type:'meeting-ended'});
    await new Promise(resolve=>setImmediate(resolve));
    assert(messages.some(message=>message.message==='meeting_ended'));
    assert.equal(messages.filter(message=>message.message==='save_session_history').length,1);
    storageListeners[0]({trackCaptions:{newValue:false}},'sync');
    messageHandler({message:'viewer_ready'},null,response=>{viewer=response;});
    assert.equal(viewer.streaming,false);
    assert.equal(adapter.stopped,true);
    storageListeners[0]({trackCaptions:{newValue:true}},'sync');
    assert.equal(adapter.startCount,2);
});
test('Google Meet does not start capture when caption tracking is disabled at load',async()=>{
    let startCount=0;
    let messageHandler;
    const local={async get(){return {};},async set(){},async remove(){}};
    const adapter={isMeetingPresent:()=>true,setAutoEnableCaptions(){},start(){startCount++;},stop(){}};
    const chrome={
        runtime:{sendMessage:()=>Promise.resolve(),onMessage:{addListener(handler){messageHandler=handler;}}},
        storage:{local,sync:{get:async()=>({trackCaptions:false})},onChanged:{addListener(){}}}
    };
    const context=vm.createContext({
        CaptionKeepProviderRegistry:{create:()=>adapter,normalizeCaption:caption=>caption},chrome,Date,URL,crypto:webcrypto,MutationObserver:class{},
        console:{log(){},error(){}},document:{title:'Meet test'},window:{location:{href:'https://meet.google.com/abc-defg-hij'},addEventListener(){}},globalThis:null
    });
    context.globalThis=context;
    vm.runInContext(read('configuration.js'),context);
    vm.runInContext(read('captureCoordinator.js'),context);
    vm.runInContext(read('transcriptInsights.js'),context);
    vm.runInContext(read('googleMeetContentScript.js'),context);
    await new Promise(resolve=>setImmediate(resolve));
    let status;
    messageHandler({message:'get_status'},null,response=>{status=response;});
    assert.equal(startCount,0);
    assert.equal(status.capturing,false);
    assert.equal(status.captureState,'paused');
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
test('exports stage locally and start automatic downloads in a background tab',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    await h.run("downloadFile('CON.txt','Synthetic private words','text/plain',{automatic:true,saveAs:false})");
    const job=Object.values(h.data)[0];assert.equal(job.filename,'_CON.txt');assert.equal(job.browserFilename,'_CON.txt');assert.equal(job.content,'Synthetic private words');assert.equal(job.automatic,true);assert.equal(job.saveAs,false);assert.equal(job.autoStart,true);
    assert(h.tabs[0].url.startsWith('chrome-extension://test/export.html?job='));
    assert.equal(h.tabs[0].active,false);
});
test('manual Downloads subfolders survive export staging',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    await h.run("downloadFile('Transcripts/Teams/Test.txt','Synthetic','text/plain',{automatic:false,saveAs:false})");
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
    assert(script.includes('saveAs:promptForLocation'));
    assert(script.includes('closeCurrentTab'));
    assert(!script.includes("disabled = busy || !('showDirectoryPicker' in window)"));
});
test('legacy default save behavior migrates to the Downloads option',()=>{
    assert(read('popup.js').includes("settings.saveAsType === 'default' ? 'downloads'"));
    assert(read('service_worker.js').includes("settings.saveAsType === 'default' ? 'downloads'"));
});
test('automatic saving skips prompts while ask-each-time always prompts',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    h.data.saveAsType='downloads';
    assert.equal((await h.run('resolveSavePreferences({forAutoSave:false})')).saveAs,false);
    assert.equal((await h.run('resolveSavePreferences({forAutoSave:true})')).saveAs,false);
    h.data.saveAsType='prompt';
    assert.equal((await h.run('resolveSavePreferences({forAutoSave:false})')).saveAs,true);
    assert.equal((await h.run('resolveSavePreferences({forAutoSave:true})')).saveAs,true);
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
    assert.deepEqual(manifest.content_scripts[0].js.slice(0,3),['providerRegistry.js','configuration.js','transcriptInsights.js']);
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
        const buildLabel=manifest.version_name.toLowerCase();
        assert(buildLabel.includes(source.version));
        assert(buildLabel.includes(target));
        assert(buildLabel.includes('development')||buildLabel.includes('release candidate'));
    }
});
test('Chrome Store manifest preserves runtime behavior without test labeling',()=>{
    const source=JSON.parse(read('manifest.json'));
    const manifest=JSON.parse(readProject('manifests/manifest.chrome-store.json'));
    for(const key of ['version','permissions','host_permissions','background','content_scripts','storage']) {
        assert.deepEqual(manifest[key],source[key]);
    }
    assert.equal(manifest.name,'Better CaptionKeep');
    assert.equal(manifest.action.default_title,'Better CaptionKeep — by Señor Farris');
    assert(!/test|development/i.test(`${manifest.name} ${manifest.version_name||''} ${manifest.action.default_title}`));
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
    for(const page of ['popup.html','viewer.html','export.html','handoff.html','platform-coming-soon.html','sidepanel.html']) {
        const html=read(page);
        for(const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
            assert(!/^(?:https?:)?\/\//i.test(match[1]),`${page} must not load remote code`);
            assert(fs.existsSync(path.join(root,match[1])),`${page} references missing script ${match[1]}`);
        }
    }
    const popup=read('popup.html');
    assert(popup.includes('<details class="settings-group" open>'));
    for(const section of ['Appearance','Speaker aliases','Saving transcripts','Bring your own AI (BYOAI) and privacy','Naming and timestamps','Configuration portability']) {
        assert(popup.includes(`<summary>${section}</summary>`));
    }
});
test('all target manifests expose the local Evidence Board through the side panel',()=>{
    for(const relative of ['teams-captions-saver/manifest.json','manifests/manifest.chrome.json','manifests/manifest.edge.json','manifests/manifest.chrome-store.json']) {
        const manifest=JSON.parse(readProject(relative));
        assert(manifest.permissions.includes('sidePanel'));
        assert.equal(manifest.side_panel?.default_path,'sidepanel.html');
    }
    const popup=read('popup.html');const popupScript=read('popup.js');
    assert(popup.includes('id="evidenceBoardButton"'));
    assert(popupScript.includes('chrome.sidePanel.open'));
    assert(popupScript.includes("chrome.sidePanel.setOptions({enabled: true, path: 'sidepanel.html'})"));
    const sidepanel=read('sidepanel.html');const sidepanelScript=read('sidepanel.js');
    assert(sidepanel.includes('id="close-panel"'));
    assert(sidepanelScript.includes("typeof chrome.sidePanel.close === 'function'"));
    assert(sidepanelScript.includes('chrome.sidePanel.setOptions({enabled: false})'));
});
test('popup uses a compact three-platform launcher without an inline Teams warning link',()=>{
    const popup=read('popup.html');const script=read('popup.js');
    assert(popup.includes('class="platform-launchers"'));
    assert.equal((popup.match(/class="platform-launcher"/g)||[]).length,3);
    assert(popup.includes('aria-label="Open Microsoft Teams"'));
    assert(popup.includes('href="https://app.zoom.us/wc"'));
    assert(popup.includes('aria-label="Open Zoom Web"'));
    assert(popup.includes('href="https://meet.google.com"'));
    assert(popup.includes('aria-label="Open Google Meet"'));
    assert(script.includes('getActiveMeetingTab'));
    assert(script.includes('https:\\/\\/meet\\.google\\.com'));
    assert(script.includes('https:\\/\\/app\\.zoom\\.us\\/wc'));
    assert(script.includes("textContent = 'Open Teams, Zoom Web, or Google Meet to begin.'"));
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
    const h=harness();h.run(read('configuration.js'));h.run(read('transcriptInsights.js'));h.run(read('content_script.js'));for(let i=0;i<10;i++)await Promise.resolve();return h;
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
test('Teams interim caption updates refresh capture health time',async()=>{
    const h=await contentHarness();
    const author={innerText:'Speaker'};const words={innerText:'Updated live words'};
    const row={getAttribute:()=> 'caption-1',querySelector:selector=>selector.includes('author')?author:words};
    h.document.querySelector=()=>({querySelectorAll:()=>[row]});
    h.run("capturing=true;trackingAllowed=true;transcriptArray.push({Name:'Speaker',Text:'Earlier words',Time:'10:00',key:'caption-1',capturedAt:'2026-01-01T00:00:00.000Z'});");
    await h.run('processCaptionUpdates()');
    assert.equal(h.run('transcriptArray[0].Text'),'Updated live words');
    assert.notEqual(h.run('transcriptArray[0].capturedAt'),'2026-01-01T00:00:00.000Z');
    assert.ok(!Number.isNaN(Date.parse(h.run('transcriptArray[0].capturedAt'))));
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
    h.run(read('configuration.js'));h.run(read('transcriptInsights.js'));h.run(read('content_script.js'));for(let i=0;i<12;i++)await Promise.resolve();
    assert.equal(h.run('transcriptArray.length'),1);
    assert.equal(h.run('documentSessionId'),'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    assert.match(h.run('checkpointError'),/resumed from a recovery checkpoint/i);
});
