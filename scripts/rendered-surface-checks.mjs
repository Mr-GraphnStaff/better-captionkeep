import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function validateSurfaceResult(result, exceptions = []) {
  if (exceptions.length) throw new Error(`Browser script exception: ${exceptions.join('; ')}`);
  if (!result || !Array.isArray(result.checks) || !result.checks.length) throw new Error('No rendered assertions ran.');
  const failed = result.checks.filter(check => check.passed !== true);
  if (failed.length) throw new Error(failed.map(check => check.name).join('; '));
  return result;
}

async function connection(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once:true});
    socket.addEventListener('error', reject, {once:true});
  });
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    }
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  return {
    exceptions,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const requestId = ++id;
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Timed out: ${method}`)); }, 10000);
        pending.set(requestId, {resolve, reject, timer});
        socket.send(JSON.stringify({id:requestId, method, params}));
      });
    },
    close() { socket.close(); }
  };
}

// These APIs are fixtures for file-based UI checks, not extension/provider tests.
const fixture = `(() => {
  const area = {async get(keys) {
    if (keys === 'viewer_payload_surface') return {viewer_payload_surface:{meetingTitle:'Synthetic UI verification',
      sessionId:'synthetic-surface',isHistorical:true,expiresAt:Date.now()+60000,
      transcriptArray:[{key:'synthetic-1',Name:'Synthetic speaker',Time:'10:00',capturedAt:'2026-10-13T10:00:00Z',Text:'Synthetic test caption.'}]}};
    return {};
  }, async set() {}, async remove() {}, async getBytesInUse() {return 0;}};
  const noopEvent = {addListener() {}};
  globalThis.chrome = Object.assign(globalThis.chrome || {}, {
    storage:{sync:area,local:area,session:area,managed:area,onChanged:noopEvent},
    runtime:{id:'surface-fixture',getManifest:()=>({version:'6.0.0',name:'Better CaptionKeep'}),
      getURL:p=>new URL(p,location.href).href,sendMessage:async()=>({ok:true,connected:false}),onMessage:noopEvent},
    tabs:{query:async()=>[],create:async()=>({}),sendMessage:async()=>({}),onActivated:noopEvent,onUpdated:noopEvent},
    downloads:{search:async()=>[]},permissions:{contains:async()=>false},
    i18n:{getUILanguage:()=> 'en',getMessage:()=> ''}
  });
})();`;

const settingsAssertions = `(async () => {
  const checks = [];
  const visible = element => !!element && element.getBoundingClientRect().height > 0 &&
    getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none';
  const add = (name, passed) => checks.push({name,passed:!!passed});
  add('Settings main is visible',visible(document.querySelector('.popup-main')));
  add('Settings navigation is visible',visible(document.querySelector('.settings-cockpit-nav')));
  add('Settings has no horizontal overflow',document.documentElement.scrollWidth <= innerWidth + 1);
  const links = [...document.querySelectorAll('.settings-cockpit-nav a[href^="#"]')];
  add('Settings navigation has sections',links.length > 0);
  for (const link of links) {
    const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (target instanceof HTMLDetailsElement) target.open = false;
    link.click();
    await new Promise(resolve => setTimeout(resolve,60));
    add('Settings navigation opens '+link.hash,target instanceof HTMLDetailsElement && target.open && visible(target));
    const top = target?.getBoundingClientRect().top;
    add('Settings navigation reaches '+link.hash,typeof top === 'number' && top >= -1 && top < innerHeight);
  }
  return {checks};
})()`;

const popupAssertions = `(() => {
  const checks = [];
  const add = (name, passed) => checks.push({name,passed:!!passed});
  add('Popup has no horizontal overflow',document.documentElement.scrollWidth <= innerWidth + 1);
  for (const selector of ['.v6-status-card','#liveWorkspaceButton','#openLastTranscriptButton']) {
    const element = document.querySelector(selector);
    element?.scrollIntoView({block:'center'});
    const rect = element?.getBoundingClientRect();
    add('Popup control is visible and reachable: '+selector,rect && rect.width > 0 && rect.height > 0 &&
      rect.left >= -1 && rect.right <= innerWidth + 1 &&
      (selector === '.v6-status-card' || (rect.top >= -1 && rect.bottom <= innerHeight + 1)));
  }
  return {checks};
})()`;

const viewerAssertions = `(() => {
  const checks = [];
  const visible = element => !!element && element.getBoundingClientRect().height > 0 && !element.closest('[hidden]');
  for (const id of ['copy-all-btn-primary','save-all-btn-primary']) {
    const button = document.getElementById(id);
    checks.push({name:'Viewer primary action visible: '+id,passed:visible(button) && !button.closest('.more-tools')});
  }
  const more = document.querySelector('.more-tools');
  checks.push({name:'Viewer secondary tools collapsed initially',passed:!!more && !more.open});
  more?.querySelector('summary')?.click();
  checks.push({name:'Viewer secondary tools open on request',passed:!!more?.open && visible(document.getElementById('print-pdf-btn'))});
  return {checks};
})()`;

const handoffAssertions = `(() => {
  const visible = element => !!element && element.getBoundingClientRect().height > 0 && !element.closest('[hidden]');
  const checks = [{name:'Handoff empty state visible',passed:visible(document.getElementById('handoff-empty'))},
    {name:'Handoff workspace hidden with no payload',passed:document.getElementById('handoff-workspace')?.hidden === true}];
  for (const id of ['copy','saveEvidence','discard','copyChunk','previousChunk','nextChunk']) {
    checks.push({name:'Handoff empty state hides unusable action: '+id,passed:!visible(document.getElementById(id))});
  }
  return {checks};
})()`;

const workspaceAssertions = `(() => {
  const visible = element => !!element && element.getBoundingClientRect().height > 0 && !element.closest('[hidden]');
  return {checks:[{name:'Live workspace main visible',passed:visible(document.querySelector('main'))},
    {name:'Live workspace has no horizontal overflow',passed:document.documentElement.scrollWidth <= innerWidth + 1}]};
})()`;

async function themeChecks(cdp, surface) {
  const checks = [];
  await cdp.send('Runtime.evaluate',{expression:"CaptionKeepTheme.apply('system')"});
  for (const scheme of ['light','dark','light']) {
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:scheme}]});
    await delay(75);
    const state = await cdp.send('Runtime.evaluate',{returnByValue:true,expression:`(() => ({
      theme:document.documentElement.dataset.theme,
      preference:document.documentElement.dataset.themePreference,
      native:getComputedStyle(document.documentElement).colorScheme,
      nativeField:getComputedStyle(document.querySelector('input,select,textarea') || document.body).colorScheme
    }))()`});
    const actual = state.result.value;
    checks.push({name:surface+' system theme follows '+scheme,passed:actual.preference === 'system' &&
      actual.theme === (scheme === 'light' ? 'light' : 'captionkeep') && actual.native === scheme && actual.nativeField === scheme});
  }
  await cdp.send('Runtime.evaluate',{expression:"CaptionKeepTheme.apply('light')"});
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
  await delay(75);
  const explicit = await cdp.send('Runtime.evaluate',{returnByValue:true,
    expression:"document.documentElement.dataset.theme === 'light' && getComputedStyle(document.documentElement).colorScheme === 'light'"});
  checks.push({name:surface+' explicit light stays light on dark OS',passed:explicit.result.value === true});
  validateSurfaceResult({checks},cdp.exceptions);
  return checks;
}

export async function runChromiumSurface(binary, directory, screenshot, options = {}) {
  if (typeof WebSocket !== 'function') throw new Error('Rendered checks require Node.js with built-in WebSocket support.');
  const profile = await mkdtemp(path.join(os.tmpdir(), 'captionkeep-surface-'));
  let child;
  let cdp;
  // Serving the exact packaged files avoids file:// fetch restrictions in the
  // localization and dynamically loaded archive modules.
  const server = createServer(async (request,response) => {
    try {
      const requested = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
      const file = path.resolve(directory, `.${requested}`);
      if (!file.startsWith(path.resolve(directory) + path.sep)) {response.writeHead(403); response.end(); return;}
      const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
      response.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');
      response.end(await readFile(file));
    } catch {response.writeHead(404); response.end();}
  });
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  try {
    child = spawn(binary, ['--headless=new','--disable-gpu','--no-first-run',
      '--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],
      {windowsHide:true,stdio:'ignore'});
    let launchError;
    child.on('error', error => { launchError = error; });
    let port;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error(`Browser exited before debugging connection: ${child.exitCode}`);
      try { port = (await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]; break; } catch { await delay(100); }
    }
    if (!port) throw new Error('Browser did not open a debugging connection.');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find(target => target.type === 'page');
    if (!page?.webSocketDebuggerUrl) throw new Error('Browser page debugging target is unavailable.');
    cdp = await connection(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:fixture});
    const checks = [];
    for (const surface of ['settings','popup','viewer','handoff','workspace']) {
      const viewport = options.viewportForSurface?.(surface) || {width:surface === 'popup' ? 364 : 1280, height:surface === 'popup' ? 600 : 900};
      await cdp.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false});
      const pageName = surface === 'viewer' ? 'viewer.html?payload=viewer_payload_surface'
        : surface === 'handoff' ? 'handoff.html' : surface === 'workspace' ? 'sidepanel.html'
          : surface === 'settings' ? 'popup.html?view=settings' : 'popup.html';
      const url = `http://127.0.0.1:${server.address().port}/${pageName}`;
      await cdp.send('Page.navigate',{url});
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await cdp.send('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});
        if (result.result.value === 'complete') {ready = true; break;}
        await delay(50);
      }
      if (!ready) throw new Error(`${surface} page did not finish loading.`);
      await delay(200);
      if (options.beforeAssertions) {
        const injected = await cdp.send('Runtime.evaluate',{expression:options.beforeAssertions,awaitPromise:true});
        if (injected.exceptionDetails) {
          throw new Error(`Browser script exception: ${injected.exceptionDetails.exception?.description || injected.exceptionDetails.text}`);
        }
      }
      const expression = surface === 'settings' ? settingsAssertions : surface === 'popup' ? popupAssertions
        : surface === 'viewer' ? viewerAssertions : surface === 'workspace' ? workspaceAssertions : handoffAssertions;
      const result = await cdp.send('Runtime.evaluate',{expression,
        returnByValue:true,awaitPromise:true});
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      validateSurfaceResult(result.result.value,cdp.exceptions);
      checks.push(...result.result.value.checks);
      checks.push(...await themeChecks(cdp,surface));
      if (options.afterSurface) {
        const extra = await options.afterSurface(surface, cdp);
        if (extra) {
          validateSurfaceResult(extra,cdp.exceptions);
          checks.push(...extra.checks);
        }
      }
      if (surface === 'settings') {
        await cdp.send('Runtime.evaluate',{expression:'window.scrollTo(0,0)'});
        const captured = await cdp.send('Page.captureScreenshot',{format:'png'});
        await writeFile(screenshot,Buffer.from(captured.data,'base64'));
      }
    }
    return {checks};
  } finally {
    cdp?.close();
    if (child && child.exitCode === null) {
      const closed = new Promise(resolve => child.once('exit',resolve));
      child.kill();
      await Promise.race([closed,delay(3000)]);
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:200});
  }
}
