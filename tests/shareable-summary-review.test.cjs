const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const api=require('../teams-captions-saver/shareableSummary.js');
require('../teams-captions-saver/configuration.js');
const config=globalThis.CaptionKeepConfiguration;
const scrubber=require('../teams-captions-saver/privacyScrubber.js');
async function fixture({managedAvailable=true}={}) {
    const nodes=new Map(),listeners={},calls={copy:[],download:[],print:0};
    const element=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',checked:false,hidden:true,textContent:'',children:[],events:{},
        addEventListener(name,fn){this.events[name]=fn;},append(...children){this.children.push(...children);},
        querySelectorAll(){return [];}});return nodes.get(id);};
    element('summary-text').value='Synthetic authorized business summary';
    const label={value:'confidential'},managed={},user={privacyScrubberEnabled:false};
    let loadCount=0,onSource=()=>{},policyCount=0,onPolicy=()=>{};
    const transcript=[{key:'one',Name:'Synthetic speaker',Text:'RESTRICTED SOURCE NOT FOR OUTPUT',capturedAt:'2026-10-14T10:00:00Z'}];
    const document={getElementById:element,querySelector:()=>label,createElement:()=>({children:[],append(...children){this.children.push(...children);}}),createTextNode:text=>({textContent:text})};
    const context={console,document,location:{search:'?session=session_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},history:{replaceState(){}},URLSearchParams,TextEncoder,
        crypto:webcrypto,CaptionKeepShareableSummary:api,CaptionKeepConfiguration:config,CaptionKeepPrivacyScrubber:scrubber,
        SessionManager:class{async loadSession(){loadCount++;onSource(loadCount);return {transcript:structuredClone(transcript)};}},
        chrome:{storage:{managed:managedAvailable?{get:async()=>{onPolicy(++policyCount);return structuredClone(managed);}}:undefined,sync:{get:async()=>structuredClone(user)},onChanged:{addListener:fn=>listeners.storage=fn}},
            downloads:{download:async value=>calls.download.push(value)}},
        navigator:{clipboard:{writeText:async value=>calls.copy.push(value)}},
        window:{addEventListener:(name,fn)=>listeners[name]=fn,print:()=>calls.print++},setTimeout,Blob,URL};
    vm.runInNewContext(fs.readFileSync('teams-captions-saver/shareable.js','utf8'),context);
    for(let i=0;i<30 && element('draft-form').hidden;i++)await new Promise(resolve=>setTimeout(resolve,2));
    return {nodes,element,calls,managed,user,listeners,transcript,setOnSource:fn=>onSource=fn,setOnPolicy:fn=>onPolicy=fn,
        async output(kind){element('reviewed').checked=true;element(kind).events.click();for(let i=0;i<30;i++)await new Promise(resolve=>setTimeout(resolve,2));}};
}
test('shareable release fails closed when managed storage API is unavailable',async()=>{
    const f=await fixture({managedAvailable:false});
    await f.output('copy');assert.equal(f.calls.copy.length,0);
});
test('fresh clipboard denial arriving during source validation prevents summary release',async()=>{
    const f=await fixture();f.setOnSource(count=>{if(count===2)f.managed.disableClipboard=true;});
    await f.output('copy');assert.equal(f.calls.copy.length,0);
});
test('source digest change blocks output and original source remains unchanged',async()=>{
    const f=await fixture();f.transcript[0].Text='A changed source';const before=structuredClone(f.transcript);
    await f.output('copy');assert.equal(f.calls.copy.length,0);assert.deepEqual(f.transcript,before);
});
test('normal reviewed copy contains only stamp and summary, never source text',async()=>{
    const f=await fixture();await f.output('copy');
    assert.equal(f.calls.copy.length,1);assert.equal(f.calls.copy[0],'CONFIDENTIAL — FOR AUTHORIZED RECIPIENTS ONLY\n\nSynthetic authorized business summary');
});
test('source change during final policy await invalidates source review before release',async()=>{
    const f=await fixture();f.setOnPolicy(count=>{if(count===3)f.transcript[0].Text='A replaced source after first validation';});
    await f.output('copy');assert.equal(f.calls.copy.length,0);
});

