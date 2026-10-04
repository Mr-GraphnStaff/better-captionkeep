(function (root) {
    'use strict';
    // Transport adapters only: callers must obtain separate provider consent and
    // pass a reviewed, policy-cleaned derivative. No credentials are persisted.
    function validate({accessToken, text, title}) {
        if (typeof accessToken !== 'string' || !accessToken.trim()) throw new Error('Connect the selected storage provider first.');
        if (typeof text !== 'string' || !text.trim()) throw new Error('No reviewed transcript selected.');
        if (new TextEncoder().encode(text).length > 4000000) throw new Error('Cloud export exceeds 4 MB. Use local export for this meeting.');
        return {text, title:String(title || 'Meeting transcript').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100)};
    }
    async function responseBody(response, provider) {
        if (!response.ok) throw new Error(`${provider} export failed (HTTP ${response.status}). Check account permission and destination. No automatic retry was attempted.`);
        const body = await response.json();
        if (!body?.id) throw new Error(`${provider} returned no file identity; check the destination before retrying.`);
        return body;
    }
    async function uploadGoogleDoc(options, fetchImpl = fetch) {
        const {text, title} = validate(options);
        const boundary = `captionkeep-${crypto.randomUUID()}`;
        const metadata = {name:title, mimeType:'application/vnd.google-apps.document'};
        if (options.folderId) {
            if (!/^[A-Za-z0-9_-]{1,200}$/.test(options.folderId)) throw new Error('Google destination folder identity is invalid.');
            metadata.parents = [options.folderId];
        }
        const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
        return responseBody(await fetchImpl('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
            method:'POST', headers:{Authorization:`Bearer ${options.accessToken}`, 'Content-Type':`multipart/related; boundary=${boundary}`}, body, redirect:'error'
        }), 'Google Docs');
    }
    async function uploadMicrosoftFile(options, fetchImpl = fetch) {
        const {text, title} = validate(options);
        const driveId = options.driveId || '';
        const folderId = options.folderId || '';
        for (const id of [driveId, folderId]) if (id && !/^[A-Za-z0-9_!.-]{1,200}$/.test(id)) throw new Error('Microsoft destination identity is invalid.');
        // New uniquely named file, never overwrite a user's existing transcript.
        const filename = `${title}-${crypto.randomUUID()}.txt`;
        const drive = driveId ? `drives/${encodeURIComponent(driveId)}` : 'me/drive';
        const parent = folderId ? `items/${encodeURIComponent(folderId)}` : 'root';
        const url = `https://graph.microsoft.com/v1.0/${drive}/${parent}:/${encodeURIComponent(filename)}:/content`;
        return responseBody(await fetchImpl(url, {method:'PUT', headers:{Authorization:`Bearer ${options.accessToken}`, 'Content-Type':'text/plain; charset=utf-8'}, body:text, redirect:'error'}), 'Microsoft storage');
    }
    root.CaptionKeepCloudExports = Object.freeze({validate, uploadGoogleDoc, uploadMicrosoftFile});
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepCloudExports;
})(typeof globalThis !== 'undefined' ? globalThis : this);
