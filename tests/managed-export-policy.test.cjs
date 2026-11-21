const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');

test('actual browser and direct-folder exports deny managed failures visibly, preserving unmanaged Firefox',async()=>{
 for(const mode of ['blocked','error','absent','firefox','chrome-error'])for(const action of ['download','folder']){
  const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,disabled:false,replaceChildren(){},append(){},children:[],focus(){}});return nodes.get(id);};
  let downloads=0,writes=0;
  const storage={sync:{get:async()=>({})},local:{get:async()=>({}),set:async()=>{},remove:async()=>{}}};
  if(mode!=='absent')storage.managed={get:async()=>{
   if(mode==='error')throw Error('Synthetic policy provider failed');
   if(mode==='firefox'||mode==='chrome-error')throw Error('Managed storage manifest not found');
   return {disableFileExport:true};
  }};
  class FakeURL extends URL {static createObjectURL(){return 'blob:synthetic';}static revokeObjectURL(){}}
  const context=vm.createContext({console,chrome:{storage,runtime:{getBrowserInfo:async()=>({name:mode==='firefox'?'Firefox':'Chrome'})},downloads:{download:async()=>{downloads++;return 42;},onChanged:{addListener(){},removeListener(){}},search:async()=>[{state:'complete'}]},tabs:{}},
   document:{getElementById:node,createElement:()=>node('generated')},location:{href:'https://synthetic/export.html?job=export_probe'},URL:FakeURL,Blob,atob,crypto:{randomUUID:()=> 'synthetic'},window:{},indexedDB:{open(){throw Error('No real IndexedDB permitted');}},setTimeout,confirm:()=>false});
  for(const file of ['configuration.js','export.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../teams-captions-saver',file),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  context.folder={name:'synthetic',queryPermission:async()=> 'granted',getFileHandle:async()=>({createWritable:async()=>({write:async()=>{writes++;},close:async()=>{},abort:async()=>{}})})};
  vm.runInContext("currentJob={content:'Synthetic transcript',filename:'synthetic.txt',mimeType:'text/plain'};directory=folder;",context);
  const result=await vm.runInContext(action==='download'?'downloadWithBrowser(true)':'saveToFolder()',context);
  const denied=['blocked','error','chrome-error'].includes(mode);
  assert.equal(downloads+writes,denied?0:1,`${mode}/${action}`);
  assert.equal(result,!denied,`${mode}/${action}`);
  if(mode==='error'||mode==='chrome-error')assert.match(node('status').textContent,/Reload this page to retry/);
 }
});

test('a previously observed Firefox restriction cannot disappear on a later provider failure',async()=>{
 let failed=false;const context=vm.createContext({chrome:{storage:{managed:{get:async()=>{if(failed)throw Error('Managed storage manifest not found');return {disableFileExport:true}}}},runtime:{getBrowserInfo:async()=>({name:'Firefox'})}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../teams-captions-saver/configuration.js'),'utf8'),context);
 assert.equal((await vm.runInContext('CaptionKeepConfiguration.readManaged()',context)).disableFileExport,true);failed=true;
 await assert.rejects(vm.runInContext('CaptionKeepConfiguration.readManaged()',context),/Organization settings could not be read/);
});
