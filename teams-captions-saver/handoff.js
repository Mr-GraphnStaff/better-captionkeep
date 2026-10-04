const id = new URL(location.href).searchParams.get('id');
const promptBox = document.getElementById('prompt');
const chunkBox = document.getElementById('chunk');
const statusBox = document.getElementById('status');
const providersBox = document.getElementById('providers');
const scrubberToggle = document.getElementById('privacyScrubberToggle');
const scrubberMode = document.getElementById('scrubberMode');
const copyButton = document.getElementById('copy');
const saveEvidenceButton = document.getElementById('saveEvidence');
const copyChunkButton = document.getElementById('copyChunk');
const previousChunkButton = document.getElementById('previousChunk');
const nextChunkButton = document.getElementById('nextChunk');
let sourceData = null;
let currentPackage = null;
let currentChunk = 0;
let unmaskedCopyArmed = false;
let scrubOptions = {};
let effectivePolicy = null;
let basePrompt = '';
let handoffReady = false;
let customTemplates = [];
let appliedInstructions = '';
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
    effectivePolicy = await readPolicy();
    if (!handoffReady || effectivePolicy.settings.disableAiHandoff) throw new Error('No authorized AI handoff is available.');
}

templateSelect.addEventListener('change', selectTemplate);
templateApply.addEventListener('click', async () => {
    try {
        await allowTemplateAction();
        appliedInstructions = templateInstructions.value;
        promptBox.value = CaptionKeepPromptTemplates.apply(basePrompt, appliedInstructions);
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

async function readPolicy() {
    const userSettings = await chrome.storage.sync.get([
        'privacyScrubberEnabled', 'profanityFilterEnabled', 'customScrubTerms',
        'chatgptWorkspaceUrl', 'claudeWorkspaceUrl', 'claudeConsoleUrl'
    ]);
    return CaptionKeepConfiguration.applyPolicy(userSettings, await CaptionKeepConfiguration.readManaged());
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFilename(value) {
    return `${String(value || 'Meeting').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'Meeting'}-complete-evidence.md`;
}

function renderCoverage() {
    const coverage = currentPackage.coverage;
    document.getElementById('coverageCaptions').textContent = `${coverage.included} / ${coverage.selected}`;
    document.getElementById('coverageOmitted').textContent = String(coverage.omitted);
    document.getElementById('coverageChunks').textContent = String(coverage.chunkCount);
    document.getElementById('coverageSize').textContent = formatBytes(coverage.bytes);
    document.getElementById('coveragePrivacy').textContent = coverage.privacyMode;
}

function renderChunk() {
    const chunks = currentPackage?.chunks || [];
    currentChunk = Math.max(0, Math.min(currentChunk, Math.max(0, chunks.length - 1)));
    chunkBox.value = chunks[currentChunk]?.text || '';
    document.getElementById('chunkPosition').textContent = `Chunk ${chunks.length ? currentChunk + 1 : 0} / ${chunks.length}`;
    previousChunkButton.disabled = currentChunk <= 0;
    nextChunkButton.disabled = currentChunk >= chunks.length - 1;
    copyChunkButton.disabled = !chunks.length || !!effectivePolicy?.settings.disableClipboard;
}

function renderPackage() {
    unmaskedCopyArmed = false;
    const privacyMode = scrubberToggle.checked ? 'cleaned by Scrubby' : 'unmasked';
    let transcript = sourceData.transcript;
    let metadata = {
        meetingTitle:sourceData.meetingTitle,
        providerLabel:sourceData.providerLabel,
        warnings:sourceData.warnings
    };
    if (scrubberToggle.checked) {
        const scrubbed = CaptionKeepPrivacyScrubber.scrubHandoff(transcript, metadata, scrubOptions);
        transcript = scrubbed.transcript;
        metadata = scrubbed.metadata;
        scrubberMode.textContent = scrubbed.replacements.length
            ? `On - masked ${scrubbed.replacements.length} sensitive detail${scrubbed.replacements.length === 1 ? '' : 's'} consistently across the complete evidence.`
            : 'On - no supported sensitive-data patterns found.';
        copyButton.textContent = 'Copy cleaned instructions';
    } else {
        scrubberMode.textContent = 'Off - instructions and evidence may contain sensitive data.';
        copyButton.textContent = 'Copy unmasked instructions';
    }
    currentPackage = CaptionKeepHandoffPackage.buildPackage(transcript, {
        meetingTitle:metadata.meetingTitle,
        providerLabel:metadata.providerLabel,
        sessionId:sourceData.sessionId,
        warnings:metadata.warnings,
        privacyMode
    });
    basePrompt = currentPackage.prompt;
    promptBox.value = appliedInstructions
        ? CaptionKeepPromptTemplates.apply(basePrompt, appliedInstructions)
        : basePrompt;
    currentChunk = 0;
    renderCoverage();
    renderChunk();
    statusBox.textContent = `Review the ${privacyMode} instructions and complete evidence before sharing.`;
}

scrubberToggle.addEventListener('change', () => {
    if (effectivePolicy?.settings.forceScrubbedExport && !scrubberToggle.checked) {
        scrubberToggle.checked = true;
        statusBox.textContent = 'Your organization requires cleaned output.';
        return;
    }
    renderPackage();
});

async function requireAllowedAction(action) {
    effectivePolicy = await readPolicy();
    if (effectivePolicy.settings.disableAiHandoff) throw new Error('AI handoff is disabled by your organization.');
    if (action === 'copy' && effectivePolicy.settings.disableClipboard) throw new Error('Clipboard actions are disabled by your organization.');
    if (action === 'save' && effectivePolicy.settings.disableFileExport) throw new Error('File export is disabled by your organization.');
    if (effectivePolicy.settings.forceScrubbedExport && !scrubberToggle.checked) {
        scrubberToggle.checked = true;
        renderPackage();
    }
}

copyButton.onclick = async () => {
    try {
        await requireAllowedAction('copy');
        if (!scrubberToggle.checked && !unmaskedCopyArmed) {
            unmaskedCopyArmed = true;
            statusBox.textContent = 'Scrubby is off. Click "Copy unmasked instructions" again to confirm.';
            return;
        }
        await navigator.clipboard.writeText(promptBox.value);
        unmaskedCopyArmed = false;
        statusBox.textContent = 'Instructions copied. Attach the complete evidence file, or copy every numbered chunk in order.';
    } catch (error) {
        statusBox.textContent = error.message;
    }
};

copyChunkButton.onclick = async () => {
    try {
        await requireAllowedAction('copy');
        if (!scrubberToggle.checked && !unmaskedCopyArmed) {
            unmaskedCopyArmed = true;
            statusBox.textContent = 'Scrubby is off. Click "Copy this chunk" again to confirm unmasked copying.';
            return;
        }
        await navigator.clipboard.writeText(currentPackage.chunks[currentChunk].text);
        unmaskedCopyArmed = false;
        statusBox.textContent = `Copied chunk ${currentChunk + 1} of ${currentPackage.chunks.length}.`;
    } catch (error) {
        statusBox.textContent = error.message;
    }
};

saveEvidenceButton.onclick = async () => {
    try {
        await requireAllowedAction('save');
        const blobUrl = URL.createObjectURL(new Blob([currentPackage.file], {type:'text/markdown;charset=utf-8'}));
        try {
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = safeFilename(sourceData.meetingTitle);
            link.click();
            statusBox.textContent = 'Complete local evidence save started. Attach it only to an approved workspace.';
        } finally {
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        }
    } catch (error) {
        statusBox.textContent = error.message;
    }
};

previousChunkButton.onclick = () => { currentChunk -= 1; renderChunk(); };
nextChunkButton.onclick = () => { currentChunk += 1; renderChunk(); };

document.getElementById('discard').onclick = async () => {
    await chrome.storage.local.remove(id);
    basePrompt = '';
    appliedInstructions = '';
    handoffReady = false;
    templateApply.disabled = true;
    templateSave.disabled = true;
    templateDelete.disabled = true;
    sourceData = null;
    currentPackage = null;
    promptBox.value = '';
    chunkBox.value = '';
    scrubberToggle.disabled = true;
    copyButton.disabled = true;
    copyChunkButton.disabled = true;
    saveEvidenceButton.disabled = true;
    statusBox.textContent = 'Handoff discarded. Temporary evidence was removed.';
};

function renderProvider(providerKey, settings) {
    const destination = CaptionKeepDestinations.resolve(providerKey, settings);
    if (!destination) return;
    const card = document.createElement('article');
    card.className = 'provider-card';
    const heading = document.createElement('h3');
    heading.textContent = destination.name;
    const detail = document.createElement('p');
    detail.textContent = destination.configured
        ? `Saved enterprise destination - ${new URL(destination.url).hostname}`
        : destination.requiresWorkspaceConfirmation
            ? 'No enterprise destination saved - choose the correct workspace after opening'
            : new URL(destination.url).hostname;
    const link = document.createElement('a');
    link.className = 'provider-link';
    link.textContent = destination.configured ? 'Open saved workspace' : `Open ${destination.name}`;
    link.href = destination.url;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.addEventListener('click', () => {
        statusBox.textContent = `Opened ${destination.name}. Confirm the active workspace before attaching or pasting.`;
    });
    card.append(heading, detail, link);
    providersBox.append(card);
}

(async () => {
    try {
        if (!id?.startsWith('handoff_')) throw new Error('No handoff selected');
        sourceData = (await chrome.storage.local.get(id))[id];
        if (!sourceData) throw new Error('This handoff is no longer available');
        effectivePolicy = await readPolicy();
        if (effectivePolicy.settings.disableAiHandoff) throw new Error('AI handoff is disabled by your organization.');
        scrubOptions = {
            profanityFilterEnabled:!!effectivePolicy.settings.profanityFilterEnabled,
            customTerms:effectivePolicy.settings.customScrubTerms || []
        };
        scrubberToggle.checked = effectivePolicy.settings.privacyScrubberEnabled !== false || !!effectivePolicy.settings.forceScrubbedExport;
        scrubberToggle.disabled = effectivePolicy.locked.includes('privacyScrubberEnabled') || !!effectivePolicy.settings.forceScrubbedExport;
        copyButton.disabled = !!effectivePolicy.settings.disableClipboard;
        saveEvidenceButton.disabled = !!effectivePolicy.settings.disableFileExport;
        renderPackage();
        const storedTemplates = await chrome.storage.local.get(CaptionKeepPromptTemplates.STORAGE_KEY);
        customTemplates = CaptionKeepPromptTemplates.sanitize(storedTemplates[CaptionKeepPromptTemplates.STORAGE_KEY]);
        handoffReady = true;
        templateApply.disabled = false;
        templateSave.disabled = false;
        renderTemplates();
        for (const provider of sourceData.providers) renderProvider(provider, effectivePolicy.settings);
        await chrome.storage.local.remove(id);
    } catch (error) {
        if (id?.startsWith('handoff_')) await chrome.storage.local.remove(id).catch(() => {});
        statusBox.textContent = error.message;
    }
})();
