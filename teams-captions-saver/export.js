// File handles stay in IndexedDB on this device; never put them in sync storage.
const statusElement = document.getElementById('status');
const requestedJobId = new URL(location.href).searchParams.get('job');
const jobId = /^export_[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(requestedJobId || '')
    ? requestedJobId
    : null;
let currentJob;
let directory;
let busy = false;
let fileExportDisabled = true;
const supportsDirectoryPicker = typeof window.showDirectoryPicker === 'function';

function jobStorageUpdate(value) {
    return jobId ? Object.fromEntries([[jobId, value]]) : {};
}

function hasJobContent(job = currentJob) {
    return typeof job?.content === 'string' && job.content.length > 0;
}

function decodeJobContent(job = currentJob) {
    if (!hasJobContent(job)) return null;
    if (job.contentEncoding !== 'base64') return job.content;
    const binary = atob(job.content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

async function refreshFileExportPolicy({discardPending = false} = {}) {
    const policy = CaptionKeepConfiguration.applyPolicy({}, await CaptionKeepConfiguration.readManaged());
    fileExportDisabled = !!policy.settings.disableFileExport;
    if (fileExportDisabled && discardPending) {
        const stored = await chrome.storage.local.get(null);
        const pending = Object.keys(stored).filter(key => key.startsWith('export_'));
        if (pending.length) await chrome.storage.local.remove(pending);
        currentJob = null;
        statusElement.textContent = 'File export is disabled by your organization. Pending exports were discarded.';
    }
    refreshButtons();
    return !fileExportDisabled;
}

function folderStore(mode, operation) {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open('captionkeep-files', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('preferences');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('preferences', mode);
            const request = operation(tx.objectStore('preferences'));
            tx.oncomplete = () => { resolve(request?.result); db.close(); };
            tx.onerror = () => { reject(tx.error); db.close(); };
            tx.onabort = () => { reject(tx.error || new Error('Folder preference was not saved')); db.close(); };
        };
    });
}

function refreshButtons() {
    document.getElementById('save-as').disabled = fileExportDisabled || busy || !hasJobContent();
    document.getElementById('save-folder').disabled = fileExportDisabled || busy || !directory || !hasJobContent();
    document.getElementById('choose-folder').disabled = fileExportDisabled || busy;
    document.getElementById('forget-folder').disabled = fileExportDisabled || busy || !directory;
    document.getElementById('folder').textContent = directory
        ? `Automatic-save folder: ${directory.name}`
        : 'Automatic saves use browser Downloads.';
}

async function saveToFolder(interactive = true) {
    if (!await refreshFileExportPolicy({discardPending:true})) return false;
    if (busy || !hasJobContent() || !directory) return false;
    busy = true; refreshButtons();
    try {
        let permission = await directory.queryPermission({mode:'readwrite'});
        if (permission !== 'granted' && interactive) permission = await directory.requestPermission({mode:'readwrite'});
        if (permission !== 'granted') throw new Error('Folder access needs your permission. Choose Save to selected folder or Save As.');
        // UUID suffix avoids overwriting an unrelated transcript.
        const name = currentJob.filename.replace(/(\.[^.]+)$/, `-${crypto.randomUUID()}$1`);
        const handle = await directory.getFileHandle(name, {create:true});
        const writable = await handle.createWritable();
        try { await writable.write(decodeJobContent()); await writable.close(); }
        catch (error) { await writable.abort().catch(() => {}); throw error; }
        await chrome.storage.local.remove(jobId);
        currentJob = null;
        statusElement.textContent = `Saved to ${directory.name}: ${name}`;
        await loadPending();
        return true;
    } catch (error) {
        statusElement.textContent = `Export pending. ${error.message}`;
        return false;
    } finally { busy = false; refreshButtons(); }
}

async function closeCurrentTab() {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) await chrome.tabs.remove(tab.id);
    else window.close();
}

async function showCurrentTab() {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) await chrome.tabs.update(tab.id, {active:true});
}

function closeCurrentTabSoon() {
    setTimeout(() => closeCurrentTab().catch(() => window.close()), 0);
}

