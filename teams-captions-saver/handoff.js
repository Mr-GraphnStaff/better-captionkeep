const id = new URL(location.href).searchParams.get('id');
const promptBox = document.getElementById('prompt');
const statusBox = document.getElementById('status');
const providersBox = document.getElementById('providers');
const scrubberToggle = document.getElementById('privacyScrubberToggle');
const scrubberMode = document.getElementById('scrubberMode');
const copyButton = document.getElementById('copy');
copyButton.disabled = true;
let originalPrompt = '';
let unmaskedCopyArmed = false;
let scrubOptions = {};
let enterprisePolicy = {};
let basePrompt = '';
let handoffReady = false;
let customTemplates = [];
const templateSelect = document.getElementById('template-select');
const templateName = document.getElementById('template-name');
const templateInstructions = document.getElementById('template-instructions');
const templateStatus = document.getElementById('template-status');
const templateApply = document.getElementById('template-apply');
const templateSave = document.getElementById('template-save');
const templateDelete = document.getElementById('template-delete');

function selectTemplate() {
    const template = [...CaptionKeepPromptTemplates.BUILT_INS, ...customTemplates].find(item => item.id === templateSelect.value);
    templateName.value = template?.name || '';
    templateInstructions.value = template?.instructions || '';
    templateDelete.disabled = !handoffReady || !customTemplates.some(item => item.id === templateSelect.value);
}

function renderTemplates(selected = templateSelect.value) {
    templateSelect.replaceChildren();
    for (const template of [...CaptionKeepPromptTemplates.BUILT_INS, ...customTemplates]) {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name;
        templateSelect.append(option);
    }
    if ([...templateSelect.options].some(option => option.value === selected)) templateSelect.value = selected;
    selectTemplate();
}

async function allowTemplateAction() {
    await refreshHandoffPolicy();
    if (!handoffReady || enterprisePolicy.disableAiHandoff) throw new Error('No authorized AI handoff is available.');
}

templateSelect.addEventListener('change', selectTemplate);
templateApply.addEventListener('click', async () => {
    try {
        await allowTemplateAction();
        originalPrompt = CaptionKeepPromptTemplates.apply(basePrompt, templateInstructions.value);
        renderScrubberMode();
        templateStatus.textContent = 'Task applied. Review the complete prompt before copying.';
    } catch (error) { templateStatus.textContent = error.message; }
});
templateSave.addEventListener('click', async () => {
    try {
        await allowTemplateAction();
        if (!templateName.value.trim() || !templateInstructions.value.trim()) throw new Error('Enter a name and reusable instructions.');
        // Never persist the generated prompt or transcript as a template.
        const existing = customTemplates.find(item => item.id === templateSelect.value);
        if (!existing && customTemplates.length >= 20) throw new Error('Delete a custom template before adding another (limit 20).');
        const template = {id:existing?.id || `custom-${crypto.randomUUID()}`, name:templateName.value, instructions:templateInstructions.value};
        const next = CaptionKeepPromptTemplates.sanitize([...customTemplates.filter(item => item.id !== template.id), template]);
        await chrome.storage.local.set({[CaptionKeepPromptTemplates.STORAGE_KEY]:next});
        customTemplates = next;
        renderTemplates(template.id);
        templateStatus.textContent = 'Instructions saved locally. Meeting content was not saved as a template.';
    } catch (error) { templateStatus.textContent = error.message; }
});
templateDelete.addEventListener('click', async () => {
    try {
        await allowTemplateAction();
        const next = customTemplates.filter(item => item.id !== templateSelect.value);
        await chrome.storage.local.set({[CaptionKeepPromptTemplates.STORAGE_KEY]:next});
        customTemplates = next;
        renderTemplates();
        templateStatus.textContent = 'Custom template deleted.';
    } catch (error) { templateStatus.textContent = error.message; }
});

async function refreshHandoffPolicy() {
    const userSettings = await chrome.storage.sync.get(['privacyScrubberEnabled', 'profanityFilterEnabled', 'customScrubTerms', 'chatgptWorkspaceUrl', 'claudeWorkspaceUrl', 'claudeConsoleUrl']);
    const policy = CaptionKeepConfiguration.applyPolicy(userSettings, await CaptionKeepConfiguration.readManaged());
    enterprisePolicy = policy.settings;
    scrubOptions = { profanityFilterEnabled: !!enterprisePolicy.profanityFilterEnabled, customTerms: enterprisePolicy.customScrubTerms || [] };
    if (enterprisePolicy.forceScrubbedExport) scrubberToggle.checked = true;
    scrubberToggle.disabled = policy.locked.includes('privacyScrubberEnabled');
    copyButton.disabled = !!enterprisePolicy.disableClipboard || !!enterprisePolicy.disableAiHandoff;
    return policy;
}

