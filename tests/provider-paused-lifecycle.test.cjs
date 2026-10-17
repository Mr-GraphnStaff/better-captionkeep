const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const read = file => fs.readFileSync(path.join(__dirname,'../teams-captions-saver',file),'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

for (const provider of ['googleMeet','zoom']) {
    for (const rejoin of [false,true]) {
    test(`${provider} ${rejoin?'observes meeting transitions while paused':'preserves the current meeting across pause/resume'} without capturing or enabling captions`,async()=>{
        const observers=[];
        const data={};
        const archives=[];
        const coordinators=[];
        let descriptor;
        let settingsChanged;
        let tick=0;
        let sourceNode;
        let controls=[];
        let enabledClicks=0;
        const captionSource=text=>provider==='zoom'?{textContent:text,children:[{tagName:'SPAN',textContent:text}]}:{textContent:text,children:[{children:[
            {textContent:'Synthetic speaker',children:[{tagName:'IMG'}]}, {textContent:text}
        ]}]};
        sourceNode=captionSource('Meeting A caption');
        const window={location:{href:provider==='googleMeet'?'https://meet.google.com/abc-defg-hij':'https://app.zoom.us/wc/123456789/join'},
            addEventListener() {},removeEventListener() {}};
        const document={title:'Synthetic meeting A',body:{},querySelector:()=>sourceNode,querySelectorAll:()=>controls};
        class Observer {
            constructor(callback) {this.callback=callback;observers.push(this);}
            observe(target) {this.target=target;this.active=true;}
            disconnect() {this.active=false;}
        }
        const area={async get(keys) {
            return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,data[key]]));
        },async set(values) {Object.assign(data,structuredClone(values));},async remove(key) {delete data[key];}};
        const chrome={storage:{local:area,sync:area,onChanged:{addListener(callback) {settingsChanged=callback;}}},runtime:{
            onMessage:{addListener() {}},async sendMessage(message) {
                if (message.message==='get_capture_surface') return {ok:true,surfaceId:'synthetic-tab-4'};
                if (message.message==='save_session_history') archives.push(structuredClone(message));
                return {ok:true};
            }}};
        const registry={register(value) {descriptor=value;},create:()=>descriptor.create({document,window,MutationObserver:Observer,
            now:()=>new Date(1700000000000+tick++*2000)}),normalizeCaption:value=>({...value})};
        const context=vm.createContext({URL,Date,document,window,MutationObserver:Observer,chrome,crypto:webcrypto,
            console:{log() {},error() {}},CaptionKeepProviderRegistry:registry,
            CaptionKeepConfiguration:{async readManaged() {return {};},applyPolicy:settings=>({settings})},
            CaptionKeepTranscriptInsights:{createAiSummaryFeature:()=>({async onMeetingEnded() {}})}});
        vm.runInContext(read(`${provider}Provider.js`),context);
        vm.runInContext(read('captureCoordinator.js'),context);
        const create=context.CaptionKeepCaptureCoordinator.create;
        context.CaptionKeepCaptureCoordinator={create(options) {
            const capture=create({...options,now:()=>new Date(1700000000000+tick++*1000)});
            coordinators.push(capture);return capture;
        }};
        vm.runInContext(read(`${provider}ContentScript.js`),context);
        await flush();
        assert.equal(coordinators[0].getTranscript()[0].Text,'Meeting A caption');
        data.trackCaptions=false;
        settingsChanged({trackCaptions:{newValue:false}},'sync');
        // Already queued mutation callbacks must not retain captions after pause.
        const oldCaptionObserver=observers.find(observer=>observer.target===sourceNode);
        sourceNode.children=captionSource('Must not capture while paused').children;
        oldCaptionObserver.callback();
        assert.equal(coordinators[0].getTranscript().length,1);
        assert.equal(coordinators[0].getTranscript()[0].Text,'Meeting A caption');
        if (!rejoin) {
            sourceNode.children=captionSource('Meeting A caption').children;
            settingsChanged({trackCaptions:{newValue:true}},'sync');
            await flush();
            assert.equal(coordinators.length,1);
            assert.equal(archives.length,0);
            assert.equal(coordinators[0].getState().captureState,'capturing');
            assert.equal(coordinators[0].getTranscript().length,1);
            assert.equal(coordinators[0].getTranscript()[0].Text,'Meeting A caption');
            return;
        }
        sourceNode=null;
        if (provider==='googleMeet') controls=[{getAttribute:()=> 'Rejoin',textContent:'Rejoin'}];
        else window.location.href='https://app.zoom.us/';
        for (const observer of [...observers]) if (observer.active && observer.target===document.body) observer.callback();
        await flush();
        window.location.href=provider==='googleMeet'?'https://meet.google.com/xyz-abcd-uvw':'https://app.zoom.us/wc/987654321/join';
        document.title='Synthetic meeting B';
        controls=[{getAttribute:()=>provider==='googleMeet'?'Leave call':'Show Captions',textContent:'',click() {enabledClicks++;}}];
        for (const observer of [...observers]) if (observer.active && observer.target===document.body) observer.callback();
        sourceNode=captionSource('Meeting B caption while paused');
        for (const observer of [...observers]) if (observer.active && observer.target===document.body) observer.callback();
        await flush();
        const beforeResume={sessions:coordinators.length,state:coordinators.at(-1).getState().captureState,
            transcript:coordinators.at(-1).getTranscript()};
        assert.equal(enabledClicks,0);
        data.trackCaptions=true;
        settingsChanged({trackCaptions:{newValue:true}},'sync');
        await flush();
        assert.equal(beforeResume.sessions,2,'paused lifecycle must isolate B: '+JSON.stringify({beforeResume,afterResume:coordinators.at(-1).getTranscript()}));
        assert.equal(beforeResume.state,'paused');
        assert.equal(beforeResume.transcript.length,0);
        assert.equal(archives.length,1);
        assert.equal(archives[0].transcriptArray[0].Text,'Meeting A caption');
        assert.equal(coordinators[1].getTranscript().length,1);
        assert.equal(coordinators[1].getTranscript()[0].Text,'Meeting B caption while paused');
        assert(!coordinators[1].getTranscript().some(caption=>caption.Text==='Meeting A caption'));
    });
    }
}
