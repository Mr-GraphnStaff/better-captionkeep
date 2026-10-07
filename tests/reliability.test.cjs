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
    const data = {}; const sessionData = {}; const managedData = {}; const callbacks=[]; const messages=[]; const tabs=[]; const importedScripts=[];
    const area = {
        async get(keys) { if (keys===null) return clone(data); const out={}; for(const k of (Array.isArray(keys)?keys:[keys])) if(k in data)out[k]=clone(data[k]); return out; },
        async set(values) {
            if (area.fail || area.failNext?.(values)) { area.failNext=null; throw new Error('QUOTA_BYTES exceeded'); }
            Object.assign(data,clone(values));
        },
        async remove(keys) { for(const key of (Array.isArray(keys)?keys:[keys])) delete data[key]; },
        async getBytesInUse(keys) {
            if(keys===null||keys===undefined) return JSON.stringify(data).length;
            const selected={};
            for(const key of (Array.isArray(keys)?keys:[keys])) if(key in data) selected[key]=data[key];
            return JSON.stringify(selected).length;
        }
    };
    const managed = {
        async get(keys) { const out={}; for(const key of (Array.isArray(keys)?keys:Object.keys(managedData))) if(key in managedData) out[key]=clone(managedData[key]); return out; }
    };
    const sessionArea = {
        async get(keys) { if (keys===null) return clone(sessionData); const out={}; for(const k of (Array.isArray(keys)?keys:[keys])) if(k in sessionData)out[k]=clone(sessionData[k]); return out; },
        async set(values) { Object.assign(sessionData,clone(values)); },
        async remove(keys) { for(const key of (Array.isArray(keys)?keys:[keys])) delete sessionData[key]; }
    };
    const chrome={storage:{local:area,session:sessionArea,sync:area,managed,onChanged:{addListener(fn){callbacks.push(fn);}}},
        runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,
            getManifest:()=>({name:'Better CaptionKeep',version:'5.3.0',version_name:'5.3.0'}),sendMessage:async m=>{
            messages.push(m);
            if(m?.message==='get_capture_surface') return {ok:true,surfaceId:`${m.providerId}-tab-1`};
            return {ok:true};
        },
            onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(fn){chrome.listener=fn;}}},
        tabs:{create:async tab=>tabs.push(tab),query:async()=>[]},action:{setBadgeText(){},setBadgeBackgroundColor(){}}};
    const document={hidden:false,title:'Synthetic meeting',body:{},querySelector:()=>null,contains:()=>true,addEventListener(){}};
    const context=vm.createContext({chrome,document,crypto:webcrypto,Blob,URL,TextEncoder,Uint8Array,btoa,atob,console:{log(){},warn(){},error(){}},
        window:{location:{href:'https://teams.microsoft.com/'},addEventListener(){}},
        setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},MutationObserver:class{observe(){} disconnect(){}},
        importScripts(...names){for(const name of names) { importedScripts.push(name); vm.runInContext(read(name),context); }}});
    return {data,sessionData,managedData,area,chrome,context,document,callbacks,messages,tabs,importedScripts,run:code=>vm.runInContext(code,context)};
}

test('all shipped scripts parse',()=>{
    for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.js'))) new vm.Script(read(name),{filename:name});
});

test('the extension ships no commercial entitlement or feature-tier gate',()=>{
    const worker=read('service_worker.js');
    assert.equal(fs.existsSync(path.join(root,'entitlement.js')),false);
    assert(!worker.includes('CaptionKeepEntitlements'));
    assert(!worker.includes('get_entitlement_state'));
});

function storedZipEntries(bytes) {
    const decoder=new TextDecoder();
    const entries={};
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let offset=0;
    while(offset+4<=bytes.length && view.getUint32(offset,true)===0x04034b50) {
        const compressedSize=view.getUint32(offset+18,true);
        const nameLength=view.getUint16(offset+26,true);
        const extraLength=view.getUint16(offset+28,true);
        const name=decoder.decode(bytes.subarray(offset+30,offset+30+nameLength));
        const start=offset+30+nameLength+extraLength;
        entries[name]=decoder.decode(bytes.subarray(start,start+compressedSize));
        offset=start+compressedSize;
    }
    return entries;
}

function validateStoredZipDirectory(bytes, crc32) {
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let end=-1;
    for(let offset=bytes.length-22;offset>=0;offset-=1) {
        if(view.getUint32(offset,true)===0x06054b50) { end=offset; break; }
    }
    assert(end>=0,'ZIP end-of-central-directory record is missing');
    const count=view.getUint16(end+10,true);
    const centralSize=view.getUint32(end+12,true);
    const centralOffset=view.getUint32(end+16,true);
    let cursor=centralOffset;
    for(let index=0;index<count;index+=1) {
        assert.equal(view.getUint32(cursor,true),0x02014b50);
        const expectedCrc=view.getUint32(cursor+16,true);
        const expectedSize=view.getUint32(cursor+20,true);
        const nameLength=view.getUint16(cursor+28,true);
        const extraLength=view.getUint16(cursor+30,true);
        const commentLength=view.getUint16(cursor+32,true);
        const localOffset=view.getUint32(cursor+42,true);
        assert.equal(view.getUint32(localOffset,true),0x04034b50);
        const localNameLength=view.getUint16(localOffset+26,true);
        const localExtraLength=view.getUint16(localOffset+28,true);
        const dataStart=localOffset+30+localNameLength+localExtraLength;
        const data=bytes.subarray(dataStart,dataStart+expectedSize);
        assert.equal(crc32(data),expectedCrc);
        cursor+=46+nameLength+extraLength+commentLength;
    }
    assert.equal(cursor,centralOffset+centralSize);
    assert.equal(cursor,end);
}

test('DOCX export is valid OOXML with Unicode, escaped text, and source provenance',()=>{
    const context=vm.createContext({TextEncoder,Uint8Array,btoa,globalThis:null});context.globalThis=context;
    vm.runInContext(read('exportProfiles.js'),context);
    const source=[
        {key:'source-α',Time:'10:00',Name:'Zoë & Co',Text:'Café <launch> & résumé'},
        {key:'source-2',Time:'10:01',Name:'',Text:'Line one\nLine two\u0001\u000b\ufffe'},
        {key:'source-3',Time:'',Name:'李',Text:'x'.repeat(20000)}
    ];
    const before=JSON.stringify(source);
    const profile=context.CaptionKeepExportProfiles.createProfile({format:'docx',meetingTitle:'R&D <review>',transcript:source});
    const bytes=Uint8Array.from(atob(profile.content),character=>character.charCodeAt(0));
    const entries=storedZipEntries(bytes);
    validateStoredZipDirectory(bytes,context.CaptionKeepExportProfiles.crc32);
    assert.deepEqual(Object.keys(entries),['[Content_Types].xml','_rels/.rels','word/document.xml']);
    assert.match(entries['[Content_Types].xml'],/wordprocessingml\.document\.main\+xml/);
    assert.match(entries['_rels/.rels'],/Target="word\/document\.xml"/);
    assert(entries['word/document.xml'].includes('Café &lt;launch&gt; &amp; résumé'));
    assert(entries['word/document.xml'].includes('Zoë &amp; Co'));
    assert(entries['word/document.xml'].includes('Unknown speaker'));
    assert(entries['word/document.xml'].includes('Source caption: source-α'));
    assert(entries['word/document.xml'].includes('<w:br/>'));
    assert(!/[\u0001\u000b\ufffe]/u.test(entries['word/document.xml']));
    assert(entries['word/document.xml'].includes('Line two���'));
    assert(entries['word/document.xml'].includes('x'.repeat(20000)));
    assert.equal(profile.mimeType,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.equal(profile.timingBasis,'source-display-or-observation-time');
    assert.equal(JSON.stringify(source),before);
    assert.throws(()=>context.CaptionKeepExportProfiles.createProfile({format:'srt',transcript:source}),/not verified speech cue boundaries/);
});

test('DOCX profile contains only the scrubbed derivative and no hidden raw text',()=>{
    const context=vm.createContext({TextEncoder,Uint8Array,btoa,globalThis:null});context.globalThis=context;
    vm.runInContext(read('privacyScrubber.js'),context);
    vm.runInContext(read('exportProfiles.js'),context);
    const raw=[{key:'private-1',Time:'10:00',Name:'Ada',Text:'Email secret@example.com'}];
    const scrubbed=context.CaptionKeepPrivacyScrubber.scrubTranscript(raw).transcript;
    const profile=context.CaptionKeepExportProfiles.createProfile({format:'docx',meetingTitle:'Synthetic',transcript:scrubbed});
    const binary=atob(profile.content);
    assert(!binary.includes('secret@example.com'));
    assert(!profile.previewText.includes('secret@example.com'));
    assert(binary.includes('[EMAIL_1]'));
});

test('local terminology dictionary applies literal longest matches with Unicode word boundaries',()=>{
    const context=vm.createContext({globalThis:null});context.globalThis=context;
    vm.runInContext(read('correctionManager.js'),context);
    const api=context.CaptionKeepCorrections;
    const entries=api.parseDictionaryText('contoso => Contoso Ltd\ncontoso cloud => Contoso Cloud\na.b => literal', {wholeWord:true});
    const result=api.applyDictionaryToText('contoso cloud, CONTOSO and a.b; incontoso stays.',{entries});
    assert.equal(result.text,'Contoso Cloud, Contoso Ltd and literal; incontoso stays.');
    assert.equal(result.matches.length,3);
    assert.throws(()=>api.parseDictionaryText('missing separator'),/must use/);
});

test('corrections preserve raw captions, are reversible, and detect provider revisions',async()=>{
    const h=harness();
    vm.runInContext(read('correctionManager.js'),h.context);
    const {CorrectionManager,applyCorrectionRecords}=h.context.CaptionKeepCorrections;
    const manager=new CorrectionManager(true);
    const raw=[{key:'provider-1',Name:'Ada',Time:'10:00',Text:'ship teh build'}];
    await manager.saveCorrection('meeting-1',raw[0],0,'ship the build');
    const stored=await manager.getCorrections('meeting-1');
    assert.equal(raw[0].Text,'ship teh build');
    assert.equal(applyCorrectionRecords(raw,stored).transcript[0].Text,'ship the build');
    const revised=[{...raw[0],Text:'ship teh production build'}];
    const conflict=applyCorrectionRecords(revised,stored);
    assert.equal(conflict.transcript[0].Text,revised[0].Text);
    assert.equal(conflict.conflictCount,1);
    await manager.undoCorrection('meeting-1',raw[0],0);
    assert.equal(Object.keys((await manager.getCorrections('meeting-1')).records).length,0);
});

test('dictionary preview does not rewrite history and quota failure preserves prior corrections',async()=>{
    const h=harness();
    vm.runInContext(read('correctionManager.js'),h.context);
    const manager=new h.context.CaptionKeepCorrections.CorrectionManager(true);
    const raw=[{key:'c1',Name:'A',Text:'project orion'}];
    const dictionary=await manager.saveDictionary([{term:'orion',replacement:'Orion',wholeWord:true}]);
    const preview=manager.previewDictionary(raw,dictionary);
    assert.equal(preview.transcript[0].Text,'project Orion');
    assert.equal(Object.keys((await manager.getCorrections('s1')).records).length,0);
    await manager.saveCorrection('s1',raw[0],0,'project Orion');
    h.area.fail=true;
    await assert.rejects(()=>manager.saveCorrection('s1',raw[0],0,'replacement lost'),/QUOTA_BYTES/);
    h.area.fail=false;
    assert.equal((await manager.getCorrections('s1')).records.c1.replacementText,'project Orion');
});

test('explicit dictionary apply preserves reviewed manual edits',async()=>{
    const h=harness();vm.runInContext(read('correctionManager.js'),h.context);
    const manager=new h.context.CaptionKeepCorrections.CorrectionManager(true);
    const raw=[{key:'manual',Text:'acme'},{key:'dictionary',Text:'acme'}];
    await manager.saveCorrection('s2',raw[0],0,'ACME reviewed');
    const dictionary=await manager.saveDictionary([{term:'acme',replacement:'Acme Corp',wholeWord:true}]);
    const result=await manager.applyDictionary('s2',raw,dictionary);
    const stored=await manager.getCorrections('s2');
    assert.equal(stored.records.manual.replacementText,'ACME reviewed');
    assert.equal(stored.records.dictionary.replacementText,'Acme Corp');
    assert.equal(result.skippedManualChanges.length,1);
});

function sendWorker(h, message) {
    return new Promise(resolve => h.chrome.listener(message,
        {id:'test',url:'chrome-extension://test/viewer.html'}, resolve));
}

test('meeting extras serialize writes, scrub text, reject missing source and managed screenshots', async () => {
    const h = harness(); h.run(read('service_worker.js'));
    const sessionId = '2026-10-03T10:00:00.000Z';
    h.data.active_capture_v3_teams_test = {recordingStartTime:sessionId, transcript:[{key:'c1', Text:'Synthetic caption'}]};
    const response = await sendWorker(h, {message:'save_meeting_extras', sessionId, extras:{messages:[{speaker:'A', text:'secret@example.com'}]}});
    assert.equal(response.ok, true);
    const key = h.context.CaptionKeepMeetingExtras.storageKey(sessionId);
    assert(!JSON.stringify(h.data[key]).includes('secret@example.com'));
    h.managedData.forceScrubbedExport = true;
    assert.equal((await sendWorker(h, {message:'save_meeting_extras', sessionId, extras:{screenshot:'data:image/png;base64,YQ=='}})).ok, false);
    assert.equal((await sendWorker(h, {message:'save_meeting_extras', sessionId:'missing', extras:{}})).ok, false);
    assert.equal((await sendWorker(h, {message:'delete_meeting_extras', sessionId})).ok, true);
    assert.equal(h.data[key], undefined);
});

test('service worker serializes corrections from multiple viewer contexts',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    const sessionId='2026-10-02T10:00:00.000Z';
    const transcript=[{key:'c1',Text:'alpha'},{key:'c2',Text:'beta'}];
    h.data.active_capture_v3_teams_test={recordingStartTime:sessionId,transcript};
    const [first,second]=await Promise.all([
        sendWorker(h,{message:'save_correction',sessionId,sourceKey:'c1',replacementText:'ALPHA'}),
        sendWorker(h,{message:'save_correction',sessionId,sourceKey:'c2',replacementText:'BETA'})
    ]);
    assert.equal(first.ok,true);assert.equal(second.ok,true);
    const stored=h.data[h.run(`CaptionKeepCorrections.storageKey(${JSON.stringify(sessionId)})`)];
    assert.equal(stored.records.c1.replacementText,'ALPHA');
    assert.equal(stored.records.c2.replacementText,'BETA');
});

