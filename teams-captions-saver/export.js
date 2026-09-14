// File handles stay in IndexedDB on this device; never put them in sync storage.
const statusElement = document.getElementById('status');
const jobId = new URL(location.href).searchParams.get('job');
let currentJob;
let directory;
let busy = false;
const supportsDirectoryPicker = typeof window.showDirectoryPicker === 'function';

function sanitizeSubfolderPath(value) {
    return String(value || '')
        .split(/[\\/]+/)
        .map(segment => segment.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_'))
        .filter(segment => segment && segment !== '.' && segment !== '..')
        .join('/');
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
    document.getElementById('save-as').disabled = busy || !currentJob?.content;
    document.getElementById('save-folder').disabled = busy || !directory || !currentJob?.content;
    document.getElementById('choose-folder').disabled = busy;
    document.getElementById('forget-folder').disabled = busy || !directory;
    document.getElementById('folder').textContent = directory ? `Selected folder: ${directory.name}` : 'No folder selected.';
}

async function saveToFolder(interactive = true) {
    if (busy || !currentJob?.content || !directory) return;
    busy = true; refreshButtons();
    try {
        let permission = await directory.queryPermission({mode:'readwrite'});
        if (permission !== 'granted' && interactive) permission = await directory.requestPermission({mode:'readwrite'});
        if (permission !== 'granted') throw new Error('Folder access needs your permission. Choose Save to selected folder or Save As.');
        // UUID suffix avoids overwriting an unrelated transcript.
        const name = currentJob.filename.replace(/(\.[^.]+)$/, `-${crypto.randomUUID()}$1`);
        const handle = await directory.getFileHandle(name, {create:true});
        const writable = await handle.createWritable();
        try { await writable.write(currentJob.content); await writable.close(); }
        catch (error) { await writable.abort().catch(() => {}); throw error; }
        await chrome.storage.local.remove(jobId);
        currentJob = null;
        statusElement.textContent = `Saved to ${directory.name}: ${name}`;
        await loadPending();
    } catch (error) {
        statusElement.textContent = `Export pending. ${error.message}`;
    } finally { busy = false; refreshButtons(); }
}

async function saveAs() {
    if (busy || !currentJob?.content) return;
    busy = true; refreshButtons();
    const url = URL.createObjectURL(new Blob([currentJob.content], {type:currentJob.mimeType + ';charset=utf-8'}));
    try {
        const downloadId = await chrome.downloads.download({
            url,
            filename:currentJob.browserFilename || currentJob.filename,
            saveAs:true
        });
        currentJob.downloadId = downloadId;
        await chrome.storage.local.set({[jobId]:currentJob});
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
        currentJob = null;
        statusElement.textContent = 'File saved successfully.';
        await loadPending();
    } catch (error) {
        statusElement.textContent = `Export pending. ${error.message}`;
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

document.getElementById('save-as').onclick = saveAs;
document.getElementById('save-folder').onclick = () => saveToFolder();
document.getElementById('choose-folder').onclick = async () => {
    if (!supportsDirectoryPicker) {
        document.getElementById('manual-folder').focus();
        statusElement.textContent = 'Direct folder selection is unavailable in this browser profile. Choose a Downloads subfolder below or use Save As for each export.';
        return;
    }
    try {
        directory = await window.showDirectoryPicker({id:'captionkeep-exports',mode:'readwrite'});
        await folderStore('readwrite', store => store.put(directory,'exportFolder'));
        statusElement.textContent = 'Export folder selected. Use Save to selected folder to write this transcript.';
    } catch (error) { statusElement.textContent = error.name === 'AbortError' ? 'Folder selection canceled.' : error.message; }
    refreshButtons();
};
document.getElementById('remember-manual-folder').onclick = async () => {
    const saveLocation = sanitizeSubfolderPath(document.getElementById('manual-folder').value);
    await chrome.storage.sync.set({saveAsType:saveLocation ? 'custom' : 'downloads', saveLocation});
    if (currentJob) {
        currentJob.browserFilename = saveLocation ? `${saveLocation}/${currentJob.filename}` : currentJob.filename;
        await chrome.storage.local.set({[jobId]:currentJob});
    }
    document.getElementById('manual-folder').value = saveLocation;
    statusElement.textContent = saveLocation
        ? `Downloads subfolder remembered: ${saveLocation}`
        : 'The main browser Downloads folder will be used.';
    refreshButtons();
};
document.getElementById('open-downloads-folder').onclick = () => {
    try {
        chrome.downloads.showDefaultFolder();
        statusElement.textContent = 'Opened the browser Downloads folder.';
    } catch (error) {
        statusElement.textContent = `Could not open the Downloads folder: ${error.message}`;
    }
};
document.getElementById('forget-folder').onclick = async () => {
    try { await folderStore('readwrite',store => store.delete('exportFolder')); directory=null; refreshButtons(); }
    catch(error) { statusElement.textContent=error.message; }
};

(async () => {
    try {
        directory = await folderStore('readonly',store => store.get('exportFolder'));
        const settings = await chrome.storage.sync.get(['saveAsType','saveLocation']);
        document.getElementById('manual-folder').value = settings.saveAsType === 'custom'
            ? sanitizeSubfolderPath(settings.saveLocation)
            : '';
        currentJob = jobId ? (await chrome.storage.local.get(jobId))[jobId] : null;
        statusElement.textContent = currentJob ? 'Export ready. Choose where to save.' : 'Choose a folder or open a pending export.';
        if (currentJob) {
            document.getElementById('actions').hidden = false;
            document.getElementById('preview-section').hidden = false;
            document.getElementById('filename').textContent = currentJob.filename;
            document.getElementById('preview').value = currentJob.content;
        }
        await loadPending(); refreshButtons();
        if (!supportsDirectoryPicker) {
            document.getElementById('choose-folder').textContent = 'Use manual folder fallback';
        }
        if (currentJob?.automatic && directory) await saveToFolder(false);
    } catch (error) { statusElement.textContent = 'Could not load export: ' + error.message; }
})();
