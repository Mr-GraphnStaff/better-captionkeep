const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../teams-captions-saver/popup.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../teams-captions-saver/popup.html'), 'utf8');
const tenant = '11111111-1111-4111-8111-111111111111';
const client = '22222222-2222-4222-8222-222222222222';
const replacement = '33333333-3333-4333-8333-333333333333';
const setup = {enableGraphTranscriptImport:true, graphTenantId:tenant, graphClientId:client};
const locks = ['enableGraphTranscriptImport', 'graphTenantId', 'graphClientId'];

function fixture({copyError = false, pendingCopy = false, bindIdentifiers = true} = {}) {
  const elements = {}, clipboard = [], writes = [], pageEvents = {}, timers = new Map(), labels = {};
  let finishCopy;
  function element(id) {
    return {id, value:'', textContent:'', hidden:false, disabled:false, readOnly:false, open:false, dataset:{}, style:{}, attributes:{}, listeners:{},handlers:{},
      setAttribute(name,value){this.attributes[name]=value;},
      addEventListener(name,callback){(this.handlers[name]??=[]).push(callback);this.listeners[name]=event=>Promise.all(this.handlers[name].map(handler=>handler(event)));},
      async click(){if(!this.disabled)return this.listeners.click?.({target:this});},
      input(value){this.value=value;this.listeners.input?.({target:this});},
      querySelector(){return this.note || null;},append(node){this.note=node;}};
  }
  for(const id of ['graphTenantId','graphClientId','graphRevealTenantId','graphRevealClientId','graphCopyTenantId','graphCopyClientId',
    'graphIdentifierStatus','graphSetupStatus','graphSetupActions','graphManagedSetupSummary','graphManagedSetupHeading','graphAdminDetails',
    'graphSaveSetup','graphClearSetup','graphTranscriptSection','graphConnectionStatus','graphRedirectUri','saveLocationRow','saveBehaviorHint',
    'copyButton','saveButton','policyStatusBanner','policyStatusMessage','retryPolicySettings','statusMessage'])elements[id]=element(id);
  for(const [property,id] of [['defaultSaveFormatSelect','defaultSaveFormat'],['saveAsTypeSelect','saveAsType'],['saveLocationInput','saveLocation'],
    ['timestampFormat','timestampFormat'],['filenamePattern','filenamePattern'],['themeSelect','themeSelect'],['webmailDestination','webmailDestination']]) {
    elements[property]=element(id);labels[id]=element('label-'+id);
  }
  const context = vm.createContext({
    UI_ELEMENTS:elements, currentEnterprisePolicy:{}, graphConfigured:false, graphConnectionAttempt:0, graphConnected:false,
    document:{body:{dataset:{}},querySelector(selector){return labels[/for="([^"]+)"/.exec(selector)?.[1]]||null;},
      querySelectorAll(){return ['copyButton','saveButton','graphCopyTenantId','graphCopyClientId','graphSaveSetup','graphClearSetup','graphTenantId','graphClientId','retryPolicySettings'].map(id=>elements[id]);},
      createElement(){return element('note');}},
    navigator:{clipboard:{writeText(value){clipboard.push(value);if(copyError)return Promise.reject(Error('denied'));if(pendingCopy)return new Promise(resolve=>{finishCopy=resolve;});return Promise.resolve();}}},
    setTimeout(callback){const id=timers.size+1;timers.set(id,callback);return id;},clearTimeout(id){timers.delete(id);},
    addEventListener(name,callback){pageEvents[name]=callback;},
    chrome:{storage:{local:{async set(value){writes.push(value);}}}},
    async sendGraphMessage(){return {configured:true,connected:false};},setGraphBusy(){},async refreshGraphStatus(){},async loadSettings(){}
  });
  vm.runInContext(source.slice(source.indexOf('function isGraphGuid('),source.indexOf('async function refreshGraphStatus(')),context);
  if(bindIdentifiers)vm.runInContext('setupGraphIdentifierControls()',context);
  const save = source.slice(source.indexOf("UI_ELEMENTS.graphSaveSetup?.addEventListener('click'"),source.indexOf("UI_ELEMENTS.graphClearSetup?.addEventListener('click'"));
  vm.runInContext(save,context);
  const hint = source.slice(source.indexOf('function updateSaveBehaviorHint('),source.indexOf('async function refreshLastTranscriptFolderButton('));
  vm.runInContext(hint,context);
  return {elements,clipboard,writes,pageEvents,timers,labels,context,
    configure(values=setup,managed=locks){context.configuration=values;context.locked=new Set(managed);vm.runInContext('updateGraphSetupControls(configuration,locked)',context);},
    finishCopy:()=>finishCopy(),run:expression=>vm.runInContext(expression,context)};
}

