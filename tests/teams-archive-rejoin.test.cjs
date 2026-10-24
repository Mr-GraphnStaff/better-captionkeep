const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const source = file => fs.readFileSync(path.join(__dirname,'../teams-captions-saver',file),'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function harness() {
    const data = {};
    const archives = [];
    const messages = [];
    let releaseArchive;
    const area = {async get(keys) {
        if (keys === null) return {...data};
        return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key=>[key,data[key]]));
    },async set(values) {Object.assign(data,structuredClone(values));},async remove(keys) {
        for (const key of (Array.isArray(keys) ? keys : [keys])) delete data[key];
    }};
    const chrome = {storage:{local:area,sync:area,session:area,managed:area,onChanged:{addListener() {}}},
        runtime:{onMessage:{addListener() {}},async sendMessage(message) {
            messages.push(structuredClone(message));
            if (message.message === 'get_capture_surface') return {ok:true,surfaceId:'teams-tab-9'};
            if (message.message === 'save_session_history') {
                archives.push(structuredClone(message));
                return new Promise(resolve => {releaseArchive=()=>resolve({ok:true});});
            }
            return {ok:true};
        }}};
    const document = {title:'Synthetic Teams meeting',hidden:false,body:{},querySelector:()=>null,
        querySelectorAll:()=>[],contains:()=>true,addEventListener() {}};
    const context = vm.createContext({chrome,document,URL,Date,crypto:webcrypto,
        console:{log() {},error() {},warn() {}},window:{location:{href:'https://teams.microsoft.com/'},addEventListener() {}},
        setInterval:()=>1,clearInterval() {},setTimeout:()=>1,clearTimeout() {},
        MutationObserver:class {observe() {} disconnect() {}}});
    for (const file of ['configuration.js','transcriptInsights.js','teamsCaptionBuffer.js','content_script.js']) {
        vm.runInContext(source(file),context,{filename:file});
    }
    await flush();
    return {context,data,archives,messages,document,area,run:code=>vm.runInContext(code,context),releaseArchive:()=>releaseArchive()};
}

test('slow completed Teams archive keeps its original source and cannot delete a rejoined capture checkpoint',async()=>{
    const h=await harness();
    h.run(`documentSessionId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      recordingStartTime=new Date('2026-10-14T10:00:00Z');meetingTitleOnStart='First meeting';
      transcriptArray.push({key:'first',Name:'Speaker',Text:'First transcript',Time:'10:00'});
      attendeeData.allAttendees.add('First attendee');
      globalThis.completed=captureBackupSnapshot();globalThis.archive=saveToSessionHistory(completed);`);
    await flush();
    assert.equal(h.archives.length,1);
    h.run(`documentSessionId='bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
      recordingStartTime=new Date('2026-10-14T10:01:00Z');meetingTitleOnStart='Second meeting';
      transcriptArray.splice(0,transcriptArray.length,{key:'second',Name:'Speaker',Text:'Second transcript',Time:'10:01'});
      attendeeData.allAttendees.clear();attendeeData.allAttendees.add('Second attendee');`);
    await h.run('persistBackup()');
    h.releaseArchive();
    await h.run('archive');
    assert.equal(h.archives[0].meetingTitle,'First meeting');
    assert.equal(h.archives[0].transcriptArray[0].Text,'First transcript');
    assert.equal(h.archives[0].attendeeReport.attendeeList[0],'First attendee');
    assert.equal(h.archives[0].backupKey,'backup_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    const active=h.data[h.run('ACTIVE_CAPTURE_KEY')];
    assert.equal(active.documentSessionId,'bbbbbbbb-cccc-dddd-eeee-ffffffffffff');
    assert.equal(active.transcript[0].Text,'Second transcript');
});

test('fresh Teams sessions rotate recovery identity while a paused session keeps its identity',async()=>{
    const h=await harness();
    const original=h.run('documentSessionId');
    await h.run('startCaptureSession()');
    const fresh=h.run('documentSessionId');
    assert.notEqual(original,fresh);
    h.run('capturing=false;pausedByUser=true;');
    await h.run('startCaptureSession()');
    assert.equal(h.run('documentSessionId'),fresh);
});

test('canceled Teams Leave intent expires only with positive live controls and preserves capture during later source loss',async()=>{
    const h=await harness();
    const control={};
    const sourceNode={querySelectorAll:()=>[]};
    h.document.querySelectorAll=selector=>selector.includes('hangup')?[control]:selector.includes('closed-caption')?[sourceNode]:[];
    h.document.querySelector=selector=>selector.includes('closed-caption')?sourceNode:null;
    h.run("wasInMeeting=true;capturing=true;leaveRequested=true;leaveRequestedAt=Date.now()-16000;");
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('leaveRequested'),false);
    assert.equal(h.run('capturing'),true);
    h.document.querySelectorAll=()=>[];
    h.document.querySelector=()=>null;
    h.document.hidden=true;
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('capturing'),true);
    assert.equal(h.run('captureState'),'source unavailable');
});

