const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {existsSync} = require('node:fs');
const {mkdtemp,rm} = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {statusView, inventoryView, parseConfiguration, createController} = require('../teams-captions-saver/byomcpSettings.js');
const profile = {id:'test-profile', label:'Synthetic profile', transport:'stdio', revision:1, verified:true};
const tool = {name:'captionkeep_get_caption_sources', schemaDigest:'a'.repeat(64), compatible:true, approved:true, profileGrantId:'synthetic-grant', effect:'read'};
const status = {ok:true, status:{protocolVersion:1, helperVersion:'0.1', enrollmentVerified:true, enabled:false, profiles:[profile]}};
test('BYOMCP settings defaults off without checking or invoking a helper', () => {
    let sends = 0; const controller = createController({send:() => {sends++;}, policy:async () => ({})});
    assert.equal(controller.getState().enabled,false); assert.equal(sends,0);
    assert.equal(controller.getState().verified,false);
});
test('missing, unsupported and unverified helper responses never appear connected', () => {
    for (const response of [undefined, {}, {ok:true,status:{...status.status,enrollmentVerified:false}}, {ok:true,status:{...status.status,protocolVersion:2}}]) {
        assert.equal(statusView(response).verified,false); assert.equal(statusView(response).enabled,false);
    }
    assert.match(statusView({code:'not-installed'}).label,/not installed/);
});
test('managed denial prevents all helper calls and keeps Core independent', async () => {
    let sends = 0; const controller = createController({send:async () => {sends++;},policy:async () => ({disableByomcp:true})});
    await assert.rejects(controller.check(),/organization/); assert.equal(sends,0);
    assert.equal(controller.getState().enabled,false); assert.match(controller.getState().label,/Local capture remains available/);
});
test('policy check failure never releases a helper request', async () => {
    let sends = 0; const controller = createController({send:async () => {sends++;},policy:async () => {throw new Error('unavailable');}});
    await assert.rejects(controller.check()); assert.equal(sends,0);
});
test('inventory is revision bound and requires compatible approved grants, not tool annotations', () => {
    const response = {ok:true,inventory:{profileId:profile.id,revision:1,tools:[tool]}};
    assert.equal(inventoryView(response,profile).length,1);
    assert.equal(inventoryView({ok:true,inventory:{...response.inventory,tools:[{...tool,effect:'write'}]}},profile)[0].effect,'write');
    for (const inventory of [{...response.inventory,revision:2}, {...response.inventory,tools:[{...tool,approved:false,readOnlyHint:true}]},
        {...response.inventory,tools:[{...tool,compatible:false}]}, {...response.inventory,tools:[{...tool,profileGrantId:''}]},
        {...response.inventory,tools:[{...tool,schemaDigest:'bad'}]}, {...response.inventory,tools:Array(101).fill(tool)}])
        assert.throws(() => inventoryView({ok:true,inventory},profile));
});
test('status and inventory requests send no transcript, URL, token or arbitrary tool arguments', async () => {
    const calls = []; const controller = createController({policy:async () => ({}), send:async message => {
        calls.push(message); return message.operation === 'status' ? status : {ok:true,inventory:{profileId:profile.id,revision:1,tools:[tool]}};
    }});
    await controller.check(); await controller.review(profile.id);
    assert.deepEqual(calls,[{message:'byomcp_settings',operation:'status'}, {message:'byomcp_settings',operation:'inventory',profileId:profile.id,revision:1}]);
    assert.equal(controller.getState().reviewed.tools.length,1); assert.equal(controller.getState().enabled,false);
    assert.equal(typeof controller.invoke,'undefined');
});
test('repeat checking invalidates prior reviewed inventory and filters unsafe profiles', async () => {
    let current = status; const controller = createController({policy:async () => ({}),send:async message => message.operation === 'status' ? current
        : {ok:true,inventory:{profileId:profile.id,revision:1,tools:[tool]}}});
    await controller.check(); await controller.review(profile.id);
    current = {ok:true,status:{...status.status,profiles:[{...profile,id:'https://secret.example/?token=secret'}, {...profile,verified:false}]}};
    await controller.check(); assert.equal(controller.getState().reviewed,null); assert.equal(controller.getState().profiles.length,0);
});
test('settings markup has no credential, endpoint or command entry and preserves disclosure', () => {
    const html = readFileSync(require.resolve('../teams-captions-saver/popup.html'),'utf8');
    const section = html.split('id="byomcp-settings"')[1].split('id="privacy-settings"')[0];
    assert(!/type="(?:password|text|url)"/.test(section)); assert(section.includes('aria-live="polite"'));
    assert(section.includes('type="file" accept=".json,application/json"'));
    assert(section.includes('I reviewed this non-secret helper configuration'));
    assert(section.includes('Nothing from your meetings is sent'));
    assert(section.includes('id="byomcp-review" type="button" disabled'));
});