test('serialized edit, dictionary apply, and undo preserve independent updates',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    const sessionId='2026-10-02T10:10:00.000Z';
    h.data.active_capture_v3_teams_test={recordingStartTime:sessionId,
        transcript:[{key:'manual',Text:'acme'},{key:'dictionary',Text:'acme'}]};
    const dictionary={version:1,entries:[{id:'term-1',term:'acme',replacement:'Acme Corp',wholeWord:true}]};
    const results=await Promise.all([
        sendWorker(h,{message:'save_correction',sessionId,sourceKey:'manual',replacementText:'ACME reviewed'}),
        sendWorker(h,{message:'apply_correction_dictionary',sessionId,dictionary}),
        sendWorker(h,{message:'undo_correction',sessionId,sourceKey:'manual'})
    ]);
    assert(results.every(result=>result.ok));
    const stored=h.data[h.run(`CaptionKeepCorrections.storageKey(${JSON.stringify(sessionId)})`)];
    assert.equal(stored.records.manual,undefined);
    assert.equal(stored.records.dictionary.replacementText,'Acme Corp');
});

test('disabled history keeps live corrections session-scoped and rejects stale historical viewers',async()=>{
    const h=harness();h.managedData.disableSessionHistory=true;h.run(read('service_worker.js'));
    const liveId='2026-10-02T10:20:00.000Z';
    h.data.active_capture_v3_teams_test={recordingStartTime:liveId,transcript:[{key:'live',Text:'raw'}]};
    const saved=await sendWorker(h,{message:'save_correction',sessionId:liveId,sourceKey:'live',replacementText:'edited'});
    assert.equal(saved.ok,true);
    const liveKey=h.run(`CaptionKeepCorrections.storageKey(${JSON.stringify(liveId)})`);
    assert.equal(h.data[liveKey],undefined);
    assert.equal(h.sessionData[liveKey].records.live.replacementText,'edited');

    h.data.session_index=[{id:'archived',sourceSessionId:'old-source',storagePrefix:'old',chunkCount:1,captionCount:1}];
    h.data.old_chunk_0=[{key:'old',Text:'private raw'}];
    h.data[h.run("CaptionKeepCorrections.storageKey('old-source')")]={sessionId:'old-source',records:{old:{originalText:'private raw',replacementText:'prior'}}};
    const rejected=await sendWorker(h,{message:'save_correction',sessionId:'old-source',sourceKey:'old',replacementText:'stale',historical:true});
    assert.equal(rejected.ok,false);
    assert.match(rejected.error,/history is disabled/);
    assert.equal(h.data[h.run("CaptionKeepCorrections.storageKey('old-source')")],undefined);
});

test('deleted source blocks a stale viewer from recreating corrections',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    h.data.session_index=[{id:'archived',sourceSessionId:'capture',storagePrefix:'generation',chunkCount:1,captionCount:1}];
    h.data.generation_chunk_0=[{key:'caption-1',Text:'raw'}];
    assert.equal((await sendWorker(h,{message:'delete_session',sessionId:'archived'})).ok,true);
    const stale=await sendWorker(h,{message:'save_correction',sessionId:'capture',sourceKey:'caption-1',replacementText:'resurrected',historical:true});
    assert.equal(stale.ok,false);
    assert.match(stale.error,/source transcript is no longer available/);
    assert.equal(h.data[h.run("CaptionKeepCorrections.storageKey('capture')")],undefined);
});

test('recovery corrections retain stable identity through retry and archive reload',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    const sourceSessionId='2026-10-02T10:30:00.000Z';
    h.data.backup_edit={recordingStartTime:sourceSessionId,lastBackup:'2026-10-02T10:31:00.000Z',
        meetingTitle:'Recovery',transcript:[{key:'caption-1',Name:'Ada',Time:'10:30',Text:'raw recovery'}]};
    const indexed=await h.run('new SessionManager().getSessionIndex()');
    assert.equal(indexed[0].sourceSessionId,sourceSessionId);
    const edited=await sendWorker(h,{message:'save_correction',sessionId:sourceSessionId,sourceKey:'caption-1',replacementText:'reviewed recovery',historical:true});
    assert.equal(edited.ok,true);
    const retried=await sendWorker(h,{message:'retry_archive',sessionId:'backup_edit'});
    assert.equal(retried.ok,true);
    assert.equal(h.data.backup_edit,undefined);
    const session=h.data.session_index.find(item=>item.sourceSessionId===sourceSessionId);
    const loaded=await h.run(`new SessionManager().loadSession(${JSON.stringify(session.id)})`);
    const corrections=h.data[h.run(`CaptionKeepCorrections.storageKey(${JSON.stringify(sourceSessionId)})`)];
    const applied=h.context.CaptionKeepCorrections.applyCorrectionRecords(loaded.transcript,corrections);
    assert.equal(applied.transcript[0].Text,'reviewed recovery');
});

test('deleting a recovery snapshot removes stable and legacy corrections',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    const sourceSessionId='2026-10-02T10:40:00.000Z';
    h.data.backup_delete={recordingStartTime:sourceSessionId,transcript:[{key:'caption-1',Text:'raw'}]};
    const stableKey=h.run(`CaptionKeepCorrections.storageKey(${JSON.stringify(sourceSessionId)})`);
    const legacyKey=h.run("CaptionKeepCorrections.storageKey('backup_delete')");
    h.data[stableKey]={records:{'caption-1':{originalText:'raw',replacementText:'edited'}}};
    h.data[legacyKey]={records:{'caption-1':{originalText:'raw',replacementText:'legacy'}}};
    const deleted=await sendWorker(h,{message:'delete_session',sessionId:'backup_delete'});
    assert.equal(deleted.ok,true);
    assert.equal(h.data.backup_delete,undefined);
    assert.equal(h.data[stableKey],undefined);
    assert.equal(h.data[legacyKey],undefined);
});