async function downloadWithBrowser(promptForLocation = true, closeWhenDone = false) {
    if (!await refreshFileExportPolicy({discardPending:true})) return false;
    if (busy || !hasJobContent()) return false;
    busy = true; refreshButtons();
    const content = decodeJobContent();
    const mimeType = currentJob.contentEncoding === 'base64' ? currentJob.mimeType : currentJob.mimeType + ';charset=utf-8';
    const url = URL.createObjectURL(new Blob([content], {type:mimeType}));
    try {
        const downloadId = await chrome.downloads.download({
            url,
            filename:currentJob.browserFilename || currentJob.filename,
            saveAs:promptForLocation
        });
        currentJob.downloadId = downloadId;
        await chrome.storage.local.set(jobStorageUpdate(currentJob));
        statusElement.textContent = 'Download started. Waiting for file completion…';
        await new Promise((resolve,reject) => {
            const finish = state => {
                if (state === 'complete' || state === 'interrupted') {
                    chrome.downloads.onChanged.removeListener(listener);
                    if (state === 'complete') resolve(); else reject(new Error('Download interrupted or canceled.'));
                }
            };
            const listener = delta => { if (delta.id === downloadId) finish(delta.state?.current); };
            chrome.downloads.onChanged.addListener(listener);
            chrome.downloads.search({id:downloadId}).then(items => finish(items[0]?.state), reject);
        });
        await chrome.storage.local.remove(jobId);
        await chrome.storage.local.set({lastCompletedDownload:{
            id:downloadId,
            browserFilename:currentJob.browserFilename || currentJob.filename,
            completedAt:new Date().toISOString()
        }});
        currentJob = null;
        statusElement.textContent = 'File saved successfully.';
        await loadPending();
        if (closeWhenDone) closeCurrentTabSoon();
        return true;
    } catch (error) {
        statusElement.textContent = `Export pending. ${error.message}`;
        return false;
    } finally { URL.revokeObjectURL(url); busy = false; refreshButtons(); }
}

async function loadPending() {
    const data = await chrome.storage.local.get(null);
    const list = document.getElementById('pending');
    list.replaceChildren();
    for (const [id,job] of Object.entries(data).filter(([id]) => id.startsWith('export_'))) {
        const row = document.createElement('li');
        const link = document.createElement('a');
        link.href = `export.html?job=${encodeURIComponent(id)}`;
        link.textContent = job.filename;
        const discard = document.createElement('button'); discard.textContent = 'Discard export';
        discard.onclick = async () => {
            if (!confirm('Discard this pending export? Saved meeting history is separate.')) return;
            await chrome.storage.local.remove(id);
            if (id === jobId) { currentJob=null; refreshButtons(); statusElement.textContent='Export discarded.'; }
            await loadPending();
        };
        row.append(link, discard); list.append(row);
    }
    if (!list.children.length) list.textContent = 'No pending exports.';
}

document.getElementById('save-as').onclick = () => downloadWithBrowser(true);
document.getElementById('save-folder').onclick = () => saveToFolder();
document.getElementById('choose-folder').onclick = async () => {
    if (!await refreshFileExportPolicy({discardPending:true})) return;
    if (!supportsDirectoryPicker) {
        document.getElementById('manual-folder').focus();
        statusElement.textContent = 'Direct folder selection is unavailable in this browser profile. Choose a Downloads subfolder below or use Save As for each export.';
        return;
    }
    try {
        directory = await window.showDirectoryPicker({id:'captionkeep-exports',mode:'readwrite'});
        await folderStore('readwrite', store => store.put(directory,'exportFolder'));
        await chrome.storage.sync.set({saveAsType:'downloads'});
        statusElement.textContent = 'Automatic saves will use this folder. Use Save to selected folder for this transcript.';
    } catch (error) { statusElement.textContent = error.name === 'AbortError' ? 'Folder selection canceled.' : error.message; }
    refreshButtons();
};
document.getElementById('forget-folder').onclick = async () => {
    try { await folderStore('readwrite',store => store.delete('exportFolder')); directory=null; refreshButtons(); }
    catch(error) { statusElement.textContent=error.message; }
};

(async () => {
    try {
        if (!await refreshFileExportPolicy({discardPending:true})) return;
        directory = await folderStore('readonly',store => store.get('exportFolder'));
        const settings = await chrome.storage.sync.get(['saveAsType']);
        const storedJob = jobId ? await chrome.storage.local.get(jobId) : {};
        currentJob = jobId && Object.hasOwn(storedJob, jobId) ? storedJob[jobId] : null;
        statusElement.textContent = currentJob ? 'Export ready. Choose where to save.' : 'Choose a folder or open a pending export.';
        if (currentJob) {
            document.getElementById('actions').hidden = false;
            document.getElementById('preview-section').hidden = false;
            document.getElementById('filename').textContent = currentJob.filename;
            document.getElementById('preview').value = currentJob.previewText || currentJob.content;
            const profile = currentJob.profile;
            if (profile) {
                document.getElementById('profile').hidden = false;
                document.getElementById('profile').textContent = `${profile.format.toUpperCase()} · ${profile.subsetCount} caption${profile.subsetCount === 1 ? '' : 's'} · ${profile.warnings.join(' ')}`;
            }
        }
        await loadPending(); refreshButtons();
        if (!supportsDirectoryPicker) {
            document.getElementById('choose-folder').textContent = 'Use a Downloads subfolder instead';
        }
        if (currentJob?.autoStart) {
            currentJob.autoStart = false;
            await chrome.storage.local.set(jobStorageUpdate(currentJob));
            if (currentJob.saveAs === false && directory && settings.saveAsType !== 'custom') {
                const saved = await saveToFolder(false);
                if (saved) closeCurrentTabSoon();
                else await showCurrentTab();
                return;
            }
            const saved = await downloadWithBrowser(currentJob.saveAs !== false, true);
            if (!saved) await showCurrentTab();
        }
    } catch (error) { statusElement.textContent = 'Could not load export: ' + error.message; }
})();
