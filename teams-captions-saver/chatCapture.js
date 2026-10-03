(() => {
    'use strict';
    // Never scrape the whole Teams chat application. Only explicit meeting panes.
    const roots = location.hostname === 'meet.google.com'
        ? ['[data-panel-id="chat"]', '[data-panel-id="2"]']
        : location.hostname === 'app.zoom.us'
            ? ['.meeting-chat', '.chat-container__chat-list']
            : ['[data-tid="meeting-chat"]', '[data-tid="meeting-chat-panel"]'];
    const rowSelector = '[data-message-id], [data-tid="chat-message"], [data-message-text], .chat-message__container';
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (sender.id !== chrome.runtime.id || message?.message !== 'capture_visible_meeting_chat') return false;
        try {
            const pane = roots.map(selector => document.querySelector(selector)).find(element => element && element.getClientRects().length);
            if (!pane) throw new Error('Open the meeting chat pane first. This layout is not recognized; no page-wide chat was captured.');
            const rows = [...pane.querySelectorAll(rowSelector)].filter(row => !row.parentElement?.closest(rowSelector));
            if (rows.length > 500) throw new Error('More than 500 loaded messages found; capture a smaller chat snapshot.');
            const messages = rows.map(row => ({
                speaker:row.querySelector('[data-tid="message-author-name"], [data-sender-name], .chat-message__sender')?.textContent?.trim() || 'Unknown sender',
                text:(row.querySelector('[data-tid="message-body"], [data-message-text], .chat-message__text-content') || row).textContent?.trim() || '',
                time:row.querySelector('time')?.getAttribute('datetime') || row.querySelector('time')?.textContent?.trim() || '',
                links:[...row.querySelectorAll('a[href]')].map(link => link.href).filter(link => /^https?:\/\//i.test(link))
            })).filter(message => message.text);
            sendResponse({ok:true, messages, partial:true});
        } catch (error) { sendResponse({ok:false, error:error.message}); }
        return false;
    });
})();
