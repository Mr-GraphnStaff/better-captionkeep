(function registerGoogleMeetProvider(root) {
    'use strict';

    const registry = root.CaptionKeepProviderRegistry;
    if (!registry) throw new Error('CaptionKeepProviderRegistry must load before Google Meet.');

    const CAPTION_SOURCE_SELECTOR = '[role="region"][aria-label="Captions"]';
    const MEETING_PATH = /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:\/|$)/i;

    function isMeetingUrl(url) {
        return url.hostname === 'meet.google.com' && MEETING_PATH.test(url.pathname);
    }

    function sanitizeStructure(rootNode, limits = {}) {
        const maxDepth = Math.max(1, Math.min(Number(limits.maxDepth) || 8, 12));
        const maxNodes = Math.max(1, Math.min(Number(limits.maxNodes) || 200, 500));
        const safeAttributeValues = new Set(['alert', 'dialog', 'group', 'log', 'region', 'status', 'polite', 'assertive', 'off', 'true', 'false']);
        let nodeCount = 0;

        function visit(node, depth) {
            if (!node || nodeCount >= maxNodes || depth > maxDepth) return null;
            nodeCount += 1;

            if (node.nodeType === 3) {
                return {type: 'text', present: Boolean(node.textContent?.trim())};
            }
            if (node.nodeType !== 1) return {type: `node-${node.nodeType}`};

            const attributeNames = Array.from(node.attributes || [], attribute => attribute.name)
                .filter(name => name !== 'class' && name !== 'style')
                .sort();
            const safeAttributes = {};
            for (const name of ['role', 'aria-live', 'aria-atomic']) {
                const value = node.getAttribute?.(name);
                if (safeAttributeValues.has(value)) safeAttributes[name] = value;
            }

            const children = [];
            for (const child of Array.from(node.childNodes || [])) {
                const sanitized = visit(child, depth + 1);
                if (sanitized) children.push(sanitized);
                if (nodeCount >= maxNodes) break;
            }
            return {type: 'element', tag: String(node.tagName || '').toUpperCase(), attributeNames, safeAttributes, children};
        }

        const tree = visit(rootNode, 0);
        return Object.freeze({version: 1, truncated: nodeCount >= maxNodes, nodeCount, tree});
    }

    function createAdapter(context) {
        const pageDocument = context.document || document;
        const pageWindow = context.window || window;
        const Observer = context.MutationObserver || MutationObserver;
        let emit = () => {};
        let pageObserver = null;
        let captionObserver = null;
        let captionSource = null;
        let sourceAvailable = false;
        let meetingEnded = false;

        function signal(type, details = {}) {
            emit(Object.freeze({providerId: 'google-meet', type, observedAt: new Date().toISOString(), ...details}));
        }

        function currentUrl() {
            return new URL(pageWindow.location.href);
        }

        function disconnectCaptionSource() {
            captionObserver?.disconnect();
            captionObserver = null;
            captionSource = null;
        }

        function observeCaptionSource(source) {
            disconnectCaptionSource();
            captionSource = source;
            captionObserver = new Observer(() => signal('caption-source-mutated'));
            captionObserver.observe(source, {childList: true, subtree: true, characterData: true});
        }

        function reconcile() {
            if (!isMeetingUrl(currentUrl())) {
                if (!meetingEnded) signal('meeting-ended');
                meetingEnded = true;
                disconnectCaptionSource();
                return;
            }

            meetingEnded = false;
            const nextSource = pageDocument.querySelector(CAPTION_SOURCE_SELECTOR);
            if (nextSource && nextSource !== captionSource) {
                observeCaptionSource(nextSource);
                sourceAvailable = true;
                signal('caption-source-available');
            } else if (!nextSource && sourceAvailable) {
                disconnectCaptionSource();
                sourceAvailable = false;
                signal('caption-source-unavailable', {recoverable: true, reason: 'captions-hidden-or-remounting'});
            }
        }

        function start(eventHandler) {
            if (pageObserver) return;
            if (typeof eventHandler !== 'function') throw new TypeError('Google Meet adapter start requires an event handler.');
            emit = eventHandler;
            pageObserver = new Observer(reconcile);
            pageObserver.observe(pageDocument.body, {childList: true, subtree: true});
            pageWindow.addEventListener('popstate', reconcile);
            pageWindow.addEventListener('hashchange', reconcile);
            reconcile();
        }

        function stop() {
            pageObserver?.disconnect();
            pageObserver = null;
            disconnectCaptionSource();
            pageWindow.removeEventListener('popstate', reconcile);
            pageWindow.removeEventListener('hashchange', reconcile);
            sourceAvailable = false;
        }

        return Object.freeze({
            getCaptionSource: () => captionSource,
            getSanitizedStructure: () => sanitizeStructure(captionSource),
            isMeetingPresent: () => isMeetingUrl(currentUrl()),
            start,
            stop
        });
    }

    registry.register({id: 'google-meet', matches: url => url.hostname === 'meet.google.com', create: createAdapter});
    root.CaptionKeepGoogleMeet = Object.freeze({CAPTION_SOURCE_SELECTOR, MEETING_PATH, isMeetingUrl, sanitizeStructure});
})(globalThis);