test('aged real Teams Leave with no in-call controls ends capture even if a stale caption wrapper remains',async()=>{
    const h=await harness();
    const sourceNode={querySelectorAll:()=>[]};
    h.document.hidden=true;
    h.document.querySelectorAll=selector=>selector.includes('closed-caption')?[sourceNode]:[];
    h.document.querySelector=selector=>selector.includes('closed-caption')?sourceNode:null;
    h.run("wasInMeeting=true;capturing=true;leaveRequested=true;leaveRequestedAt=Date.now()-16000;sourceMissingSince=Date.now()-16000;");
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('capturing'),false);
    assert.equal(h.run('wasInMeeting'),false);
});

test('failed Teams badge publication retries, while an older failure cannot invalidate a newer state',async()=>{
    const h=await harness();
    h.document.querySelectorAll=()=>[{}];
    h.run('capturing=true;lastPublishedBadgeState=null;');
    let requests=0;
    h.context.chrome.runtime.sendMessage=async message=>{
        if (message.message !== 'update_badge_status') return {ok:true};
        requests++;
        if (requests===1) throw new Error('Worker temporarily unavailable');
        return {ok:true};
    };
    h.run('publishCaptureBadge()');
    await flush();
    assert.equal(h.run('lastPublishedBadgeState'),null);
    h.run('publishCaptureBadge()');
    await flush();
    assert.equal(requests,2);
    assert.equal(h.run('lastPublishedBadgeState'),true);
    let rejectOld;
    h.context.chrome.runtime.sendMessage=message=>message.message !== 'update_badge_status' ? Promise.resolve({ok:true}) : new Promise((resolve,reject)=>{
        if (!rejectOld) rejectOld=reject;else resolve({ok:true});
    });
    h.run('capturing=false;publishCaptureBadge();capturing=true;publishCaptureBadge();');
    rejectOld(new Error('Late rejection'));
    await flush();
    assert.equal(h.run('lastPublishedBadgeState'),true);
});

