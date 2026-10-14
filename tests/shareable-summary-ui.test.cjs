const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {webcrypto} = require('node:crypto');
const vm = require('node:vm');
const pageCode = readFileSync(require.resolve('../teams-captions-saver/shareable.js'),'utf8');
const api = require('../teams-captions-saver/shareableSummary.js');
const settle = () => new Promise(resolve => setTimeout(resolve,20));
async function harness({captionCount = 1} = {}) {
    const nodes = new Map();
    function node(id) { return {id,checked:false,value:'',hidden:true,textContent:'',children:[],listeners:{},
        addEventListener(name,fn) {this.listeners[name] = fn;}, append(...values) {this.children.push(...values);},
        querySelectorAll() {return this.children.flatMap(label=>label.children || []).filter(input=>input.checked);}}; }
    for (const id of ['status','draft-form','source','summary-text','reviewed','privilege-confirmed','privilege-attestation','preview','prompt','copy','download','print','print-stamp','print-body']) nodes.set(id,node(id));
    const radio = {value:'confidential'}; const events = {}; const copies = []; const files = []; let storageListener;
    let captions = Array.from({length:captionCount}, (_,index)=>({key:String(index),Name:'Synthetic speaker',Text:'Approved business update.'})); let managed = {}; let failure = false; let prints = 0; let address; let yields = 0;
    const window = {addEventListener:(name,fn)=>{events[name]=fn;},print:()=>{prints++;}};
    const context = {CaptionKeepShareableSummary:api, CaptionKeepConfiguration:{applyPolicy:user=>({settings:user})},
        CaptionKeepPrivacyScrubber:{scrub:text=>({text})},SessionManager:class {async loadSession() {if (failure) throw Error('deleted'); return {transcript:captions};}},
        location:{search:'?session=private-session',pathname:'/shareable.html'},history:{replaceState:(_a,_b,url)=>{address=url;}},
        document:{getElementById:id=>nodes.get(id),querySelector:()=>radio,createElement:()=>node('generated'),createTextNode:text=>({text})},
        chrome:{storage:{managed:{get:async()=>managed},sync:{get:async()=>({privacyScrubberEnabled:false})},onChanged:{addListener:fn=>{storageListener=fn;}}},
            downloads:{download:async value=>{files.push(value);}}},navigator:{clipboard:{writeText:async text=>{copies.push(text);}}},
        crypto:webcrypto, TextEncoder, URLSearchParams, URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL(){}},Blob,window,setTimeout:()=>0,
        requestAnimationFrame:fn=>{yields++; queueMicrotask(fn);}};
    vm.runInNewContext(pageCode,context); await settle();
    return {nodes,radio,copies,files,events,get prints(){return prints;},get address(){return address;},get yields(){return yields;},
        setCaptions:value=>{captions=value;},deleteSource:()=>{failure=true;},setPolicy:value=>{managed=value;},
        change:(id)=>nodes.get('draft-form').listeners.input({target:nodes.get(id)}),
        click:async id=>{nodes.get(id).listeners.click(); await settle();},storageChange:()=>storageListener({},'managed')};
}
test('shareable workspace is blank, excerpts unselected and private locator removed', async()=>{
    const h=await harness(); assert.equal(h.nodes.get('draft-form').hidden,false); assert.equal(h.address,'/shareable.html');
    assert.equal(h.nodes.get('summary-text').value,''); assert.equal(h.nodes.get('source').querySelectorAll().length,0);
    await h.click('prompt'); assert.equal(h.copies.length,0);
});
test('long source rendering yields in batches without dropping excerpts or preselecting them',async()=>{
    const h=await harness({captionCount:251}); assert.equal(h.yields,2);
    assert.equal(h.nodes.get('source').children.length,251); assert.equal(h.nodes.get('source').querySelectorAll().length,0);
    assert.equal(h.nodes.get('draft-form').hidden,false);
});
test('reviewed summary exports stamp and summary only; edits revoke approval', async()=>{
    const h=await harness(); h.nodes.get('summary-text').value='Business update.';
    await h.click('copy'); assert.equal(h.copies.length,0);
    h.nodes.get('reviewed').checked=true; await h.click('copy'); assert.equal(h.copies.length,1);
    assert.match(h.copies[0],/CONFIDENTIAL/); assert.match(h.copies[0],/Business update/); assert(!h.copies[0].includes('Synthetic speaker'));
    h.change('summary-text'); await h.click('copy'); assert.equal(h.copies.length,1);
});
test('privilege requires explicit designation and any selection change clears review',async()=>{
    const h=await harness(); h.radio.value='privileged'; h.nodes.get('summary-text').value='Reviewed text.'; h.nodes.get('reviewed').checked=true;
    await h.click('copy'); assert.equal(h.copies.length,0);
    h.nodes.get('privilege-confirmed').checked=true; h.nodes.get('reviewed').checked=true; await h.click('copy'); assert.equal(h.copies.length,1);
    h.change('source'); assert.equal(h.nodes.get('reviewed').checked,false);
});
test('changed or deleted original prevents export',async()=>{
    for(const deleted of [false,true]) { const h=await harness(); h.nodes.get('summary-text').value='Reviewed text.'; h.nodes.get('reviewed').checked=true;
        if(deleted) h.deleteSource(); else h.setCaptions([{Text:'Changed source'}]);
        await h.click('copy'); assert.equal(h.copies.length,0); assert.equal(h.nodes.get('reviewed').checked,false);
    }
});
test('fresh policy denial blocks clipboard, files and all shareable exports',async()=>{
    for(const [policy,kind] of [[{disableClipboard:true},'copy'],[{disableFileExport:true},'download'],[{disableEvidenceEmail:true},'copy']]) {
        const h=await harness(); h.nodes.get('summary-text').value='Reviewed text.'; h.nodes.get('reviewed').checked=true; h.setPolicy(policy); await h.click(kind);
        assert.equal(h.copies.length,0); assert.equal(h.files.length,0);
    }
});
test('browser print shortcut is blank and explicit validated print clears private print buffer',async()=>{
    const h=await harness(); h.events.beforeprint(); assert.equal(h.nodes.get('print-body').textContent,'');
    h.nodes.get('summary-text').value='Reviewed print.'; h.nodes.get('reviewed').checked=true; await h.click('print');
    assert.equal(h.prints,1); assert.equal(h.nodes.get('print-body').textContent,'');
    h.storageChange(); assert.equal(h.nodes.get('reviewed').checked,false);
});
