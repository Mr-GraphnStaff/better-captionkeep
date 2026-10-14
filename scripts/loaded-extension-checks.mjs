import {spawn,execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {installedBrowsers} from './browser-platform.mjs';

function pipeConnection(child) {
  let sequence = 0;
  let buffer = '';
  const pending = new Map();
  const exceptions = [];
  child.stdio[4].on('data', bytes => {
    buffer += bytes.toString('utf8');
    let boundary;
    while ((boundary = buffer.indexOf('\0')) >= 0) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 1);
      if (!raw) continue;
      const message = JSON.parse(raw);
      if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
  });
  const terminate = error => {
    for (const request of pending.values()) {clearTimeout(request.timer); request.reject(error);}
    pending.clear();
  };
  child.once('error', terminate);
  child.once('exit', () => terminate(new Error('Isolated browser exited.')));
  return {
    exceptions,
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {pending.delete(id); reject(new Error(`Browser command timed out: ${method}`));}, 15000);
        pending.set(id, {resolve, reject, timer});
        child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId ? {sessionId} : {})}) + '\0');
      });
    }
  };
}

const checksExpression = `(async () => {
  const checks = [];
  const add = (name, passed) => checks.push({name, passed:!!passed});
  add('Native extension APIs and packaged worker are available',!!chrome.runtime.id && typeof chrome.storage.local.set === 'function');
  const caption = {key:'synthetic-source-1',Name:'Synthetic speaker',Text:'Synthetic upgrade fixture',Time:'10:00'};
  const archived = {id:'session_legacy_54',title:'Synthetic legacy archive',timestamp:'2026-10-13T12:00:00Z',chunkCount:1,captionCount:1};
  await chrome.storage.local.set({session_index:[archived],session_legacy_54_chunk_0:[caption]});
  await chrome.storage.sync.set({filenamePattern:'Preserved-{meeting}',uiTheme:'light'});
  const legacy = await chrome.runtime.sendMessage({message:'get_corrections',sessionId:archived.id,historical:true});
  const retained = await chrome.storage.local.get(['session_index','session_legacy_54_chunk_0']);
  const preferences = await chrome.storage.sync.get(['filenamePattern','uiTheme']);
  add('Legacy 5.4-style archive loads through the real worker',legacy.ok === true && retained.session_legacy_54_chunk_0[0].Text === caption.Text);
  add('Existing preferences survive archive access',preferences.filenamePattern === 'Preserved-{meeting}' && preferences.uiTheme === 'light');
  const backup = 'backup_11111111-1111-4111-8111-111111111111';
  await chrome.storage.local.set({[backup]:{transcript:[caption],recordingStartTime:new Date().toISOString(),meetingTitle:'Synthetic recovery'}});
  const retried = await chrome.runtime.sendMessage({message:'retry_archive',sessionId:backup});
  add('Recovery retry returns a usable archived session identity',retried.ok === true && typeof retried.sessionId === 'string' && retried.sessionId.startsWith('session_'));
  const markerResult = await chrome.runtime.sendMessage({message:'update_evidence_markers',upserts:[
    {id:'synthetic-marker',sessionId:retried.sessionId,sourceKey:caption.key,kind:'Decision',note:'Synthetic note'}]});
  add('Evidence marker persists through source-authorized worker messaging',markerResult.ok === true && markerResult.markers?.[0]?.text === caption.Text);
  const deletion = await chrome.runtime.sendMessage({message:'delete_session',sessionId:retried.sessionId});
  const deleted = await chrome.storage.local.get('evidenceBoardMarkersV1');
  add('Deleting archived source removes its quoted evidence',deletion.ok === true && !deleted.evidenceBoardMarkersV1?.some(item => item.id === 'synthetic-marker'));
  const replay = await chrome.runtime.sendMessage({message:'update_evidence_markers',upserts:[
    {id:'synthetic-marker',sessionId:retried.sessionId,sourceKey:caption.key,kind:'Decision'}]});
  add('Stale marker replay cannot resurrect a deleted source',replay.ok === true && replay.rejected?.length === 1 && !replay.markers?.length);
  const metadataTab = await chrome.tabs.create({url:'about:blank',active:false});
  try {
    const previous = (await chrome.tabs.get(metadataTab.id)).autoDiscardable;
    await chrome.tabs.update(metadataTab.id,{autoDiscardable:false});
    const protectedState = (await chrome.tabs.get(metadataTab.id)).autoDiscardable;
    await chrome.tabs.update(metadataTab.id,{autoDiscardable:previous});
    const restoredState = (await chrome.tabs.get(metadataTab.id)).autoDiscardable;
    add('Native tab discard metadata can be protected/restored without broad tabs permission',
      !chrome.runtime.getManifest().permissions.includes('tabs') && typeof previous === 'boolean' && protectedState === false && restoredState === previous);
  } finally {await chrome.tabs.remove(metadataTab.id);}
  return {checks,extensionId:chrome.runtime.id,version:chrome.runtime.getManifest().version};
})()`;

