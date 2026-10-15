const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {argumentsFrom,createController}=require('../teams-captions-saver/byomcpCatalog.js');
function fixture() {
    const calls=[],tool={name:'execute',description:'<img src=x onerror=alert(1)>',inputSchema:{type:'object'},schemaDigest:'a'.repeat(64)};
    let clock=Date.now(),tamper=false,hold=null;
    const controller=createController({now:()=>clock,send:async message=>{
        calls.push(structuredClone(message));if(hold)await hold;
        if(message.operation==='catalog')return {ok:true,catalog:{profileId:message.profileId,revision:1,tools:[tool]}};
        if(message.operation==='prepare-tool')return {ok:true,proposal:{id:randomUUID(),profileId:message.profileId,revision:1,tool:message.tool,
            schemaDigest:tool.schemaDigest,arguments:tamper?{changed:true}:message.arguments,expiresAt:clock+300000,digest:'b'.repeat(64)}};
        return {ok:true,result:{status:'returned',content:[{type:'text',text:'untrusted server response'}]}};
    }});
    return {controller,calls,setTamper:()=>{tamper=true;},advance:()=>{clock+=300001;},block:value=>{hold=value;}};
}
test('general tool review exposes full catalog without dispatch and execution consumes exact sealed proposal',async()=>{
    const f=fixture();await f.controller.load('owner');
    assert.equal(f.controller.getState().tools[0].name,'execute');assert.equal(f.calls.length,1);
    await f.controller.prepare('execute','{"code":"return 1"}');assert(!f.calls.some(c=>c.operation==='execute-tool'));
    const reviewed=f.controller.getState();reviewed.proposal.arguments.code='tampered external copy';
    await f.controller.execute();assert.equal(f.calls.filter(c=>c.operation==='execute-tool').length,1);
    assert(!Object.hasOwn(f.calls.at(-1),'arguments'));await assert.rejects(f.controller.execute(),/Review a fresh/);
});
test('edits, cancellation and expiry require fresh review; mismatched helper arguments reject',async()=>{
    for(const action of ['invalidate','expiry']) {
        const f=fixture();await f.controller.load('owner');await f.controller.prepare('execute','{}');
        if(action==='invalidate')f.controller.invalidate();else f.advance();
        await assert.rejects(f.controller.execute(),/Review a fresh/);assert(!f.calls.some(c=>c.operation==='execute-tool'));
    }
    const f=fixture();await f.controller.load('owner');f.setTamper();await assert.rejects(f.controller.prepare('execute','{}'),/does not match/);
});
test('changed selection during pending preparation cannot resurrect its proposal',async()=>{
    const f=fixture();await f.controller.load('owner');let release;f.block(new Promise(resolve=>{release=resolve;}));
    const preparing=f.controller.prepare('execute','{}');f.controller.invalidate();release();
    await assert.rejects(preparing,/Selection changed/);assert.equal(f.controller.getState().proposal,null);
});
test('JSON arguments have explicit object/depth/byte limits and local errors do not echo secrets',async()=>{
    for(const input of ['[]','null','1','{"secret":','x'.repeat(48001)])assert.throws(()=>argumentsFrom(input));
    let value={};for(let n=0;n<15;n++)value={child:value};assert.throws(()=>argumentsFrom(JSON.stringify(value)),/oversized/);
    const controller=createController({send:async()=>{throw Error('Bearer SYNTHETIC_SECRET');}});
    await assert.rejects(controller.load('owner'),error=>!error.message.includes('SYNTHETIC_SECRET'));
});
test('tool descriptions and results are rendered as data, with no executable DOM sinks',()=>{
    const fs=require('node:fs'),source=fs.readFileSync('teams-captions-saver/byomcpCatalog.js','utf8');
    assert(!/innerHTML|outerHTML|insertAdjacentHTML|eval\(/.test(source));
    assert(source.includes("if(!event.isTrusted)return"));
    assert(source.includes("el('result').textContent"));
});