test('delayed old Teams checkpoint write cannot overwrite a newer meeting checkpoint',async()=>{
    const h=await harness();
    let releaseOld;
    const set=h.area.set;
    h.area.set=async values=>{
        if (Object.values(values).some(value=>value?.documentSessionId === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')) {
            await new Promise(resolve=>{releaseOld=resolve;});
        }
        await set(values);
    };
    h.run("documentSessionId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';transcriptArray.push({Name:'A',Text:'Old capture',Time:'10'});globalThis.oldWrite=persistBackup();");
    await flush();
    h.run("documentSessionId='bbbbbbbb-cccc-dddd-eeee-ffffffffffff';transcriptArray.splice(0,transcriptArray.length,{Name:'B',Text:'New capture',Time:'11'});globalThis.newWrite=persistBackup();");
    await flush();
    releaseOld();
    await h.run('Promise.all([oldWrite,newWrite])');
    const active=h.data[h.run('ACTIVE_CAPTURE_KEY')];
    assert.equal(active.documentSessionId,'bbbbbbbb-cccc-dddd-eeee-ffffffffffff');
    assert.equal(active.transcript[0].Text,'New capture');
});

test('Teams tab discard protection follows raw capture, survives source loss, and releases on stop',async()=>{
    const h=await harness();
    h.document.querySelectorAll=()=>[{}];
    h.run('wasInMeeting=true;capturing=true;publishCaptureBadge();');
    await flush();
    h.document.querySelectorAll=()=>[];
    h.document.hidden=true;
    await h.run('handleMeetingStateChange()');
    const updates=()=>h.messages.filter(message=>message.message === 'set_capture_tab_protection');
    assert.equal(updates().at(-1).active,true);
    assert.equal(updates().at(-1).sessionId,h.run('documentSessionId'));
    h.run('stopCaptureSession()');
    await flush();
    assert.equal(updates().at(-1).active,false);
    assert(updates().every(message=>message.tabId === undefined));
});

test('fresh Teams capture identity republishes protection even when the active boolean stays true',async()=>{
    const h=await harness();
    h.run("capturing=true;documentSessionId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';publishCaptureTabProtection();documentSessionId='bbbbbbbb-cccc-dddd-eeee-ffffffffffff';publishCaptureTabProtection();");
    await flush();
    const active=h.messages.filter(message=>message.message==='set_capture_tab_protection' && message.active);
    assert.deepEqual(active.map(message=>message.sessionId),['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','bbbbbbbb-cccc-dddd-eeee-ffffffffffff']);
});


function setLeaveSurfaces(h, {controls=false, dialog=null}={}) {
    const captions={querySelectorAll:()=>[]};
    h.document.querySelectorAll=selector=>selector.includes('hangup')?(controls?[{}]:[])
        :selector.includes('closed-caption')?[captions]
        :selector.includes('role=')?(dialog?[dialog]:[]):[];
    h.document.querySelector=selector=>selector.includes('closed-caption')?captions:null;
}

async function freshLeave() {
    const h=await harness();
    setLeaveSurfaces(h);
    h.run("wasInMeeting=true;capturing=true;leaveRequested=true;leaveRequestedAt=Date.now();recordingStartTime=new Date();transcriptArray.push({key:'before',Name:'Synthetic',Text:'Words before canceled Leave',Time:'10:00'});");
    return h;
}

test('fresh Teams Leave source gap and cancellation preserve the same capture without archiving',async()=>{
    const h=await freshLeave(), identity=h.run('documentSessionId');
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('capturing'),true);
    assert.equal(h.run('captureState'),'source unavailable');
    assert.equal(h.messages.filter(message=>message.message==='update_badge_status').at(-1).capturing,false);
    assert(!h.messages.some(message=>message.message==='meeting_ended'));
    setLeaveSurfaces(h,{controls:true});
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('leaveRequested'),false);
    assert.equal(h.run('capturing'),true);
    assert.equal(h.run('documentSessionId'),identity);
    assert.equal(h.run('transcriptArray[0].Text'),'Words before canceled Leave');
    assert.equal(h.archives.length,0);
    assert(!h.messages.some(message=>message.message==='meeting_ended'));
});

test('visible Teams Leave confirmation preserves capture beyond grace until cancellation restores controls',async()=>{
    const h=await freshLeave(), identity=h.run('documentSessionId');
    setLeaveSurfaces(h,{dialog:{}});
    h.run('leaveRequestedAt=Date.now()-60000;sourceMissingSince=Date.now()-60000;');
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('capturing'),true);
    assert.equal(h.run('documentSessionId'),identity);
    assert(!h.messages.some(message=>message.message==='meeting_ended'));
    assert.equal(h.messages.filter(message=>message.message==='update_badge_status').at(-1).capturing,false);
    setLeaveSurfaces(h,{controls:true});
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('leaveRequested'),false);
    assert.equal(h.run('documentSessionId'),identity);
    assert.equal(h.run('capturing'),true);
    assert.equal(h.archives.length,0);
});

test('initial post-click Teams controls cannot clear fresh Leave intent before a real departure',async()=>{
    const h=await freshLeave();
    setLeaveSurfaces(h,{controls:true});
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('leaveRequested'),true);
    assert.equal(h.run('capturing'),true);
    setLeaveSurfaces(h);
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('leaveRequested'),true);
    assert.equal(h.run('capturing'),true);
    h.run('leaveRequestedAt=Date.now()-16000;sourceMissingSince=Date.now()-16000;');
    h.document.hidden=true;
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('capturing'),false);
    assert(h.messages.some(message=>message.message==='meeting_ended'));
    assert.equal(h.run('transcriptArray[0].Text'),'Words before canceled Leave');
});

