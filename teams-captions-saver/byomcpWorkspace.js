(function initializeByomcpWorkspace(root) {
    'use strict';
    const HASH = /^[a-f0-9]{64}$/;
    const copy = value => JSON.parse(JSON.stringify(value));
    function immutable(value) {if (value && typeof value === 'object') {Object.values(value).forEach(immutable); Object.freeze(value);} return value;}
    function checkSelection(request) {
        if (!request || !request.source || !HASH.test(request.source.sourceDigest || '') || !request.source.sessionId
            || !request.source.revision || !Array.isArray(request.source.captions) || !request.source.captions.length
            || request.source.captions.length > 12 || request.source.captions.some(caption => !caption.key || !caption.evidenceId || !caption.text))
            throw new Error('Choose bounded source evidence before preparing an action.');
        const profile = request.profile;
        if (!profile || profile.compatible !== true || profile.approved !== true || !profile.profileGrantId
            || !HASH.test(profile.schemaDigest || '') || !['read','write'].includes(profile.effect)
            || !['dns-change','directory-lookup'].includes(profile.kind) || !profile.id || !profile.tool
            || !Number.isSafeInteger(profile.revision) || profile.revision < 1)
            throw new Error('This action needs a reviewed compatible profile.');
        if (profile.kind === 'dns-change' && profile.effect !== 'write') throw new Error('The DNS profile must be a reviewed write action.');
        if (profile.kind === 'directory-lookup' && profile.effect !== 'read') throw new Error('The directory profile must be a reviewed read action.');
        return immutable(copy(request));
    }
    function createWorkflow({backend = {}, stillCurrent = () => false} = {}) {
        let generation = 0, selection = null, prepared = null;
        let state = {phase:'closed', message:'Bring Your Own MCP is off until an enrolled connection is available.'};
        const view = () => copy(state);
        function guard(expected) {
            if (expected !== generation || !selection || stillCurrent(selection.source) !== true)
                throw new Error('The source changed. Select evidence again; no new action is approved.');
        }
        function fail(message) {prepared = null; state = {...state,phase:'unavailable',message};}
        return {
            getState:view,
            open(request) {
                generation++; prepared = null; selection = checkSelection(request);
                const available = typeof backend.prepare === 'function' && typeof backend.approveAndDispatch === 'function';
                state = {phase:available ? 'editing' : 'unavailable', selection:copy(selection),
                    message:available ? 'Prepare the exact operation, then review it. Nothing has been executed.'
                        : 'Action execution is unavailable in this build. No evidence has been sent.'};
                return view();
            },
            async prepare(argumentsValue) {
                if (state.phase !== 'editing' && state.phase !== 'preview') throw new Error('A compatible action backend is unavailable.');
                const expected = generation, args = immutable(copy(argumentsValue));
                guard(expected); prepared = null; state = {...state,phase:'preparing',message:'Preparing an exact review. This is not execution approval.'};
                try {
                    const response = await backend.prepare({sourceId:selection.source.sessionId,profileId:selection.profile.id,
                        tool:selection.profile.tool,operation:selection.profile.effect,arguments:args,
                        captionKeys:selection.source.captions.map(caption=>caption.key),privacyMode:selection.privacyMode || 'scrubbed'}); guard(expected);
                    const preview = response?.preview;
                    if (response?.state !== 'draft' || !preview || !HASH.test(response.approvalDigest || '')
                        || preview.source?.sourceDigest !== selection.source.sourceDigest
                        || preview.source?.sessionId !== selection.source.sessionId || preview.source?.revision !== selection.source.revision
                        || JSON.stringify(preview.source?.captions?.map(caption=>caption.key)) !== JSON.stringify(selection.source.captions.map(caption=>caption.key))
                        || preview.connection?.id !== selection.profile.id || preview.connection?.revision !== selection.profile.revision || preview.tool !== selection.profile.tool
                        || !preview.connection.tools?.some(tool=>tool.name===selection.profile.tool && tool.schemaDigest===selection.profile.schemaDigest)
                        || !response.jobId || response.jobId !== preview.jobId || !Number.isSafeInteger(response.revision)
                        || preview.operation !== selection.profile.effect || !preview.arguments)
                        throw new Error('The operation preview could not be verified. Nothing is approved.');
                    prepared = immutable(copy(response));
                    state = {...state,phase:'preview',preview:copy(prepared.preview),message:'Review this exact operation. Execution requires the separate approval button.'};
                    return view();
                } catch (error) {if (expected === generation) fail('The operation preview is unavailable or stale. Nothing is approved.'); throw error;}
            },
            async execute({confirmed = false} = {}) {
                if (!confirmed || state.phase !== 'preview' || !prepared) throw new Error('Explicit review approval is required.');
                const expected = generation, approval = prepared; guard(expected);
                state = {...state,phase:'sending',message:'Submitting the approved operation once. Cancel cannot undo work already performed.'};
                try {
                    const response = await backend.approveAndDispatch({jobId:approval.jobId,expectedRevision:approval.revision,approvalDigest:approval.approvalDigest});
                    if (expected !== generation) return view();
                    guard(expected);
                    if (response?.jobId !== approval.jobId || !['queued','running','waiting','verified','outcome-unknown','blocked','failed','expired','cancelled'].includes(response.state)
                        || !Number.isSafeInteger(response.revision) || response.revision <= approval.revision)
                        throw new Error('Dispatch outcome could not be confirmed.');
                    prepared = immutable({...approval,revision:response.revision});
                    state = {...state,phase:'waiting',message:'Waiting for the service result. Completion has not been verified.'};
                    if (response.state==='verified') return this.acceptStatus(response);
                    if (['outcome-unknown','blocked','failed','expired','cancelled'].includes(response.state)) state={...state,phase:response.state,message:response.state==='blocked' ? 'The operation was blocked. No completion is established.' : response.state==='expired' ? 'Approval expired. Prepare a new operation preview.' : 'The operation outcome is not verified. Check the service before retrying.'};
                    return view();
                } catch (error) {if (expected === generation) state = {...state,phase:'outcome-unknown',message:'The operation outcome is unknown. Do not retry before checking the service.'}; throw error;}
            },
            edit() {
                if (!['editing','preview'].includes(state.phase)) return view();
                prepared=null; state={...state,phase:'editing',preview:null,message:'Arguments changed. Prepare and review a new exact operation before approving.'}; return view();
            },
            acceptStatus(status) {
                try {guard(generation);} catch(error) {fail('The source changed. This result is unavailable for the current selection.'); throw error;}
                if (!prepared || status?.jobId!==prepared.jobId || !Number.isSafeInteger(status.revision)
                    || status.revision<prepared.revision) throw new Error('Stale or unmatched operation status.');
                prepared=immutable({...prepared,revision:status.revision});
                if (status.state==='verified' && status.result) return this.acceptResult(status.result,status.proof);
                if (['failed','outcome-unknown'].includes(status.state)) {state={...state,phase:'outcome-unknown',message:'The operation result is not verified. Check the service before retrying.'};}
                return view();
            },
            acceptResult(result, trustedJobProof = null) {
                try {guard(generation);} catch(error) {fail('The source changed. This result is unavailable for the current selection.'); throw error;}
                if (state.phase !== 'waiting' || !prepared) throw new Error('No matching active operation.');
                if (result?.jobId !== prepared.jobId || result.approvalDigest !== prepared.approvalDigest
                    || result.sourceDigest !== selection.source.sourceDigest) throw new Error('The result does not match this approved source and operation.');
                const keys=new Set(selection.source.captions.map(caption=>caption.key));
                const verified = ['received','insufficient-evidence'].includes(result.status)
                    && Array.isArray(result.citations) && result.citations.every(key=>keys.has(key))
                    && (result.status==='insufficient-evidence' || !result.answer || result.citations.length>0)
                    && trustedJobProof?.verified===true && trustedJobProof.jobId===prepared.jobId
                    && trustedJobProof.approvalDigest===prepared.approvalDigest && trustedJobProof.sourceDigest===selection.source.sourceDigest
                    && HASH.test(trustedJobProof.receiptDigest || '');
                state = {...state,phase:verified ? 'verified' : 'unverified',result:copy(result),
                    message:verified ? 'Result source binding and receipt verified. Review the reported result; this component alone does not establish external action completion.'
                        : 'Result received but not verified. It cannot be pinned as completed work.'};
                return view();
            },
            async cancel() {
                const job = prepared; generation++; prepared = null;
                const completedReview=['verified','unverified','pinned','unmaterialized'].includes(state.phase);
                const dispatched = ['sending','waiting','outcome-unknown'].includes(state.phase);
                state = {...state,phase:'canceled',message:completedReview ? 'Closed result review. External work is not undone.' : dispatched ? 'Stopped waiting. The service may already have acted; cancellation does not undo it.' : 'Review canceled. No operation was approved.'};
                if (dispatched && typeof backend.cancel === 'function') {
                    try {await backend.cancel({jobId:job?.jobId,expectedRevision:job?.revision});} catch {state.message = 'Stopped waiting, but service cancellation could not be confirmed. The operation may already have acted.';}
                }
                return view();
            },
            async pin({confirmed = false} = {}) {
                if (!confirmed || state.phase !== 'verified' || typeof backend.pin !== 'function') throw new Error('Review a verified result before pinning.');
                const expected = generation; guard(expected);
                const response = await backend.pin({jobId:prepared.jobId,expectedRevision:prepared.revision}); guard(expected);
                if (response?.jobId===prepared.jobId && response.state==='unmaterialized') {state={...state,phase:'unmaterialized',message:'Receipt retention is unavailable in this build. The result has not been pinned.'}; return view();}
                if (response?.jobId !== prepared.jobId || response.state !== 'pinned' || !response.artifactId) throw new Error('Result retention could not be confirmed.');
                state = {...state,phase:'pinned',message:'Reviewed result retained as a separate source-linked Receipt.'}; return view();
            }
        };
    }
    function createComponent({document, backend, stillCurrent, onClose = () => {}}) {
        const workflow = createWorkflow({backend,stillCurrent});
        let opener;
        const dialog = document.createElement('dialog'); dialog.className = 'byomcp-workspace';
        dialog.setAttribute('aria-labelledby','byomcp-action-title');
        const make = (tag,text,parent=dialog) => {const node=document.createElement(tag); if(text) node.textContent=text; parent.append(node); return node;};
        const title=make('h2','Review selected evidence'); title.id='byomcp-action-title';
        make('p','From meeting words to verified work.');
        make('p','This action uses whole selected captions. Review the exact release snapshot before approving; highlighting words alone does not narrow the submitted caption.');
        const status=make('p'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
        const identity=make('p'); identity.className='byomcp-identity';
        const evidence=make('ol'); evidence.setAttribute('aria-label','Exact selected meeting evidence');
        const form=make('form'); form.method='dialog'; const fields=make('fieldset',null,form); make('legend','Exact action arguments',fields);
        const prepare=make('button','Prepare operation preview',form); prepare.type='submit';
        const preview=make('pre'); preview.setAttribute('aria-label','Exact operation preview');
        const execute=make('button','Approve and execute this exact operation'); execute.type='button';
        const pin=make('button','Pin reviewed result'); pin.type='button';
        const cancel=make('button','Cancel / close'); cancel.type='button';
        const result=make('pre'); result.setAttribute('aria-label','Service result for review');
        function render() {
            const state=workflow.getState(); status.textContent=state.message;
            fields.disabled=!['editing','preview'].includes(state.phase);
            prepare.disabled=!['editing','preview'].includes(state.phase);
            execute.disabled=state.phase!=='preview'; pin.disabled=state.phase!=='verified';
            preview.textContent=state.preview ? JSON.stringify(state.preview,null,2) : '';
            result.textContent=state.result ? JSON.stringify(state.result,null,2) : '';
        }
        async function run(operation) {let failed=false; try {const pending=operation(); render(); await pending;} catch {failed=true;} render(); if(failed) status.textContent+=' The requested operation could not be confirmed.';}
        form.addEventListener('submit',event=>{event.preventDefault(); const args=Object.fromEntries([...fields.querySelectorAll('input')].map(input=>[input.name,input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value])); void run(()=>workflow.prepare(args));});
        form.addEventListener('input',()=>{workflow.edit(); render();});
        execute.addEventListener('click',()=>{void run(()=>workflow.execute({confirmed:true}));});
        pin.addEventListener('click',()=>{void run(()=>workflow.pin({confirmed:true}));});
        function close() {void run(async()=>{await workflow.cancel(); dialog.close(); opener?.focus({preventScroll:true}); onClose();});}
        cancel.addEventListener('click',close); dialog.addEventListener('cancel',event=>{event.preventDefault(); close();});
        document.body.append(dialog);
        return {
            dialog, workflow,
            open(request) {
                const state=workflow.open(request); opener=document.activeElement;
                identity.textContent=`${state.selection.profile.id} · ${state.selection.profile.tool} · ${state.selection.profile.effect} · source ${state.selection.source.sessionId}`;
                evidence.replaceChildren(); fields.querySelectorAll('label').forEach(label=>label.remove());
                for(const caption of state.selection.source.captions) make('li',`${caption.evidenceId}: ${caption.text}`,evidence);
                const names=state.selection.profile.kind==='dns-change' ? ['accountId','zoneId','recordId','recordType','recordName','expectedCurrentValue','proposedValue','ttl','proxied'] : ['tenantId','matchedPersonId','workFields','purpose'];
                for(const name of names) {const label=make('label',name.replace(/([A-Z])/g,' $1'),fields); const input=make('input',null,label); input.name=name; input.type=name==='ttl'?'number':name==='proxied'?'checkbox':'text'; input.required=name!=='proxied'; if(name==='ttl'){input.min='1';input.step='1';} input.maxLength=1000; input.autocomplete='off';}
                render(); dialog.showModal(); return state;
            },
            acceptResult(result) {const state=workflow.acceptResult(result); render(); return state;},
            acceptStatus(status) {const state=workflow.acceptStatus(status); render(); return state;},
            destroy() {void workflow.cancel(); dialog.remove();}
        };
    }
    function runtimeBackend(runtime) {
        async function call(operation,request) {const response=await runtime.sendMessage({message:'byomcp_action',operation,request}); if(response?.ok!==true)throw new Error('Action backend unavailable or denied.');return response;}
        return {prepare:input=>call('prepare',{sourceSessionRef:input.sourceId,profileId:input.profileId,tool:input.tool,
            operation:input.operation,arguments:input.arguments,captionKeys:input.captionKeys,privacyMode:input.privacyMode}),
            approveAndDispatch:request=>call('approve',request),cancel:request=>call('cancel',request),pin:request=>call('pin',request),getStatus:jobId=>call('status',{jobId})};
    }
    const api = Object.freeze({checkSelection,createWorkflow,createComponent,runtimeBackend});
    root.CaptionKeepByomcpWorkspace=api;
    if(typeof module!=='undefined' && module.exports) module.exports=api;
})(globalThis);
