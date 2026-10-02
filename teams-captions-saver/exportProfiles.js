(function (root) {
    'use strict';

    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const TIMING_WARNING = 'Displayed times are source labels or browser observation times, not verified media cue boundaries.';

    function xmlEscape(value) {
        return String(value ?? '').replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '\uFFFD')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    function sourceId(entry, index) {
        return String(entry?.key || entry?.sourceKey || `caption-${String(index + 1).padStart(4, '0')}`);
    }

    function normalizedSpeaker(entry) {
        return String(entry?.Name || 'Unknown speaker');
    }

    function formatAsText(transcript, attendeeReport, {includeSourceIds = false} = {}) {
        const lines = [];
        if (attendeeReport?.totalUniqueAttendees > 0) {
            lines.push('=== MEETING ATTENDEES ===', `Total Attendees: ${attendeeReport.totalUniqueAttendees}`);
            if (attendeeReport.meetingStartTime) lines.push(`Meeting Start: ${new Date(attendeeReport.meetingStartTime).toLocaleString()}`);
            lines.push('', 'Attendee List:', ...(attendeeReport.attendeeList || []).map(name => `- ${name}`), '', '=== TRANSCRIPT ===');
        }
        for (const [index, entry] of (transcript || []).entries()) {
            const provenance = includeSourceIds ? ` [source: ${sourceId(entry, index)}]` : '';
            lines.push(`[${String(entry?.Time || 'time unavailable')}] ${normalizedSpeaker(entry)}: ${String(entry?.Text || '')}${provenance}`);
        }
        return lines.join('\n');
    }

    function formatAsMarkdown(transcript, attendeeReport, {includeSourceIds = false} = {}) {
        const sections = [];
        if (attendeeReport?.totalUniqueAttendees > 0) {
            sections.push('# Meeting Attendees', '', `**Total Attendees:** ${attendeeReport.totalUniqueAttendees}`, '');
            if (attendeeReport.meetingStartTime) sections.push(`**Meeting Start:** ${new Date(attendeeReport.meetingStartTime).toLocaleString()}`, '');
            sections.push('## Attendee List', '', ...(attendeeReport.attendeeList || []).map(name => `- ${name}`), '', '---', '', '# Transcript', '');
        }
        for (const [index, entry] of (transcript || []).entries()) {
            const provenance = includeSourceIds ? ` · source: \`${sourceId(entry, index)}\`` : '';
            sections.push(`**${normalizedSpeaker(entry)}** (${String(entry?.Time || 'time unavailable')})${provenance}:`, `> ${String(entry?.Text || '').replace(/\n/g, '\n> ')}`, '');
        }
        return sections.join('\n').trim();
    }

    function paragraph(text, {bold = false, style = ''} = {}) {
        const parts = String(text ?? '').split(/\r?\n/);
        const runs = parts.map((part, index) => `${index ? '<w:r><w:br/></w:r>' : ''}<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlEscape(part)}</w:t></w:r>`).join('');
        return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${xmlEscape(style)}"/></w:pPr>` : ''}${runs}</w:p>`;
    }

    function documentXml({meetingTitle, transcript, attendeeReport, versionNotice}) {
        const body = [
            paragraph(meetingTitle || 'Meeting transcript', {bold:true}),
            versionNotice ? paragraph(versionNotice) : '',
            paragraph(TIMING_WARNING)
        ];
        if (attendeeReport?.totalUniqueAttendees > 0) {
            body.push(paragraph(`Attendees (${attendeeReport.totalUniqueAttendees})`, {bold:true}));
            for (const name of attendeeReport.attendeeList || []) body.push(paragraph(`• ${name}`));
        }
        body.push(paragraph('Transcript', {bold:true}));
        for (const [index, entry] of (transcript || []).entries()) {
            body.push(paragraph(`[${String(entry?.Time || 'time unavailable')}] ${normalizedSpeaker(entry)}:`, {bold:true}));
            body.push(paragraph(String(entry?.Text || '')));
            body.push(paragraph(`Source caption: ${sourceId(entry, index)}`));
        }
        body.push('<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>');
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}</w:body></w:document>`;
    }

    let crcTable;
    function crc32(bytes) {
        if (!crcTable) {
            crcTable = Array.from({length:256}, (_, value) => {
                let current = value;
                for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
                return current >>> 0;
            });
        }
        let crc = 0xffffffff;
        for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    }

    function littleEndian(value, length) {
        const output = new Uint8Array(length);
        let remaining = Number(value) >>> 0;
        for (let index = 0; index < length; index += 1) {
            output[index] = remaining & 0xff;
            remaining >>>= 8;
        }
        return output;
    }

    function concat(parts) {
        const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
        let offset = 0;
        for (const part of parts) { output.set(part, offset); offset += part.length; }
        return output;
    }

    function zip(files) {
        const encoder = new TextEncoder();
        const locals = [];
        const central = [];
        let offset = 0;
        for (const file of files) {
            const name = encoder.encode(file.name);
            const data = encoder.encode(file.content);
            const crc = crc32(data);
            const local = concat([
                littleEndian(0x04034b50,4), littleEndian(20,2), littleEndian(0x0800,2), littleEndian(0,2),
                littleEndian(0,2), littleEndian(0x21,2), littleEndian(crc,4), littleEndian(data.length,4), littleEndian(data.length,4),
                littleEndian(name.length,2), littleEndian(0,2), name, data
            ]);
            locals.push(local);
            central.push(concat([
                littleEndian(0x02014b50,4), littleEndian(20,2), littleEndian(20,2), littleEndian(0x0800,2), littleEndian(0,2),
                littleEndian(0,2), littleEndian(0x21,2), littleEndian(crc,4), littleEndian(data.length,4), littleEndian(data.length,4),
                littleEndian(name.length,2), littleEndian(0,2), littleEndian(0,2), littleEndian(0,2), littleEndian(0,2),
                littleEndian(0,4), littleEndian(offset,4), name
            ]));
            offset += local.length;
        }
        const centralBytes = concat(central);
        return concat([...locals, centralBytes,
            littleEndian(0x06054b50,4), littleEndian(0,2), littleEndian(0,2), littleEndian(files.length,2), littleEndian(files.length,2),
            littleEndian(centralBytes.length,4), littleEndian(offset,4), littleEndian(0,2)]);
    }

    function buildDocx(options) {
        return zip([
            {name:'[Content_Types].xml', content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'},
            {name:'_rels/.rels', content:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},
            {name:'word/document.xml', content:documentXml(options)}
        ]);
    }

    function bytesToBase64(bytes) {
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        return btoa(binary);
    }

    function createProfile(options = {}) {
        const transcript = Array.isArray(options.transcript) ? options.transcript : [];
        const requestedFormat = String(options.format || '').toLowerCase();
        if (['srt','vtt','webvtt'].includes(requestedFormat)) {
            throw new Error('Subtitle export is unavailable because caption observation times are not verified speech cue boundaries.');
        }
        const format = ['txt','md','docx'].includes(requestedFormat) ? requestedFormat : 'txt';
        const common = {
            format,
            subsetCount:transcript.length,
            sourceIds:transcript.map(sourceId),
            warnings:[TIMING_WARNING],
            timingBasis:'source-display-or-observation-time',
            previewText:[options.versionNotice, TIMING_WARNING, formatAsText(transcript, options.attendeeReport, {includeSourceIds:true})].filter(Boolean).join('\n\n')
        };
        if (format === 'docx') {
            return {...common, extension:'docx', mimeType:DOCX_MIME, contentEncoding:'base64',
                content:bytesToBase64(buildDocx({...options, transcript}))};
        }
        const content = format === 'md'
            ? formatAsMarkdown(transcript, options.attendeeReport)
            : formatAsText(transcript, options.attendeeReport);
        const prefix = options.versionNotice ? `${format === 'md' ? '> ' : ''}${options.versionNotice}\n\n` : '';
        return {...common, extension:format, mimeType:format === 'md' ? 'text/markdown' : 'text/plain', contentEncoding:'utf8', content:prefix + content};
    }

    root.CaptionKeepExportProfiles = Object.freeze({
        DOCX_MIME, TIMING_WARNING, xmlEscape, sourceId, formatAsText, formatAsMarkdown,
        crc32, zip, buildDocx, bytesToBase64, createProfile
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepExportProfiles;
})(typeof globalThis !== 'undefined' ? globalThis : this);
