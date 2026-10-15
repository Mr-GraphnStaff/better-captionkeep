(function initializeCatalog(root) {
    'use strict';
    const LIMIT = 48000;
    const ID = /^[a-zA-Z0-9._-]{1,100}$/;
    const TOOL = /^[a-zA-Z0-9._-]{1,128}$/;
    const HASH = /^[a-f0-9]{64}$/;
    function json(value, depth = 0) {
        if (depth > 12) throw Error('Invalid or oversized JSON object.');
        if (value === null || ['string','boolean'].includes(typeof value)) return JSON.stringify(value);
        if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
        if (Array.isArray(value)) return `[${value.map(item => json(item,depth+1)).join(',')}]`;
        if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw Error('Invalid JSON object.');
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${json(value[key],depth+1)}`).join(',')}}`;
    }
    function argumentsFrom(text) {
        if (typeof text !== 'string' || new TextEncoder().encode(text).length > LIMIT) throw Error('Arguments exceed the local review limit.');
        let value; try {value=JSON.parse(text);} catch {throw Error('Enter a valid JSON object.');}
        if (!value || Array.isArray(value) || typeof value !== 'object') throw Error('Enter a JSON object, not a list or scalar.');
        json(value); return value;
    }
    function createController({send,now=()=>Date.now()}) {
        let generation=0, pending=false, state={profileId:'',tools:[],proposal:null,result:null};
        const invalidate=()=>{generation++;state.proposal=null;state.result=null;};
        async function request(operation,fields) {
            if (pending) throw Error('Wait for the current operation to finish.');
            pending=true;const expected=generation;
            try {
                let response;
                try {response=await send({message:'byomcp_settings',operation,...fields});}
                catch {throw Error('The local helper request failed. Check connection before continuing. Do not automatically retry an execution.');}
                if (expected!==generation) throw Error('Selection changed. Review the operation again.');
                if (response?.ok!==true) throw Error('Operation not verified. Check connection, configured catalog access and write permissions. Do not automatically retry an execution.');
                return response;
            } finally {pending=false;}
        }
        return {
            getState:()=>structuredClone(state),invalidate,
            async load(profileId) {
                if (!ID.test(profileId)) throw Error('Choose a verified profile first.');
                invalidate();state={profileId,tools:[],proposal:null,result:null};
                const {catalog}=await request('catalog',{profileId});
                if (!catalog || catalog.profileId!==profileId || !Array.isArray(catalog.tools) || catalog.tools.length>100
                    || new TextEncoder().encode(json(catalog)).length>65536) throw Error('Tool catalog unavailable or too large.');
                for (const tool of catalog.tools) if (!TOOL.test(tool.name) || !HASH.test(tool.schemaDigest)
                    || !tool.inputSchema || typeof tool.inputSchema!=='object') throw Error('Invalid tool metadata.');
                state.tools=structuredClone(catalog.tools);return this.getState();
            },
            async prepare(tool,text) {
                invalidate();const args=argumentsFrom(text),selected=state.tools.find(item=>item.name===tool);
                if (!selected) throw Error('Choose a tool from the loaded catalog.');
                const {proposal}=await request('prepare-tool',{profileId:state.profileId,tool,arguments:args});
                if (!proposal || proposal.profileId!==state.profileId || proposal.tool!==tool || proposal.schemaDigest!==selected.schemaDigest
                    || !HASH.test(proposal.digest) || typeof proposal.id!=='string' || proposal.id.length>64
                    || !Number.isSafeInteger(proposal.expiresAt) || proposal.expiresAt<=now() || proposal.expiresAt>now()+300000
                    || json(proposal.arguments)!==json(args)) throw Error('The reviewed operation does not match your request.');
                state.proposal=structuredClone(proposal);return this.getState();
            },
            async execute() {
                const proposal=state.proposal;
                if (!proposal || proposal.expiresAt<=now()) {invalidate();throw Error('Review a fresh operation before approving.');}
                state.proposal=null; // Consume locally before awaiting; double approval cannot replay.
                const {result}=await request('execute-tool',{profileId:state.profileId,proposalId:proposal.id,proposalDigest:proposal.digest});
                if (!result || !['returned','outcome-unknown'].includes(result.status)
                    || new TextEncoder().encode(json(result)).length>900000) throw Error('Result could not be verified. Do not automatically retry.');
                state.result=structuredClone(result);return this.getState();
            }
        };
    }
    const api={argumentsFrom,createController};
    if (typeof module!=='undefined' && module.exports) module.exports=api;
    root.CaptionKeepByomcpCatalog=Object.freeze(api);
    if (typeof document==='undefined' || !document.getElementById('byomcp-catalog-panel')) return;
    const el=name=>document.getElementById(`byomcp-catalog-${name}`);
    const profile=document.getElementById('byomcp-profile'),writes=document.getElementById('byomcp-allow-writes');
    const controller=createController({send:message=>chrome.runtime.sendMessage(message)});
    function clearReview() {controller.invalidate();el('review').hidden=true;el('result').textContent='';}
    function describe() {
        clearReview();const tool=controller.getState().tools.find(item=>item.name===el('tool').value);
        el('description').textContent=tool ? `Server description (untrusted): ${String(tool.description || 'No description provided.')}` : '';
        el('schema').textContent=tool ? JSON.stringify(tool.inputSchema,null,2) : '';
    }
    async function run(action) {
        for (const name of ['load','prepare','execute']) el(name).disabled=true;
        el('status').textContent='Working…';
        try {await action();} catch(error) {el('status').textContent=error.message;el('review').hidden=true;}
        finally {for (const name of ['load','prepare','execute']) el(name).disabled=false;}
    }
    el('load').addEventListener('click',()=>{void run(async()=>{
        clearReview();const state=await controller.load(profile.value);
        el('tool').replaceChildren();const first=document.createElement('option');first.value='';first.textContent='Choose a tool';el('tool').append(first);
        for (const tool of state.tools) {const option=document.createElement('option');option.value=tool.name;option.textContent=tool.name;el('tool').append(option);}
        el('tool').disabled=false;describe();el('status').textContent=`${state.tools.length} tools available, including write-capable tools. Nothing has executed.`;
    });});
    el('tool').addEventListener('change',describe);
    profile.addEventListener('change',()=>{clearReview();el('tool').replaceChildren();el('tool').disabled=true;});
    writes.addEventListener('change',clearReview);
    document.getElementById('byomcp-disconnect').addEventListener('click',clearReview);
    el('arguments').addEventListener('input',()=>{clearReview();el('arguments').removeAttribute('aria-invalid');});
    el('prepare').addEventListener('click',()=>{void run(async()=>{
        let state;try {state=await controller.prepare(el('tool').value,el('arguments').value);} catch(error){el('arguments').setAttribute('aria-invalid','true');throw error;}
        const proposal=state.proposal;
        el('destination').textContent=`Helper profile: ${proposal.profileId}. Tool: ${proposal.tool}.`;
        el('exact').textContent=JSON.stringify(proposal.arguments,null,2);el('review').hidden=false;
        el('review-heading').focus();el('status').textContent='Review the exact arguments above. Nothing has executed.';
    });});
    el('cancel').addEventListener('click',()=>{clearReview();el('status').textContent='Review cancelled. Nothing executed.';el('prepare').focus();});
    el('execute').addEventListener('click',event=>{if(!event.isTrusted)return;void run(async()=>{
        if (!writes.checked) throw Error('Enable reviewed write actions before approving a general MCP tool.');
        el('review').hidden=true;const state=await controller.execute();
        el('result').textContent=JSON.stringify(state.result,null,2);
        el('status').textContent=state.result.status==='returned'?'Server response received (untrusted). A completed change has not been independently verified.':'Outcome unknown. Do not automatically retry; inspect the target first.';
    });});
})(globalThis);
