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
    const imported = [];
    let nativeCalls = 0;
    chrome.runtime.connectNative = () => {nativeCalls++; throw new Error("Native connection is forbidden");};
    let context;
    context = vm.createContext({chrome, crypto:webcrypto, Blob, URL, TextEncoder, Uint8Array,
        structuredClone, Date, btoa, atob, console:{log(){}, warn(){}, error(){}},
        importScripts(...files) {imported.push(...files); for (const file of files) vm.runInContext(fs.readFileSync(path.join(directory, file), 'utf8'), context, {filename:file});}});
    vm.runInContext(fs.readFileSync(path.join(directory, 'service_worker.js'), 'utf8'), context, {filename:'service_worker.js'});
    function send(message, sender = {id:chrome.runtime.id, url:chrome.runtime.getURL('sidepanel.html')}) {
        return new Promise(resolve => {
            const accepted = listeners.message(message, sender, result => resolve(structuredClone(result)));
            if (accepted === false) resolve({ignored:true});
        });
    }
    return {data, session, send, imported, listeners, nativeCalls:() => nativeCalls};
}


const caption = {key:'caption-one', Name:'Synthetic speaker', Text:'Synthetic authoritative caption', Time:'10:00'};
const receipt = {id:'historical-action', kind:'action-result', sessionId:'source', sourceCaptionCount:1,
    sourceTranscriptSha256:'a'.repeat(64), sourceKeys:['caption-one'], evidenceIds:['C0001'],
    payload:{text:'Previously retained result', receipt:{jobId:'old-job'}}, status:'user-confirmed'};
const dormant = {byomcp_jobs_v1:{jobs:{'old-job':{state:'outcome-unknown'}}},
    byomcp_trusted_configuration_v1:{version:1, profiles:[]}};

test('worker rejects former MCP routes without loading modules, connecting or modifying dormant data', async () => {
    const f = fixture({local:dormant});
    assert(!f.imported.some(file => /byomcp|evidenceAction/i.test(file)));
    for (const route of ['byomcp_settings', 'byomcp_action', 'unknown_feature']) {
        for (const operation of ['status','configure','connect','invoke','pin','disconnect']) {
            assert.deepEqual(await f.send({message:route, operation}), {ok:false,error:'unsupported-operation'});
        }
    }
    f.listeners.storage({byomcp_jobs_v1:{newValue:{jobs:{}}}}, 'local');
    f.listeners.storage({byomcpEnabled:{newValue:true}}, 'sync');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.nativeCalls(), 0);
    assert.deepEqual(f.data, dormant);
});

test('unsupported messages retain sender isolation and supported capture routing', async () => {
    const f = fixture();
    assert.deepEqual(await f.send({message:'unknown_feature'}, {id:'another-extension'}), {ignored:true});
    assert.deepEqual(await f.send({message:'get_capture_surface',providerId:'meet'},
        {id:'synthetic-extension',url:'https://meet.google.com/synthetic',tab:{id:9}}),
        {ok:true,surfaceId:'meet-tab-9'});
    assert.equal(f.nativeCalls(), 0);
});

test('historical receipts remain readable and individually removable; new receipts cannot be forged', async () => {
    const f = fixture({local:{...dormant,
        active_capture_v3_meet_surface:{recordingStartTime:'source',transcript:[caption]},
        derived_artifacts_source:[receipt]}});
    const read = await f.send({message:'get_derived_artifacts',sessionId:'source'});
    assert.equal(read.ok, true);
    assert.equal(read.artifacts[0].payload.text, receipt.payload.text);
    assert.equal(read.artifacts[0].kind, 'action-result');
    const saved = await f.send({message:'save_derived_artifact',sessionId:'source',artifact:{...receipt,id:'forged'}});
    assert.equal(saved.ok, false);
    assert.match(saved.error, /not supported/);
    assert.equal(f.data.derived_artifacts_source.length, 1);
    const removed = await f.send({message:'delete_derived_artifact',sessionId:'source',artifactId:receipt.id});
    assert.equal(removed.ok, true);
    assert.deepEqual(f.data.derived_artifacts_source, []);
    assert.deepEqual(f.data.byomcp_jobs_v1, dormant.byomcp_jobs_v1);
    assert.equal(f.nativeCalls(), 0);
});

test('ordinary source deletion clears associated receipts and markers while preserving dormant MCP records', async () => {
    const f = fixture({local:{...dormant,
        transcriptBackup:{recordingStartTime:'source',transcript:[caption]},
        derived_artifacts_source:[receipt], derived_artifacts_other:[{...receipt,sessionId:'other'}],
        evidenceBoardMarkersV1:[{id:'own',sessionId:'source'},{id:'other',sessionId:'other'}]}});
    const result = await f.send({message:'delete_session',sessionId:'transcriptBackup'});
    assert.equal(result.ok, true);
    assert.equal(f.data.transcriptBackup, undefined);
    assert.equal(f.data.derived_artifacts_source, undefined);
    assert.equal(f.data.derived_artifacts_other.length, 1);
    assert.deepEqual(f.data.evidenceBoardMarkersV1.map(item => item.id), ['other']);
    assert.deepEqual(f.data.byomcp_jobs_v1, dormant.byomcp_jobs_v1);
    assert.deepEqual(f.data.byomcp_trusted_configuration_v1, dormant.byomcp_trusted_configuration_v1);
    assert.equal(f.nativeCalls(), 0);
});
