(function (root) {
    'use strict';

    const DICTIONARY_KEY = 'terminology_dictionary_v1';
    const MAX_ENTRIES = 200;
    const MAX_TERM_LENGTH = 160;
    const MAX_REPLACEMENT_LENGTH = 400;
    const MAX_CORRECTIONS = 10000;

    function storageKey(sessionId) {
        const normalized = encodeURIComponent(String(sessionId || '').trim())
            .replace(/%/g, '_')
            .slice(0, 240);
        if (!normalized) throw new Error('A transcript session identifier is required.');
        return `transcript_corrections_${normalized}`;
    }

    function sourceKey(caption, index) {
        return String(caption?.key || caption?.sourceKey || `caption-${index + 1}`);
    }

    function isWordCharacter(character) {
        return Boolean(character && /[\p{L}\p{N}_]/u.test(character));
    }

    function previousCharacter(text, index) {
        return Array.from(text.slice(0, index)).pop() || '';
    }

    function nextCharacter(text, index) {
        return Array.from(text.slice(index))[0] || '';
    }

    function normalizeEntry(entry, index) {
        const term = String(entry?.term || '').trim();
        const replacement = String(entry?.replacement ?? '').trim();
        if (!term) throw new Error(`Dictionary entry ${index + 1} has no source term.`);
        if (term.length > MAX_TERM_LENGTH) throw new Error(`Dictionary term ${index + 1} is too long.`);
        if (replacement.length > MAX_REPLACEMENT_LENGTH) throw new Error(`Dictionary replacement ${index + 1} is too long.`);
        return {
            id:String(entry?.id || `term-${index + 1}`),
            term,
            replacement,
            caseSensitive:Boolean(entry?.caseSensitive),
            wholeWord:entry?.wholeWord !== false,
            order:Number.isInteger(entry?.order) ? entry.order : index
        };
    }

    function normalizeDictionary(value) {
        const entries = Array.isArray(value?.entries) ? value.entries : [];
        if (entries.length > MAX_ENTRIES) throw new Error(`The local dictionary is limited to ${MAX_ENTRIES} entries.`);
        return {
            version:Number.isInteger(value?.version) ? value.version : 0,
            updatedAt:value?.updatedAt || null,
            entries:entries.map(normalizeEntry)
        };
    }

    function parseDictionaryText(text, options = {}) {
        const lines = String(text || '').split(/\r?\n/);
        const entries = [];
        for (const [lineIndex, rawLine] of lines.entries()) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const separator = line.indexOf('=>');
            if (separator < 1) throw new Error(`Dictionary line ${lineIndex + 1} must use "source => replacement".`);
            entries.push(normalizeEntry({
                id:`term-${entries.length + 1}`,
                term:line.slice(0, separator),
                replacement:line.slice(separator + 2),
                caseSensitive:Boolean(options.caseSensitive),
                wholeWord:options.wholeWord !== false,
                order:entries.length
            }, entries.length));
        }
        if (entries.length > MAX_ENTRIES) throw new Error(`The local dictionary is limited to ${MAX_ENTRIES} entries.`);
        return entries;
    }

    function entryMatches(text, index, entry) {
        const candidate = text.slice(index, index + entry.term.length);
        const matches = entry.caseSensitive
            ? candidate === entry.term
            : candidate.toLocaleLowerCase() === entry.term.toLocaleLowerCase();
        if (!matches) return false;
        if (!entry.wholeWord) return true;
        return !isWordCharacter(previousCharacter(text, index))
            && !isWordCharacter(nextCharacter(text, index + entry.term.length));
    }

    function applyDictionaryToText(text, dictionary) {
        const input = String(text ?? '');
        const entries = normalizeDictionary(dictionary).entries
            .slice()
            .sort((a, b) => b.term.length - a.term.length || a.order - b.order);
        let output = '';
        let index = 0;
        const matches = [];
        while (index < input.length) {
            const entry = entries.find(candidate => entryMatches(input, index, candidate));
            if (entry) {
                const original = input.slice(index, index + entry.term.length);
                output += entry.replacement;
                matches.push({entryId:entry.id, term:original, replacement:entry.replacement, index});
                index += entry.term.length;
                continue;
            }
            const codePoint = input.codePointAt(index);
            const character = String.fromCodePoint(codePoint);
            output += character;
            index += character.length;
        }
        return {text:output, matches};
    }

    function normalizeRecords(value, sessionId) {
        const records = value?.records && typeof value.records === 'object' ? value.records : {};
        return {
            version:1,
            sessionId:String(value?.sessionId || sessionId),
            updatedAt:value?.updatedAt || null,
            records
        };
    }

    function applyCorrectionRecords(transcript, correctionSet) {
        const records = correctionSet?.records || {};
        const statuses = {};
        let appliedCount = 0;
        let conflictCount = 0;
        const corrected = (Array.isArray(transcript) ? transcript : []).map((caption, index) => {
            const key = sourceKey(caption, index);
            const record = records[key];
            if (!record) return {...caption};
            if (String(caption?.Text ?? '') !== String(record.originalText ?? '')) {
                statuses[key] = 'conflict';
                conflictCount += 1;
                return {...caption};
            }
            statuses[key] = 'applied';
            appliedCount += 1;
            return {...caption, Text:String(record.replacementText ?? '')};
        });
        return {transcript:corrected, statuses, appliedCount, conflictCount};
    }

    class CorrectionManager {
        constructor(writer = false, storageArea = null) {
            this.writer = writer;
            this.storage = storageArea || chrome.storage.local;
        }

        async request(message, payload = {}) {
            const response = await chrome.runtime.sendMessage({message, ...payload});
            if (!response?.ok) throw new Error(response?.error || 'Correction update failed.');
            return response.value;
        }

        async getDictionary() {
            const stored = await this.storage.get(DICTIONARY_KEY);
            return normalizeDictionary(stored[DICTIONARY_KEY]);
        }

        async saveDictionary(entries) {
            if (!this.writer) return this.request('save_correction_dictionary', {entries});
            const prior = await this.getDictionary();
            const dictionary = normalizeDictionary({
                version:prior.version + 1,
                updatedAt:new Date().toISOString(),
                entries
            });
            await this.storage.set({[DICTIONARY_KEY]:dictionary});
            return dictionary;
        }

        async getCorrections(sessionId, context = {}) {
            if (!this.writer) return this.request('get_corrections', {sessionId, historical:Boolean(context.historical)});
            const key = storageKey(sessionId);
            const stored = await this.storage.get(key);
            return normalizeRecords(stored[key], sessionId);
        }

        async saveCorrection(sessionId, caption, index, replacementText, kind = 'manual', dictionaryVersion = null, context = {}) {
            if (!this.writer) return this.request('save_correction', {
                sessionId, sourceKey:sourceKey(caption, index), replacementText, kind, dictionaryVersion,
                historical:Boolean(context.historical)
            });
            const correctionSet = await this.getCorrections(sessionId);
            const key = sourceKey(caption, index);
            const replacement = String(replacementText ?? '');
            if (replacement.length > 20000) throw new Error('A corrected caption is limited to 20,000 characters.');
            if (!correctionSet.records[key] && Object.keys(correctionSet.records).length >= MAX_CORRECTIONS) {
                throw new Error(`A transcript is limited to ${MAX_CORRECTIONS} correction records.`);
            }
            correctionSet.records[key] = {
                sourceKey:key,
                originalText:String(caption?.Text ?? ''),
                replacementText:replacement,
                kind:kind === 'dictionary' ? 'dictionary' : 'manual',
                dictionaryVersion:Number.isInteger(dictionaryVersion) ? dictionaryVersion : null,
                changedAt:new Date().toISOString()
            };
            correctionSet.updatedAt = new Date().toISOString();
            await this.storage.set({[storageKey(sessionId)]:correctionSet});
            return correctionSet.records[key];
        }

        async undoCorrection(sessionId, caption, index, context = {}) {
            if (!this.writer) return this.request('undo_correction', {
                sessionId, sourceKey:sourceKey(caption, index), historical:Boolean(context.historical)
            });
            const correctionSet = await this.getCorrections(sessionId);
            delete correctionSet.records[sourceKey(caption, index)];
            correctionSet.updatedAt = new Date().toISOString();
            await this.storage.set({[storageKey(sessionId)]:correctionSet});
            return correctionSet;
        }

        previewDictionary(transcript, dictionary) {
            const changes = [];
            const corrected = (Array.isArray(transcript) ? transcript : []).map((caption, index) => {
                const result = applyDictionaryToText(caption?.Text, dictionary);
                if (result.matches.length) changes.push({sourceKey:sourceKey(caption, index), index, ...result});
                return {...caption, Text:result.text};
            });
            return {transcript:corrected, changes};
        }

        async applyDictionary(sessionId, transcript, dictionary, context = {}) {
            if (!this.writer) return this.request('apply_correction_dictionary', {
                sessionId, dictionary, historical:Boolean(context.historical)
            });
            const preview = this.previewDictionary(transcript, dictionary);
            const correctionSet = await this.getCorrections(sessionId);
            const appliedChanges = [];
            const skippedManualChanges = [];
            for (const change of preview.changes) {
                const caption = transcript[change.index];
                const key = sourceKey(caption, change.index);
                if (correctionSet.records[key]?.kind === 'manual') {
                    skippedManualChanges.push(change);
                    continue;
                }
                correctionSet.records[key] = {
                    sourceKey:key,
                    originalText:String(caption?.Text ?? ''),
                    replacementText:change.text,
                    kind:'dictionary',
                    dictionaryVersion:dictionary.version,
                    changedAt:new Date().toISOString()
                };
                appliedChanges.push(change);
            }
            if (Object.keys(correctionSet.records).length > MAX_CORRECTIONS) throw new Error(`A transcript is limited to ${MAX_CORRECTIONS} correction records.`);
            correctionSet.updatedAt = new Date().toISOString();
            await this.storage.set({[storageKey(sessionId)]:correctionSet});
            return {...preview, appliedChanges, skippedManualChanges};
        }
    }

    const api = {
        CorrectionManager,
        DICTIONARY_KEY,
        storageKey,
        sourceKey,
        normalizeDictionary,
        parseDictionaryText,
        applyDictionaryToText,
        applyCorrectionRecords
    };
    root.CaptionKeepCorrections = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