test('explicit connection requires granted browser permission and a fresh policy check', async () => {
    const calls = []; let denied = false;
    const controller = createController({policy:async () => ({disableByomcp:denied}),send:async message => {
        calls.push(message); return {...status,status:{...status.status,enabled:true}};
    }});
    await assert.rejects(controller.connect(Promise.resolve(false)),/not granted/); assert.equal(calls.length,0);
    denied = true; await assert.rejects(controller.connect(Promise.resolve(true)),/organization/); assert.equal(calls.length,0);
    denied = false; await controller.connect(Promise.resolve(true));
    assert.deepEqual(calls,[{message:'byomcp_settings',operation:'connect'}]); assert.equal(controller.getState().enabled,true);
});

test('configuration import validates size and JSON without sending invalid or unreviewed data', async () => {
    const calls = []; let denied = false;
    const controller = createController({policy:async () => ({disableByomcp:denied}),send:async message => {calls.push(message); return {ok:true};}});
    for (const text of ['no json','[]','null','"scalar"',' '.repeat(128*1024+1)]) assert.throws(() => parseConfiguration(text));
    await assert.rejects(controller.configure('{}',false),/Review/); assert.equal(calls.length,0);
    denied = true; await assert.rejects(controller.configure('{}',true),/organization/); assert.equal(calls.length,0);
    denied = false; await controller.configure('{"version":1}',true);
    assert.deepEqual(calls,[{message:'byomcp_settings',operation:'configure',configuration:{version:1}}]);
    assert.equal(controller.getState().enabled,false); assert.equal(controller.getState().verified,false);
    assert.match(controller.getState().label,/Connection remains off/);
});

test('configuration failures do not reflect raw backend messages or configuration', async () => {
    const controller = createController({policy:async () => ({}),send:async () => ({ok:false,detail:'secret-private-fixture'})});
    await assert.rejects(controller.configure('{}',true),error => !error.message.includes('secret-private-fixture'));
    assert.match(statusView({code:'configuration-required'}).label,/Setup required/);
    assert.match(statusView({code:'not-connected'}).label,/not connected/);
});

test('write consent defaults off, requires fresh policy, and import resets it without executing', async () => {
    const calls=[]; let denied=false;
    const controller=createController({policy:async()=>({disableByomcpWrites:denied}),send:async message=>{
        calls.push(message); return {ok:true,enabled:message.enabled===true};
    }});
    assert.notEqual(controller.getState().allowWrites,true);
    denied=true; await assert.rejects(controller.allowWrites(true),/organization/); assert.equal(calls.length,0);
    denied=false; await controller.allowWrites(true); assert.equal(controller.getState().allowWrites,true);
    await controller.allowWrites(false); assert.equal(controller.getState().allowWrites,false);
    await controller.allowWrites(true); await controller.configure('{}',true); assert.notEqual(controller.getState().allowWrites,true);
    assert(calls.every(message=>['allow-writes','configure'].includes(message.operation)));
});

