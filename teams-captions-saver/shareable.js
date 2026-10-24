/* Local, non-persistent review workspace. Never classify legal content automatically. */
(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const api = globalThis.CaptionKeepShareableSummary;
    const params = new URLSearchParams(location.search);
    // Retain locators only in this closure, not in the printable page address.
    history.replaceState(null, '', location.pathname);
    let fingerprint = null;
    let source = [];
    let revision = 0;
    let printing = false;
    let busy = false;
    let initialSettings = {};
    const status = message => { $('status').textContent = message; };
    const selectedLabel = () => document.querySelector('input[name="classification"]:checked').value;
    function currentDraft(text = $('summary-text').value) {
        return api.createDraft({text, label:selectedLabel(), reviewed:$('reviewed').checked,
            privilegeConfirmed:$('privilege-confirmed').checked});
    }
    function render() {
        $('privilege-attestation').hidden = selectedLabel() !== 'privileged';
        try { $('preview').textContent = api.draftText(currentDraft(releaseText($('summary-text').value, initialSettings))); }
        catch (error) { $('preview').textContent = error.message; }
    }
    function invalidate() { revision++; $('reviewed').checked = false; clearPrint(); render(); }
    function clearPrint() { printing = false; $('print-stamp').textContent = ''; $('print-body').textContent = ''; }
    async function policy() {
        // Unlike a permissive settings fallback, this release path fails closed on read errors.
        if (typeof chrome.storage?.managed?.get !== 'function') throw new Error('Organization policy could not be verified. Export is unavailable.');
        const managed = await chrome.storage.managed.get(null);
        const user = await chrome.storage.sync.get(null);
        const effective = CaptionKeepConfiguration.applyPolicy(user, managed);
        if (managed.disableEvidenceEmail === true) throw new Error('Shareable summaries are disabled by your organization.');
        return {managed, settings:effective.settings};
    }
    async function readSource() {
        if (params.has('session')) {
            const saved = await new SessionManager().loadSession(params.get('session'));
            if (!Array.isArray(saved?.transcript)) throw new Error('The original transcript is unavailable.');
            return saved.transcript;
        }
        const tab = Number(params.get('liveTab'));
        const session = params.get('liveSession');
        if (!params.has('liveTab') || !Number.isInteger(tab) || tab < 0 || !session) throw new Error('Open this workspace from a transcript viewer.');
        const result = await chrome.tabs.sendMessage(tab, {message:'get_evidence_context'});
        if (result?.sessionId !== session || !Array.isArray(result.transcriptArray)) throw new Error('The original live meeting is no longer available.');
        return result.transcriptArray;
    }
    async function digest(value) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
        return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    async function validateSource() {
        if (await digest(await readSource()) !== fingerprint) {
            invalidate();
            throw new Error('The original transcript changed. Reopen this workspace and review a fresh draft.');
        }
    }
    function releaseText(text, settings) {
        return settings.privacyScrubberEnabled !== false
            ? CaptionKeepPrivacyScrubber.scrub(text, {customTerms:settings.customScrubTerms,
                profanityFilterEnabled:settings.profanityFilterEnabled}).text : text;
    }
    async function output(kind) {
        if (busy) return;
        busy = true;
        const initialRevision = revision;
        try {
            await policy();
            await validateSource();
            // Read again after source I/O: a revocation must not wait for a storage event.
            const {managed, settings} = await policy();
            // Policy reads can yield too: reject deletion/source edits observed after that read.
            await validateSource();
            if ((kind === 'copy' || kind === 'prompt') && managed.disableClipboard === true) throw new Error('Clipboard export is disabled by your organization.');
            if ((kind === 'download' || kind === 'print') && managed.disableFileExport === true) throw new Error('File export is disabled by your organization.');
            if (kind === 'prompt' && settings.disableAiHandoff === true) throw new Error('AI handoffs are disabled by your organization.');
            if (JSON.stringify(settings) !== JSON.stringify(initialSettings)) {
                initialSettings = settings; invalidate();
                throw new Error('Privacy settings changed. Review the updated preview again.');
            }
            if (revision !== initialRevision) throw new Error('The draft changed. Review it again.');
            if (kind === 'prompt') {
                const selected = Array.from($('source').querySelectorAll('input:checked'), input => source[Number(input.value)]);
                const text = releaseText(api.buildPrompt(selected), settings);
                await navigator.clipboard.writeText(text);
                status('Selected-material prompt copied. Review it before using an approved AI destination.');
                return;
            }
            const draft = currentDraft(releaseText($('summary-text').value, settings));
            const text = api.exportText(draft);
            if (kind === 'copy') await navigator.clipboard.writeText(text);
            if (kind === 'download') {
                const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'}));
                try { await chrome.downloads.download({url, filename:'shareable-summary.txt', saveAs:true}); }
                finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
            }
            if (kind === 'print') {
                $('print-stamp').textContent = api.stamp(draft);
                $('print-body').textContent = draft.text;
                printing = true;
                window.print();
                clearPrint();
            }
            status('Reviewed summary prepared. Original transcript was not included.');
        } catch (error) { $('reviewed').checked = false; clearPrint(); render(); status(error.message); }
        finally { busy = false; }
    }
    $('draft-form').addEventListener('submit', event => event.preventDefault());
    $('draft-form').addEventListener('input', event => { if (event.target.id === 'reviewed') { revision++; clearPrint(); render(); } else invalidate(); });
    for (const kind of ['prompt','copy','download','print']) $(kind).addEventListener('click', () => void output(kind));
    window.addEventListener('beforeprint', () => { if (!printing) clearPrint(); });
    window.addEventListener('afterprint', clearPrint);
    chrome.storage.onChanged.addListener((_changes, area) => { if (['local','managed','sync'].includes(area)) invalidate(); });
    (async () => {
        try {
            initialSettings = (await policy()).settings;
            source = Object.freeze((await readSource()).map(caption => Object.freeze({...caption})));
            fingerprint = await digest(source);
            for (const [index, caption] of source.entries()) {
                const label = document.createElement('label');
                const input = document.createElement('input'); input.type = 'checkbox'; input.value = String(index); input.name = 'excerpt';
                label.append(input, document.createTextNode(` ${caption.Name || 'Speaker'}: ${caption.Text || ''}`));
                $('source').append(label);
                // Long meetings remain complete while yielding between small rendering batches.
                if ((index + 1) % 100 === 0 && index + 1 < source.length) {
                    status(`Loading excerpts: ${index + 1} of ${source.length}…`);
                    await new Promise(resolve => {
                        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
                        else setTimeout(resolve, 0);
                    });
                }
            }
            $('draft-form').hidden = false; render(); status('Draft only. Select authorized material or write your summary; review is required before export.');
        } catch (error) { status(error.message); }
    })();
})();
