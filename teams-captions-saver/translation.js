(function (root) {
    'use strict';
    const NOTICE = 'Transcript version: Machine-translated derivative. Original retained locally; translation may be inaccurate.';
    async function translateTranscript(translator, captions, {cache = new Map(), onProgress = () => {}, signal} = {}) {
        const output = [];
        for (const [index, caption] of captions.entries()) {
            if (signal?.aborted) throw new Error('Translation cancelled.');
            const text = String(caption?.Text || '');
            const key = `${String(caption?.key || caption?.sourceKey || index)}\u0000${text}`;
            let translated = cache.get(key);
            if (translated === undefined) {
                translated = text ? await translator.translate(text) : '';
                cache.set(key, translated);
            }
            output.push({...caption, Text:translated});
            onProgress(index + 1, captions.length);
        }
        return output;
    }
    root.CaptionKeepTranslation = Object.freeze({NOTICE, translateTranscript});
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepTranslation;
})(typeof globalThis !== 'undefined' ? globalThis : this);
