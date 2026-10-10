(() => {
    'use strict';

    const DESTINATIONS = Object.freeze({
        outlook_work: Object.freeze({ name: 'Outlook work or school' }),
        outlook_personal: Object.freeze({ name: 'Outlook.com personal' }),
        outlook: Object.freeze({ name: 'Outlook work or school' }),
        gmail: Object.freeze({ name: 'Gmail on the web' }),
        default: Object.freeze({ name: 'default email app' })
    });

    function clean(value, limit) {
        return String(value || '').replace(/\u0000/g, '').slice(0, limit);
    }

    function compose(destinationKey, message = {}) {
        const destination = DESTINATIONS[destinationKey] || DESTINATIONS.outlook_work;
        const subject = clean(message.subject, 300);
        const body = clean(message.body, 6000);
        const params = new URLSearchParams({ subject, body });
        let url;
        if (destinationKey === 'gmail') {
            const gmailParams = new URLSearchParams({ view: 'cm', fs: '1', su: subject, body });
            url = `https://mail.google.com/mail/?${gmailParams}`;
        } else if (destinationKey === 'default') {
            url = `mailto:?${params}`;
        } else if (destinationKey === 'outlook_personal') {
            url = `https://outlook.live.com/mail/0/deeplink/compose?${params}`;
        } else {
            url = `https://outlook.office.com/mail/deeplink/compose?${params}`;
        }
        return Object.freeze({ name: destination.name, url });
    }

    const api = Object.freeze({ DESTINATIONS, compose });
    globalThis.CaptionKeepWebMail = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
