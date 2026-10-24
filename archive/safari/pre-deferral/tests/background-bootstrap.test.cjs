const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {readFileSync, mkdtempSync, rmSync} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');

const project = path.resolve(__dirname, '..');
const isolatedDist = mkdtempSync(path.join(os.tmpdir(),'captionkeep-bootstrap-build-'));
const read = (directory, file) => readFileSync(path.join(directory, file), 'utf8');

before(() => {
    for (const target of ['firefox', 'safari']) {
        execFileSync(process.execPath, ['scripts/build-browser-targets.mjs', target], {
            cwd:project,env:{...process.env,CAPTIONKEEP_TEST_DIST:isolatedDist}
        });
    }
});
after(() => rmSync(isolatedDist,{recursive:true,force:true}));

function background(directory, worker) {
    const listeners = {};
    const event = name => ({addListener(listener) { listeners[name] = listener; }});
    const area = {async get() { return {}; }, async set() {}, async remove() {}};
    const chrome = {
        runtime: {id:'bootstrap-test', getURL:file => `extension://bootstrap-test/${file}`,
            onMessage:event('message'), onInstalled:event('installed'), onStartup:event('startup')},
        tabs: {onUpdated:event('tabUpdated')},
        storage: {local:area, sync:area, session:area, managed:area, onChanged:event('storageChanged')},
        action: {async setBadgeText() {}, async setBadgeBackgroundColor() {}}
    };
    const context = vm.createContext({chrome, crypto:webcrypto, console, URL, Blob, TextEncoder,
        Uint8Array, btoa, atob, structuredClone});
    const loaded = [];
    const execute = file => {
        loaded.push(file);
        vm.runInContext(read(directory, file), context, {filename:file});
    };
    if (worker) context.importScripts = (...files) => files.forEach(execute);
    else context.document = {}; // Document backgrounds deliberately have no importScripts.
    return {context, execute, listeners, loaded};
}

function assertInitialized(instance) {
    assert.equal(typeof instance.context.CaptionKeepConfiguration, 'object');
    assert.equal(typeof instance.context.CaptionKeepGraphTranscript, 'object');
    assert.equal(typeof instance.context.CaptionKeepDerivedArtifacts, 'object');
    assert.equal(typeof instance.listeners.installed, 'function');
    assert.equal(typeof instance.listeners.startup, 'function');
    let response;
    instance.listeners.message({message:'get_capture_surface', providerId:'google-meet'},
        {id:'bootstrap-test', tab:{id:23}}, result => { response = result; });
    assert.equal(response.ok, true);
    assert.equal(response.surfaceId, 'google-meet-tab-23');
}

for (const target of ['firefox', 'safari']) {
    test(`${target} document background executes packaged dependencies and handles capture messages`, () => {
        const directory = path.join(isolatedDist, 'prod', `${target}-unpacked`);
        const manifest = JSON.parse(read(directory, 'manifest.json'));
        assert.equal(manifest.manifest_version, 3);
        assert.equal(manifest.background.scripts.at(-1), 'service_worker.js');
        const instance = background(directory, false);
        for (const file of manifest.background.scripts) instance.execute(file);
        assertInitialized(instance);
        assert.equal(new Set(instance.loaded).size, instance.loaded.length);
    });
}

test('worker background loads dependencies synchronously and handles capture messages', () => {
    const instance = background(path.join(project, 'teams-captions-saver'), true);
    instance.execute('service_worker.js');
    assertInitialized(instance);
    const manifest = JSON.parse(read(path.join(isolatedDist,'prod/firefox-unpacked'),'manifest.json'));
    assert.deepEqual(instance.loaded.slice(1), manifest.background.scripts.slice(0, -1));
});

test('Safari packaged worker fallback loads the same dependencies as its document background', () => {
    const directory = path.join(isolatedDist, 'prod/safari-unpacked');
    const manifest = JSON.parse(read(directory, 'manifest.json'));
    const instance = background(directory, true);
    instance.execute(manifest.background.service_worker);
    assertInitialized(instance);
    assert.deepEqual(instance.loaded.slice(1), manifest.background.scripts.slice(0, -1));
});