test('confirmed Teams Leave after a long dialog finalizes once the dialog disappears despite stale captions',async()=>{
    const h=await freshLeave();
    setLeaveSurfaces(h,{dialog:{}});
    h.run('leaveRequestedAt=Date.now()-60000;sourceMissingSince=Date.now()-60000;');
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('capturing'),true);
    setLeaveSurfaces(h);
    await h.run('handleMeetingStateChange()');
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('capturing'),false);
    assert.equal(h.messages.filter(message=>message.message==='meeting_ended').length,1);
    assert.equal(h.run('transcriptArray.length'),1);
});

test('a visible dialog without Teams Leave intent does not override normal visible source-loss timeout',async()=>{
    const h=await freshLeave();
    h.document.querySelectorAll=selector=>selector.includes('role=')?[{}]:[];
    h.document.querySelector=()=>null;
    h.run('leaveRequested=false;leaveRequestedAt=0;sourceMissingSince=Date.now()-60000;');
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('capturing'),false);
    assert.equal(h.messages.filter(message=>message.message==='meeting_ended').length,1);
});

test('DOM-hidden confirmation remnants cannot prevent an aged real Teams Leave',async()=>{
    const h=await freshLeave();
    setLeaveSurfaces(h,{dialog:{closest:()=>({hidden:true})}});
    h.run('leaveRequestedAt=Date.now()-16000;sourceMissingSince=Date.now()-16000;');
    await h.run('handleMeetingStateChange()');
    assert.equal(h.run('capturing'),false);
    assert(h.messages.some(message=>message.message==='meeting_ended'));
});


test('visible post-call dialogs cannot defer Teams archiving beyond the source-gap hold, even when hidden',async()=>{
    for (const hidden of [false,true]) {
        const h=await freshLeave();
        h.document.hidden=hidden;
        h.data.autoSaveOnEnd=true;
        setLeaveSurfaces(h,{dialog:{}});
        h.run('leaveRequestedAt=Date.now()-600000;sourceMissingSince=Date.now()-TIMING.LEAVE_CONFIRMATION_MAX_HOLD+1000;');
        await h.run('handleMeetingStateChange()');
        await flush();
        assert.equal(h.run('capturing'),true,'visible confirmation is retained before its bounded deadline');
        assert.equal(h.messages.filter(message=>message.message==='update_badge_status').at(-1).capturing,false);
        assert.equal(h.archives.length,0);
        assert(!h.messages.some(message=>message.message==='meeting_ended'));
        h.run('sourceMissingSince=Date.now()-TIMING.LEAVE_CONFIRMATION_MAX_HOLD-1;');
        await h.run('handleMeetingStateChange()');
        await flush();
        assert.equal(h.run('capturing'),false,'a residual visible dialog cannot keep a departed session alive forever');
        assert.equal(h.messages.filter(message=>message.message==='meeting_ended').length,1);
        assert.equal(h.messages.filter(message=>message.message==='save_on_leave').length,1);
        assert.equal(h.archives.length,1);
        assert.equal(h.archives[0].transcriptArray[0].Text,'Words before canceled Leave');
        await h.run('handleMeetingStateChange()');
        await flush();
        assert.equal(h.archives.length,1,'later polls do not duplicate the completed archive');
    }
});

test('old Teams Leave intent does not bypass a newly observed source-gap grace',async()=>{
    for (const hidden of [false,true]) {
        const h=await freshLeave();
        h.document.hidden=hidden;
        h.run('leaveRequestedAt=Date.now()-600000;sourceMissingSince=null;');
        await h.run('handleMeetingStateChange()');
        await flush();
        assert.equal(h.run('capturing'),true,'elapsed time since the click is not elapsed source loss');
        assert(!h.messages.some(message=>message.message==='meeting_ended'));
        assert.equal(h.messages.filter(message=>message.message==='update_badge_status').at(-1).capturing,false);
        h.run('sourceMissingSince=Date.now()-16000;');
        await h.run('handleMeetingStateChange()');
        await flush();
        assert.equal(h.run('capturing'),false,'a source gap past normal grace without a modal eventually finalizes');
        assert.equal(h.messages.filter(message=>message.message==='meeting_ended').length,1);
    }
});