test('technical details start collapsed, including Microsoft 365 deep links',()=>{
  assert.match(html,/<details class="graph-manual graph-admin-details" id="graphAdminDetails">/);
  assert.doesNotMatch(source,/graphAdminDetails\.open = true/);
  for(const id of ['graphTenantId','graphClientId','graphRevealTenantId','graphCopyTenantId','graphRevealClientId','graphCopyClientId'])assert(html.includes(`id="${id}"`));
});

test('managed identifiers are concealed in fields and metadata, with a clean organization summary',()=>{
  const f=fixture();f.configure();
  assert.equal(f.elements.graphManagedSetupSummary.hidden,false);
  assert.equal(f.elements.graphManagedSetupHeading.textContent,'Configured by your organization');
  assert.equal(f.elements.graphSetupActions.hidden,true);
  for(const id of ['graphTenantId','graphClientId']) {
    assert.equal(f.elements[id].value,'••••••••');assert.equal(f.elements[id].readOnly,true);
  }
  const rendered=JSON.stringify(f.elements);
  assert(!rendered.includes(tenant));assert(!rendered.includes(client));
});

test('explicit Reveal/Hide preserves managed read-only values and semantic toggle state',async()=>{
  const f=fixture();f.configure();
  await f.elements.graphRevealTenantId.click();
  assert.equal(f.elements.graphTenantId.value,tenant);assert.equal(f.elements.graphTenantId.readOnly,true);
  assert.equal(f.elements.graphRevealTenantId.attributes['aria-pressed'],'true');
  assert.equal(f.elements.graphRevealTenantId.attributes['aria-label'],'Hide tenant ID');
  await f.elements.graphRevealTenantId.click();
  assert.equal(f.elements.graphTenantId.value,'••••••••');
  assert.equal(f.elements.graphRevealTenantId.attributes['aria-pressed'],'false');
});

test('Copy uses full canonical values while concealed and never includes them in feedback',async()=>{
  const f=fixture();f.configure();
  await f.elements.graphCopyTenantId.click();await f.elements.graphCopyClientId.click();
  assert.deepEqual(f.clipboard,[tenant,client]);
  assert.equal(f.elements.graphTenantId.value,'••••••••');
  assert(!f.elements.graphIdentifierStatus.textContent.includes(client));
  f.configure({...setup,graphTenantId:replacement});
  await f.elements.graphCopyTenantId.click();assert.equal(f.clipboard.at(-1),replacement);
});

test('manual configured Save never persists a mask, and new manual input remains editable and validated',async()=>{
  const f=fixture();f.configure(setup,[]);
  await f.elements.graphSaveSetup.click();
  assert.equal(f.writes[0].graphTenantId,tenant);assert.equal(f.writes[0].graphClientId,client);
  f.configure({},[]);
  assert.equal(f.elements.graphTenantId.readOnly,false);
  f.elements.graphTenantId.input(replacement.toUpperCase());f.elements.graphClientId.input(client);
  await f.elements.graphRevealTenantId.click();
  assert.equal(f.elements.graphTenantId.value,'••••••••');
  await f.elements.graphSaveSetup.click();assert.equal(f.writes[1].graphTenantId,replacement);
  await f.elements.graphRevealTenantId.click();f.elements.graphTenantId.input('not-a-guid');
  await f.elements.graphSaveSetup.click();assert.equal(f.writes.length,2);
  assert.match(f.elements.graphSetupStatus.textContent,/valid GUID/);
});

