const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const read = file => fs.readFileSync(path.join(__dirname,'../teams-captions-saver',file),'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

for (const provider of ['googleMeet','zoom']) {
    test(`${provider} terminal callbacks can reconcile without recursion and emit a fresh rejoin`, () => {
        const observers = [];
        let descriptor;
        let source = {children:[],textContent:''};
        let controls = [];
        const window = {location:{href:provider === 'googleMeet' ? 'https://meet.google.com/abc-defg-hij' : 'https://app.zoom.us/wc/123456789/join'},
            addEventListener() {},removeEventListener() {}};
        const document = {body:{},querySelector:()=>source,querySelectorAll:()=>controls};
        class Observer {constructor(callback) {this.callback=callback;observers.push(this);} observe() {} disconnect() {}}
        const context = vm.createContext({URL,Date,document,window,MutationObserver:Observer,
            CaptionKeepProviderRegistry:{register(value) {descriptor=value;}}});
        vm.runInContext(read(`${provider}Provider.js`),context);
        const adapter = descriptor.create({document,window,MutationObserver:Observer});
        const events = [];
        adapter.start(event => {
            events.push(event.type);
            if (event.type === 'meeting-ended') {
                if (events.filter(type=>type === 'meeting-ended').length > 2) throw new Error('Recursive terminal transition');
                adapter.setAutoEnableCaptions(true);
            }
        });
        source = null;
        if (provider === 'googleMeet') controls = [{getAttribute:()=> 'Rejoin',textContent:'Rejoin'}];
        else window.location.href = 'https://app.zoom.us/';
        observers[0].callback();
        assert.equal(events.filter(type=>type === 'meeting-ended').length,1);
        assert.equal(adapter.isMeetingPresent(),false);
        source = {children:[],textContent:''};
        controls=[];
        window.location.href = provider === 'googleMeet' ? 'https://meet.google.com/abc-defg-hij' : 'https://app.zoom.us/wc/123456789/join';
        observers[0].callback();
        assert.equal(events.filter(type=>type === 'meeting-started').length,1);
        assert.equal(adapter.isMeetingPresent(),true);
        assert(events.lastIndexOf('meeting-started') < events.lastIndexOf('caption-source-available'));
    });

    test(`${provider} SPA rejoin archives the old capture before creating an isolated new capture`, async () => {
        const data = {};
        const archived = [];
        const coordinators = [];
        let emit;
        let listener;
        let tick = 0;
        const area = {async get(key) {return {[key]:data[key]};},async set(values) {Object.assign(data,structuredClone(values));},
            async remove(key) {delete data[key];}};
        const adapter = {start(handler) {emit=handler;},stop() {},setAutoEnableCaptions() {},restoreState() {},
            isMeetingPresent:()=>true,getCaptionSource:()=>({})};
        const chrome = {storage:{local:area,sync:area,onChanged:{addListener() {}}},runtime:{
            onMessage:{addListener(handler) {listener=handler;}},async sendMessage(message) {
                if (message.message === 'get_capture_surface') return {ok:true,surfaceId:'provider-tab-7'};
                if (message.message === 'save_session_history') archived.push(structuredClone(message));
                return {ok:true};
            }}};
        const context = vm.createContext({URL,Date,chrome,crypto:webcrypto,console:{error() {},log() {}},
            document:{title:'Synthetic meeting'},window:{location:{href:'https://meet.google.com/abc-defg-hij'},addEventListener() {}},
            MutationObserver:class{},CaptionKeepProviderRegistry:{create:()=>adapter,normalizeCaption:value=>({...value})},
            CaptionKeepTranscriptInsights:{createAiSummaryFeature:()=>({async onMeetingEnded() {}})},
            CaptionKeepConfiguration:{async readManaged() {return {};},applyPolicy:settings=>({settings})}});
        vm.runInContext(read('captureCoordinator.js'),context);
        const create = context.CaptionKeepCaptureCoordinator.create;
        context.CaptionKeepCaptureCoordinator = {create(options) {
            const capture = create({...options,now:()=>new Date(1700000000000 + tick++ * 1000)});
            coordinators.push(capture);
            return capture;
        }};
        vm.runInContext(read(`${provider}ContentScript.js`),context);
        await flush();
        emit({type:'caption-source-available'});
        emit({type:'caption-upsert',caption:{key:'caption-1',Name:'Speaker',Text:'First meeting',capturedAt:'2026-10-14T10:00:00Z'}});
        await flush();
        emit({type:'meeting-ended'});
        emit({type:'meeting-started'});
        emit({type:'caption-source-available'});
        emit({type:'caption-upsert',caption:{key:'caption-1',Name:'Speaker',Text:'Second meeting',capturedAt:'2026-10-14T10:01:00Z'}});
        await flush();
        await coordinators.at(-1).whenIdle();
        assert.equal(archived.length,1);
        assert.equal(archived[0].transcriptArray[0].Text,'First meeting');
        assert.equal(coordinators.length,2);
        assert.equal(coordinators[0].getState().finalized,true);
        assert.notEqual(coordinators[0].getState().recordingStartTime,coordinators[1].getState().recordingStartTime);
        assert.equal(coordinators[1].getTranscript().length,1);
        assert.equal(coordinators[1].getTranscript()[0].Text,'Second meeting');
        let status;
        listener({message:'get_status'}, {}, value=>{status=value;});
        assert.equal(status.capturing,true);
        assert.equal(status.captionCount,1);
        assert.equal(data[coordinators[1].activeCaptureKey].transcript[0].Text,'Second meeting');
    });
}
