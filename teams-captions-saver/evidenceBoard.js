(function initializeEvidenceBoard(root) {
    'use strict';

    const MARKER_KINDS = Object.freeze([
        'Decision',
        'Action item',
        'Question',
        'Risk',
        'Follow-up',
        'Important moment'
    ]);

    function cleanInline(value, fallback = '') {
        const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
        return cleaned || fallback;
    }

    function evidenceId(index) {
        const normalized = Math.max(0, Number.parseInt(index, 10) || 0);
        return `C${String(normalized + 1).padStart(4, '0')}`;
    }

    function normalizeKind(value) {
        return MARKER_KINDS.includes(value) ? value : 'Important moment';
    }

    function createMarker(context = {}, options = {}) {
        const transcript = Array.isArray(context.transcriptArray) ? context.transcriptArray : [];
        const captionIndex = Number.isInteger(options.captionIndex)
            ? options.captionIndex
            : transcript.length - 1;
        const caption = transcript[captionIndex];
        if (!caption || !cleanInline(caption.Text)) {
            throw new TypeError('A captured caption is required to create an evidence marker.');
        }

        const now = typeof options.now === 'function' ? options.now() : new Date();
        const createId = typeof options.createId === 'function'
            ? options.createId
            : () => crypto.randomUUID();

        return Object.freeze({
            version: 1,
            id: cleanInline(createId()),
            sessionId: cleanInline(context.sessionId, 'session unavailable'),
            meetingTitle: cleanInline(context.meetingTitle, 'Meeting'),
            providerLabel: cleanInline(context.providerLabel, 'Meeting platform'),
            kind: normalizeKind(options.kind),
            evidenceId: evidenceId(captionIndex),
            sourceKey: cleanInline(caption.key),
            speaker: cleanInline(caption.Name, 'Unknown speaker'),
            time: cleanInline(caption.Time, 'time unavailable'),
            capturedAt: cleanInline(caption.capturedAt),
            text: cleanInline(caption.Text),
            markedText: cleanInline(caption.Text),
            note: cleanInline(options.note),
            createdAt: now.toISOString()
        });
    }

    function reconcileMarkers(markers, context = {}) {
        const transcript = Array.isArray(context.transcriptArray) ? context.transcriptArray : [];
        const byKey = new Map(transcript.map((caption, index) => [cleanInline(caption.key), {caption, index}]));
        let changed = false;
        const reconciled = (Array.isArray(markers) ? markers : []).map(marker => {
            if (marker.sessionId !== context.sessionId || !marker.sourceKey) return marker;
            const match = byKey.get(cleanInline(marker.sourceKey));
            if (!match) return marker;
            const next = {
                ...marker,
                evidenceId: evidenceId(match.index),
                speaker: cleanInline(match.caption.Name, 'Unknown speaker'),
                time: cleanInline(match.caption.Time, 'time unavailable'),
                capturedAt: cleanInline(match.caption.capturedAt),
                text: cleanInline(match.caption.Text)
            };
            if (JSON.stringify(next) !== JSON.stringify(marker)) changed = true;
            return next;
        });
        return Object.freeze({changed, markers: reconciled});
    }

    function compareMarkers(left, right) {
        return String(left?.createdAt || '').localeCompare(String(right?.createdAt || ''));
    }

    function normalizedCaptions(context = {}) {
        const transcript = Array.isArray(context.transcriptArray) ? context.transcriptArray : [];
        return transcript.map((caption, index) => ({
            evidenceId: evidenceId(index),
            sourceKey: cleanInline(caption.key),
            speaker: cleanInline(caption.Name, 'Unknown speaker'),
            time: cleanInline(caption.Time, 'time unavailable'),
            capturedAt: cleanInline(caption.capturedAt),
            text: cleanInline(caption.Text)
        }));
    }

    function canonicalTranscript(context = {}) {
        return JSON.stringify({
            sessionId: cleanInline(context.sessionId, 'session unavailable'),
            meetingTitle: cleanInline(context.meetingTitle, 'Meeting'),
            providerLabel: cleanInline(context.providerLabel, 'Meeting platform'),
            captions: normalizedCaptions(context)
        });
    }

    function createEvidenceBundle(markers, context = {}, options = {}) {
        const items = Array.isArray(markers) ? [...markers].sort(compareMarkers) : [];
        const captions = normalizedCaptions(context);
        return Object.freeze({
            format: 'better-captionkeep-evidence-bundle',
            version: 1,
            generatedAt: cleanInline(options.generatedAt, new Date().toISOString()),
            authority: 'The captured transcript is authoritative. Evidence markers and notes are user-created derivatives.',
            source: {
                sessionId: cleanInline(context.sessionId || items[0]?.sessionId, 'session unavailable'),
                meetingTitle: cleanInline(context.meetingTitle || items[0]?.meetingTitle, 'Meeting'),
                providerLabel: cleanInline(context.providerLabel || items[0]?.providerLabel, 'Meeting platform'),
                transcriptSha256: cleanInline(options.transcriptSha256) || null,
                transcriptIncluded: captions.length > 0,
                captionCount: captions.length
            },
            captions,
            markers: items.map(marker => ({
                id: cleanInline(marker.id),
                kind: normalizeKind(marker.kind),
                evidenceId: cleanInline(marker.evidenceId, 'caption'),
                sourceKey: cleanInline(marker.sourceKey),
                speaker: cleanInline(marker.speaker, 'Unknown speaker'),
                time: cleanInline(marker.time, 'time unavailable'),
                capturedAt: cleanInline(marker.capturedAt),
                markedText: cleanInline(marker.markedText),
                finalText: cleanInline(marker.text),
                note: cleanInline(marker.note),
                createdAt: cleanInline(marker.createdAt)
            }))
        });
    }

    function toMarkdown(markers, context = {}) {
        const items = Array.isArray(markers) ? [...markers].sort(compareMarkers) : [];
        const title = cleanInline(context.meetingTitle || items[0]?.meetingTitle, 'Meeting');
        const provider = cleanInline(context.providerLabel || items[0]?.providerLabel, 'Meeting platform');
        const lines = [
            `# Evidence board: ${title}`,
            '',
            `Provider: ${provider}`,
            '',
            'The raw transcript remains authoritative. These are user-created evidence markers.',
            ''
        ];

        if (!items.length) {
            lines.push('No evidence markers were created.');
            return lines.join('\n');
        }

        for (const marker of items) {
            lines.push(`## ${normalizeKind(marker.kind)} — ${cleanInline(marker.evidenceId, 'caption')}`);
            lines.push('');
            lines.push(`- Time: ${cleanInline(marker.time, 'time unavailable')}`);
            lines.push(`- Speaker: ${cleanInline(marker.speaker, 'Unknown speaker')}`);
            lines.push(`- Evidence: “${cleanInline(marker.text)}”`);
            if (cleanInline(marker.note)) lines.push(`- Note: ${cleanInline(marker.note)}`);
            lines.push('');
        }

        return lines.join('\n').trimEnd();
    }

    root.CaptionKeepEvidenceBoard = Object.freeze({
        MARKER_KINDS,
        canonicalTranscript,
        cleanInline,
        createEvidenceBundle,
        createMarker,
        evidenceId,
        normalizeKind,
        reconcileMarkers,
        toMarkdown
    });
})(globalThis);
