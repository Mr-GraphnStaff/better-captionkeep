(function registerGoogleMeetProvider(root) {
    'use strict';

    const registry = root.CaptionKeepProviderRegistry;
    if (!registry) throw new Error('CaptionKeepProviderRegistry must load before Google Meet.');

    const CAPTION_SOURCE_SELECTOR = '[role="region"][aria-label="Captions"]';
    const CAPTION_ENABLE_LABEL = 'Turn on captions';
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
        let autoEnableCaptions = true;
        let captionEnableAttempted = false;
        let nextCaptionId = 0;
        const rowKeys = new WeakMap();
        const lastTextByKey = new Map();

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

        function normalizedText(node) {
            return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
        }

        function containsImage(node) {
            if (!node) return false;
            if (String(node.tagName || '').toUpperCase() === 'IMG') return true;
            return Array.from(node.children || []).some(containsImage);
        }

        function captionRows(source) {
            return Array.from(source?.children || []).flatMap(row => {
                const blocks = Array.from(row.children || []);
                if (blocks.length < 2 || !containsImage(blocks[0])) return [];
                const speaker = normalizedText(blocks[0]) || normalizedText(blocks[0].querySelector?.('img')?.alt) || 'Unknown speaker';
                const text = normalizedText(blocks[1]);
                if (!text) return [];
                return [{row, speaker, text}];
            });
        }

        function emitCaptionRows() {
            const capturedAt = new Date();
            for (const {row, speaker, text} of captionRows(captionSource)) {
                let key = rowKeys.get(row);
                if (!key) {
                    key = `google-meet-${++nextCaptionId}`;
                    rowKeys.set(row, key);
                }
                if (lastTextByKey.get(key) === text) continue;
                lastTextByKey.set(key, text);
                signal('caption-upsert', {caption: {
                    Name: speaker,
                    Text: text,
                    Time: capturedAt.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}),
                    capturedAt: capturedAt.toISOString(),
                    key
                }});
            }
        }

        function requestCaptionEnable() {
            if (!autoEnableCaptions || captionSource || captionEnableAttempted) return false;
            const control = Array.from(pageDocument.querySelectorAll?.('button, [role="button"]') || [])
                .find(element => element.getAttribute?.('aria-label') === CAPTION_ENABLE_LABEL);
            if (!control) return false;
            captionEnableAttempted = true;
            control.click();
            signal('caption-enable-requested');
            return true;
        }

        function observeCaptionSource(source) {
            disconnectCaptionSource();
            captionSource = source;
            captionObserver = new Observer(() => {
                emitCaptionRows();
                signal('caption-source-mutated');
            });
            captionObserver.observe(source, {childList: true, subtree: true, characterData: true});
        }

        function reconcile() {
            if (!isMeetingUrl(currentUrl())) {
                if (!meetingEnded) signal('meeting-ended');
                meetingEnded = true;
                captionEnableAttempted = false;
                disconnectCaptionSource();
                return;
            }

            meetingEnded = false;
            const nextSource = pageDocument.querySelector(CAPTION_SOURCE_SELECTOR);
            if (nextSource && nextSource !== captionSource) {
                captionEnableAttempted = true;
                observeCaptionSource(nextSource);
                sourceAvailable = true;
                signal('caption-source-available');
                emitCaptionRows();
            } else if (!nextSource && sourceAvailable) {
                disconnectCaptionSource();
                sourceAvailable = false;
                signal('caption-source-unavailable', {recoverable: true, reason: 'captions-hidden-or-remounting'});
            }
            if (!nextSource) requestCaptionEnable();
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

        function setAutoEnableCaptions(enabled) {
            autoEnableCaptions = enabled !== false;
            if (pageObserver && autoEnableCaptions) reconcile();
        }

        return Object.freeze({
            getCaptionSource: () => captionSource,
            getSanitizedStructure: () => sanitizeStructure(captionSource),
            isMeetingPresent: () => isMeetingUrl(currentUrl()),
            setAutoEnableCaptions,
            start,
            stop
        });
    }

    registry.register({id: 'google-meet', matches: url => url.hostname === 'meet.google.com', create: createAdapter});
    root.CaptionKeepGoogleMeet = Object.freeze({CAPTION_ENABLE_LABEL, CAPTION_SOURCE_SELECTOR, MEETING_PATH, isMeetingUrl, sanitizeStructure});
})(globalThis);
