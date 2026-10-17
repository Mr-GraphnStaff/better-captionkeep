const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../teams-captions-saver');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const workspace=read('sidepanel.js');

test('shipping popup/settings and workspace expose no MCP controls or assets',()=>{
    for(const file of ['popup.html','sidepanel.html']) {
        const html=read(file);
        assert.doesNotMatch(html,/byomcp|Bring Your Own MCP|nativeMessaging/i);
        for(const [,asset] of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g))
            assert(fs.existsSync(path.join(root,asset)),`${file}: missing ${asset}`);
    }
    assert.match(read('settings.js'),/popup\.html\?view=settings/);
    assert.doesNotMatch(workspace,/CaptionKeepByomcp|connectedAction|byomcp_(?:settings|action)/);
    assert.doesNotMatch(read('sidepanel.css'),/byomcp/);
});

test('normal BYOAI, selection, keyboard, receipt and review controls remain wired',()=>{
    const popup=read('popup.html'),html=read('sidepanel.html');
    for(const id of ['privacy-settings','autoAISummaryToggle','privacyScrubberToggle','aiProviderOptions'])
        assert(popup.includes(`id="${id}"`),id);
    for(const id of ['on-the-fly-bar','clear-on-the-fly','review-on-the-fly','prepare-on-the-fly','action-receipt-count','action-receipt-list'])
        assert(html.includes(`id="${id}"`),id);
    assert.match(workspace,/elements\.transcriptList\.addEventListener\('keydown'/);
    assert.match(workspace,/elements\.reviewOnTheFly\.addEventListener\('click', openOnTheFlyDialog\)/);
    assert.match(workspace,/elements\.actionReceiptList\.addEventListener\('click'/);
    for(const script of ['derivedArtifacts.js','rollingNotes.js','aiTaskFramework.js','promptTemplates.js','aiDestinations.js'])
        assert(html.indexOf(`src="${script}"`)<html.indexOf('src="sidepanel.js"'),script);
    assert.match(read('handoff.js'),/reviewedHandoffText/);
});

test('clearing selected evidence restores caption focus or search fallback without MCP globals',()=>{
    const start=workspace.indexOf('    function clearOnTheFly(');
    const end=workspace.indexOf('    function openOnTheFlyDialog()',start);
    assert(start>=0 && end>start);
    for(const hasCaption of [true,false]) {
        let focused;
        const button={dataset:{captionIndex:'2'},setAttribute(){},closest:()=>({classList:{remove(){}}}),focus(){focused='caption';}};
        const elements={onTheFlyBar:{hidden:false,querySelectorAll:()=>[]},onTheFlyQuestion:{value:'question'},markerNote:{value:'note'},
            markLatest:{disabled:false},transcriptList:{querySelectorAll:()=>hasCaption?[button]:[],contains:()=>false},
            transcriptSearch:{focus(){focused='search';}}};
        vm.runInNewContext(`let selectedCaptionIndex=2,onTheFlyEvidence={};${workspace.slice(start,end)};clearOnTheFly({restoreFocus:true});`,
            {elements,window:{getSelection:()=>null}});
        assert.equal(focused,hasCaption?'caption':'search');
        assert.equal(elements.onTheFlyBar.hidden,true);
        assert.equal(elements.markLatest.disabled,true);
        assert.equal(elements.onTheFlyQuestion.value,'');
    }
});

test('ordinary evidence review opens its native dialog only with an explicit selection',()=>{
    const start=workspace.indexOf('    function openOnTheFlyDialog()');
    const end=workspace.indexOf('    function selectionRequestSnapshot()',start);
    assert(start>=0 && end>start);
    for(const selected of [null,{evidenceId:'C0001',time:'00:01',speaker:'Synthetic',text:'Review locally'}]) {
        let opens=0;
        const elements={onTheFlyEvidence:{textContent:''},onTheFlyDialog:{showModal(){opens++;}}};
        vm.runInNewContext(`${workspace.slice(start,end)};openOnTheFlyDialog();`,{elements,onTheFlyEvidence:selected});
        assert.equal(opens,selected?1:0);
        if(selected)assert.match(elements.onTheFlyEvidence.textContent,/Review locally/);
    }
});
