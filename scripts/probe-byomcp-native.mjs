import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {installedBrowsers} from './browser-platform.mjs';
import {createInstallPlan} from '../companion/byomcp/install-plan.mjs';
import {inputSchema} from '../companion/byomcp/test/fixtures/mcp-server.mjs';
import {zipEntries} from './verify-package-source.mjs';
import {helperArtifactNames} from './package-byomcp-helper.mjs';
const require=createRequire(import.meta.url);
const contracts=require('../teams-captions-saver/evidenceActionContracts.js');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const HOST='com.daftech.captionkeep.byomcp';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function privateBase(baseDirectory) {
    const candidate=baseDirectory || (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA,'DAF-TECH/CaptionKeep/BYOMCP-Probe'));
    if(!candidate || !path.isAbsolute(candidate) || path.basename(path.resolve(candidate))!=='BYOMCP-Probe') throw Error('An explicit scoped BYOMCP-Probe private directory is required.');
    return path.resolve(candidate);
}
export async function prepareByomcpNativeProbe({root=project,baseDirectory,cloudflareInventory=false}={}) {
    if(process.platform!=='win32')throw Error('This bounded native probe prepares only the approved Windows Brave profile.');
    root=path.resolve(root);
    const base=privateBase(baseDirectory),setup=path.join(base,'setup'),extension=path.join(base,'extension'),profileDirectory=path.join(base,'profile'),installation=path.join(base,'installation');
    await mkdir(setup,{recursive:true});await mkdir(profileDirectory,{recursive:true});
    const source=path.join(root,'dist/prod/brave-unpacked');
    const manifest=JSON.parse(await readFile(path.join(source,'manifest.json'),'utf8'));
    if(!(manifest.optional_permissions || []).includes('nativeMessaging'))throw Error('Packaged optional nativeMessaging permission is missing.');
    const build=await readFile(path.join(root,'scripts/build-browser-targets.mjs'),'utf8');
    const key=/const UAT_KEY = '([^']+)';/.exec(build)?.[1];
    if(!key)throw Error('Stable public UAT identity is unavailable.');
    manifest.key=key;
    const extensionId=sha(Buffer.from(key,'base64')).slice(0,32).replace(/[0-9a-f]/g,digit=>String.fromCharCode(97+parseInt(digit,16)));
    await cp(source,extension,{recursive:true});
    await writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
    const runtime=await readFile(path.join(extension,'browserRuntimeConfig.js'),'utf8');
    if(!runtime.includes('"target":"brave"'))throw Error('Probe extension does not carry the Brave runtime identity.');
    const names=helperArtifactNames(manifest.version),archive=await readFile(path.join(root,'dist/prod',names.zip));
    const published=JSON.parse(await readFile(path.join(root,'dist/prod',names.hashes),'utf8'));
    if(published.zip!==names.zip || published.zipSha256!==sha(archive).toUpperCase())throw Error('Public helper ZIP hash differs from its release manifest.');
    const entries=zipEntries(archive);
    if(entries.size!==published.entries.length)throw Error('Public helper ZIP entry count differs.');
    for(const [name,bytes] of entries){
        const file=path.resolve(installation,name),expected=published.entries.find(item=>item.path===name);
        if(!file.startsWith(path.resolve(installation)+path.sep) || !expected || expected.sha256!==sha(bytes).toUpperCase()
            || !/^(?:companion\/byomcp\/|teams-captions-saver\/|LICENSE$|START-HERE\.md$|BYOMCP-SBOM\.cdx\.json$)/.test(name))throw Error('Public helper archive entry is not approved.');
        await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);
    }
    const node=process.execPath,fixture=path.join(installation,'companion/byomcp/test/fixtures/mcp-server.mjs');
    await mkdir(path.dirname(fixture),{recursive:true});
    await cp(path.join(root,'companion/byomcp/test/fixtures/mcp-server.mjs'),fixture);
    let identity={id:'synthetic-native-inventory',label:'Synthetic inventory only — no actions',revision:1,transport:'stdio',
        executable:node,executableDigest:sha(await readFile(node)),cwd:path.join(installation,'companion/byomcp'),args:[fixture,'--serve'],
        tools:[{name:'synthetic_read',operation:'read',readOnly:true,schemaDigest:await contracts.digest({input:inputSchema,output:null})}]};
    const oauthStorePath=path.join(base,'CloudflareOAuth/cloudflare.dpapi');
    if(cloudflareInventory){
        // This mode is explicitly post-consent. It cannot initiate OAuth and
        // imports only the verified ZIP's private installed helper modules.
        try {
            const oauth=await import(pathToFileURL(path.join(installation,'companion/byomcp/cloudflare-oauth.mjs')).href);
            const {createSdkAdapters}=await import(pathToFileURL(path.join(installation,'companion/byomcp/transports.mjs')).href);
            if(oauth.RESOURCE!=='https://mcp.cloudflare.com/mcp')throw Error('resource-mismatch');
            identity={id:'cloudflare-readonly',label:'Cloudflare metadata only — no actions',revision:1,transport:'remote',
                resource:oauth.RESOURCE,credentialReference:'cloudflare-readonly',tools:[]};
            const adapters=createSdkAdapters({getAuthorization:async resource=>{
                if(resource!==oauth.RESOURCE)throw Error('resource-mismatch');
                return oauth.getCloudflareAuthorization(identity,{storePath:oauthStorePath});
            }});
            try {
                const inventory=await adapters.remote.inspect(identity); // tools/list ONLY, never invoke/observe
                if(!Array.isArray(inventory)||inventory.length>100)throw Error('inventory-unavailable');
                const matches=inventory.filter(tool=>tool.name==='whoami');
                if(matches.length!==1 || !/^[a-f0-9]{64}$/.test(matches[0].schemaDigest || ''))throw Error('whoami-schema-unavailable');
                identity.tools=[{name:'whoami',operation:'read',readOnly:true,schemaDigest:matches[0].schemaDigest}];
            } finally {await adapters.remote.disconnect();}
        } catch {throw Error('Cloudflare metadata preparation requires an existing matching private OAuth grant and verified helper modules. No authorization was started or tool invoked.');}
    }
    const browserConfiguration={version:1,hostName:HOST,allowedCallers:[{browser:'brave',caller:`chrome-extension://${extensionId}/`}],
        profiles:[{profile:{...identity,profileDigest:await contracts.digest(identity)},actions:[]}]};
    const configurationPath=path.join(setup,'helper-config.json'),browserConfigurationPath=path.join(setup,'browser-configuration.json'),
        launcherPath=path.join(setup,'host.cmd'),manifestPath=path.join(setup,`${HOST}.json`);
    const configuration={enabled:true,browserConfiguration,browserStoragePath:profileDirectory,verificationTools:[],...(cloudflareInventory?{oauthStorePath}:{})};
    const plan=createInstallPlan({browser:'brave',os:'windows',extensionId,nodePath:node,cliPath:path.join(installation,'companion/byomcp/cli.mjs'),
        configurationPath,launcherPath,manifestPath});
    // Registration is owned by the coordinating human-authorized setup step.
    // This is the explicitly selected Chromium Chrome-key fallback probe, not
    // a claim that a BraveSoftware-specific registry convention was verified.
    const registryCandidate={key:`HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST}`,defaultValue:manifestPath};
    await writeFile(configurationPath,JSON.stringify(configuration,null,2)+'\n',{mode:0o600});
    await writeFile(browserConfigurationPath,JSON.stringify(browserConfiguration,null,2)+'\n',{mode:0o600});
    await writeFile(launcherPath,plan.launcher);
    await writeFile(manifestPath,JSON.stringify(plan.manifest,null,2)+'\n');
    await writeFile(path.join(setup,'install-plan.json'),JSON.stringify({...plan,registryCandidate,installationPerformed:false},null,2)+'\n');
    const record={version:1,extensionId,extension,profileDirectory,setup,installation,configurationPath,browserConfigurationPath,launcherPath,manifestPath,registryCandidate,
        profileId:identity.id,cloudflareInventory:cloudflareInventory===true,workerSha256:sha(await readFile(path.join(extension,'service_worker.js'))),nodeSha256:sha(await readFile(node)),
        fixtureSha256:sha(await readFile(fixture)),helperZipSha256:sha(archive),scope:cloudflareInventory
            ?'Post-authorization Cloudflare tools/list metadata only. whoami schema pinned but NEVER invoked; actions remain empty. No DNS, directory, data-tool or meeting-content calls.'
            :'Synthetic enrollment and tools/list only. No tools/call, meeting source, Cloudflare authentication, DNS or directory queries.',
        registrationPerformed:false,preparedAt:new Date().toISOString()};
    await writeFile(path.join(setup,'probe.json'),JSON.stringify(record,null,2)+'\n');
    return record;
}
function pipe(child) {
    let sequence=0,buffer='';const pending=new Map();
    const fail=error=>{for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error);}pending.clear();};
    child.once('error',fail);child.once('exit',()=>fail(Error('Isolated Brave exited.')));
    child.stdio[4].on('data',chunk=>{buffer+=chunk.toString();let index;
        while((index=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,index);buffer=buffer.slice(index+1);if(!raw)continue;
            let message;try{message=JSON.parse(raw);}catch{fail(Error('Invalid browser protocol reply'));continue;}
            const entry=pending.get(message.id);if(!entry)continue;pending.delete(message.id);clearTimeout(entry.timer);
            if(message.error)entry.reject(Error(message.error.message));else entry.resolve(message.result);}
    });
    return {send(method,params={},sessionId,timeout=30000){return new Promise((resolve,reject)=>{
        const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Browser command timed out: ${method}`));},timeout);
        pending.set(id,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');
    });}};
}
export async function runByomcpNativeProbe({root=project,baseDirectory,interactive=false,manualConnect=false}={}) {
    if(manualConnect&&!interactive)throw Error('Manual Connect requires an explicitly visible interactive probe.');
    root=path.resolve(root);const base=privateBase(baseDirectory),record=JSON.parse(await readFile(path.join(base,'setup/probe.json'),'utf8'));
    if(record.extension!==path.join(base,'extension') || record.profileDirectory!==path.join(base,'profile'))throw Error('Probe paths differ from approved isolated directories.');
    if(!/^[a-p]{32}$/.test(record.extensionId || '') || !/^[a-zA-Z0-9._-]{1,100}$/.test(record.profileId || '')
        || record.browserConfigurationPath!==path.join(base,'setup/browser-configuration.json'))throw Error('Probe caller/configuration identity is invalid.');
    if(record.workerSha256!==sha(await readFile(path.join(record.extension,'service_worker.js'))))throw Error('Prepared worker bytes changed; prepare and review registration again.');
    const browser=(await installedBrowsers()).find(item=>item.browser==='brave'&&item.binary);
    if(!browser)throw Error('Installed Brave is unavailable.');
    const child=spawn(browser.binary,[...(interactive?[]:['--headless=new']),'--no-first-run','--no-default-browser-check','--disable-background-networking',
        '--enable-unsafe-extension-debugging','--remote-debugging-pipe',`--user-data-dir=${record.profileDirectory}`,'about:blank'],
        {windowsHide:!interactive,stdio:['ignore','ignore','pipe','pipe','pipe']});
    const connection=pipe(child);let stderr='',ready=false;child.stderr.on('data',value=>{stderr=(stderr+value.toString()).slice(-4096);});
    const evidence={testedAt:new Date().toISOString(),scope:record.scope,extensionId:record.extensionId,workerSha256:record.workerSha256,
        registrationPerformedByProbe:false,interactive:interactive===true,manualConnect:manualConnect===true,checks:[],permissionMethod:manualConnect
            ?'Visible Settings awaits the person’s Connect click and real optional permission grant. No programmatic Connect click.'
            :'Production Settings DOM Connect click under CDP userGesture; browser grant is real, not mocked or set through CDP.'};
    try {
        const version=await connection.send('Browser.getVersion');ready=true;evidence.engineVersion=version.product;
        const loaded=await connection.send('Extensions.loadUnpacked',{path:record.extension});
        if(loaded.id!==record.extensionId)throw Error('Loaded extension identity differs from registered allowlist.');
        const target=await connection.send('Target.createTarget',{url:`chrome-extension://${loaded.id}/popup.html?view=settings`});
        const {sessionId}=await connection.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
        await connection.send('Runtime.enable',{},sessionId);
        await connection.send('Page.enable',{},sessionId);
        if(interactive){await connection.send('Target.activateTarget',{targetId:target.targetId});await connection.send('Page.bringToFront',{},sessionId);}
        const evaluate=async expression=>{const value=await connection.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},sessionId,60000);
            if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result?.value;};
        for(let index=0;index<100;index++){
            if(await evaluate("document.readyState==='complete'&&!!document.getElementById('byomcp-connect')"))break;
            await delay(50);
        }
        const configurationText=await readFile(record.browserConfigurationPath,'utf8');
        if(Buffer.byteLength(configurationText)>131072)throw Error('Probe configuration exceeds the approved body bound.');
        const configuration=JSON.parse(configurationText);
        if(configuration.allowedCallers?.length!==1 || configuration.allowedCallers[0]?.browser!=='brave'
            || configuration.allowedCallers[0]?.caller!==`chrome-extension://${record.extensionId}/`
            || configuration.profiles?.length!==1 || configuration.profiles[0]?.profile?.id!==record.profileId
            || configuration.profiles[0]?.actions?.length!==0)throw Error('Probe must have one exact caller/profile and no actions.');
        const configured=await evaluate(`chrome.runtime.sendMessage({message:'byomcp_settings',operation:'configure',configuration:${JSON.stringify(configuration)}})`);
        evidence.checks.push({name:'Production worker accepts non-secret probe configuration while remaining disconnected',passed:configured?.ok===true&&configured.status?.enrollmentVerified===false});
        // Permission-denied control runs before the actual Settings Connect click.
        const permission=await evaluate("chrome.permissions.contains({permissions:['nativeMessaging']})");
        evidence.permissionGrantedBefore=permission===true;
        if(!permission){
            const denied=await evaluate("chrome.runtime.sendMessage({message:'byomcp_settings',operation:'connect'})");
            evidence.checks.push({name:'No-permission direct worker connection fails closed',passed:denied?.ok===false});
        }else{
            evidence.denialControl={status:'not-run',reason:'This isolated profile already holds the real optional grant. No permission was removed or fabricated; earlier denial evidence must be considered separately.'};
        }
        await evaluate("document.getElementById('byomcp-settings').open=true;document.getElementById('byomcp-connect').scrollIntoView();document.getElementById('byomcp-connect').addEventListener('click',event=>{globalThis.__probeConnectClick={isTrusted:event.isTrusted};},{once:true})");
        if(!manualConnect)await evaluate("document.getElementById('byomcp-connect').click()");
        let status;
        const permissionDeadline=Date.now()+(manualConnect?180000:interactive?120000:20000);
        while(Date.now()<permissionDeadline){
            status=await evaluate("chrome.runtime.sendMessage({message:'byomcp_settings',operation:'status'})");
            if(status?.status?.enrollmentVerified===true)break;await delay(200);
        }
        evidence.checks.push({name:'Actual production Settings permission flow enrolls the registered native helper',passed:status?.ok===true&&status.status?.enrollmentVerified===true});
        if(status?.status?.enrollmentVerified===true){
            const inventory=await evaluate(`chrome.runtime.sendMessage({message:'byomcp_settings',operation:'inventory',profileId:${JSON.stringify(record.profileId)},revision:1})`);
            evidence.checks.push({name:'Real helper inventory is read but unsupported named actions are not enabled',passed:inventory?.ok===true&&Array.isArray(inventory.inventory?.tools)&&inventory.inventory.tools.length===0});
            const after=await evaluate("chrome.runtime.sendMessage({message:'byomcp_settings',operation:'status'})");
            evidence.checks.push({name:'Configured profile inventory reviewed without enabling actions',passed:after.status?.profiles?.some(profile=>profile.id===record.profileId&&profile.inventoryVerified===true)===true&&after.status.enabled===false});
        }
        evidence.uiStatus=await evaluate("document.getElementById('byomcp-status').textContent");
        evidence.permissionGrantedAfter=await evaluate("chrome.permissions.contains({permissions:['nativeMessaging']})");
        evidence.settingsBusy=await evaluate("document.getElementById('byomcp-settings').getAttribute('aria-busy')");
        evidence.connectDisabled=await evaluate("document.getElementById('byomcp-connect').disabled");
        evidence.connectClick=await evaluate("globalThis.__probeConnectClick || null");
        if(manualConnect)evidence.checks.push({name:'Manual mode observed a trusted browser Connect click',passed:evidence.connectClick?.isTrusted===true});
        evidence.denialControlRun=!permission;
        evidence.passed=evidence.checks.every(check=>check.passed===true);
        return evidence;
    } catch(error) {
        evidence.passed=false;evidence.error=String(error.message).replaceAll(root,'[project]').slice(0,1600);
        if(!ready)evidence.startupStderr=stderr.replace(/[\u0000-\u001f]/g,' ').slice(-1000);
        return evidence;
    } finally {
        await writeFile(path.join(base,'native-probe-result.json'),JSON.stringify(evidence,null,2)+'\n');
        if(child.exitCode===null){if(ready){try{await connection.send('Browser.close');}catch{}}
            if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await Promise.race([exited,delay(3000)]);}}
        // Retain isolated evidence/config/profile for inspection. The owner that
        // explicitly registers the host must also unregister it; this script
        // never changes registration or touches the user's ordinary profile.
    }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
    const mode=process.argv[2];if(!['prepare','run'].includes(mode))throw Error('Choose prepare or run; neither performs registration.');
    const result=mode==='prepare'?await prepareByomcpNativeProbe({cloudflareInventory:process.argv.includes('--cloudflare-inventory')})
        :await runByomcpNativeProbe({interactive:process.argv.includes('--interactive'),manualConnect:process.argv.includes('--manual-connect')});
    console.log(JSON.stringify(result,null,2));if(mode==='run'&&!result.passed)process.exitCode=1;
}