export async function runLoadedExtension(binary, sourceDirectory, {screenshot,browserName = 'chromium'} = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'captionkeep-loaded-'));
  const profile = path.join(temporary, 'profile');
  const extension = path.join(temporary, 'extension');
  await cp(sourceDirectory, extension, {recursive:true});
  const workerSha256 = createHash('sha256').update(await readFile(path.join(extension, 'service_worker.js'))).digest('hex');
  let child;
  let connection;
  try {
    child = spawn(binary, ['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
      '--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],
    {windowsHide:true,stdio:['ignore','ignore','ignore','pipe','pipe']});
    connection = pipeConnection(child);
    const browser = await connection.send('Browser.getVersion');
    const loaded = await connection.send('Extensions.loadUnpacked', {path:extension});
    if (!loaded.id) throw new Error('Browser did not return an unpacked extension identity.');
    const target = await connection.send('Target.createTarget', {url:`chrome-extension://${loaded.id}/popup.html?view=settings`});
    const attached = await connection.send('Target.attachToTarget', {targetId:target.targetId,flatten:true});
    const session = attached.sessionId;
    await connection.send('Runtime.enable', {}, session);
    await connection.send('Page.enable', {}, session);
    let pageReady = false;
    for (let count = 0; count < 100; count += 1) {
      const ready = await connection.send('Runtime.evaluate', {
        expression:`document.readyState === 'complete' && location.origin === ${JSON.stringify(`chrome-extension://${loaded.id}`)} && globalThis.chrome?.runtime?.id === ${JSON.stringify(loaded.id)}`,
        returnByValue:true}, session);
      if (ready.result?.value === true) {pageReady = true; break;}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!pageReady) throw new Error('Loaded extension page did not finish initialization.');
    const evaluated = await connection.send('Runtime.evaluate', {expression:checksExpression,returnByValue:true,awaitPromise:true}, session);
    if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
    const result = evaluated.result?.value;
    if (!result?.checks?.length || result.checks.some(item => !item.passed)) {
      throw new Error(`Loaded-extension assertions failed: ${result?.checks?.filter(item => !item.passed).map(item => item.name).join('; ')}`);
    }
    if (connection.exceptions.length) throw new Error(`Extension page exception: ${connection.exceptions.join('; ')}`);
    if (screenshot) {
      const capture = await connection.send('Page.captureScreenshot', {format:'png'}, session);
      await writeFile(screenshot, Buffer.from(capture.data,'base64'));
    }
    const brandedVersion = process.platform === 'win32'
      ? execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-Item -LiteralPath '${binary.replaceAll("'","''")}').VersionInfo.ProductVersion`],
        {encoding:'utf8',windowsHide:true,timeout:10000}).trim()
      : execFileSync(binary,['--version'],{encoding:'utf8',timeout:10000}).trim();
    return {...result,browser:browserName,browserVersion:brandedVersion,engineVersion:browser.product,workerSha256,operatingSystem:`${os.type()} ${os.release()}`,
      testedAt:new Date().toISOString(),scope:'Actual unpacked extension APIs and worker with synthetic legacy archive, recovery, preferences, source deletion, marker replay, and native discard metadata. No live meeting providers or store-installed upgrade were exercised.'};
  } finally {
    if (child && child.exitCode === null) {
      try {await connection?.send('Browser.close');} catch {}
      if (child.exitCode === null) {
        const exited = new Promise(resolve => child.once('exit', resolve));
        child.kill();
        await Promise.race([exited,new Promise(resolve => setTimeout(resolve,3000))]);
      }
    }
    await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:250});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const directory = process.argv[2] || path.join(project, 'teams-captions-saver');
  const browserName = process.argv[3] || 'chrome';
  const definition = (await installedBrowsers()).find(item => item.browser === browserName && item.chromium);
  if (!definition?.binary) throw new Error(`Requested browser is unavailable: ${browserName}`);
  const output = path.join(project,'dist','prod','certification-evidence');
  await mkdir(output,{recursive:true});
  const result = await runLoadedExtension(definition.binary, directory, {browserName,screenshot:path.join(output,`${browserName}-loaded-extension.png`)});
  await writeFile(path.join(output,`${browserName}-loaded-extension.json`),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
