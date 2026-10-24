const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');

const directory = path.join(__dirname, '../teams-captions-saver');
function fixture({local = {}, managed = {}} = {}) {
    const data = structuredClone(local);
    const session = {};
    const listeners = {};
    const event = name => ({addListener:listener => {listeners[name] = listener;}});
    const area = values => ({
        async get(keys) {
            const selected = keys === null ? Object.keys(values) : typeof keys === 'string' ? [keys]
                : Array.isArray(keys) ? keys : Object.keys(keys || {});
            return structuredClone(Object.fromEntries(selected.filter(key => key in values).map(key => [key, values[key]])));
        },
        async set(updates) {Object.assign(values, structuredClone(updates));},
        async remove(keys) {for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];}
    });
    const chrome = {
        storage:{local:area(data), session:area(session), managed:area(managed), sync:area({}), onChanged:event('storage')},
        runtime:{id:'synthetic-extension', getURL:file => `chrome-extension://synthetic-extension/${file}`,
            getManifest:() => ({version:'6.0.0', name:'Better CaptionKeep'}), onInstalled:event('installed'),
            onStartup:event('startup'), onMessage:event('message')},
        tabs:{onUpdated:event('tabsUpdated'), create:async () => ({id:3})},
        action:{setBadgeText:async () => {}, setBadgeBackgroundColor:async () => {}}
    };
    let context;
    context = vm.createContext({chrome, crypto:webcrypto, Blob, URL, TextEncoder, Uint8Array,
        structuredClone, Date, btoa, atob, console:{log(){}, warn(){}, error(){}},
        importScripts(...files) {for (const file of files) vm.runInContext(fs.readFileSync(path.join(directory, file), 'utf8'), context, {filename:file});}});
    vm.runInContext(fs.readFileSync(path.join(directory, 'service_worker.js'), 'utf8'), context, {filename:'service_worker.js'});
    function send(message, sender = {id:chrome.runtime.id, url:chrome.runtime.getURL('sidepanel.html')}) {
        return new Promise(resolve => {
            const accepted = listeners.message(message, sender, result => resolve(structuredClone(result)));
            if (accepted === false) resolve({ignored:true});
        });
    }
    return {data, session, send};
}

const caption = {key:'caption-one', Name:'Synthetic speaker', Text:'Synthetic authoritative caption', Time:'10:00'};
const artifact = {kind:'live-notes', sessionId:'live-source', sourceCaptionCount:1,
    sourceTranscriptSha256:'a'.repeat(64), sourceKeys:['caption-one'], evidenceIds:['C0001'], payload:{text:'Reviewed note [C0001]'}};

test('worker returns the actual archive identity after recovery retry', async () => {
    const backupId = 'backup_11111111-1111-4111-8111-111111111111';
    const f = fixture({local:{[backupId]:{transcript:[caption], recordingStartTime:'2026-10-14T00:00:00Z', meetingTitle:'Synthetic recovery'}}});
    const response = await f.send({message:'retry_archive', sessionId:backupId});
    assert.equal(response.ok, true);
    assert.equal(response.sessionId, f.data.session_index[0].id);
    assert.equal(f.data[backupId], undefined);
});

test('worker denies persistent reviewed artifacts for a live source when history retention is disabled', async () => {
    const f = fixture({managed:{disableSessionHistory:true}, local:{
        active_capture_v3_meet_surface:{recordingStartTime:'live-source', transcript:[caption]}}});
    const response = await f.send({message:'save_derived_artifact', sessionId:'live-source', artifact});
    assert.equal(response.ok, false);
    assert.match(response.error, /retention is disabled/);
    assert.equal(f.data['derived_artifacts_live-source'], undefined);
});

test('worker retains approved reviewed artifacts when source and retention policy allow them', async () => {
    const f = fixture({local:{active_capture_v3_meet_surface:{recordingStartTime:'live-source', transcript:[caption]}}});
    const response = await f.send({message:'save_derived_artifact', sessionId:'live-source', artifact});
    assert.equal(response.ok, true);
    assert.equal(response.artifact.sessionId, 'live-source');
    assert.equal(f.data['derived_artifacts_live-source'].length, 1);
});

test('content scripts and other extension identities cannot mutate privileged stored derivatives', async () => {
    const f = fixture({local:{active_capture_v3_meet_surface:{recordingStartTime:'live-source', transcript:[caption]}}});
    const request = {message:'save_derived_artifact', sessionId:'live-source', artifact};
    assert.equal((await f.send(request, {id:'another-extension', url:'chrome-extension://another-extension/page.html'})).ignored, true);
    assert.equal((await f.send(request, {id:'synthetic-extension', url:'https://meet.google.com/synthetic', tab:{id:4}})).ignored, true);
    assert.equal(f.data['derived_artifacts_live-source'], undefined);
});

test('worker permits only the explicit canned unestablished answer without citations', async () => {
    const f = fixture({local:{active_capture_v3_meet_surface:{recordingStartTime:'live-source', transcript:[caption]}}});
    const unanswered = {...artifact, kind:'answer', evidenceIds:[], sourceKeys:[],
        payload:{question:'Synthetic question', text:'The transcript does not establish an answer.', notEstablished:true}};
    assert.equal((await f.send({message:'save_derived_artifact', sessionId:'live-source', artifact:unanswered})).ok, true);
    const forged = {...unanswered, payload:{...unanswered.payload, text:'An unsupported conclusion.'}};
    const response = await f.send({message:'save_derived_artifact', sessionId:'live-source', artifact:forged});
    assert.equal(response.ok, false);
    assert.match(response.error, /standard response/);
    const ordinary = {...unanswered, payload:{text:'An unsupported conclusion.'}};
    assert.equal((await f.send({message:'save_derived_artifact', sessionId:'live-source', artifact:ordinary})).ok, false);
});

test('a caller cannot invent caption capacity or references beyond the authoritative source', async () => {
    const f = fixture({local:{active_capture_v3_meet_surface:{recordingStartTime:'live-source', transcript:[caption]}}});
    const forged = {...artifact, sourceCaptionCount:9999, evidenceIds:['C9999'], payload:{text:'Invented evidence [C9999]'}};
    const response = await f.send({message:'save_derived_artifact', sessionId:'live-source', artifact:forged});
    assert.equal(response.ok, false);
    assert.equal(f.data['derived_artifacts_live-source'], undefined);
});

test('a generic derivative save cannot bypass managed screenshot masking restrictions', async () => {
    const f = fixture({managed:{forceScrubbedExport:true},local:{
        active_capture_v3_meet_surface:{recordingStartTime:'live-source',transcript:[caption]}}});
    const moment = {...artifact,kind:'moment',payload:{screenshot:'data:image/png;base64,AA=='}};
    const response = await f.send({message:'save_derived_artifact',sessionId:'live-source',artifact:moment});
    assert.equal(response.ok,false);
    assert.equal(f.data['derived_artifacts_live-source'],undefined);
});
