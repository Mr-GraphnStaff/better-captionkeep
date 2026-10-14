(function initializeByomcpRuntimeAdapter(root) {
    'use strict';
    const HOST = 'com.daftech.captionkeep.byomcp';
    const HASH = /^[a-f0-9]{64}$/;
    const ID = /^[a-zA-Z0-9._-]{1,100}$/;
    const GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    const FIELDS = new Set(['displayName','jobTitle','department','mail','userPrincipalName','officeLocation']);
    const DNS_NAME = /^(?=.{1,253}$)(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    const clone = value => structuredClone(value);
    const exact = (value, keys) => !!value && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
    const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
    function fields(value, required, optional = []) {
        return !!value && typeof value === 'object' && !Array.isArray(value)
            && required.every(key=>Object.hasOwn(value,key))
            && Object.keys(value).every(key=>required.includes(key) || optional.includes(key));
    }
    // This registry is explicitly provisioned/reviewed local metadata. It is
    // never populated from helper self-assertions, tool descriptions or captions.
    async function validateConfiguration(value, {contracts, browserTarget, caller}) {
        if (!exact(value,['version','hostName','allowedCallers','profiles']) || value.version !== 1 || value.hostName !== HOST
            || !Array.isArray(value.allowedCallers) || !value.allowedCallers.length || value.allowedCallers.length > 20
            || !value.allowedCallers.some(entry => exact(entry,['browser','caller']) && entry.browser === browserTarget && entry.caller === caller)
            || !Array.isArray(value.profiles) || !value.profiles.length || value.profiles.length > 20) throw new Error('local-enrollment-required');
        for (const entry of value.allowedCallers) {
            if (!exact(entry,['browser','caller']) || !['chrome','edge','brave','opera','firefox'].includes(entry.browser)
                || (entry.browser === 'firefox' ? !text(entry.caller,128) || !/^[a-zA-Z0-9@._{}-]+$/.test(entry.caller)
                    : !/^chrome-extension:\/\/[a-p]{32}\/$/.test(entry.caller))) throw new Error('invalid-local-caller');
        }
        const seen = new Set();
        for (const entry of value.profiles) {
            if (!exact(entry,['profile','actions']) || !Array.isArray(entry.actions) || entry.actions.length > 100) throw new Error('invalid-local-profile');
            const p=entry.profile;
            if (!fields(p,['id','label','revision','transport','tools','profileDigest'],['executable','executableDigest','cwd','args','resource','credentialReference'])
                || !text(p.label,120) || !ID.test(p.id) || seen.has(p.id) || !HASH.test(p.profileDigest) || !Number.isSafeInteger(p.revision) || p.revision < 1
                || !['stdio','remote'].includes(p.transport) || !Array.isArray(p.tools) || !p.tools.length || p.tools.length > 100) throw new Error('invalid-local-profile');
            if (p.transport === 'remote') {
                let resource;
                try {resource=new URL(p.resource);} catch {throw new Error('invalid-local-resource');}
                if (resource.protocol !== 'https:' || resource.username || resource.password || resource.search || resource.hash
                    || !ID.test(p.credentialReference || '') || p.executable || p.executableDigest || p.cwd || p.args) throw new Error('invalid-local-resource');
            } else {
                const absolute = value=>typeof value === 'string' && /^(?:[a-z]:[\\/]|\/)/i.test(value) && !/[\u0000-\u001f]/.test(value);
                if (!absolute(p.executable) || !absolute(p.cwd) || !HASH.test(p.executableDigest || '') || p.resource || p.credentialReference
                    || !Array.isArray(p.args) || p.args.length>32 || p.args.some(arg=>typeof arg!=='string' || arg.length>1024 || /[\u0000-\u001f]/.test(arg))) throw new Error('invalid-local-process');
            }
            const {profileDigest,...identity}=p;
            if (await contracts.digest(identity) !== profileDigest) throw new Error('profile-digest-mismatch');
            seen.add(p.id);const tools=new Set();
            for(const grant of p.tools) {
                if(!fields(grant,['name','operation','schemaDigest'],['readOnly','reviewedWrite'])
                    || !ID.test(grant.name) || tools.has(grant.name) || !HASH.test(grant.schemaDigest)
                    || !['read','write'].includes(grant.operation) || (grant.operation==='read' && grant.readOnly!==true)
                    || (grant.operation==='write' && grant.reviewedWrite!==true)) throw new Error('invalid-local-grant');
                tools.add(grant.name);
            }
            const actionTools=new Set();
            for(const action of entry.actions) {
                const grant=p.tools.find(tool=>tool.name===action.tool);
                if(!grant || actionTools.has(action.tool)) throw new Error('invalid-local-action');
                actionTools.add(action.tool);
                if(action.kind==='dns-change') {
                    if(!exact(action,['kind','tool','accountId','zoneIds']) || grant.operation!=='write' || !/^[a-f0-9]{32}$/.test(action.accountId)
                        || !Array.isArray(action.zoneIds) || !action.zoneIds.length || action.zoneIds.length>50
                        || action.zoneIds.some(id=>!/^[a-f0-9]{32}$/.test(id))) throw new Error('invalid-dns-scope');
                } else if(action.kind==='directory-lookup') {
                    if(!exact(action,['kind','tool','tenantId','allowedFields']) || grant.operation!=='read' || !GUID.test(action.tenantId)
                        || !Array.isArray(action.allowedFields) || !action.allowedFields.length || action.allowedFields.some(field=>!FIELDS.has(field))) throw new Error('invalid-directory-scope');
                } else throw new Error('unsupported-action');
            }
        }
        return clone(value);
    }
    function dnsContent(type,value) {
        if(!text(value,4096)) return false;
        if(type==='TXT') return true;
        if(type==='A') return /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value) && value.split('.').every(part=>Number(part)<=255);
        if(type==='CNAME') return DNS_NAME.test(value) && !value.startsWith('*.');
        if(type==='AAAA') {
            // DNS AAAA content is an IPv6 address, never a URL or a fetch target.
            if (!value.includes(':') || /[^a-f0-9:]/i.test(value)) return false;
            const halves=value.split('::');
            if (halves.length>2) return false;
            const groups=halves.flatMap(half=>half ? half.split(':') : []);
            return groups.every(group=>/^[a-f0-9]{1,4}$/i.test(group))
                && (halves.length===2 ? groups.length<8 : groups.length===8);
        }
        return false;
    }
    function operationAllowed(action, args) {
        if(action?.kind==='dns-change') return exact(args,['accountId','zoneId','recordId','recordType','recordName','expectedCurrentValue','proposedValue','ttl','proxied'])
            && args.accountId===action.accountId && action.zoneIds.includes(args.zoneId) && /^[a-f0-9]{32}$/.test(args.recordId)
            && ['A','AAAA','CNAME','TXT'].includes(args.recordType) && DNS_NAME.test(args.recordName)
            && dnsContent(args.recordType,args.expectedCurrentValue) && dnsContent(args.recordType,args.proposedValue)
            && Number.isSafeInteger(args.ttl) && (args.ttl===1 || args.ttl>=60 && args.ttl<=86400) && typeof args.proxied==='boolean'
            && (args.recordType!=='TXT' || args.proxied===false);
        if(action?.kind==='directory-lookup') return exact(args,['tenantId','matchedPersonId','workFields','purpose'])
            && args.tenantId===action.tenantId && GUID.test(args.matchedPersonId) && Array.isArray(args.workFields) && !!args.workFields.length
            && new Set(args.workFields).size===args.workFields.length && args.workFields.every(field=>action.allowedFields.includes(field)) && text(args.purpose,500);
        return false;
    }
    function verifyObservation(action,args,observation) {
        if(action.kind==='directory-lookup') return exact(observation,['tenantId','personId','fields']) && observation.tenantId===args.tenantId
            && observation.personId===args.matchedPersonId && exact(observation.fields,args.workFields)
            && Object.values(observation.fields).every(value=>value===null || text(value,1024));
        if(action.kind!=='dns-change' || !exact(observation,['before','after','preconditionCheckedAt','atomicPrecondition','limitation'])
            || !Number.isFinite(Date.parse(observation.preconditionCheckedAt)) || observation.atomicPrecondition!==false
            || observation.limitation!=='Read/write race remains; independent readback is not compare-and-swap.') return false;
        const fields=['accountId','zoneId','recordId','type','name','content','ttl','proxied'];
        const before=observation.before,after=observation.after;
        return [before,after].every(record=>exact(record,fields) && record.accountId===args.accountId && record.zoneId===args.zoneId
            && record.recordId===args.recordId && record.type===args.recordType && record.name===args.recordName)
            && before.content===args.expectedCurrentValue && Number.isSafeInteger(before.ttl) && before.ttl>=1 && typeof before.proxied==='boolean'
            && after.content===args.proposedValue && after.ttl===args.ttl && after.proxied===args.proxied;
    }
    function create(options={}) {
        const contracts=options.contracts || root.CaptionKeepEvidenceActionContracts;
        const api=options.chrome || root.chrome, browserTarget=options.browserTarget || 'unsupported';
        const readPolicy=options.readPolicy || (async()=>({disabled:true}));
        const readConfig=options.readTrustedConfiguration || (async()=>null);
        const inventoryCache=new Map(),proofs=new Map(),verifiedReceipts=new Map();
        const caller=browserTarget==='firefox' ? api?.runtime?.id : api?.runtime?.getURL('');
        let enrolledConfigDigest=null;
        const configuration=async()=>validateConfiguration(clone(await readConfig()),{contracts,browserTarget,caller});
        async function verifyEnrollment({enrollment}) {
            const config=await configuration(),status=enrollment?.status;
            if(!status || status.enrollmentVerified!==true || status.profiles.length!==config.profiles.length) return false;
            for(const entry of config.profiles) {
                const match=status.profiles.find(p=>p.id===entry.profile.id);
                if(!match || match.revision!==entry.profile.revision || match.profileDigest!==entry.profile.profileDigest
                    || match.transport!==(entry.profile.transport==='remote'?'streamable-http':'stdio')) return false;
            }
            enrolledConfigDigest=await contracts.digest(config);return true;
        }
        function revoked(code) {enrolledConfigDigest=null;inventoryCache.clear();proofs.clear();verifiedReceipts.clear();options.onRevoked?.(code);}
        const native=options.nativeClient || (options.nativeClientModule || root.CaptionKeepByomcpNativeClient).create({...options,verifyEnrollment,onRevoked:revoked});
        async function authority() {
            const policy=await readPolicy();
            if(policy.disabled!==false || policy.disableSessionHistory!==false) throw new Error('policy-denied');
            const config=await configuration();
            if(!enrolledConfigDigest || await contracts.digest(config)!==enrolledConfigDigest) throw new Error('enrollment-changed');
            const status=await native.localStatus();
            if(status.enrollmentVerified!==true) throw new Error('helper-unavailable');
            return {config,status,policy};
        }
        async function localStatus() {
            const status=await native.localStatus();
            if(!status.enrollmentVerified) return status;
            try {
                const {config}=await authority();
                return {...status,enabled:[...inventoryCache.values()].some(review=>review.tools.length>0),profiles:status.profiles.map(profile=>({...profile,
                    inventoryVerified:inventoryCache.has(profile.id) && config.profiles.some(item=>item.profile.id===profile.id)}))};
            } catch {return {protocolVersion:1,enrollmentVerified:false,enabled:false,profiles:[],code:'local-review-required'};}
        }
        async function inventory(id,revision,sender) {
            const {config}=await authority(),entry=config.profiles.find(item=>item.profile.id===id && item.profile.revision===revision);
            if(!entry) throw new Error('profile-unavailable');
            const result=await native.inventory(id,revision,sender),tools=[];
            for(const item of result.tools) {
                const grant=entry.profile.tools.find(tool=>tool.name===item.name && tool.schemaDigest===item.schemaDigest && tool.operation===item.effect);
                const action=entry.actions.find(value=>value.tool===item.name);
                if(grant && action) tools.push({...item,actionKind:action.kind});
            }
            await authority();inventoryCache.set(id,{revision,tools:clone(tools)});return {...result,tools};
        }
        async function getReviewedProfile(id) {
            const {config}=await authority(),entry=config.profiles.find(item=>item.profile.id===id),review=inventoryCache.get(id);
            if(!entry || !review || review.revision!==entry.profile.revision || !review.tools.length) return null;
            // Approval's connection is the full configured grant list; dispatch
            // still requires its selected tool to be present in reviewed inventory.
            return clone(entry.profile);
        }
        async function actionFor(profile,approval) {
            const {config,policy}=await authority(),entry=config.profiles.find(item=>item.profile.id===profile.id);
            if(!entry || entry.profile.profileDigest!==profile.profileDigest || entry.profile.revision!==profile.revision
                || !inventoryCache.get(profile.id)?.tools.some(tool=>tool.name===approval.payload.tool)) return null;
            // Job guards/native dispatch enforce live expiry; status/Receipt
            // review may legitimately occur after the short execution window.
            await contracts.verifyApproval(approval,profile,{requireScrubbed:policy.requireScrubbed!==false,now:Date.parse(approval.payload.createdAt)});
            if(approval.payload.operation==='write' && policy.allowWrites!==true) return null;
            const action=entry.actions.find(item=>item.tool===approval.payload.tool);
            return operationAllowed(action,approval.payload.arguments) ? action : null;
        }
        async function verifyOperation(profile,approval) {try {return !!await actionFor(profile,approval);} catch {return false;}}
        const transport=Object.freeze({async invoke(profile,approval,signal,context) {
            if(!await verifyOperation(profile,approval)) throw new Error('operation-denied');
            const result=await native.transport.invoke(profile,approval,signal,{assertDispatch:async()=>{
                if(!await verifyOperation(profile,approval)) throw new Error('operation-denied');
                await context.assertDispatch();
            }});
            const proof=native.takeResultProof?.(approval.payload.jobId);
            if(proof && proofs.size<50) proofs.set(approval.payload.jobId,clone(proof));
            return result;
        }});
        async function verifyResultProof(approval,result,profile) {
            const supplied=proofs.get(approval.payload.jobId);proofs.delete(approval.payload.jobId);
            const action=await actionFor(profile,approval);
            if(!action || result?.status!=='received' || !exact(supplied,['version','jobId','approvalDigest','sourceDigest','profileDigest','actionKind','resultDigest','observedAt','observation','receiptDigest'])) return null;
            const {receiptDigest,...receipt}=supplied;
            if(receipt.version!==1 || receipt.jobId!==approval.payload.jobId || receipt.approvalDigest!==approval.approvalDigest
                || receipt.sourceDigest!==approval.payload.source.sourceDigest || receipt.profileDigest!==profile.profileDigest || receipt.actionKind!==action.kind
                || receipt.resultDigest!==await contracts.digest(result) || !HASH.test(receiptDigest) || receiptDigest!==await contracts.digest(receipt)
                || !Number.isFinite(Date.parse(receipt.observedAt)) || Date.parse(receipt.observedAt)<Date.parse(approval.payload.createdAt)
                || Date.parse(receipt.observedAt)>Date.now()+30000 || !verifyObservation(action,approval.payload.arguments,receipt.observation)) return null;
            if(verifiedReceipts.size>=50 && !verifiedReceipts.has(receipt.jobId)) return null;
            verifiedReceipts.set(receipt.jobId,clone(supplied));
            return {verified:true,jobId:receipt.jobId,approvalDigest:receipt.approvalDigest,sourceDigest:receipt.sourceDigest,receiptDigest};
        }
        async function getVerifiedReceipt(jobId) {await authority();const receipt=verifiedReceipts.get(jobId);return receipt ? clone(receipt) : null;}
        async function connectGranted(sender) {inventoryCache.clear();proofs.clear();verifiedReceipts.clear();return native.connectGranted(sender);}
        async function connectFromGesture(sender) {inventoryCache.clear();proofs.clear();verifiedReceipts.clear();return native.connectFromGesture(sender);}
        async function disconnect(sender) {try{return await native.disconnect(sender);} finally {revoked('disconnected');}}
        async function getCapacity() {await authority();const value=await native.getCapacity();await authority();return Number.isSafeInteger(value) && value>=0 ? value : null;}
        return Object.freeze({localStatus,inventory,getReviewedProfile,verifyOperation,verifyResultProof,transport,connectGranted,connectFromGesture,disconnect,
            getCapacity,verifyEnrollment,getVerifiedReceipt});
    }
    root.CaptionKeepByomcpRuntimeAdapter=Object.freeze({create,validateConfiguration,operationAllowed,verifyObservation});
    if(typeof module!=='undefined' && module.exports) module.exports=root.CaptionKeepByomcpRuntimeAdapter;
})(globalThis);