test('service worker imports verified Graph source through the consolidated generational archive',async()=>{
    const h=harness();
    h.managedData.enableGraphTranscriptImport=true;
    h.managedData.graphTenantId='11111111-1111-4111-8111-111111111111';
    h.managedData.graphClientId='22222222-2222-4222-8222-222222222222';
    h.run(read('service_worker.js'));
    h.context.CaptionKeepGraphTranscript={
        async importTranscript(){
            return {
                transcript:[{key:'graph-1',Name:'Pilot User',Text:'Synthetic verified caption.',Time:'00:00:01.000'}],
                rawSource:'WEBVTT\nSynthetic verified source',
                title:'Official Teams transcript - Synthetic QA',
                source:{type:'microsoft-graph',provider:'Microsoft Teams',sourceSha256:'c'.repeat(64),speakerAttribution:'included'}
            };
        }
    };
    const response=await sendWorker(h,{message:'graph_import_transcript',joinUrl:'https://teams.microsoft.com/meet/123?p=fixture'});
    assert.equal(response.ok,true);
    assert.equal(response.captionCount,1);
    assert.equal(response.sourceSha256,'c'.repeat(64));
    const metadata=h.data.session_index.find(item=>item.id===response.sessionId);
    assert.equal(metadata.source.type,'microsoft-graph');
    assert.match(metadata.storagePrefix,/^session_.+_generation_/);
    assert.equal(h.data[metadata.sourceArtifactKey],'WEBVTT\nSynthetic verified source');
    const loaded=await h.run(`new SessionManager().loadSession(${JSON.stringify(response.sessionId)})`);
    assert.equal(loaded.transcript[0].Text,'Synthetic verified caption.');
    assert.equal(loaded.sourceArtifact,'WEBVTT\nSynthetic verified source');
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
test('AI handoff claims a session before asynchronous work and releases failed claims',async()=>{
    const context=vm.createContext({globalThis:null});context.globalThis=context;
    vm.runInContext(read('transcriptInsights.js'),context);
    let releaseDispatch;
    let dispatches=0;
    const feature=context.CaptionKeepTranscriptInsights.createAiSummaryFeature({
        storage:{get:async()=>({autoAISummary:true,aiSummaryProviders:['copilot']})},
        readManaged:async()=>({}),applyPolicy:settings=>({settings}),
        sendMessage:async()=>{dispatches++;await new Promise(resolve=>{releaseDispatch=resolve;});}
    });
    const payload={transcript:[{Name:'A',Text:'Evidence',Time:'10:00'}],sessionId:'same-session'};
    const first=feature.onMeetingEnded(payload);
    const second=await feature.onMeetingEnded(payload);
    assert.equal(second.status,'already-preparing');
    assert.equal(dispatches,0);
    for(let i=0;i<4&&!releaseDispatch;i++) await Promise.resolve();
    assert.equal(dispatches,1);
    releaseDispatch();
    assert.equal((await first).status,'prepared');

    let attempts=0;
    const retryable=context.CaptionKeepTranscriptInsights.createAiSummaryFeature({
        storage:{get:async()=>({autoAISummary:true,aiSummaryProviders:['copilot']})},
        readManaged:async()=>({}),applyPolicy:settings=>({settings}),
        sendMessage:async()=>{attempts++;if(attempts===1) throw new Error('synthetic dispatch failure');}
    });
    await assert.rejects(retryable.onMeetingEnded(payload),/synthetic dispatch failure/);
    assert.equal((await retryable.onMeetingEnded(payload)).status,'prepared');
    assert.equal(attempts,2);
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
test('Google Meet same-URL post-call state finalizes once after positive in-call evidence',()=>{
    const observers=[];
    class FakeObserver { constructor(callback){this.callback=callback;observers.push(this);} observe(){} disconnect(){} }
    let controls=[];
    const pageWindow={location:{href:'https://meet.google.com/abc-defg-hij'},addEventListener(){},removeEventListener(){}};
    const pageDocument={body:{},querySelector:()=>null,querySelectorAll:()=>controls};
    const context=vm.createContext({URL,Date,globalThis:null});context.globalThis=context;
    vm.runInContext(read('providerRegistry.js'),context);
    vm.runInContext(read('googleMeetProvider.js'),context);
    const adapter=context.CaptionKeepProviderRegistry.create(pageWindow.location.href,{document:pageDocument,window:pageWindow,MutationObserver:FakeObserver});
    const events=[];
    adapter.start(event=>events.push(event));
    assert.equal(events.filter(event=>event.type==='meeting-ended').length,0);
    controls=[{getAttribute:name=>name==='aria-label'?'Leave call':null}];
    observers[0].callback();
    assert.equal(adapter.isMeetingPresent(),true);
    controls=[{getAttribute:name=>name==='aria-label'?'Rejoin':null}];
    observers[0].callback();
    observers[0].callback();
    assert.equal(events.filter(event=>event.type==='meeting-ended').length,1);
});
test('Google Meet manifest scope is exact and isolated from Teams capture',()=>{
    const manifest=JSON.parse(read('manifest.json'));
    assert(manifest.host_permissions.includes('https://meet.google.com/*'));
    const meetEntry=manifest.content_scripts.find(entry=>entry.matches.includes('https://meet.google.com/*'));
    assert.deepEqual(meetEntry.js,['providerRegistry.js','configuration.js','captureCoordinator.js','transcriptInsights.js','googleMeetProvider.js','chatCapture.js','googleMeetContentScript.js']);
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
    assert.deepEqual(zoomEntry.js,['providerRegistry.js','configuration.js','captureCoordinator.js','transcriptInsights.js','zoomProvider.js','chatCapture.js','zoomContentScript.js']);
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
    const createCoordinator=(pageUrl,surfaceId='google-meet-tab-1')=>{
        const context=vm.createContext({URL,crypto:webcrypto,Date,globalThis:null});context.globalThis=context;
        vm.runInContext(read('captureCoordinator.js'),context);
        return context.CaptionKeepCaptureCoordinator.create({
            providerId:'google-meet',surfaceId,pageUrl,meetingTitle:'Saturday test',storage,
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
    const otherSurface=createCoordinator('https://meet.google.com/abc-defg-hij?authuser=1','google-meet-tab-2');
    assert.equal(await otherSurface.restore(),false);
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
    const leaveButton={getAttribute:name=>name==='aria-label'?'Leave call':null};
    const pageDocument={body:{},querySelector:()=>source,querySelectorAll:()=>[captionButton,leaveButton]};
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
        sendMessage(message){
            messages.push(message);
            if(message?.message==='get_capture_surface') return Promise.resolve({ok:true,surfaceId:'google-meet-tab-7'});
            return Promise.resolve({ok:true});
        },
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
        runtime:{sendMessage:message=>Promise.resolve(message?.message==='get_capture_surface'
            ? {ok:true,surfaceId:'google-meet-tab-7'} : {ok:true}),onMessage:{addListener(handler){messageHandler=handler;}}},
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
test('viewer presents Graph provenance without exposing tenant or meeting identifiers',()=>{
    const html=read('viewer.html');
    const script=read('viewer.js');
    assert(html.includes('id="viewer-provenance"'));
    assert(html.includes('Verified source details'));
    assert(html.includes('id="source-fingerprint"'));
    assert(script.includes('viewerData.source.sourceSha256'));
    assert(!script.includes("document.getElementById('source-tenant')"));
    assert(!script.includes("document.getElementById('source-meeting')"));
});
test('viewer archive search is keyboard-accessible, source-linked, and stale-query safe',()=>{
    const html=read('viewer.html');
    const script=read('viewer.js');
    for(const id of ['archiveSearchForm','archiveSearchQuery','archiveSearchTitle','archiveSearchSpeaker','archiveSearchFrom','archiveSearchTo','archiveSearchOrder','archiveSearchResults','archiveSearchPrevious','archiveSearchNext']) {
        assert(html.includes(`id="${id}"`));
    }
    assert(script.includes('generation !== archiveSearchGeneration'));
    assert(script.includes('viewer.html?session=${encodeURIComponent(result.sessionId)}&caption=${result.captionIndex}'));
    assert(script.includes('focusCaption(Number(caption))'));
    assert(script.includes('disableSessionHistory'));
    assert(script.includes('more matches are available'));
    assert(script.includes("if (historical && /^\\d+$/.test(caption || '')) autoScroll = false"));
});
test('local archive retains more than a workday without automatic eviction',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    h.data.session_index=Array.from({length:25},(_,i)=>({id:'old_'+i,timestamp:new Date(2026,8,25-i).toISOString(),chunkCount:1}));
    for(let i=0;i<25;i++) h.data[`old_${i}_chunk_0`]=[{Text:`archive ${i}`}];
    const manager=h.run('new SessionManager(true)');
    await manager.saveSession([{Name:'A',Text:'Synthetic',Time:'10:00'}],'Test',null,{sourceSessionId:'meeting-new'});
    assert.equal(h.data.session_index.length,26);
    for(let i=0;i<25;i++) assert(h.data.session_index.some(s=>s.id===`old_${i}`));
});
test('managed history options prune expired sessions and lower the session maximum',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    const now=Date.parse('2026-09-26T12:00:00Z');
    h.data.session_index=[
        {id:'expired',timestamp:'2026-08-01T00:00:00Z',chunkCount:1},
        ...Array.from({length:5},(_,i)=>({id:'recent_'+i,timestamp:new Date(now-i*60000).toISOString(),chunkCount:1}))
    ];
    h.data.expired_chunk_0=[{Text:'expired'}];
    for(let i=0;i<5;i++) h.data[`recent_${i}_chunk_0`]=[{Text:`recent ${i}`}];
    const manager=h.run('new SessionManager(true,{maxStoredSessions:5,sessionRetentionDays:30})');
    assert.equal(await manager.pruneExpiredSessions(now),1);
    assert.equal('expired_chunk_0' in h.data,false);
    h.data.session_index.push({id:'extra',timestamp:'2026-09-25T00:00:00Z',chunkCount:1});
    h.data.extra_chunk_0=[{Text:'extra'}];
    assert.equal(await manager.pruneExcessSessions(),1);
    assert.equal('extra_chunk_0' in h.data,false);
    await manager.saveSession([{Name:'A',Text:'new',Time:'10:00',capturedAt:'2026-09-26T12:00:00Z'}],'New');
    assert.equal(h.data.session_index.length,5);
});
test('managed retention rejects an old retry before publishing archive data',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    const manager=h.run('new SessionManager(true,{sessionRetentionDays:1})');
    await assert.rejects(
        manager.saveSession([{Name:'A',Text:'old',Time:'10:00'}],'Old',null,{sourceSessionId:'2020-01-01T00:00:00Z',recordedAt:'2020-01-01T00:00:00Z'}),
        /outside the managed transcript retention period/
    );
    assert.deepEqual(h.data.session_index || [],[]);
    assert.equal(Object.keys(h.data).some(key=>key.includes('_generation_')),false);
});
test('quota rejection preserves existing history',async()=>{
    const h=harness();h.run(read('sessionManager.js'));h.data.session_index=[{id:'keep',chunkCount:1}];h.data.keep_chunk_0=[{Text:'keep'}];h.area.fail=true;
    await assert.rejects(h.run('new SessionManager(true)').saveSession([{Name:'A',Text:'new',Time:'10'}],'New'),/QUOTA/);
    assert.equal(h.data.session_index[0].id,'keep');assert.equal(h.data.keep_chunk_0[0].Text,'keep');
});
test('idempotent archive replacement publishes one generation and removes obsolete chunks',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    const manager=h.run('new SessionManager(true)');
    const saved=await manager.saveSession([{Name:'A',Text:'draft',Time:'10:00'}],'New',null,{sourceSessionId:'stable-meeting',recordedAt:'2026-09-25T10:00:00Z'});
    const firstPrefix=h.data.session_index[0].storagePrefix;
    const repeated=await manager.saveSession([{Name:'A',Text:'final',Time:'10:00'}],'New',null,{sourceSessionId:'stable-meeting',recordedAt:'2026-09-25T10:00:00Z'});
    assert.equal(repeated,saved);
    assert.equal(h.data.session_index.length,1);
    assert.notEqual(h.data.session_index[0].storagePrefix,firstPrefix);
    assert.equal(Object.keys(h.data).some(key=>key.startsWith(firstPrefix)),false);
    assert.equal((await manager.loadSession(saved)).transcript[0].Text,'final');
});

test('failed archive replacement preserves the prior generation and removes staged data',async()=>{
    const rollback=harness();rollback.run(read('sessionManager.js'));
    const rollbackManager=rollback.run('new SessionManager(true)');
    const saved=await rollbackManager.saveSession([{Name:'A',Text:'keep',Time:'10:00'}],'Keep',null,{sourceSessionId:'stable-meeting'});
    const prior={...rollback.data.session_index[0]};
    rollback.area.failNext=values=>Object.hasOwn(values,'session_index');
    await assert.rejects(rollbackManager.saveSession([{Name:'A',Text:'replace',Time:'10:00'}],'Keep',null,{sourceSessionId:'stable-meeting'}),/QUOTA/);
    assert.equal(rollback.data.session_index[0].id,saved);
    assert.equal(rollback.data.session_index[0].storagePrefix,prior.storagePrefix);
    assert.equal((await rollbackManager.loadSession(saved)).transcript[0].Text,'keep');
    assert.deepEqual(Object.keys(rollback.data).filter(key=>key.includes('_generation_')).sort(),[`${prior.storagePrefix}_chunk_0`]);
});
test('session mutations never persist transient recovery entries',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    h.data.session_index=[{id:'stored',timestamp:'2026-01-01T00:00:00Z',chunkCount:1}];
    h.data.backup_transient={transcript:[{Name:'A',Text:'recover'}],lastBackup:'2026-09-25T12:00:00Z'};
    const manager=h.run('new SessionManager(true)');
    await manager.updateSessionIndex({id:'new',timestamp:'2026-09-25T12:00:00Z',chunkCount:1});
    assert.equal(h.data.session_index.some(item=>item.id==='backup_transient'),false);
});
test('Graph source artifact is retained separately and deleted with its saved session',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    const manager=h.run('new SessionManager(true)');
    const raw='WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Pilot User>Synthetic phrase.</v>\n';
    const source={type:'microsoft-graph',sourceSha256:'a'.repeat(64),speakerAttribution:'included'};
    const id=await manager.saveSession([{Name:'Pilot User',Text:'Synthetic phrase.',Time:'00:00:01.000'}],'Graph Pilot',null,{source,rawSource:raw});
    const loaded=await manager.loadSession(id);
    assert.equal(loaded.sourceArtifact,raw);
    assert.equal(loaded.metadata.source.type,'microsoft-graph');
    assert.equal(loaded.metadata.source.sourceSha256,'a'.repeat(64));
    const metadata=h.data.session_index.find(item=>item.id===id);
    assert.equal(h.data[metadata.sourceArtifactKey],raw);
    await manager.deleteSession(id);
    assert.equal(metadata.sourceArtifactKey in h.data,false);
    assert.equal(h.data.session_index.some(item=>item.id===id),false);
});
test('managed retention removes normalized Graph captions and the raw source artifact together',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    const manager=h.run('new SessionManager(true,{sessionRetentionDays:30})');
    const id=await manager.saveSession([{Name:'Pilot User',Text:'Synthetic phrase.',Time:'00:00:01.000'}],
        'Graph retention proof',null,{source:{type:'microsoft-graph',sourceSha256:'b'.repeat(64)},rawSource:'WEBVTT\nSynthetic source'});
    const metadata=h.data.session_index[0];
    h.data.session_index[0].timestamp='2026-08-01T00:00:00Z';
    assert.equal(await manager.pruneExpiredSessions(Date.parse('2026-10-01T00:00:00Z')),1);
    assert.equal(`${metadata.storagePrefix}_chunk_0` in h.data,false);
    assert.equal(metadata.sourceArtifactKey in h.data,false);
    assert.equal(h.data.session_index.length,0);
});
test('missing chunks are reported rather than silently omitted',async()=>{
    const h=harness();h.run(read('sessionManager.js'));h.data.session_index=[{id:'broken',chunkCount:2,captionCount:2}];h.data.broken_chunk_0=[];
    await assert.rejects(h.run('new SessionManager()').loadSession('broken'),/missing chunk/);
});
test('legacy completed sessions load without chunk migration or data loss',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    h.data.session_index=[{id:'session_legacy',title:'Legacy',timestamp:'2026-09-01T12:00:00Z',chunkCount:1,captionCount:1}];
    h.data.session_legacy_chunk_0=[{key:'source-1',Name:'A',Text:'authoritative raw',Time:'10:00'}];
    const loaded=await h.run('new SessionManager()').loadSession('session_legacy');
    assert.equal(loaded.transcript[0].Text,'authoritative raw');
    assert.equal(loaded.transcript[0].key,'source-1');
    assert.equal(h.data.session_index[0].storagePrefix,undefined);
});
test('session deletion removes its corrections but keeps the shared dictionary',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    h.data.session_index=[{id:'session-delete',sourceSessionId:'capture-delete',storagePrefix:'generation-delete',chunkCount:1}];
    h.data['generation-delete_chunk_0']=[{key:'c1',Text:'raw'}];
    h.data['transcript_corrections_capture-delete']={records:{c1:{originalText:'raw',replacementText:'corrected'}}};
    h.data.terminology_dictionary_v1={entries:[{term:'raw',replacement:'preferred'}]};
    await h.run('new SessionManager(true)').deleteSession('session-delete');
    assert.equal(h.data['generation-delete_chunk_0'],undefined);
    assert.equal(h.data['transcript_corrections_capture-delete'],undefined);
    assert(h.data.terminology_dictionary_v1);
});
test('archive search supports Unicode phrases, filters, ordering, and corrupt-session recovery',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    h.data.session_index=[
        {id:'newer',title:'Product résumé',timestamp:'2026-09-25T12:00:00Z',date:'9/25/2026',chunkCount:1,captionCount:2,speakers:['Zoë']},
        {id:'older',title:'Planning',timestamp:'2026-09-20T12:00:00Z',date:'9/20/2026',chunkCount:1,captionCount:1,speakers:['Lee']},
        {id:'broken',title:'Broken',timestamp:'2026-09-24T12:00:00Z',date:'9/24/2026',chunkCount:1,captionCount:1,speakers:['Zoë']}
    ];
    h.data.newer_chunk_0=[
        {key:'new-1',Name:'Zoë',Text:'The CAFÉ launch decision is approved.',Time:'10:00'},
        {key:'new-2',Name:'Zoë',Text:'Unicode निर्णय follows.',Time:'10:01'}
    ];
    h.data.older_chunk_0=[{key:'old-1',Name:'Lee',Text:'The café launch was proposed.',Time:'09:00'}];
    const manager=h.run('new SessionManager(true)');
    const newest=await manager.searchSessions('café launch',{order:'newest'});
    assert.deepEqual(Array.from(newest.results,item=>item.sessionId),['newer','older']);
    assert.equal(newest.skippedSessions[0].sessionId,'broken');
    assert.equal(newest.results[0].sourceKey,'new-1');
    const filtered=await manager.searchSessions('UNICODE निर्णय',{title:'résumé',speaker:'zoë',dateFrom:'2026-09-25T00:00:00Z'});
    assert.equal(filtered.results.length,1);
    assert.equal(filtered.results[0].captionIndex,1);
    await manager.deleteSession('newer');
    assert.equal((await manager.searchSessions('approved')).results.length,0);
});
test('archive search stays bounded across a thousand retained meetings',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    h.data.session_index=Array.from({length:1000},(_,index)=>({
        id:`bulk_${index}`,title:`Meeting ${index}`,timestamp:new Date(Date.UTC(2026,0,1,0,index)).toISOString(),
        date:'fixture',chunkCount:1,captionCount:1,speakers:['Speaker']
    }));
    for(let index=0;index<1000;index++) h.data[`bulk_${index}_chunk_0`]=[{key:`key-${index}`,Name:'Speaker',Text:`bounded needle ${index}`,Time:'10:00'}];
    const response=await h.run('new SessionManager()').searchSessions('needle',{limit:25});
    assert.equal(response.results.length,25);
    assert.equal(response.hasMore,true);
    assert.equal(response.searchedSessions,26);
    const last=await h.run('new SessionManager()').searchSessions('needle',{limit:25,offset:975});
    assert.equal(last.results.length,25);
    assert.equal(last.results[0].sourceKey,'key-24');
    assert.equal(last.hasMore,false);
    assert.equal(last.searchedSessions,1000);
});
test('archive search pages more than one hundred matches from one meeting without gaps',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    h.data.session_index=[{id:'long-meeting',title:'Long meeting',timestamp:'2026-09-25T12:00:00Z',chunkCount:1,captionCount:225}];
    h.data['long-meeting_chunk_0']=Array.from({length:225},(_,index)=>({key:`long-${index}`,Name:'Speaker',Text:`needle caption ${index}`,Time:'10:00'}));
    const first=await h.run('new SessionManager()').searchSessions('needle',{limit:100});
    const second=await h.run('new SessionManager()').searchSessions('needle',{limit:100,offset:100});
    const third=await h.run('new SessionManager()').searchSessions('needle',{limit:100,offset:200});
    assert.equal(first.results.length,100);assert.equal(first.hasMore,true);
    assert.equal(second.results.length,100);assert.equal(second.hasMore,true);
    assert.equal(third.results.length,25);assert.equal(third.hasMore,false);
    assert.equal(new Set([...first.results,...second.results,...third.results].map(item=>item.sourceKey)).size,225);
});
test('archive speaker filter searches captions beyond truncated metadata speakers',async()=>{
    const h=harness();h.run(read('sessionManager.js'));
    h.data.session_index=[{id:'many-speakers',title:'Meeting',timestamp:'2026-09-25T12:00:00Z',chunkCount:1,captionCount:1,
        speakers:Array.from({length:10},(_,index)=>`Speaker ${index}`)}];
    h.data['many-speakers_chunk_0']=[{key:'hidden-speaker',Name:'Speaker 11',Text:'discoverable decision',Time:'10:00'}];
    const response=await h.run('new SessionManager()').searchSessions('decision',{speaker:'Speaker 11'});
    assert.equal(response.results.length,1);
    assert.equal(response.results[0].sourceKey,'hidden-speaker');
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
test('archive failure remains visible and recovery retry commits before cleanup',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    h.data.backup_abc123={
        transcript:[{Name:'A',Text:'retained recovery',Time:'10:00',capturedAt:'2026-09-25T10:00:00Z'}],
        meetingTitle:'Retry meeting',recordingStartTime:'2026-09-25T10:00:00Z',lastBackup:'2026-09-25T10:01:00Z',
        providerId:'google-meet',surfaceId:'meet-tab-7',documentSessionId:'abc123',backupKey:'backup_abc123',
        attendeeData:{allAttendees:['Ada'],currentAttendees:[['Ada','Presenter']],attendeeHistory:[{name:'Ada',action:'joined'}]}
    };
    h.data['active_capture_v3_google-meet_meet-tab-7']={...h.data.backup_abc123};
    h.area.failNext=values=>Object.keys(values).some(key=>key.includes('_generation_'));
    const failed=await new Promise(resolve=>h.chrome.listener({
        message:'save_session_history',backupKey:'backup_abc123',recordingStartTime:'2026-09-25T10:00:00Z',
        transcriptArray:h.data.backup_abc123.transcript,meetingTitle:'Retry meeting'
    },{id:'test'},resolve));
    assert.equal(failed.ok,false);
    assert(h.data.backup_abc123);
    assert.equal(h.data.archive_last_error.retryable,true);

    const retried=await new Promise(resolve=>h.chrome.listener(
        {message:'retry_archive',sessionId:'backup_abc123'},
        {id:'test',url:'chrome-extension://test/popup.html'},resolve
    ));
    assert.equal(retried.ok,true);
    assert.equal(h.data.backup_abc123,undefined);
    assert.equal(h.data.archive_last_error,undefined);
    assert.equal(h.data['active_capture_v3_google-meet_meet-tab-7'],undefined);
    assert.equal(h.data.session_index.length,1);
    const loaded=await h.run('new SessionManager()').loadSession(h.data.session_index[0].id);
    assert.equal(loaded.transcript[0].Text,'retained recovery');
    assert.equal(loaded.attendeeReport.attendeeList[0],'Ada');
    assert.equal(loaded.attendeeReport.currentAttendees[0].role,'Presenter');
});
test('recovery retry respects current user and managed attendee capture settings',async()=>{
    for (const mode of ['user','managed']) {
        const h=harness();h.run(read('service_worker.js'));
        if (mode === 'user') h.data.trackAttendees=false;
        else h.managedData.disableAttendeeCapture=true;
        h.data[`backup_${mode}`]={transcript:[{Name:'A',Text:'recovery',Time:'10:00'}],meetingTitle:'Retry',
            recordingStartTime:'2026-09-25T10:00:00Z',lastBackup:'2026-09-25T10:01:00Z',
            attendeeData:{allAttendees:['Private attendee'],currentAttendees:[['Private attendee','Presenter']],attendeeHistory:[{name:'Private attendee'}]}};
        const retried=await new Promise(resolve=>h.chrome.listener(
            {message:'retry_archive',sessionId:`backup_${mode}`},
            {id:'test',url:'chrome-extension://test/popup.html'},resolve
        ));
        assert.equal(retried.ok,true,mode);
        const loaded=await h.run('new SessionManager()').loadSession(h.data.session_index[0].id);
        assert.equal(loaded.attendeeReport,null,mode);
    }
});
test('expired recovery retry keeps recovery data and active checkpoint',async()=>{
    const h=harness();h.managedData.sessionRetentionDays=1;h.run(read('service_worker.js'));
    h.data.backup_expired={transcript:[{Name:'A',Text:'old',Time:'10:00'}],meetingTitle:'Expired',
        recordingStartTime:'2020-01-01T00:00:00Z',lastBackup:'2020-01-01T00:01:00Z',surfaceId:'teams-tab-7',documentSessionId:'expired'};
    h.data['active_capture_v2_teams-tab-7']={...h.data.backup_expired};
    const retried=await new Promise(resolve=>h.chrome.listener(
        {message:'retry_archive',sessionId:'backup_expired'},
        {id:'test',url:'chrome-extension://test/popup.html'},resolve
    ));
    assert.equal(retried.ok,false);
    assert.match(retried.error,/retention period/);
    assert(h.data.backup_expired);
    assert(h.data['active_capture_v2_teams-tab-7']);
    assert.equal(h.data.session_index,undefined);
});
test('recovery retry does not clear a newer active capture on the same surface',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    h.data.backup_old={transcript:[{Name:'A',Text:'old recovery',Time:'10:00'}],meetingTitle:'Old',
        recordingStartTime:'2026-09-25T10:00:00Z',lastBackup:'2026-09-25T10:01:00Z',surfaceId:'teams-tab-7',documentSessionId:'old'};
    h.data['active_capture_v2_teams-tab-7']={...h.data.backup_old,recordingStartTime:'2026-09-25T11:00:00Z',documentSessionId:'new'};
    const retried=await new Promise(resolve=>h.chrome.listener(
        {message:'retry_archive',sessionId:'backup_old'},
        {id:'test',url:'chrome-extension://test/popup.html'},resolve
    ));
    assert.equal(retried.ok,true);
    assert.equal(h.data['active_capture_v2_teams-tab-7'].documentSessionId,'new');
});
test('viewer launch payloads have a bounded lifetime and expired snapshots are removed',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    await h.run("createViewerTab([{Name:'A',Text:'live'}],{tab:{id:7}},{sessionId:'session-7',meetingTitle:'Test'})");
    const key=Object.keys(h.data).find(value=>value.startsWith('viewer_payload_'));
    assert(key);
    assert.equal(h.data[key].sourceTabId,7);
    assert(h.data[key].expiresAt>h.data[key].createdAt);
    h.data[key].expiresAt=Date.now()-1;
    await h.run('cleanupViewerPayloads()');
    assert.equal(key in h.data,false);
    const viewer=read('viewer.js');
    assert(viewer.includes("{message: 'get_evidence_context'}"));
    assert(viewer.includes('current?.sessionId === viewerData.sessionId'));
});
test('exports stage locally and start automatic downloads in a background tab',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    await h.run("downloadFile('CON.txt','Synthetic private words','text/plain',{automatic:true,saveAs:false})");
    const job=Object.values(h.data)[0];assert.equal(job.filename,'_CON.txt');assert.equal(job.browserFilename,'_CON.txt');assert.equal(job.content,'Synthetic private words');assert.equal(job.automatic,true);assert.equal(job.saveAs,false);assert.equal(job.autoStart,true);
    assert(h.tabs[0].url.startsWith('chrome-extension://test/export.html?job='));
    assert.equal(h.tabs[0].active,false);
});
test('service worker stages DOCX through the common export contract after managed scrubbing',async()=>{
    const h=harness();h.managedData.forceScrubbedExport=true;h.managedData.customScrubTerms=['Project Nightfall'];h.run(read('service_worker.js'));
    const result=await new Promise(resolve=>h.chrome.listener({message:'download_captions',format:'docx',meetingTitle:'Project Nightfall secret@example.com',
        transcriptArray:[{key:'source-1',Name:'Ada',Time:'10:00',Text:'Contact secret@example.com'}]}, {id:'test'}, resolve));
    assert.equal(result.ok,true);
    const job=Object.values(h.data).find(value=>value?.profile?.format==='docx');
    assert(job);
    assert.equal(job.contentEncoding,'base64');
    assert.equal(job.mimeType,'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.equal(job.profile.subsetCount,1);
    assert.equal(job.profile.sourceIds[0],'source-1');
    assert.equal(job.profile.timingBasis,'source-display-or-observation-time');
    assert(!atob(job.content).includes('secret@example.com'));
    assert(!atob(job.content).includes('Project Nightfall'));
    assert(!job.previewText.includes('secret@example.com'));
    assert(!job.filename.includes('Project Nightfall'));
    assert(!job.filename.includes('secret@example.com'));
    assert(atob(job.content).includes('[CUSTOM_TERM_1] [EMAIL_1]'));
    assert(job.previewText.includes('[EMAIL_1]'));
});
test('manual Downloads subfolders survive export staging',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    await h.run("downloadFile('Transcripts/Teams/Test.txt','Synthetic','text/plain',{automatic:false,saveAs:false})");
    const job=Object.values(h.data)[0];
    assert.equal(job.filename,'Test.txt');
    assert.equal(job.browserFilename,'Transcripts/Teams/Test.txt');
    assert.equal(h.run("sanitizeSubfolderPath('../Transcripts/../Teams')"),'Transcripts/Teams');
});
test('normal Downloads subfolder settings stay in the popup',()=>{
    const html=read('export.html');
    const script=read('export.js');
    const popupHtml=read('popup.html');
    const popupScript=read('popup.js');
    for(const id of ['saveAsType','saveLocation','openLastTranscriptFolder']) assert(popupHtml.includes(`id="${id}"`));
    for(const id of ['manual-folder','remember-manual-folder','open-downloads-folder']) assert(!html.includes(`id="${id}"`));
    const directFolderSection=script.slice(script.indexOf('async function saveToFolder'),script.indexOf('async function closeCurrentTab'));
    const browserDownloadSection=script.slice(script.indexOf('async function downloadWithBrowser'),script.indexOf('async function loadPending'));
    assert(!directFolderSection.includes('lastCompletedDownload'));
    assert(browserDownloadSection.includes('lastCompletedDownload'));
    assert(popupScript.includes('chrome.downloads.show(lastCompletedDownload.id)'));
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
    const h=harness();h.run(read('service_worker.js'));await h.run("openAiAssistantTabs(['chatgpt'],'Synthetic private words','Test',{transcript:[{key:'caption-1',Text:'Synthetic private words'}],sessionId:'meeting-1',providerLabel:'Teams'})");
    assert(h.tabs[0].url.startsWith('chrome-extension://test/handoff.html?'));
    assert(!h.tabs[0].url.includes('private'));
    const payload=Object.values(h.data)[0];
    assert.equal(payload.prompt,'Synthetic private words');
    assert.equal(payload.transcript[0].key,'caption-1');
    assert.equal(payload.sessionId,'meeting-1');
    assert.equal(payload.providerLabel,'Teams');
});
test('expired and failed AI handoffs remove temporary transcript payloads',async()=>{
    const expired=harness();expired.run(read('service_worker.js'));
    expired.data.handoff_old={createdAt:Date.now()-(16*60*1000),transcript:[{Text:'temporary'}]};
    await expired.run('cleanupViewerPayloads()');
    assert.equal(expired.data.handoff_old,undefined);

    const failed=harness();failed.run(read('service_worker.js'));
    failed.chrome.tabs.create=async()=>{throw new Error('synthetic tab failure');};
    await assert.rejects(failed.run("openAiAssistantTabs(['chatgpt'],'Prompt','Test',{transcript:[{Text:'temporary'}]})"),/synthetic tab failure/);
    assert.equal(Object.keys(failed.data).filter(key=>key.startsWith('handoff_')).length,0);
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
    for(const host of ['https://login.microsoftonline.com/*','https://graph.microsoft.com/*']) {
        assert(!manifest.host_permissions.includes(host));
        assert(manifest.optional_host_permissions.includes(host));
    }
    const popupScript=read('popup.js');
    assert(popupScript.includes('requestMicrosoft365HostAccess'));
    assert(popupScript.includes('chrome.permissions.request(request)'));
    assert(popupScript.includes('MICROSOFT_365_HOST_ACCESS'));
    assert(popupScript.includes('graphConnectPending'));
    const worker=read('service_worker.js');
    assert(worker.includes('resumePendingMicrosoft365Connect'));
    assert(worker.includes('chrome.permissions?.onAdded?.addListener'));
    assert(worker.includes('GRAPH_CONNECT_PENDING_MAX_AGE_MS'));
    assert.equal(manifest.storage.managed_schema,'managed-schema.json');
    assert.deepEqual(manifest.content_scripts[0].js.slice(0,3),['providerRegistry.js','configuration.js','transcriptInsights.js']);
});
test('Dev, UAT, and production roots are directly loadable lifecycle builds',()=>{
    const source=JSON.parse(read('manifest.json'));
    const builder=readProject('scripts/build-browser-targets.mjs');
    assert.equal(source.manifest_version,3);
    assert(builder.includes("['dev', path.join(sourceDir, 'manifest.json')]"));
    assert(builder.includes("['uat', path.join(sourceDir, 'manifest.json')]"));
    assert(builder.includes("['prod', path.join(manifestsDir, 'manifest.chrome-store.json')]"));
    assert(builder.includes("const defaultTargets = ['dev', 'uat', 'prod']"));
    assert(builder.includes("target === 'prod'"));
    assert(builder.includes("manifest.name = isUat ? 'Better CaptionKeep - UAT Release Candidate' : 'Better CaptionKeep - Development'"));
    assert(builder.includes('manifest.key = isUat ? UAT_KEY : DEV_KEY'));
    assert(builder.includes('const PROD_KEY ='));
    assert(builder.includes('manifest.key = PROD_KEY'));
    const verifier=readProject('scripts/verify-release.mjs');
    for(const id of ['pjpibiimicedkckleehljlklmblkacph','ecpjboeanaehianibdbgijldbikdgkhm','nffdfdkkbbbmngcibbeindpjlfkcnikg']) {
        assert(verifier.includes(id));
    }
    assert.equal(fs.existsSync(path.join(root,'graphRuntimeConfig.js')),true);
    assert(!builder.includes('--output-root'));
});
test('Chrome Store manifest preserves runtime behavior without test labeling',()=>{
    const source=JSON.parse(read('manifest.json'));
    const manifest=JSON.parse(readProject('manifests/manifest.chrome-store.json'));
    for(const key of ['version','permissions','host_permissions','optional_host_permissions','background','content_scripts','storage']) {
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
test('Scrubby preserves transcript schema and reuses placeholders across explicit data fields',()=>{
    const context=vm.createContext({globalThis:null});context.globalThis=context;
    vm.runInContext(read('privacyScrubber.js'),context);
    const original={Name:'Name / Alpha',Text:'Alpha said "Name".',Time:'10:00',key:'Name-key',capturedAt:'2026-09-25T12:00:00Z',
        attendeeList:[{name:'Alpha',role:'Name'}]};
    const result=context.CaptionKeepPrivacyScrubber.scrubTranscript([original],{customTerms:['Name','Alpha']});
    const cleaned=result.transcript[0];
    assert.equal(cleaned.key,'Name-key');
    assert.equal(cleaned.Time,'10:00');
    assert.equal(cleaned.capturedAt,original.capturedAt);
    assert.equal(cleaned.Name,'[CUSTOM_TERM_1] / [CUSTOM_TERM_2]');
    assert.equal(cleaned.Text,'[CUSTOM_TERM_2] said "[CUSTOM_TERM_1]".');
    assert.equal(cleaned.attendeeList[0].name,'[CUSTOM_TERM_2]');
    assert.equal(cleaned.attendeeList[0].role,'[CUSTOM_TERM_1]');
    assert.deepEqual(Object.keys(cleaned),Object.keys(original));
});
test('service-worker export enforcement scrubs transcript and attendee data',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    const policy={settings:{forceScrubbedExport:true,profanityFilterEnabled:false,customScrubTerms:[]}};
    const result=await h.run(`prepareManagedExport(
        'Meeting alice@example.com',
        [{Name:'alice@example.com',Text:'Email alice@example.com',Time:'10:00'}],
        {attendeeList:['alice@example.com']},
        ${JSON.stringify(policy)}
    )`);
    assert.equal(result.transcriptArray[0].Name,'[EMAIL_1]');
    assert.equal(result.transcriptArray[0].Text,'Email [EMAIL_1]');
    assert.equal(result.attendeeReport.attendeeList[0],'[EMAIL_1]');
    assert.equal(result.meetingTitle,'Meeting [EMAIL_1]');
    await assert.rejects(h.run(`prepareManagedExport('Meeting',[],null,{settings:{disableFileExport:true}})`),/disabled by your organization/);
});
test('service-worker export enforcement scrubs speaker aliases after applying them',async()=>{
    const h=harness();h.run(read('service_worker.js'));
    const result=await h.run(`prepareManagedExport(
        'Meeting',
        [{Name:'Alice',Text:'Hello',Time:'10:00'}],
        null,
        {settings:{forceScrubbedExport:true,profanityFilterEnabled:false,customScrubTerms:['Project Cobalt']}},
        {Alice:'owner@example.com / Project Cobalt'}
    )`);
    assert.equal(result.transcriptArray[0].Name,'[EMAIL_1] / [CUSTOM_TERM_1]');
    assert(!result.transcriptArray[0].Name.includes('owner@example.com'));
    assert(!result.transcriptArray[0].Name.includes('Project Cobalt'));
});
test('Scrubby masks transcript and attendee report through one release context',()=>{
    const context=vm.createContext({globalThis:null});context.globalThis=context;
    vm.runInContext(read('privacyScrubber.js'),context);
    const result=context.CaptionKeepPrivacyScrubber.scrubBundle(
        [{Name:'alice@example.com',Text:'Contact alice@example.com',Time:'10:00'}],
        {attendeeList:['alice@example.com']}
    );
    assert.equal(result.transcript[0].Name,'[EMAIL_1]');
    assert.equal(result.transcript[0].Text,'Contact [EMAIL_1]');
    assert.equal(result.attendeeReport.attendeeList[0],'[EMAIL_1]');
});
test('Scrubby preserves evidence provenance metadata while cleaning human-authored fields',()=>{
    const context=vm.createContext({globalThis:null});context.globalThis=context;
    vm.runInContext(read('privacyScrubber.js'),context);
    const bundle={
        format:'better-captionkeep-evidence-bundle',version:1,generatedAt:'2026-09-25T12:00:00Z',
        authority:'The captured transcript is authoritative.',
        source:{sessionId:'session-ab-1',meetingTitle:'Project ab for owner@example.com',providerLabel:'Teams',transcriptSha256:'ab12ff',transcriptIncluded:true,captionCount:1},
        captions:[{evidenceId:'C0001',sourceKey:'caption-ab-1',speaker:'owner@example.com',time:'10:00',capturedAt:'2026-09-25T12:00:00Z',text:'Project ab'}],
        markers:[{id:'marker-ab-1',kind:'Decision',evidenceId:'C0001',sourceKey:'caption-ab-1',speaker:'owner@example.com',time:'10:00',capturedAt:'2026-09-25T12:00:00Z',markedText:'Project ab',finalText:'Email owner@example.com',note:'Project ab',createdAt:'2026-09-25T12:01:00Z'}]
    };
    const cleaned=context.CaptionKeepPrivacyScrubber.scrubEvidenceBundle(bundle,{customTerms:['ab']}).value;
    assert.equal(cleaned.format,bundle.format);
    assert.equal(cleaned.generatedAt,bundle.generatedAt);
    assert.equal(cleaned.source.sessionId,bundle.source.sessionId);
    assert.equal(cleaned.source.transcriptSha256,bundle.source.transcriptSha256);
    assert.equal(cleaned.captions[0].sourceKey,bundle.captions[0].sourceKey);
    assert.equal(cleaned.captions[0].capturedAt,bundle.captions[0].capturedAt);
    assert.equal(cleaned.markers[0].id,bundle.markers[0].id);
    assert.equal(cleaned.markers[0].createdAt,bundle.markers[0].createdAt);
    assert(!cleaned.source.meetingTitle.includes('owner@example.com'));
    assert(!cleaned.captions[0].speaker.includes('owner@example.com'));
    assert(!cleaned.markers[0].note.includes('ab'));
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
    const enterprise=config.applyPolicy({trackAttendees:true,autoOpenAttendees:true,privacyScrubberEnabled:false},{
        forceScrubbedExport:true,disableClipboard:true,disableFileExport:true,disableEvidenceEmail:true,
        disableAttendeeCapture:true,disableSessionHistory:true,maxStoredSessions:5,sessionRetentionDays:30
    });
    assert.equal(enterprise.settings.privacyScrubberEnabled,true);
    assert.equal(enterprise.settings.trackAttendees,false);
    assert.equal(enterprise.settings.autoOpenAttendees,false);
    assert.equal(enterprise.settings.disableClipboard,true);
    assert.equal(enterprise.settings.disableFileExport,true);
    assert.equal(enterprise.settings.disableEvidenceEmail,true);
    assert.equal(enterprise.settings.disableSessionHistory,true);
    assert.equal(enterprise.settings.maxStoredSessions,5);
    assert.equal(enterprise.settings.sessionRetentionDays,30);
});
test('Dev and UAT overlays are isolated while production accepts customer-owned or managed configuration',()=>{
    const context=vm.createContext({globalThis:null,chrome:{storage:{}}});context.globalThis=context;
    vm.runInContext(read('configuration.js'),context);
    const config=context.CaptionKeepConfiguration;
    const policy=config.applyPolicy({privacyScrubberEnabled:true},{});
    const local={enableGraphTranscriptImport:true,graphTenantId:'11111111-1111-4111-8111-111111111111',graphClientId:'22222222-2222-4222-8222-222222222222'};
    const effective=config.applyGraphRuntimeConfig(policy,local,{name:'Better CaptionKeep - UAT Release Candidate',version_name:'5.3.0 uat release candidate'});
    assert.equal(effective.settings.enableGraphTranscriptImport,true);
    assert.equal(effective.settings.graphTenantId,local.graphTenantId);
    assert(effective.locked.includes('graphTenantId'));
    assert.equal(policy.settings.enableGraphTranscriptImport,undefined);
    assert.equal(Object.isFrozen(effective.settings),true);
    const development=config.applyGraphRuntimeConfig(policy,local,{name:'Better CaptionKeep - Development',version_name:'5.3.0 development'});
    assert.equal(development.settings.enableGraphTranscriptImport,true);
    assert.equal(development.settings.graphClientId,local.graphClientId);
    const production=config.applyGraphRuntimeConfig(policy,local,{name:'Better CaptionKeep',version_name:'5.3.0'});
    assert.equal(production.settings.enableGraphTranscriptImport,undefined);
    assert.equal(production.settings.graphClientId,undefined);
    const customer=config.applyPolicy(local,{});
    assert.equal(customer.settings.graphTenantId,local.graphTenantId);
    assert.equal(customer.settings.graphClientId,local.graphClientId);
    const managed=config.applyPolicy({}, {enableGraphTranscriptImport:true,graphTenantId:'33333333-3333-4333-8333-333333333333',graphClientId:'44444444-4444-4444-8444-444444444444'});
    const managedProduction=config.applyGraphRuntimeConfig(managed,local,{name:'Better CaptionKeep',version_name:'5.3.0'});
    assert.equal(managedProduction.settings.graphTenantId,'33333333-3333-4333-8333-333333333333');
    assert.equal(managedProduction.settings.graphClientId,'44444444-4444-4444-8444-444444444444');
    const disabled=config.applyPolicy({}, {enableGraphTranscriptImport:false});
    const disabledProduction=config.applyGraphRuntimeConfig(disabled,local,{name:'Better CaptionKeep',version_name:'5.3.0'});
    assert.equal(disabledProduction.settings.enableGraphTranscriptImport,false);
    assert(disabledProduction.locked.includes('enableGraphTranscriptImport'));
});
test('AI handoff requires workspace confirmation and supports saved enterprise destinations',()=>{
    const html=read('handoff.html');const script=read('handoff.js');
    assert(html.includes('Confirm the destination workspace'));
    assert(script.includes('Saved enterprise destination'));
    assert(script.includes('Confirm the active workspace before attaching or pasting'));
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
    assert(handoffScript.includes("copyButton.textContent = 'Copy cleaned instructions'"));
    assert(handoffScript.includes("copyButton.textContent = 'Copy unmasked instructions'"));
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
test('managed release restrictions are enforced across extension action surfaces',()=>{
    const worker=read('service_worker.js');
    const popup=read('popup.js');
    const viewer=read('viewer.js');
    const handoff=read('handoff.js');
    const sidepanel=read('sidepanel.js');
    const exportPage=read('export.js');
    assert(worker.includes('prepareManagedExport'));
    assert(worker.includes('disableSessionHistory'));
    assert(worker.includes('disableAiHandoff'));
    assert(popup.includes('currentEnterprisePolicy.disableClipboard'));
    assert(popup.includes('currentEnterprisePolicy.disableFileExport'));
    assert(viewer.includes('enterprisePolicy.disableClipboard'));
    assert(viewer.includes('enterprisePolicy.disableFileExport'));
    assert(handoff.includes('effectivePolicy.settings.disableClipboard'));
    assert(handoff.includes('CaptionKeepPrivacyScrubber.scrubHandoff(transcript, metadata, scrubOptions)'));
    assert(sidepanel.includes('enterprisePolicy.disableEvidenceEmail'));
    assert(exportPage.includes('Pending exports were discarded'));
    for(const page of ['viewer.html','handoff.html','sidepanel.html','export.html']) {
        assert(read(page).includes('configuration.js'),`${page} must load managed-policy configuration`);
    }
});
test('all target manifests expose the local Evidence Board through the side panel',()=>{
    for(const relative of ['teams-captions-saver/manifest.json','manifests/manifest.chrome-store.json']) {
        const manifest=JSON.parse(readProject(relative));
        assert(manifest.permissions.includes('sidePanel'));
        assert.equal(manifest.side_panel?.default_path,'sidepanel.html');
    }
    const popup=read('popup.html');const popupScript=read('popup.js');
    assert(popup.includes('id="liveWorkspaceButton"'));
    assert.equal((popup.match(/Open Live Workspace/g) || []).length,1);
    assert(!popup.includes('id="viewButton"'));
    assert(!popupScript.includes('Ctrl/Cmd + V for view'));
    assert(popupScript.includes('chrome.sidePanel.open'));
    assert(popupScript.includes("chrome.sidePanel.setOptions({enabled: true, path: 'sidepanel.html'})"));
    const sidepanel=read('sidepanel.html');const sidepanelScript=read('sidepanel.js');
    assert(sidepanel.includes('>Live transcript</button>'));
    assert(sidepanel.includes('>Open full transcript</button>'));
    assert(sidepanel.includes('id="close-panel"'));
    assert(sidepanel.includes('id="transcript-search"'));
    assert(sidepanel.includes('id="email-board"'));
    assert(sidepanel.includes('id="download-bundle"'));
    assert(sidepanelScript.includes("typeof chrome.sidePanel.close === 'function'"));
    assert(sidepanelScript.includes('chrome.sidePanel.setOptions({enabled: false})'));
    assert(sidepanelScript.includes("crypto.subtle.digest('SHA-256'"));
    assert(sidepanelScript.includes('mailto:?subject='));
    assert(sidepanelScript.includes('CaptionKeepPrivacyScrubber.scrub(rawSubject, scrubOptions)'));
    assert(sidepanelScript.includes('CaptionKeepPrivacyScrubber.scrubEvidenceBundle(bundle, scrubOptions)'));
});
test('popup uses compact native quick-start actions for all three meeting platforms',()=>{
    const popup=read('popup.html');const script=read('popup.js');
    assert(popup.includes('class="platform-launchers"'));
    assert.equal((popup.match(/class="platform-launcher"/g)||[]).length,3);
    assert.equal((popup.match(/class="platform-start"/g)||[]).length,3);
    assert(popup.includes('aria-label="Open Microsoft Teams"'));
    assert(popup.includes('aria-label="Open Microsoft Teams to Meet now">Meet now</a>'));
    assert(popup.includes('href="https://app.zoom.us/wc"'));
    assert(popup.includes('aria-label="Open Zoom Web"'));
    assert(popup.includes('href="https://zoom.new"'));
    assert(popup.includes('aria-label="Start a new Zoom meeting">New meeting</a>'));
    assert(popup.includes('href="https://meet.google.com"'));
    assert(popup.includes('aria-label="Open Google Meet"'));
    assert(popup.includes('href="https://meet.new"'));
    assert(popup.includes('aria-label="Start a new Google Meet meeting">Start meeting</a>'));
    assert(script.includes('getActiveMeetingTab'));
    assert(script.includes('https:\\/\\/meet\\.google\\.com'));
    assert(script.includes('https:\\/\\/app\\.zoom\\.us\\/wc'));
    assert(script.includes("textContent = 'Open Teams, Zoom Web, or Google Meet to begin.'"));
    assert(!script.includes('open a Teams tab</a>'));
});
test('Graph pilot can capture the active Teams meeting link without new permissions',()=>{
    const content=read('content_script.js');
    const popup=read('popup.html');
    const popupScript=read('popup.js');
    assert(content.includes("case 'get_teams_meeting_join_url'"));
    assert(content.includes("let lastKnownTeamsJoinUrl = ''"));
    assert(content.includes('lastKnownTeamsJoinUrl = joinUrl'));
    assert(content.includes('return lastKnownTeamsJoinUrl'));
    assert(/lastKnownTeamsJoinUrl = '';\r?\n\s+findCurrentTeamsJoinUrl\(\);/.test(content));
    assert(content.includes("document.querySelectorAll('a[href]')"));
    assert(popup.includes('id="graphUseCurrentMeeting"'));
    assert(popupScript.includes('populateCurrentTeamsMeeting(tab, true)'));
});
test('Teams automation requests tenant transcription and distinguishes it from local capture',()=>{
    const content=read('content_script.js');
    const popup=read('popup.html');
    const popupScript=read('popup.js');
    assert(content.includes('async function ensureTeamsTranscription'));
    assert(content.includes('async function inspectTranscriptionMenu'));
    assert(content.includes('/^start transcription$/i'));
    assert(content.includes('/^stop transcription$/i'));
    assert(content.includes('transcriptionState,'));
    assert(content.includes('autoOpenAttendees !== false'));
    assert(popup.includes('Local CaptionKeep copy:'));
    assert(popup.includes('Official tenant copy:'));
    assert(popup.includes('id="autoOpenAttendeesToggle" checked'));
    assert(popupScript.includes("transcriptionState === 'running'"));
    assert(popupScript.includes("transcriptionState === 'requested'"));
    assert(popupScript.includes("transcriptionState === 'unavailable'"));
    assert(popupScript.includes('Local capture is working.'));
    assert(!popupScript.includes('CAUTION:'));
    assert(content.includes('An official Microsoft 365 transcript is unavailable for this meeting because Teams role or organization policy controls access.'));
});
test('Verified Teams Transcript offers current, recent-five, and manual meeting selection',()=>{
    const popup=read('popup.html');
    const popupScript=read('popup.js');
    const worker=read('service_worker.js');
    assert(popup.includes('id="graphRecentMeetings"'));
    assert(popup.includes('id="graphRefreshMeetings"'));
    assert(popup.includes('Can’t find the meeting? Paste its link'));
    assert(popup.includes('Import verified transcript'));
    assert(popupScript.includes("message:'graph_list_recent_meetings'"));
    assert(popupScript.includes('meetings.slice(0, 5)'));
    assert(popupScript.includes('async function importGraphTranscript(joinUrl)'));
    assert(popupScript.includes('await importGraphTranscript(meeting.joinUrl)'));
    assert(popupScript.includes("message:'graph_import_transcript', joinUrl:normalizedJoinUrl"));
    assert(popup.includes('Choose a Teams transcript'));
    assert(popupScript.includes('graphErrorMessage'));
    assert(worker.includes("case 'graph_list_recent_meetings'"));
});
test('Graph controls remain available in every lane but render only in All Settings',()=>{
    const worker=read('service_worker.js');
    const popup=read('popup.html');
    const popupScript=read('popup.js');
    const settingsScript=read('settings.js');
    const buildScript=readProject('scripts/build-browser-targets.mjs');
    assert(!popup.includes('devUatSection'));
    assert(!popup.includes('Signed UAT pass'));
    assert(!worker.includes('requireGraphDevUatAccess'));
    assert(!worker.includes('dev_uat_'));
    assert(popup.includes('id="graphTenantId"'));
    assert(popup.includes('id="graphClientId"'));
    assert(popup.includes('Save Microsoft 365 setup'));
    assert(popup.includes('href="settings.html"'));
    assert(popup.includes('Open every setting in a full browser tab'));
    assert(!popup.includes('graph-settings-link'));
    assert(popup.includes('#graphTranscriptSection { display: none; }'));
    assert(popup.includes('html[data-view="settings"] #graphTranscriptSection { display: block; }'));
    assert(popup.includes('class="graph-settings-layout"'));
    assert(popup.includes('Connection and administrator setup'));
    assert(popup.includes('Choose a Teams transcript'));
    assert(popup.includes('grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.15fr)'));
    assert(popup.indexOf('class="settings-heading"') < popup.indexOf('id="graphTranscriptSection"'));
    assert(popupScript.includes('UI_ELEMENTS.graphTranscriptSection.hidden = !isFullSettingsPage'));
    assert(settingsScript.includes('destination.hash = location.hash'));
    assert(popupScript.includes('CaptionKeepConfiguration.readGraphUserConfig()'));
    assert(buildScript.includes("target === 'dev' || target === 'uat'"));
});
test('worker accepts local overlays only in Dev and UAT while production reads customer configuration',()=>{
    const worker=read('service_worker.js');
    const popup=read('popup.html');
    const popupScript=read('popup.js');
    const overlayScript=readProject('scripts/configure-dev-uat-unpacked.mjs');
    assert(worker.includes("'graphRuntimeConfig.js'"));
    assert(worker.includes('CaptionKeepConfiguration.applyGraphRuntimeConfig'));
    assert(worker.includes('globalThis.CaptionKeepGraphRuntimeConfig'));
    assert(popup.includes('<script src="graphRuntimeConfig.js" defer></script>'));
    assert(popupScript.includes('CaptionKeepConfiguration.applyGraphRuntimeConfig'));
    assert(popupScript.includes('globalThis.CaptionKeepGraphRuntimeConfig'));
    assert(read('configuration.js').includes("manifest.name === 'Better CaptionKeep - UAT Release Candidate'"));
    assert(!read('configuration.js').includes("manifest.name === 'Better CaptionKeep'\n"));
    assert(read('configuration.js').includes('/\\buat release candidate\\b/i'));
    assert(read('configuration.js').includes('sanitizeGraphUserConfig(runtimeConfig)'));
    assert(overlayScript.includes("['dev', 'uat'].includes(target)"));
    assert(!overlayScript.includes("'prod'"));
    assert(overlayScript.includes("path.join(projectRoot, 'dist', target)"));
    assert(overlayScript.includes('without changing a Store package'));
});
test('every service worker loads an inert Store-safe Graph configuration without a shared tenant identity',()=>{
    const production=harness();
    production.run(read('service_worker.js'));
    assert(production.importedScripts.includes('graphRuntimeConfig.js'));
    assert.deepEqual(Object.keys(production.context.CaptionKeepGraphRuntimeConfig),[]);
    assert(!read('graphRuntimeConfig.js').includes('a88e99c2-2dce-45e2-9839-fa63372c18c5'));
    assert(!read('graphRuntimeConfig.js').includes('organizations'));

    const development=harness();
    development.chrome.runtime.getManifest=()=>({name:'Better CaptionKeep - Development',version:'5.3.0',version_name:'5.3.0 development'});
    development.run(read('service_worker.js'));
    assert(development.importedScripts.includes('graphRuntimeConfig.js'));
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
    const h=harness();h.run(read('configuration.js'));h.run(read('transcriptInsights.js'));h.run(read('teamsCaptionBuffer.js'));h.run(read('content_script.js'));for(let i=0;i<10;i++)await Promise.resolve();return h;
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
    h.run('capturing=true;trackingAllowed=true;');
    await h.run('processCaptionUpdates()');
    h.run('flushPendingCaptions()');
    assert.equal(h.run('transcriptArray[0].Text'),'Updated live words');
    assert.ok(!Number.isNaN(Date.parse(h.run('transcriptArray[0].capturedAt'))));
});
test('Teams recovery seed reconciles the first DOM scan without duplicating a caption',()=>{
    const context=vm.createContext({globalThis:null});context.globalThis=context;
    vm.runInContext(read('teamsCaptionBuffer.js'),context);
    const commits=[];
    const buffer=context.CaptionKeepTeamsCaptionBuffer.create({schedule:()=>1,cancel(){},
        now:()=>new Date('2026-09-25T12:00:01Z'),onCommit:(caption,isNew)=>commits.push({caption,isNew})});
    buffer.seed([{Name:'Speaker',Text:'before reload',Time:'10:00',key:'teams-caption-4',capturedAt:'2026-09-25T12:00:00Z'}]);
    const row={};
    buffer.observeSnapshot([{identity:row,Name:'Speaker',Text:'before reload',Time:'10:00'}]);
    buffer.flushAll();
    assert.equal(commits.length,0);
    buffer.observeSnapshot([{identity:row,Name:'Speaker',Text:'before reload continued',Time:'10:00'}]);
    buffer.flushAll();
    assert.equal(commits.length,1);
    assert.equal(commits[0].isNew,false);
    assert.equal(commits[0].caption.key,'teams-caption-4');
});
test('visible transient DOM loss receives a grace interval',async()=>{
    const h=await contentHarness();h.run('wasInMeeting=true;capturing=true;sourceMissingSince=Date.now()-5000;');await h.run('handleMeetingStateChange()');
    assert.equal(h.run('capturing'),true);assert(!h.messages.some(m=>m.message==='meeting_ended'));
});
test('a recent same-page checkpoint restores captions and warns about the gap',async()=>{
    const h=harness();
    h.data['active_capture_v2_teams-tab-1']={transcript:[{Name:'A',Text:'before reload',Time:'10:00',key:'teams-caption-1',capturedAt:new Date().toISOString()}],meetingTitle:'Synthetic meeting',
        recordingStartTime:new Date(Date.now()-60000).toISOString(),lastBackup:new Date().toISOString(),
        documentSessionId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',pageUrl:'https://teams.microsoft.com/',surfaceId:'teams-tab-1'};
    h.run(read('configuration.js'));h.run(read('transcriptInsights.js'));h.run(read('teamsCaptionBuffer.js'));h.run(read('content_script.js'));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.run('transcriptArray.length'),1);
    assert.equal(h.run('documentSessionId'),'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    assert.match(h.run('checkpointError'),/resumed from a recovery checkpoint/i);
});
