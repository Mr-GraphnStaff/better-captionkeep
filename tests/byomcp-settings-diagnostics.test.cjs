const {test} = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../teams-captions-saver/byomcpSettings.js');

test('connection stages show only fixed labels and valid attempt times',()=>{
    const diagnostic={stage:'native-opening',at:Date.now(),code:'Bearer SYNTHETIC_SECRET'};
    const state=settings.statusView({ok:false,code:'native-host-not-found',diagnostic});
    assert.match(state.label,/Last connection attempt:.*starting the local helper/);
    assert(!state.label.includes('SYNTHETIC_SECRET'));
    for(const bad of [{stage:'__proto__',at:Date.now()},{stage:'Bearer SECRET',at:Date.now()},{stage:'native-opening',at:'SECRET'},{stage:'native-opening',at:Date.now()+60000}]) {
        assert(!settings.statusView({ok:false,diagnostic:bad}).label.includes('Last connection attempt'));
    }
    assert.match(settings.statusView({ok:false,code:'configuration-required'}).label,/Import a reviewed non-secret/);
});

test('fixed native connection diagnostics remain actionable and disconnected', () => {
    const expected = {
        'native-host-not-found':/not found.*registration/,
        'native-host-start-failed':/could not start.*runtime/,
        'native-host-forbidden':/not allowed.*identity/,
        'native-host-exited':/closed before enrollment/,
        'native-communication-error':/versions match/,
        'native-timeout':/did not respond in time/,
        'enrollment-mismatch':/does not match.*reviewed setup/,
        'permission-denied':/permission was not granted/,
        'native-connection-failed':/could not be verified.*reconnect/
    };
    for (const [code, message] of Object.entries(expected)) {
        const state = settings.statusView({ok:false,error:'operation-not-verified',code});
        assert.match(state.label,message);
        assert.equal(state.verified,false);
        assert.equal(state.enabled,false);
        assert.deepEqual(state.profiles,[]);
    }
});

test('unknown native diagnostic text is never reflected into Settings', () => {
    const secret = 'Bearer SYNTHETIC_SECRET C:/private/example';
    for (const code of [secret,'__proto__','constructor','toString']) {
        const state = settings.statusView({ok:false,code,error:secret});
        assert.equal(typeof state.label,'string');
        assert(!state.label.includes(secret));
        assert.equal(state.enabled,false);
    }
});

test('controller retains safe Connect failure reason without claiming enrollment',async () => {
    const controller = settings.createController({policy:async()=>({}),send:async()=>({ok:false,error:'operation-not-verified',code:'native-host-not-found'})});
    const state = await controller.connect(Promise.resolve(true));
    assert.match(state.label,/not found/);
    assert.equal(state.verified,false);
    assert.equal(state.enabled,false);
});

test('verified metadata-only connection is not reported as disconnected or enabled for actions',async () => {
    const profile = {id:'metadata-only',label:'Metadata only',transport:'streamable-http',revision:1,verified:true};
    const calls=[];
    const controller = settings.createController({policy:async()=>({}),send:async message=>{
        calls.push(message.operation);
        return message.operation==='inventory'
            ? {ok:true,inventory:{profileId:profile.id,revision:1,tools:[]}}
            : {ok:true,status:{protocolVersion:1,enrollmentVerified:true,enabled:false,profiles:[profile]}};
    }});
    const connected=await controller.connect(Promise.resolve(true));
    assert.equal(connected.verified,true);
    assert.equal(connected.enabled,false);
    assert.match(connected.label,/Helper connected; actions remain off/);
    const reviewed=await controller.review(profile.id);
    assert.equal(reviewed.verified,true);
    assert.equal(reviewed.enabled,false);
    assert.deepEqual(reviewed.reviewed.tools,[]);
    assert.deepEqual(calls,['connect','inventory']);
});
