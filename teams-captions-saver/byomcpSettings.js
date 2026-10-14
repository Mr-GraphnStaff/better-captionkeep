(() => {
    'use strict';
    const clean = (value, limit = 120) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, limit) : '';
    const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(value) ? value : '';
    function statusView(response) {
        const status = response?.ok === true ? response.status : null;
        if (!status || status.protocolVersion !== 1 || status.enrollmentVerified !== true) {
            const code = response?.code;
            return {verified:false, enabled:false, profiles:[], label:code === 'not-installed'
                ? 'Local helper not installed. Install and enroll it before connecting.'
                : code === 'policy-denied' ? 'Your organization has disabled Bring Your Own MCP. Local capture remains available.'
                : code === 'configuration-required' ? 'Setup required. Import a reviewed non-secret helper configuration before connecting.'
                : code === 'not-connected' ? 'Helper not connected. Choose Connect enrolled helper to request browser permission and verify enrollment.'
                : 'This build cannot verify an enrolled helper. Bring Your Own MCP remains off.'};
        }
        const profiles = Array.isArray(status.profiles) ? status.profiles.slice(0, 20).filter(profile => identifier(profile?.id)
            && profile.verified === true && ['stdio', 'streamable-http'].includes(profile.transport)
            && Number.isSafeInteger(profile.revision) && profile.revision > 0).map(profile => ({id:profile.id,
            label:clean(profile.label) || profile.id, transport:profile.transport, revision:profile.revision})) : [];
        return {verified:true, enabled:status.enabled === true, allowWrites:status.allowWrites === true, profiles,
            label:`Helper ${clean(status.helperVersion, 40) || 'version unavailable'} verified. ${status.enabled === true ? 'Connection enabled; every evidence request still needs review.' : 'Connection off. Review a profile before enabling it.'}`};
    }
    function inventoryView(response, profile) {
        const inventory = response?.ok === true ? response.inventory : null;
        if (!inventory || inventory.profileId !== profile.id || inventory.revision !== profile.revision
            || !Array.isArray(inventory.tools) || inventory.tools.length > 100) throw new Error('Inventory is unavailable or changed. Check the helper again.');
        return inventory.tools.map(tool => {
            if (!identifier(tool?.name) || !/^[a-fA-F0-9]{64}$/.test(tool.schemaDigest || '')
                || tool.compatible !== true || tool.approved !== true || !identifier(tool.profileGrantId)
                || !['read','write'].includes(tool.effect))
                throw new Error('The profile contains an unapproved or invalid tool. It cannot be enabled.');
            return {name:tool.name, schemaDigest:tool.schemaDigest.toLowerCase(), profileGrantId:tool.profileGrantId, effect:tool.effect};
        });
    }
    function parseConfiguration(text) {
        if (typeof text !== 'string' || new TextEncoder().encode(text).length > 128 * 1024) throw new Error('Choose a valid non-secret JSON configuration up to 128 KiB.');
        let configuration;
        try {configuration = JSON.parse(text);} catch {throw new Error('Choose a valid non-secret JSON configuration.');}
        if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw new Error('Choose a valid non-secret JSON configuration.');
        return configuration;
    }
    function createController({send, policy}) {
        let state = {verified:false, enabled:false, profiles:[], label:'Off by default. Check your installed helper when you choose to connect.'};
        let reviewed = null;
        let pending = false;
        async function request(operation, fields = {}) {
            if (pending) throw new Error('A helper check is already in progress.');
            pending = true;
            try {
                const managed = await policy();
                if (managed.disableByomcp === true || managed.disableAiHandoff === true) {
                    state = statusView({code:'policy-denied'}); reviewed = null;
                    throw new Error(state.label);
                }
                if (operation === 'allow-writes' && fields.enabled === true && managed.disableByomcpWrites === true) throw new Error('Your organization has disabled write actions.');
                return await send({message:'byomcp_settings', operation, ...fields});
            } finally {pending = false;}
        }
        return {
            getState:() => ({...state, profiles:state.profiles.map(profile => ({...profile})), reviewed:reviewed ? {...reviewed, tools:reviewed.tools.map(tool => ({...tool}))} : null}),
            async check() {
                reviewed = null;
                try {state = statusView(await request('status')); return this.getState();}
                catch (error) {state = statusView({code:state.label.includes('organization') ? 'policy-denied' : 'unsupported'}); throw error;}
            },
            async review(profileId) {
                reviewed = null;
                const profile = state.profiles.find(item => item.id === profileId);
                if (!state.verified || !profile) throw new Error('Choose a verified helper profile first.');
                const tools = inventoryView(await request('inventory', {profileId:profile.id, revision:profile.revision}), profile);
                if (!tools.length) throw new Error('This profile has no approved tools. Nothing can be enabled.');
                reviewed = {...profile, tools}; return this.getState();
            },
            async connect(permissionRequest) {
                reviewed = null;
                if (await permissionRequest !== true) throw new Error('Browser permission was not granted. The helper remains disconnected.');
                state = statusView(await request('connect')); return this.getState();
            },
            async configure(text, confirmed) {
                if (confirmed !== true) throw new Error('Review and confirm the non-secret configuration before importing.');
                const configuration = parseConfiguration(text);
                reviewed = null;
                const response = await request('configure', {configuration});
                if (response?.ok !== true) throw new Error('The helper configuration could not be accepted. Check your locally reviewed setup.');
                state = {verified:false, enabled:false, profiles:[], label:'Reviewed configuration saved. Connection remains off; choose Connect enrolled helper when ready.'};
                return this.getState();
            },
            async allowWrites(enabled) {
                const response = await request('allow-writes', {enabled:enabled === true});
                if (response?.ok !== true) throw new Error('Write-action preference could not be confirmed.');
                state = response.status ? statusView(response) : {...state, allowWrites:response.enabled === true};
                return this.getState();
            },
            async disconnect() {reviewed = null; const response = await request('disconnect'); if (response?.ok !== true) throw new Error('Disconnect could not be confirmed. Check the helper; no new evidence requests are approved here.'); state = statusView(response); return this.getState();}
        };
    }
    const api = {statusView, inventoryView, parseConfiguration, createController};
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document === 'undefined') return;
    const section = document.getElementById('byomcp-settings');
    if (!section) return;
    const elements = Object.fromEntries(['status','check','connect','profile','review','inventory','disconnect','configure','configuration-file','configuration-reviewed','allow-writes'].map(name => [name, document.getElementById(`byomcp-${name}`)]));
    const controller = createController({send:message => chrome.runtime.sendMessage(message), policy:async () => {
        if (!chrome.storage?.managed?.get) throw new Error('Managed policy cannot be checked. The connection remains off.');
        return chrome.storage.managed.get(['disableByomcp','disableAiHandoff','disableByomcpWrites']);
    }});
    function render(state) {
        elements.status.textContent = state.label;
        const previous = elements.profile.value;
        elements.profile.replaceChildren();
        const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Choose a verified profile'; elements.profile.append(empty);
        for (const profile of state.profiles) {
            const option = document.createElement('option'); option.value = profile.id;
            option.textContent = `${profile.label} · ${profile.transport === 'stdio' ? 'Local stdio' : 'Remote HTTP through helper'} · revision ${profile.revision}`;
            elements.profile.append(option);
        }
        if (state.reviewed) elements.profile.value = state.reviewed.id;
        else if (state.profiles.some(profile => profile.id === previous)) elements.profile.value = previous;
        elements.profile.disabled = !state.verified || !state.profiles.length;
        elements.review.disabled = !state.verified || !elements.profile.value;
        elements.disconnect.disabled = !state.verified;
        elements['allow-writes'].checked = state.allowWrites === true;
        elements['allow-writes'].disabled = !state.verified || state.label.includes('organization');
        elements.connect.disabled = state.enabled || state.label.includes('organization');
        elements.configure.disabled = !elements['configuration-file'].files?.length || !elements['configuration-reviewed'].checked || state.label.includes('organization');
        elements.inventory.replaceChildren();
        for (const tool of state.reviewed?.tools || []) {
            const item = document.createElement('li');
            item.textContent = `${tool.name} — compatible ${tool.effect === 'write' ? 'write action; separate execution approval required' : 'read action'}; schema ${tool.schemaDigest}`;
            elements.inventory.append(item);
        }
        if (state.reviewed) elements.status.textContent += ` ${state.reviewed.label} tool inventory reviewed. Select evidence in the Live Workspace to review a specific action. No evidence was sent by this check.`;
    }
    async function run(action) {
        if (section.getAttribute('aria-busy') === 'true') return;
        for (const name of ['check','connect','review','disconnect','profile','configure','configuration-file','configuration-reviewed','allow-writes']) elements[name].disabled = true;
        section.setAttribute('aria-busy','true');
        try {render(await action());} catch {render(controller.getState()); elements.status.textContent += ' This operation could not be verified. Check installation, enrollment and organization policy. No evidence was sent; local capture remains available.';}
        finally {elements.check.disabled = false; elements['configuration-file'].disabled = false; elements['configuration-reviewed'].disabled = false; section.setAttribute('aria-busy','false');}
    }
    elements.check.addEventListener('click', () => {void run(() => controller.check());});
    elements['allow-writes'].addEventListener('change', () => {const enabled = elements['allow-writes'].checked; void run(() => controller.allowWrites(enabled));});
    elements.connect.addEventListener('click', () => {
        // This call must stay in the original user gesture, before any asynchronous work.
        let permissionRequest;
        try {permissionRequest = chrome.permissions?.request?.({permissions:['nativeMessaging']}) ?? Promise.resolve(false);}
        catch {permissionRequest = Promise.resolve(false);}
        void run(() => controller.connect(permissionRequest));
    });
    const updateImport = () => {elements.configure.disabled = !elements['configuration-file'].files?.length || !elements['configuration-reviewed'].checked;};
    elements['configuration-file'].addEventListener('change', () => {elements['configuration-reviewed'].checked = false; elements['configuration-file'].removeAttribute('aria-invalid'); updateImport();});
    elements['configuration-reviewed'].addEventListener('change', updateImport);
    elements.configure.addEventListener('click', () => {void run(async () => {
        const file = elements['configuration-file'].files?.[0];
        const confirmed = elements['configuration-reviewed'].checked;
        try {
            if (!file || file.size > 128 * 1024) throw new Error('Invalid configuration file.');
            const state = await controller.configure(await file.text(), confirmed);
            elements['configuration-file'].value = ''; elements['configuration-reviewed'].checked = false;
            elements['configuration-file'].removeAttribute('aria-invalid');
            return state;
        } catch {elements['configuration-file'].setAttribute('aria-invalid','true'); throw new Error('Configuration could not be imported.');}
    });});
    elements.review.addEventListener('click', () => {void run(() => controller.review(elements.profile.value));});
    elements.disconnect.addEventListener('click', () => {void run(() => controller.disconnect());});
    elements.profile.addEventListener('change', () => {elements.review.disabled = !elements.profile.value; elements.inventory.replaceChildren();});
    render(controller.getState());
})();