test('managed Save cannot write through a dispatched click',async()=>{
  const f=fixture();f.configure();
  await f.elements.graphSaveSetup.listeners.click();
  assert.equal(f.writes.length,0);
});

test('refresh, policy change, collapse and pagehide remask identifiers',async()=>{
  const f=fixture();f.configure();
  await f.elements.graphRevealTenantId.click();
  const refresh = source.slice(source.indexOf('async function refreshGraphStatus('),source.indexOf('async function populateCurrentTeamsMeeting('));
  vm.runInContext(refresh,f.context);await f.run('refreshGraphStatus()');
  assert.equal(f.elements.graphTenantId.value,'••••••••');
  await f.elements.graphRevealTenantId.click();f.configure({...setup,graphTenantId:replacement});
  assert.equal(f.elements.graphTenantId.value,'••••••••');
  await f.elements.graphRevealTenantId.click();f.elements.graphAdminDetails.listeners.toggle();
  assert.equal(f.elements.graphTenantId.value,'••••••••');
  await f.elements.graphRevealTenantId.click();f.pageEvents.pagehide();
  assert.equal(f.elements.graphTenantId.value,'••••••••');
});

test('clipboard policy and rejected clipboard writes give accessible feedback without unmasking',async()=>{
  const blocked=fixture();blocked.context.currentEnterprisePolicy.disableClipboard=true;blocked.configure();
  assert.equal(blocked.elements.graphCopyTenantId.disabled,true);
  await blocked.elements.graphRevealTenantId.click();
  assert.match(blocked.elements.graphIdentifierStatus.textContent,/disabled by your organization/);
  await blocked.run("copyGraphIdentifier('graphTenantId')");assert.equal(blocked.clipboard.length,0);
  const denied=fixture({copyError:true});denied.configure();await denied.elements.graphCopyClientId.click();
  assert.match(denied.elements.graphIdentifierStatus.textContent,/Could not copy/);
  assert.equal(denied.elements.graphClientId.value,'••••••••');
});

test('a stale copy result cannot replace feedback after a configuration change',async()=>{
  const f=fixture({pendingCopy:true});f.configure();const pending=f.elements.graphCopyTenantId.click();
  f.configure({...setup,graphTenantId:replacement});f.finishCopy();await pending;
  assert.equal(f.elements.graphIdentifierStatus.textContent,'');
});

test('seven managed preferences lock, annotate and unlock, preserving save-location applicability',()=>{
  const f=fixture();f.elements.saveAsTypeSelect.value='custom';
  const keys=['defaultSaveFormat','saveAsType','saveLocation','timestampFormat','filenamePattern','uiTheme','webmailDestination'];
  f.context.locked=new Set(keys);f.run('updateManagedPreferenceControls(locked)');
  for(const property of ['defaultSaveFormatSelect','saveAsTypeSelect','saveLocationInput','timestampFormat','filenamePattern','themeSelect','webmailDestination']){
    assert.equal(f.elements[property].disabled,true);assert.equal(f.labels[f.elements[property].id].note.hidden,false);
  }
  f.run("updateSaveBehaviorHint('custom')");assert.equal(f.elements.saveLocationInput.disabled,true);
  f.context.locked=new Set();f.run('updateManagedPreferenceControls(locked)');
  assert.equal(f.elements.saveLocationInput.disabled,false);assert.equal(f.elements.themeSelect.disabled,false);
  assert.equal(f.labels.themeSelect.note.hidden,true);
  f.run("updateSaveBehaviorHint('downloads')");assert.equal(f.elements.saveLocationInput.disabled,true);
});

