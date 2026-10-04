(function (root) {
    'use strict';
    const LIMIT = 500;
    function storageKey(sessionId) {
        const id = String(sessionId || '').trim();
        if (!id || id.length > 200) throw new Error('Meeting identity is unavailable.');
        return `meeting_extras_${encodeURIComponent(id)}`;
    }
    function normalize(bundle = {}) {
        const messages = Array.isArray(bundle.messages) ? bundle.messages : [];
        if (messages.length > LIMIT) throw new Error('Chat snapshot exceeds 500 messages. Split the capture into smaller snapshots.');
        const screenshot = typeof bundle.screenshot === 'string' ? bundle.screenshot : '';
        if (screenshot && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(screenshot) || screenshot.length > 6000000)) {
            throw new Error('Screenshot must be a PNG smaller than 6 MB encoded.');
        }
        return {version:1, kind:'meeting-chat-and-screenshot', observedAt:new Date().toISOString(),
            messages:messages.map(message => ({speaker:String(message?.speaker || 'Unknown sender').slice(0, 200),
                text:String(message?.text || '').slice(0, 10000), time:String(message?.time || '').slice(0, 100),
                links:(Array.isArray(message?.links) ? message.links : []).filter(link => typeof link === 'string' && /^https?:\/\//i.test(link)).slice(0, 20).map(link => link.slice(0, 2048))})), screenshot};
    }
    function merge(previous, incoming) {
        const old = normalize(previous);
        const next = normalize(incoming);
        const messages = new Map(old.messages.map(message => [JSON.stringify(message), message]));
        for (const message of next.messages) messages.set(JSON.stringify(message), message);
        if (messages.size > LIMIT) throw new Error('This meeting already has 500 chat messages. Export or clear extras first.');
        return {...next, messages:[...messages.values()], screenshot:next.screenshot || old.screenshot};
    }
    function markdown(bundle) {
        const data = normalize(bundle);
        const lines = ['# Meeting chat (not spoken transcript)', '', 'Snapshot of loaded meeting-chat messages; this is not guaranteed to contain the full chat history.', ''];
        for (const message of data.messages) lines.push(`[${message.time || 'Time unavailable'}] ${message.speaker}: ${message.text}`, ...message.links.map(link => `Shared link: ${link}`), '');
        if (data.screenshot) lines.push('A separately reviewed screenshot is retained locally. It is not automatically scrubbed.');
        return lines.join('\n');
    }
    root.CaptionKeepMeetingExtras = Object.freeze({LIMIT, storageKey, normalize, merge, markdown});
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepMeetingExtras;
})(typeof globalThis !== 'undefined' ? globalThis : this);