test('actual Chrome narrow summary has no selected source and print CSS reveals only approved summary',async t=>{
    const {installedBrowsers}=await import('../scripts/browser-platform.mjs');
    const browser=(await installedBrowsers()).find(item=>item.browser==='chrome'&&item.binary);
    if(!browser){t.skip('Chrome is not installed; rendered privacy assertions did not run.');return;}
    const path=require('node:path'),fsp=require('node:fs/promises');
    const {runChromiumSurface}=await import('../scripts/rendered-surface-checks.mjs');
    const output=path.resolve('output/qa');await fsp.mkdir(output,{recursive:true});
    await runChromiumSurface(browser.binary,path.resolve('teams-captions-saver'),path.join(output,'shareable-review-settings.png'),{
        afterSurface:async(surface,cdp)=>{
            if(surface!=='workspace')return null;
            const bootstrap=`(() => {
                chrome.storage.managed={get:async()=>({})};chrome.storage.sync.get=async()=>({uiTheme:'light',privacyScrubberEnabled:false});
                chrome.tabs.sendMessage=async()=>({sessionId:'synthetic-review',transcriptArray:[{key:'one',Name:'Synthetic speaker',Text:'RESTRICTED SOURCE MUST NOT PRINT',capturedAt:'2026-10-14T10:00:00Z'}]});
                globalThis.__copies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>__copies.push(text)}});
                window.print=()=>{globalThis.__printed={stamp:document.getElementById('print-stamp').textContent,text:document.getElementById('print-body').textContent,
                    sourceVisible:getComputedStyle(document.getElementById('workspace')).display!=='none'};};
            })()`;
            await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:bootstrap});
            const origin=await cdp.send('Runtime.evaluate',{expression:'location.origin',returnByValue:true});
            await cdp.send('Emulation.setDeviceMetricsOverride',{width:300,height:900,deviceScaleFactor:1,mobile:false});
            await cdp.send('Page.navigate',{url:origin.result.value+'/shareable.html?liveTab=1&liveSession=synthetic-review'});
            for(let i=0;i<100;i++){
                const ready=await cdp.send('Runtime.evaluate',{expression:"document.getElementById('draft-form')?.hidden===false",returnByValue:true});
                if(ready.result.value)break;await new Promise(resolve=>setTimeout(resolve,40));
            }
            const checks=[];
            async function evaluate(expression){const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
                if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
            checks.push({name:'shareable starts blank and excerpts unselected',passed:await evaluate("!document.getElementById('draft-form').hidden&&document.getElementById('summary-text').value===''&&document.querySelectorAll('#source input:checked').length===0")});
            checks.push({name:'private source locator absent from address',passed:await evaluate("location.search===''&&location.pathname==='/shareable.html'")});
            for(const theme of ['light','captionkeep']){
                await evaluate(`CaptionKeepTheme.apply(${JSON.stringify(theme)})`);
                checks.push({name:'shareable300px '+theme+' has no horizontal overflow',passed:await evaluate('document.documentElement.scrollWidth<=innerWidth+1')});
                const png=await cdp.send('Page.captureScreenshot',{format:'png'});
                await fsp.writeFile(path.join(output,`shareable-review-300-${theme}.png`),Buffer.from(png.data,'base64'));
            }
            await cdp.send('Emulation.setEmulatedMedia',{media:'print'});
            checks.push({name:'print media excludes original source controls',passed:await evaluate("getComputedStyle(document.getElementById('workspace')).display==='none'&&getComputedStyle(document.getElementById('print-summary')).display==='block'")});
            checks.push({name:'unreviewed keyboard-print event leaves blank output',passed:await evaluate("window.dispatchEvent(new Event('beforeprint'));document.getElementById('print-stamp').textContent===''&&document.getElementById('print-body').textContent===''")});
            await evaluate("document.getElementById('summary-text').value='SYNTHETIC APPROVED SUMMARY';document.getElementById('reviewed').checked=true;document.getElementById('print').click()");
            await new Promise(resolve=>setTimeout(resolve,150));
            checks.push({name:'explicit print receives only summary and visible authorized stamp',passed:await evaluate("__printed?.stamp==='CONFIDENTIAL — FOR AUTHORIZED RECIPIENTS ONLY'&&__printed.text==='SYNTHETIC APPROVED SUMMARY'&&__printed.sourceVisible===false")});
            checks.push({name:'print content cleared after explicit output',passed:await evaluate("document.getElementById('print-body').textContent===''&&document.getElementById('print-stamp').textContent===''")});
            return {checks};
        }
    });
});
