(() => {
    'use strict';

    const RULES = Object.freeze([
        Object.freeze({
            type: 'EMAIL',
            pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
        }),
        Object.freeze({
            type: 'SSN',
            pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
            validate(value) {
                const [area, group, serial] = value.split('-').map(Number);
                return area !== 0 && area !== 666 && area < 900 && group !== 0 && serial !== 0;
            }
        }),
        Object.freeze({
            type: 'PAYMENT_CARD',
            pattern: /\b(?:\d[ -]*?){13,19}\b/g,
            validate(value) {
                const digits = value.replace(/\D/g, '');
                if (digits.length < 13 || digits.length > 19) return false;
                let sum = 0;
                let doubleDigit = false;
                for (let index = digits.length - 1; index >= 0; index -= 1) {
                    let digit = Number(digits[index]);
                    if (doubleDigit) {
                        digit *= 2;
                        if (digit > 9) digit -= 9;
                    }
                    sum += digit;
                    doubleDigit = !doubleDigit;
                }
                return sum % 10 === 0;
            }
        }),
        Object.freeze({
            type: 'PHONE',
            pattern: /(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3})[ .-]\d{3}[ .-]\d{4}\b/g
        }),
        Object.freeze({
            type: 'IP_ADDRESS',
            pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
            validate(value) {
                return value.split('.').every(part => Number(part) <= 255);
            }
        }),
        Object.freeze({
            type: 'DATE_OF_BIRTH',
            pattern: /\b(?:DOB|date of birth)\s*[:#-]?\s*(?:\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4})|[A-Z][a-z]+\s+\d{1,2},\s+\d{4})\b/gi
        }),
        Object.freeze({
            type: 'MEDICAL_ID',
            pattern: /\b(?:MRN|medical record number|patient ID|member ID)\s*[:#-]?\s*[A-Z0-9][A-Z0-9-]{4,19}\b/gi
        })
    ]);

    const PROFANITY = Object.freeze(['fuck', 'fucking', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'damn']);

    function escapePattern(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function dynamicRules(options = {}) {
        const rules = [];
        if (options.profanityFilterEnabled) {
            rules.push(Object.freeze({ type: 'PROFANITY', pattern: new RegExp(`\\b(?:${PROFANITY.map(escapePattern).join('|')})\\b`, 'gi') }));
        }
        const customTerms = Array.isArray(options.customTerms) ? options.customTerms : [];
        if (customTerms.length) {
            const terms = [...new Set(customTerms.map(term => String(term).trim()).filter(term => term.length >= 2))]
                .sort((a, b) => b.length - a.length);
            if (terms.length) rules.push(Object.freeze({ type: 'CUSTOM_TERM', pattern: new RegExp(terms.map(escapePattern).join('|'), 'gi') }));
        }
        return rules;
    }

    function createScrubContext(options = {}) {
        const replacements = [];
        const placeholders = new Map();
        const counters = new Map();
        const rules = [...RULES, ...dynamicRules(options)];
        function apply(input) {
            let text = typeof input === 'string' ? input : '';
            for (const rule of rules) {
                text = text.replace(rule.pattern, value => {
                    if (rule.validate && !rule.validate(value)) return value;
                    const key = `${rule.type}:${value.toLowerCase()}`;
                    let placeholder = placeholders.get(key);
                    if (!placeholder) {
                        const next = (counters.get(rule.type) || 0) + 1;
                        counters.set(rule.type, next);
                        placeholder = `[${rule.type}_${next}]`;
                        placeholders.set(key, placeholder);
                    }
                    replacements.push(Object.freeze({type: rule.type, placeholder, original: value}));
                    return placeholder;
                });
            }
            return text;
        }
        return {apply, replacements};
    }

    function scrub(input, options = {}) {
        const context = createScrubContext(options);
        return Object.freeze({text: context.apply(input), replacements: Object.freeze(context.replacements)});
    }

    function scrubTranscript(transcript, options = {}) {
        if (!Array.isArray(transcript)) return Object.freeze({ transcript: [], replacements: Object.freeze([]) });
        const context = createScrubContext(options);
        function scrubAttendeeValue(value) {
            if (typeof value === 'string') return context.apply(value);
            if (Array.isArray(value)) return value.map(scrubAttendeeValue);
            if (value && typeof value === 'object') {
                return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubAttendeeValue(item)]));
            }
            return value;
        }
        const cleaned = transcript.map(record => {
            if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
            const next = {...record};
            for (const field of ['Name', 'Text']) {
                if (typeof next[field] === 'string') next[field] = context.apply(next[field]);
            }
            for (const field of ['attendees', 'attendeeList', 'currentAttendees', 'attendeeHistory']) {
                if (Object.hasOwn(next, field)) next[field] = scrubAttendeeValue(next[field]);
            }
            return next;
        });
        return Object.freeze({transcript: cleaned, replacements: Object.freeze(context.replacements)});
    }

    globalThis.CaptionKeepPrivacyScrubber = Object.freeze({ RULES, PROFANITY, scrub, scrubTranscript });
})();