function renderScrubberMode() {
    unmaskedCopyArmed = false;
    if (scrubberToggle.checked) {
        const scrubbed = CaptionKeepPrivacyScrubber.scrub(originalPrompt, scrubOptions);
        promptBox.value = scrubbed.text;
        copyButton.textContent = 'Copy cleaned prompt';
        scrubberMode.textContent = scrubbed.replacements.length
            ? `On · masked ${scrubbed.replacements.length} sensitive detail${scrubbed.replacements.length === 1 ? '' : 's'} locally.`
            : 'On · no supported sensitive-data patterns found.';
        statusBox.textContent = 'Review the cleaned prompt before sharing.';
        return;
    }

    promptBox.value = originalPrompt;
    copyButton.textContent = 'Copy unmasked prompt';
    scrubberMode.textContent = 'Off · this prompt may contain sensitive data.';
    statusBox.textContent = 'Privacy Scrubber is off. Review carefully before copying.';
}

scrubberToggle.addEventListener('change', renderScrubberMode);

copyButton.onclick = async () => {
    await refreshHandoffPolicy();
    if (enterprisePolicy.disableAiHandoff) {
        originalPrompt = '';
        promptBox.value = '';
        statusBox.textContent = 'AI handoff is disabled by your organization.';
        return;
    }
    if (enterprisePolicy.disableClipboard) {
        statusBox.textContent = 'Clipboard copy is disabled by your organization.';
        return;
    }
    if (!scrubberToggle.checked && !unmaskedCopyArmed) {
        unmaskedCopyArmed = true;
        statusBox.textContent = 'Scrubby is off. Click “Copy unmasked prompt” again to confirm.';
        return;
    }
    try {
        let output = promptBox.value;
        if (scrubberToggle.checked || enterprisePolicy.forceScrubbedExport) {
            const scrubbed = CaptionKeepPrivacyScrubber.scrub(output, scrubOptions);
            output = scrubbed.text;
            promptBox.value = output;
            scrubberToggle.checked = true;
            copyButton.textContent = 'Copy cleaned prompt';
            scrubberMode.textContent = scrubbed.replacements.length
                ? `On · masked ${scrubbed.replacements.length} sensitive detail${scrubbed.replacements.length === 1 ? '' : 's'} locally.`
                : 'On · no supported sensitive-data patterns found.';
        }
        await navigator.clipboard.writeText(output);
        unmaskedCopyArmed = false;
        statusBox.textContent = 'Copied. Paste only into a workspace authorized for this meeting.';
    } catch (error) {
        statusBox.textContent = `Copy failed: ${error.message}`;
    }
};

document.getElementById('discard').onclick = async () => {
    await chrome.storage.local.remove(id);
    originalPrompt = '';
    basePrompt = '';
    handoffReady = false;
    templateApply.disabled = true;
    templateSave.disabled = true;
    templateDelete.disabled = true;
    promptBox.value = '';
    scrubberToggle.disabled = true;
    copyButton.disabled = true;
    statusBox.textContent = 'Handoff discarded.';
};

function renderProvider(providerKey, settings) {
    const destination = CaptionKeepDestinations.resolve(providerKey, settings);
    if (!destination) return;

    const card = document.createElement('article');
    card.className = 'provider-card';
    const heading = document.createElement('h3');
    heading.textContent = destination.name;
    const detail = document.createElement('p');
    if (destination.configured) {
        detail.textContent = `Saved enterprise destination · ${new URL(destination.url).hostname}`;
    } else if (destination.requiresWorkspaceConfirmation) {
        detail.textContent = 'No enterprise destination saved · choose the correct workspace after opening';
    } else {
        detail.textContent = new URL(destination.url).hostname;
    }

    const link = document.createElement('a');
    link.className = 'provider-link';
    link.textContent = destination.configured ? 'Open saved workspace' : `Open ${destination.name}`;
    link.href = destination.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.addEventListener('click', () => {
        statusBox.textContent = `Opened ${destination.name}. Confirm the active workspace before pasting.`;
    });
    card.append(heading, detail, link);
    providersBox.append(card);
}

(async () => {
    try {
        if (!id?.startsWith('handoff_')) throw new Error('No handoff selected');
        const data = (await chrome.storage.local.get(id))[id];
        if (!data) throw new Error('This handoff is no longer available');
        originalPrompt = data.prompt;
        basePrompt = data.prompt;
        const policy = await refreshHandoffPolicy();
        const settings = policy.settings;
        if (settings.disableAiHandoff) throw new Error('AI handoff is disabled by your organization.');
        scrubberToggle.checked = settings.privacyScrubberEnabled !== false;
        renderScrubberMode();
        const storedTemplates = await chrome.storage.local.get(CaptionKeepPromptTemplates.STORAGE_KEY);
        customTemplates = CaptionKeepPromptTemplates.sanitize(storedTemplates[CaptionKeepPromptTemplates.STORAGE_KEY]);
        handoffReady = true;
        templateApply.disabled = false;
        templateSave.disabled = false;
        renderTemplates();
        for (const provider of data.providers) renderProvider(provider, settings);
        // Page memory holds the editable prompt; remove the temporary durable copy after loading.
        await chrome.storage.local.remove(id);
    } catch (error) {
        statusBox.textContent = error.message;
    }
})();
