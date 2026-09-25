(function registerZoomProvider(root) {
    'use strict';

    const registry = root.CaptionKeepProviderRegistry;
    if (!registry) throw new Error('CaptionKeepProviderRegistry must load before Zoom.');

    const CAPTION_SOURCE_SELECTOR = '#live-transcription-subtitle';
    const CAPTION_ENABLE_LABEL = 'Show Captions';
    const MORE_CONTROLS_LABEL = 'More meeting control';
    const CAPTION_LANGUAGE_LABEL = 'English';
    const SAVE_LABEL = 'Save';
    const MEETING_PATH = /^\/wc\/\d+\/join(?:\/|$)/i;
    const SEGMENT_GAP_MS = 1500;
    const REMOUNT_REUSE_WINDOW_MS = 30 * 1000;
    const UNKNOWN_SPEAKER = 'Unknown speaker';

    function isMeetingUrl(url) {
        return url.hostname === 'app.zoom.us' && MEETING_PATH.test(url.pathname);
    }

    function sanitizeStructure(rootNode, limits = {}) {
        const maxDepth = Math.max(1, Math.min(Number(limits.maxDepth) || 8, 12));
        const maxNodes = Math.max(1, Math.min(Number(limits.maxNodes) || 100, 300));
        const safeAttributeValues = new Set(['alert', 'dialog', 'group', 'log', 'presentation', 'region', 'status', 'polite', 'assertive', 'off', 'true', 'false']);
        let nodeCount = 0;

        function visit(node, depth) {
            if (!node || nodeCount >= maxNodes || depth > maxDepth) return null;
            nodeCount += 1;
            if (node.nodeType === 3) return {type: 'text', present: Boolean(node.textContent?.trim())};
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
        let captionEnableStep = 'idle';
        let nextCaptionId = 0;
        let currentKey = null;
        let currentText = '';
        let lastMutationAt = 0;
        let lastEmittedCaption = null;
        let resumeCandidate = null;
        const lastTextByKey = new Map();

        function nowDate() {
            const value = typeof context.now === 'function' ? context.now() : new Date();
            return value instanceof Date ? value : new Date(value);
        }

        function signal(type, details = {}) {
            emit(Object.freeze({providerId: 'zoom', type, observedAt: nowDate().toISOString(), ...details}));
        }

        function currentUrl() {
            return new URL(pageWindow.location.href);
        }

        function normalizedText(node) {
            return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
        }

        function captionText(source) {
            const textNode = Array.from(source?.children || [])
                .find(child => String(child.tagName || '').toUpperCase() === 'SPAN' && normalizedText(child));
            return normalizedText(textNode);
        }

        function disconnectCaptionSource() {
            captionObserver?.disconnect();
            captionObserver = null;
            captionSource = null;
        }

        function createKey(text, capturedAt) {
            const canResume = resumeCandidate
                && capturedAt.getTime() - resumeCandidate.observedAt <= REMOUNT_REUSE_WINDOW_MS
                && resumeCandidate.Text === text;
            const key = canResume ? resumeCandidate.key : `zoom-${++nextCaptionId}`;
            resumeCandidate = null;
            return key;
        }

        function emitCaption() {
            const text = captionText(captionSource);
            if (!text) return;
            const capturedAt = nowDate();
            const observedAt = capturedAt.getTime();
            const relatedInterim = currentText
                && (text.startsWith(currentText) || currentText.startsWith(text) || observedAt - lastMutationAt <= SEGMENT_GAP_MS);

            if (!currentKey || !relatedInterim) currentKey = createKey(text, capturedAt);
            currentText = text;
            lastMutationAt = observedAt;
            if (lastTextByKey.get(currentKey) === text) return;
            lastTextByKey.set(currentKey, text);

            lastEmittedCaption = {
                Name: UNKNOWN_SPEAKER,
                Text: text,
                Time: capturedAt.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}),
                capturedAt: capturedAt.toISOString(),
                key: currentKey
            };
            signal('caption-upsert', {caption: lastEmittedCaption});
        }

        function preserveRemountCandidate() {
            if (!lastEmittedCaption) return;
            resumeCandidate = {...lastEmittedCaption, observedAt: nowDate().getTime()};
        }

        function controlLabel(control) {
            return [control?.getAttribute?.('aria-label'), control?.getAttribute?.('title'), control?.textContent, control?.value]
                .map(value => String(value || '').replace(/\s+/g, ' ').trim())
                .find(Boolean) || '';
        }

        function findControl(label, scope = pageDocument) {
            const controls = scope.querySelectorAll?.('button,[role="button"],[role="menuitem"],[role="radio"],input[type="radio"]') || [];
            return Array.from(controls).find(control => controlLabel(control).toLowerCase() === label.toLowerCase());
        }

        function clickControl(control, eventType) {
            if (!control || control.disabled || control.getAttribute?.('aria-disabled') === 'true') return false;
            control.click();
            signal(eventType);
            return true;
        }

        function captionLanguageDialog() {
            return Array.from(pageDocument.querySelectorAll?.('[role="dialog"]') || [])
                .find(dialog => /caption|language|spoken/i.test(normalizedText(dialog)));
        }

        function requestCaptionEnable() {
            if (!autoEnableCaptions || captionSource || captionEnableStep === 'complete') return false;

            const languageDialog = captionLanguageDialog();
            if (languageDialog) {
                const english = findControl(CAPTION_LANGUAGE_LABEL, languageDialog);
                const englishSelected = english?.checked || english?.getAttribute?.('aria-checked') === 'true';
                if (english && !englishSelected && captionEnableStep === 'caption-requested') {
                    if (!clickControl(english, 'caption-language-requested')) return false;
                    captionEnableStep = 'language-requested';
                    return true;
                }
                const save = findControl(SAVE_LABEL, languageDialog);
                if (clickControl(save, 'caption-language-confirmed')) {
                    captionEnableStep = 'confirmation-requested';
                    return true;
                }
                return false;
            }

            const showCaptions = findControl(CAPTION_ENABLE_LABEL);
            if (showCaptions) {
                if (!clickControl(showCaptions, 'caption-enable-requested')) return false;
                captionEnableStep = 'caption-requested';
                return true;
            }

            if (captionEnableStep !== 'idle') return false;
            const moreControls = findControl(MORE_CONTROLS_LABEL);
            if (!clickControl(moreControls, 'caption-menu-requested')) return false;
            captionEnableStep = 'menu-requested';
            return true;
        }

        function observeCaptionSource(source) {
            disconnectCaptionSource();
            captionSource = source;
            captionObserver = new Observer(() => {
                emitCaption();
                signal('caption-source-mutated');
            });
            captionObserver.observe(source, {childList: true, subtree: true, characterData: true});
        }

        function reconcile() {
            if (!isMeetingUrl(currentUrl())) {
                if (!meetingEnded) signal('meeting-ended');
                meetingEnded = true;
                captionEnableStep = 'idle';
                disconnectCaptionSource();
                return;
            }

            meetingEnded = false;
            const nextSource = pageDocument.querySelector(CAPTION_SOURCE_SELECTOR);
            if (nextSource && nextSource !== captionSource) {
                if (captionSource) preserveRemountCandidate();
                observeCaptionSource(nextSource);
                sourceAvailable = true;
                captionEnableStep = 'complete';
                signal('caption-source-available');
                emitCaption();
            } else if (!nextSource && sourceAvailable) {
                preserveRemountCandidate();
                disconnectCaptionSource();
                sourceAvailable = false;
                currentKey = null;
                currentText = '';
                signal('caption-source-unavailable', {recoverable: true, reason: 'captions-hidden-or-remounting'});
            }
            if (!nextSource) requestCaptionEnable();
        }

        function start(eventHandler) {
            if (pageObserver) return;
            if (typeof eventHandler !== 'function') throw new TypeError('Zoom adapter start requires an event handler.');
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
            if (!autoEnableCaptions) captionEnableStep = 'complete';
            else if (!captionSource && captionEnableStep === 'complete' && !sourceAvailable) captionEnableStep = 'idle';
            if (pageObserver && autoEnableCaptions) reconcile();
        }

        function restoreState(records = []) {
            const restored = Array.isArray(records) ? records : [];
            for (const record of restored) {
                const match = /^zoom-(\d+)$/.exec(record?.key || '');
                if (match) nextCaptionId = Math.max(nextCaptionId, Number(match[1]));
            }
            const last = restored.at(-1);
            if (last?.key && last?.Text) {
                lastEmittedCaption = {...last};
                resumeCandidate = {...last, observedAt: nowDate().getTime()};
            }
        }

        return Object.freeze({
            getCaptionSource: () => captionSource,
            getSanitizedStructure: () => sanitizeStructure(captionSource),
            isMeetingPresent: () => isMeetingUrl(currentUrl()),
            restoreState,
            setAutoEnableCaptions,
            start,
            stop
        });
    }

    registry.register({id: 'zoom', matches: url => url.hostname === 'app.zoom.us', create: createAdapter});
    root.CaptionKeepZoom = Object.freeze({CAPTION_ENABLE_LABEL, CAPTION_LANGUAGE_LABEL, CAPTION_SOURCE_SELECTOR, MEETING_PATH, MORE_CONTROLS_LABEL, SAVE_LABEL, UNKNOWN_SPEAKER, isMeetingUrl, sanitizeStructure});
})(globalThis);
