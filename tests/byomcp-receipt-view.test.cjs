const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const source = readFileSync(require.resolve('../teams-captions-saver/sidepanel.js'),'utf8');
const render = source.slice(source.indexOf('    function renderDerivedArtifacts()'),source.indexOf('    async function loadDerivedArtifacts()'));
function node() {return {children:[],textContent:'',append(...children){this.children.push(...children);},replaceChildren(){this.children=[];}};}
function renderReceipts(derivedArtifacts) {
    const elements=Object.fromEntries(['actionReceiptCount','actionReceiptList','momentCount','noteCount','answerCount','momentList','notesList','answerList'].map(name=>[name,node()]));
    vm.runInNewContext(`${render};renderDerivedArtifacts()`,{derivedArtifacts,elements,document:{createElement:node},artifactTime:value=>value,
        artifactDeleteButton:artifact=>({deleteArtifactId:artifact.id})});
    return elements;
}
const receipt={id:'action-synthetic',kind:'action-result',status:'user-confirmed',generator:'byomcp-verified-action',sourceTranscriptSha256:'a'.repeat(64),
    evidenceIds:['C0001'],payload:{text:'Verified synthetic result <not HTML>',jobId:'job-synthetic',receipt:{jobId:'job-synthetic',receiptDigest:'b'.repeat(64),observedAt:'2026-10-14T12:00:00Z'}}};
test('Evidence displays pinned verified action result with citations, observation time and delete control',()=>{
    const view=renderReceipts([receipt]); assert.equal(view.actionReceiptCount.textContent,'1');
    const [header,body,meta]=view.actionReceiptList.children[0].children;
    assert.equal(header.children[0].textContent,'Verified action result');
    assert.equal(header.children[1].deleteArtifactId,receipt.id);
    assert.equal(body.textContent,receipt.payload.text); assert.equal(body.innerHTML,undefined);
    assert.match(meta.textContent,/C0001/); assert.match(meta.textContent,/2026-10-14T12:00:00Z/);
});
test('Pending, unverified, mismatched and deleted actions are not advertised as verified receipts',()=>{
    const invalid=[{...receipt,status:'deleted'},{...receipt,generator:'model'}, {...receipt,status:'pending'},
        {...receipt,payload:{...receipt.payload,jobId:'other'}},{...receipt,payload:{...receipt.payload,receipt:{...receipt.payload.receipt,receiptDigest:''}}}];
    const view=renderReceipts(invalid); assert.equal(view.actionReceiptCount.textContent,'0');
    assert.match(view.actionReceiptList.children[0].textContent,/No verified/);
});