test('policy failure pauses stale ID Copy and release controls without discarding the previous policy',async()=>{
  const f=fixture();f.configure();f.context.currentEnterprisePolicy={disableFileExport:true};
  f.run('showPopupPolicyUnavailable()');
  assert.equal(f.elements.policyStatusBanner.hidden,false);
  assert.equal(f.elements.retryPolicySettings.disabled,false);
  assert.equal(f.elements.copyButton.disabled,true);assert.equal(f.elements.saveButton.disabled,true);
  assert.equal(f.elements.graphCopyTenantId.disabled,true);
  assert.match(f.elements.graphIdentifierStatus.textContent,/paused until organization settings/);
  f.pageEvents.pagehide();
  assert.equal(f.elements.graphTenantId.disabled,true);
  assert.equal(f.elements.graphRevealTenantId.disabled,true);
  await f.run("copyGraphIdentifier('graphTenantId')");assert.equal(f.clipboard.length,0);
  assert.equal(f.context.currentEnterprisePolicy.disableFileExport,true);
  f.run('restorePopupPolicyControls()');f.configure();
  assert.equal(f.elements.policyStatusBanner.hidden,true);
  assert.equal(f.elements.graphCopyTenantId.disabled,false);
});

test('actual policy read failure resolves initialization into a visible retry state with handlers registered once',async()=>{
  const f=fixture({bindIdentifiers:false});
  f.context.chrome.storage.sync={async get(){return {};}};
  f.context.chrome.storage.local.get=async()=>({});
  f.context.chrome.storage.managed={async get(){throw Error('Synthetic policy provider unavailable');}};
  f.context.runtimeManifest={};f.context.isFullSettingsPage=false;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../teams-captions-saver/configuration.js'),'utf8'),f.context);
  const eventsStart=source.indexOf('function setupEventListeners()');
  const eventsEnd=source.indexOf("document.getElementById('meetingExtrasButton')",eventsStart);
  vm.runInContext(source.slice(eventsStart,eventsEnd)+'}',f.context);
  vm.runInContext(source.slice(source.indexOf('async function loadSettings()'),source.indexOf('// --- Event Handling ---')),f.context);
  vm.runInContext(source.slice(source.indexOf('async function initializePopup()'),source.indexOf('// --- Keyboard Shortcuts ---')),f.context);
  await f.run('initializePopup()');
  assert.equal(f.elements.policyStatusBanner.hidden,false);
  assert.match(f.elements.policyStatusMessage.textContent,/Could not check organization settings/);
  assert.match(f.elements.statusMessage.textContent,/Organization settings unavailable/);
  assert.equal(f.elements.retryPolicySettings.handlers.click.length,1);
  assert.equal(f.elements.graphRevealTenantId.handlers.click.length,1);
  f.run('setupEventListeners()');
  assert.equal(f.elements.retryPolicySettings.handlers.click.length,1);
  assert.equal(f.elements.graphRevealTenantId.handlers.click.length,1);
});

test('an older successful policy read cannot unlock the view after a newer failed read',async()=>{
  const f=fixture();let resolveOlder,reads=0;
  f.context.chrome.storage.sync={async get(){return {};}};
  f.context.chrome.storage.local.get=async()=>({});
  f.context.chrome.storage.managed={get(){
    if(++reads===1)return new Promise(resolve=>{resolveOlder=resolve;});
    return Promise.reject(Error('Synthetic newer read failure'));
  }};
  f.context.runtimeManifest={};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../teams-captions-saver/configuration.js'),'utf8'),f.context);
  vm.runInContext(source.slice(source.indexOf('async function loadSettings()'),source.indexOf('// --- Event Handling ---')),f.context);
  const older=f.run('loadSettings()');
  while(!resolveOlder)await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(f.run('loadSettings()'),/Organization settings/);
  resolveOlder({});
  const outcome=await older.then(value=>({value}),error=>({error}));
  assert.equal(f.elements.policyStatusBanner.hidden,false);
  assert.equal(f.elements.copyButton.disabled,true);
  assert.equal(f.elements.graphCopyTenantId.disabled,true);
  assert.equal(outcome.value,false,'a stale response must return before any controls or policy are restored');
});