test('workspace source hashing dependencies precede workspace and main script', () => {
    const html = readFileSync(require.resolve('../teams-captions-saver/sidepanel.html'),'utf8');
    for (const file of ['correctionManager.js','evidenceActionContracts.js','byomcpWorkerBridge.js']) {
        assert.equal(html.split(`src="${file}"`).length,2);
        assert(html.indexOf(`src="${file}"`) < html.indexOf('src="byomcpWorkspace.js"'));
    }
});
test('actual Chrome renders off-by-default BYOMCP enrollment and fails closed on absent backend', {skip:!existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')}, async () => {
    const {runChromiumSurface} = await import('../scripts/rendered-surface-checks.mjs');
    const temporary = await mkdtemp(path.join(os.tmpdir(),'byomcp-settings-render-'));
    try {
        const result = await runChromiumSurface('C:/Program Files/Google/Chrome/Application/chrome.exe',path.resolve(__dirname,'../teams-captions-saver'),path.join(temporary,'settings.png'), {
            afterSurface:async (surface,cdp) => {
                if (surface !== 'settings') return null;
                const evaluated = await cdp.send('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression:`(async () => {
                    const checks=[], add=(name,passed)=>checks.push({name,passed:!!passed});
                    const section=document.getElementById('byomcp-settings'); section.open=true;
                    section.scrollIntoView();
                    add('BYOMCP remains in advanced Settings',!!section.closest('.settings-container') && document.documentElement.dataset.view==='settings');
                    add('Verified profile controls initially disabled',document.getElementById('byomcp-profile').disabled && document.getElementById('byomcp-review').disabled);
                    const calls=[]; chrome.runtime.sendMessage=async message=>{calls.push(message); return {};};
                    chrome.storage.managed.get=async()=>({});
                    const check=document.getElementById('byomcp-check'); check.focus(); check.click(); await new Promise(resolve=>setTimeout(resolve,30));
                    add('Missing worker contract is visibly unsupported, not connected',/cannot verify/.test(document.getElementById('byomcp-status').textContent) && document.getElementById('byomcp-profile').disabled);
                    add('Checking only sends status, never evidence or invocation',calls.length===1 && calls[0].operation==='status' && Object.keys(calls[0]).length===2);
                    add('Operation restores reachable keyboard focus',document.activeElement===check && !check.disabled);
                    chrome.storage.managed.get=async()=>({disableByomcp:true}); check.click(); await new Promise(resolve=>setTimeout(resolve,30));
                    add('Managed denial does not contact helper',calls.length===1 && /organization/.test(document.getElementById('byomcp-status').textContent));
                    chrome.storage.managed.get=async()=>({}); check.click(); await new Promise(resolve=>setTimeout(resolve,30));
                    const ordered=[];
                    chrome.permissions={request:options=>{ordered.push('permission'); return Promise.resolve(options.permissions[0]==='nativeMessaging');}};
                    chrome.runtime.sendMessage=async message=>{
                        ordered.push(message.operation);
                        return message.operation==='connect' ? {ok:true,status:{protocolVersion:1,enrollmentVerified:true,enabled:true,helperVersion:'synthetic',profiles:[]}} : {ok:true};
                    };
                    const connect=document.getElementById('byomcp-connect'); connect.click();
                    add('Permission requested synchronously in Connect gesture before worker request',ordered.join(',')==='permission');
                    await new Promise(resolve=>setTimeout(resolve,30));
                    add('Verified explicit Connect renders connected, without evidence request',ordered.join(',')==='permission,connect' && /Connection enabled/.test(document.getElementById('byomcp-status').textContent) && connect.disabled);
                    const file=document.getElementById('byomcp-configuration-file'), reviewed=document.getElementById('byomcp-configuration-reviewed'), configure=document.getElementById('byomcp-configure');
                    const transfer=new DataTransfer(); transfer.items.add(new File(['{"version":1}'],'synthetic-binding.json',{type:'application/json'}));
                    file.files=transfer.files; file.dispatchEvent(new Event('change'));
                    add('Choosing configuration resets explicit confirmation',!reviewed.checked && configure.disabled);
                    reviewed.checked=true; reviewed.dispatchEvent(new Event('change')); configure.click(); await new Promise(resolve=>setTimeout(resolve,40));
                    add('Reviewed configuration import does not connect or release evidence',ordered.join(',')==='permission,connect,configure' && /Connection remains off/.test(document.getElementById('byomcp-status').textContent));
                    add('Import resets configuration file and review checkbox',file.files.length===0 && !reviewed.checked && configure.disabled);
                    return {checks};
                })()`});
                if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.text);
                return evaluated.result.value;
            }
        });
        assert(result.checks.some(check=>check.name==='Managed denial does not contact helper' && check.passed));
    } finally {await rm(temporary,{recursive:true,force:true});}
});
