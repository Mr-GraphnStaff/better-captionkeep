(() => {
    'use strict';
    const targets=new Set(['chrome','edge','brave','firefox','opera']);
    const steps=['intro','service','local','connect'];
    const failures=new WeakSet();
    function failure(field,message) {const error=Object.assign(new Error(message),{field});failures.add(error);return error;}
    function createSetupRequest(input,environment) {
        if(environment?.os!=='win' || !targets.has(environment?.browser)
            || (environment.browser==='firefox'?!/^[a-zA-Z0-9@._{}-]{1,128}$/.test(environment.extensionId || ''):!/^[a-p]{32}$/.test(environment.extensionId || '')))
            throw failure('environment','Guided setup currently prepares Windows helper files for an installed supported extension. Use the reviewed advanced setup instructions for this environment.');
        const label=typeof input?.label==='string'?input.label.trim():'';
        if(!label || label.length>120 || /[\u0000-\u001f\u007f]/.test(label))throw failure('label','Enter a service name of 1–120 characters, without control characters.');
        if(!['remote','stdio'].includes(input?.transport))throw failure('transport','Choose a remote service or a local program.');
        const profile={label,transport:input.transport};
        if(profile.transport==='remote') {
            let resource;
            try {if(typeof input.resource!=='string' || /[\u0000-\u001f\u007f?#]/.test(input.resource))throw new Error('invalid-resource');resource=new URL(input.resource);}
            catch {throw failure('resource','Enter the service’s complete HTTPS MCP address without query parameters, fragments or control characters.');}
            if(resource.href.length>2048 || resource.protocol!=='https:' || resource.username || resource.password || resource.search || resource.hash
                || !resource.hostname || ['localhost','localhost.localdomain'].includes(resource.hostname) || resource.hostname.endsWith('.localhost'))
                throw failure('resource','Use an HTTPS MCP address without credentials, query parameters, or a fragment. Localhost endpoints are not supported by this remote helper.');
            profile.resource=resource.href;
        }
        // Copy only the agreed non-secret request fields, never arbitrary input.
        return {version:1,browser:environment.browser,extensionId:environment.extensionId,profile};
    }
    function createController({environment,download,sendStatus}) {
        let state={step:'intro',status:'Setup has not started. MCP remains optional.',verified:false,busy:false},binding,generation=0;
        const snapshot=()=>({...state});
        return {getState:snapshot,
            async start() {
                const expected=++generation;state={...state,busy:true,verified:false};
                try {binding=await environment();createSetupRequest({label:'Setup',transport:'stdio'},binding);
                    if(expected===generation)state={...state,step:'service',status:'Choose your service. No connection or sign-in has started.'};
                } catch(error) {if(expected===generation)state={...state,status:failures.has(error) && error.field==='environment'?error.message:'The installed extension environment could not be checked. Retry or use advanced setup.'};}
                finally {if(expected===generation)state={...state,busy:false};}return snapshot();
            },
            back() {generation++;state={...state,step:steps[Math.max(0,steps.indexOf(state.step)-1)],busy:false,verified:false,status:'No setup or connection is confirmed. You can review the previous step.'};return snapshot();},
            async download(input) {
                if(state.step!=='service' || state.busy)throw failure('state','Choose a service before downloading its setup request.');
                const request=createSetupRequest(input,binding),expected=++generation;state={...state,busy:true,verified:false};
                try {await download(request);if(expected===generation)state={...state,step:'local',status:'Setup request download requested. Nothing has been installed, registered, authenticated or connected.'};}
                catch {if(expected===generation)state={...state,status:'The setup request could not be downloaded. Retry; no installation or connection is confirmed.'};}
                finally {if(expected===generation)state={...state,busy:false};}return snapshot();
            },
            next() {if(state.step==='local')state={...state,step:'connect',verified:false,status:'Import the generated browser binding, then choose Connect enrolled helper yourself.'};return snapshot();},
            async verify() {
                if(state.step!=='connect' || state.busy)return snapshot();
                const expected=++generation;state={...state,busy:true,verified:false,status:'Checking the existing helper connection only…'};
                try {const response=await sendStatus();if(expected===generation){const verified=response?.ok===true && response.status?.protocolVersion===1 && response.status?.enrollmentVerified===true;
                    state={...state,verified,status:verified?'Helper enrollment verified. Service sign-in and available tools still need separate checks. No tool was run.'
                        :'Helper connection is not verified. Review local setup and the imported binding, then use Connect enrolled helper and retry this check.'};}}
                catch {if(expected===generation)state={...state,status:'Connection status could not be checked. Retry; no connection is confirmed.'};}
                finally {if(expected===generation)state={...state,busy:false};}return snapshot();
            }};
    }
    async function bounded(promise,milliseconds=15000) {
        let timer;
        try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('setup-timeout')),milliseconds);})]);}
        finally {clearTimeout(timer);}
    }
    function mount(document,api=globalThis.chrome,runtime=globalThis.CaptionKeepBrowserRuntime) {
        const section=document.getElementById('byomcp-setup');if(!section)return null;
        const get=name=>document.getElementById(`byomcp-setup-${name}`);
        const nodes=Object.fromEntries(['heading','progress','status','start','back','form','label','resource','resource-field','remote','stdio','download','import','next','connect','verify'].map(name=>[name,get(name)]));
        const controller=createController({environment:async()=>{
            if(typeof api?.runtime?.getPlatformInfo!=='function' || typeof api?.downloads?.download!=='function')throw failure('environment','Guided setup requires an installed extension with local download support. A website preview cannot prepare its browser binding.');
            const platform=await bounded(api.runtime.getPlatformInfo());return {os:platform.os,browser:runtime?.target,extensionId:api.runtime.id};
        },download:async request=>{
            const url=URL.createObjectURL(new Blob([JSON.stringify(request,null,2)+'\n'],{type:'application/json'}));
            try {const id=await bounded(api.downloads.download({url,filename:'captionkeep-mcp-setup-request.json',saveAs:true}));if(!Number.isInteger(id) || id<0)throw new Error('download-unconfirmed');}
            finally {URL.revokeObjectURL(url);}
        },sendStatus:()=>bounded(api.runtime.sendMessage({message:'byomcp_settings',operation:'status'}))});
        function render(state,focus=false) {
            for(const step of section.querySelectorAll('[data-byomcp-setup-step]'))step.hidden=step.dataset.byomcpSetupStep!==state.step;
            nodes.progress.textContent=`Step ${steps.indexOf(state.step)+1} of 4 — ${({intro:'One-time setup',service:'Choose service',local:'Local helper preparation',connect:'Verify connection'})[state.step]}`;
            nodes.status.textContent=state.status;section.setAttribute('aria-busy',String(state.busy));nodes.back.hidden=state.step==='intro';
            for(const name of ['start','download','next','verify'])nodes[name].disabled=state.busy;
            if(focus)nodes.heading.focus();
        }
        const navigate=async action=>{try {const pending=action();render(controller.getState());render(await pending,true);} catch(error){const known=failures.has(error);
            nodes.status.textContent=known && ['label','resource','transport'].includes(error.field)?error.message:'Setup could not continue. Review the service fields and retry.';
            if(known && ['label','resource'].includes(error.field)){nodes[error.field].setAttribute('aria-invalid','true');nodes[error.field].focus();}}};
        nodes.start.addEventListener('click',()=>{void navigate(()=>controller.start());});
        nodes.back.addEventListener('click',()=>render(controller.back(),true));
        nodes.next.addEventListener('click',()=>render(controller.next(),true));
        nodes.verify.addEventListener('click',()=>{void navigate(()=>controller.verify());});
        nodes.form.addEventListener('submit',event=>{event.preventDefault();void navigate(()=>controller.download({label:nodes.label.value,transport:nodes.stdio.checked?'stdio':'remote',resource:nodes.resource.value}));});
        const updateTransport=()=>{nodes['resource-field'].hidden=nodes.stdio.checked;nodes.resource.required=!nodes.stdio.checked;};
        for(const name of ['remote','stdio'])nodes[name].addEventListener('change',updateTransport);
        for(const name of ['label','resource'])nodes[name].addEventListener('input',()=>nodes[name].removeAttribute('aria-invalid'));
        function reveal(id,installation=false) {
            const target=document.getElementById(id);if(!target)return;
            if(installation)document.getElementById('byomcp-installation').open=true;
            target.scrollIntoView({block:'center'});target.focus();
        }
        nodes.import.addEventListener('click',()=>reveal('byomcp-configuration-file',true));
        nodes.connect.addEventListener('click',()=>reveal('byomcp-connect'));
        updateTransport();render(controller.getState());return controller;
    }
    if(typeof module!=='undefined' && module.exports)module.exports={createSetupRequest,createController,mount};
    if(typeof document!=='undefined')mount(document);
})();
