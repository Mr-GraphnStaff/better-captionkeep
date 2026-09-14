const id = new URL(location.href).searchParams.get('id');
const promptBox = document.getElementById('prompt');
const statusBox = document.getElementById('status');
const providersBox = document.getElementById('providers');
const scrubberToggle = document.getElementById('privacyScrubberToggle');
const scrubberMode = document.getElementById('scrubberMode');
const copyButton = document.getElementById('copy');
let originalPrompt = '';
let unmaskedCopyArmed = false;
let scrubOptions = {};

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
    if (!scrubberToggle.checked && !unmaskedCopyArmed) {
        unmaskedCopyArmed = true;
        statusBox.textContent = 'Scrubby is off. Click “Copy unmasked prompt” again to confirm.';
        return;
    }
    try {
        await navigator.clipboard.writeText(promptBox.value);
        unmaskedCopyArmed = false;
        statusBox.textContent = 'Copied. Paste only into a workspace authorized for this meeting.';
    } catch (error) {
        statusBox.textContent = `Copy failed: ${error.message}`;
    }
};

document.getElementById('discard').onclick = async () => {
    await chrome.storage.local.remove(id);
    originalPrompt = '';
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
        const userSettings = await chrome.storage.sync.get(['privacyScrubberEnabled', 'profanityFilterEnabled', 'customScrubTerms', 'chatgptWorkspaceUrl', 'claudeWorkspaceUrl', 'claudeConsoleUrl']);
        const policy = CaptionKeepConfiguration.applyPolicy(userSettings, await CaptionKeepConfiguration.readManaged());
        const settings = policy.settings;
        scrubOptions = { profanityFilterEnabled: !!settings.profanityFilterEnabled, customTerms: settings.customScrubTerms || [] };
        scrubberToggle.checked = settings.privacyScrubberEnabled !== false;
        scrubberToggle.disabled = policy.locked.includes('privacyScrubberEnabled');
        renderScrubberMode();
        for (const provider of data.providers) renderProvider(provider, settings);
        // Page memory holds the editable prompt; remove the temporary durable copy after loading.
        await chrome.storage.local.remove(id);
    } catch (error) {
        statusBox.textContent = error.message;
    }
})();
