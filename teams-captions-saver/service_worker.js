importScripts('configuration.js', 'privacyScrubber.js', 'sessionManager.js', 'graphTranscriptConnector.js',
    'correctionManager.js', 'exportProfiles.js', 'entitlement.js', 'meetingExtras.js');
try {
    importScripts('devUatLocalConfig.js');
} catch {
    // Optional file generated only into an authorized unpacked dev/UAT folder.
}
let historyQueue = Promise.resolve();

async function readEffectivePolicy(userKeys = []) {
    const user = userKeys.length ? await chrome.storage.sync.get(userKeys) : {};
    const policy = CaptionKeepConfiguration.applyPolicy(user, await CaptionKeepConfiguration.readManaged());
    return CaptionKeepConfiguration.applyDevUatGraphOverlay(
        policy,
        globalThis.CaptionKeepDevUatLocalConfig,
        chrome.runtime.getManifest()
    );
}

function historyOptions(settings = {}) {
    return {
        maxStoredSessions: settings.maxStoredSessions,
        sessionRetentionDays: settings.sessionRetentionDays
    };
}

function attendeeReportFromBackup(backup) {
    if (backup?.attendeeReport) return backup.attendeeReport;
    const data = backup?.attendeeData;
    if (!data || typeof data !== 'object') return null;
    const attendeeList = Array.isArray(data.allAttendees) ? data.allAttendees.map(String) : [];
    const currentEntries = Array.isArray(data.currentAttendees) ? data.currentAttendees : [];
    return {
        meetingStartTime:data.meetingStartTime || null,
        lastUpdated:data.lastUpdated || null,
        totalUniqueAttendees:attendeeList.length,
        currentAttendeeCount:currentEntries.length,
        attendeeList,
        currentAttendees:currentEntries.map(entry => ({name:String(entry?.[0] || ''), role:String(entry?.[1] || 'Attendee')})),
        attendeeHistory:Array.isArray(data.attendeeHistory) ? data.attendeeHistory : []
    };
}

async function removeMatchingActiveCheckpoint(backup) {
    const surfaceId = String(backup?.surfaceId || '').replace(/[^a-z0-9_-]/gi, '_');
    if (!surfaceId) return false;
    const providerId = String(backup?.providerId || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const candidates = [`active_capture_v2_${surfaceId}`];
    if (providerId) candidates.push(`active_capture_v3_${providerId}_${surfaceId}`);
    const stored = await chrome.storage.local.get(candidates);
    const matching = candidates.filter(key => {
        const active = stored[key];
        if (!active || active.recordingStartTime !== backup.recordingStartTime) return false;
        if (backup.documentSessionId && active.documentSessionId !== backup.documentSessionId) return false;
        return !backup.backupKey || !active.backupKey || active.backupKey === backup.backupKey;
    });
    if (matching.length) await chrome.storage.local.remove(matching);
    return matching.length > 0;
}

async function applyManagedHistoryPolicy() {
    const policy = await readEffectivePolicy();
    const manager = new SessionManager(true, historyOptions(policy.settings));
    if (policy.settings.disableSessionHistory) {
        await manager.clearAllSessions();
        return;
    }
    await manager.pruneExpiredSessions();
    await manager.pruneExcessSessions();
}

function queueManagedHistoryPolicy() {
    const operation = historyQueue.then(() => applyManagedHistoryPolicy());
    historyQueue = operation.catch(() => {});
    return operation;
}

async function migrateCorrectionRecords(fromSessionId, toSessionId) {
    if (!fromSessionId || !toSessionId || fromSessionId === toSessionId) return;
    const fromKey = CaptionKeepCorrections.storageKey(fromSessionId);
    const toKey = CaptionKeepCorrections.storageKey(toSessionId);
    for (const area of [chrome.storage.local, chrome.storage.session]) {
        if (!area) continue;
        const stored = await area.get([fromKey, toKey]);
        if (!stored[fromKey]) continue;
        const merged = {...(stored[fromKey].records || {}), ...(stored[toKey]?.records || {})};
        await area.set({[toKey]:{version:1, sessionId:String(toSessionId), updatedAt:new Date().toISOString(), records:merged}});
        await area.remove(fromKey);
    }
}

async function findCorrectionSource(sessionId) {
    const normalized = String(sessionId || '').trim();
    if (!normalized) return null;
    const data = await chrome.storage.local.get(null);
    const metadata = (data.session_index || []).find(item => item?.id === normalized || item?.sourceSessionId === normalized);
    if (metadata) {
        const loaded = await new SessionManager(true).loadSession(metadata.id);
        return {kind:'archive', transcript:loaded.transcript};
    }
    for (const [key, value] of Object.entries(data)) {
        if (!(key === 'transcriptBackup' || key.startsWith('backup_') || key.startsWith('active_capture_'))) continue;
        if (!Array.isArray(value?.transcript)) continue;
        const identities = [key, value.recordingStartTime, value.sessionId, value.sourceSessionId];
        if (identities.some(identity => String(identity || '') === normalized)) {
            return {kind:key.startsWith('active_capture_') ? 'live' : 'recovery', transcript:value.transcript};
        }
    }
    return null;
}

async function correctionAuthority(sessionId, historical, requireSource = true) {
    const policy = await readEffectivePolicy();
    const source = await findCorrectionSource(sessionId);
    if (requireSource && !source) {
        await chrome.storage.local.remove(CaptionKeepCorrections.storageKey(sessionId));
        await chrome.storage.session.remove(CaptionKeepCorrections.storageKey(sessionId));
        throw new Error('The source transcript is no longer available. No correction was saved.');
    }
    if (policy.settings.disableSessionHistory && (historical || source?.kind !== 'live')) {
        await new SessionManager(true).clearAllSessions();
        throw new Error('Transcript history is disabled by your organization. No correction was saved.');
    }
    const area = policy.settings.disableSessionHistory ? chrome.storage.session : chrome.storage.local;
    if (policy.settings.disableSessionHistory) {
        await chrome.storage.local.remove(CaptionKeepCorrections.storageKey(sessionId));
    }
    return {manager:new CaptionKeepCorrections.CorrectionManager(true, area), source};
}

function authoritativeCaption(transcript, requestedSourceKey) {
    const index = transcript.findIndex((caption, candidateIndex) =>
        CaptionKeepCorrections.sourceKey(caption, candidateIndex) === String(requestedSourceKey || ''));
    if (index < 0) throw new Error('The source caption is no longer available. No correction was saved.');
    return {caption:transcript[index], index};
}

async function prepareManagedExport(meetingTitle, transcriptArray, attendeeReport, policy, aliases = {}) {
    if (policy.settings.disableFileExport) throw new Error('File export is disabled by your organization.');
    const aliasedTranscript = applyAliasesToTranscript(transcriptArray, aliases);
    const aliasedAttendeeReport = applyAliasesToAttendeeReport(attendeeReport, aliases);
    if (!policy.settings.forceScrubbedExport) {
        return {meetingTitle, transcriptArray: aliasedTranscript, attendeeReport: aliasedAttendeeReport};
    }
    const cleaned = globalThis.CaptionKeepPrivacyScrubber.scrubReleaseBundle(meetingTitle, aliasedTranscript, aliasedAttendeeReport, {
        profanityFilterEnabled: !!policy.settings.profanityFilterEnabled,
        customTerms: policy.settings.customScrubTerms || []
    });
    return {meetingTitle:cleaned.meetingTitle, transcriptArray:cleaned.transcript, attendeeReport:cleaned.attendeeReport};
}
// --- Utility Functions ---
function getSanitizedMeetingName(fullTitle) {
    if (!fullTitle) return "Meeting";
    const parts = fullTitle.split('|');
    // Handles titles like "Meeting Name | Microsoft Teams" or "Location | Meeting | Teams"
    const meetingName = parts.length > 2 ? parts[1] : parts[0];
    const cleanedName = meetingName.replace('Microsoft Teams', '').trim();
    // Replace characters forbidden in filenames
    return cleanedName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || "Meeting";
}


function sanitizeSubfolderPath(path) {
    if (!path) {
        return '';
    }

    return path
        .split(/[\\/]+/)
        .map(segment => segment.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_'))
        .filter(segment => segment && segment !== '.' && segment !== '..')
        .join('/');
}

async function resolveSavePreferences({ forAutoSave = false } = {}) {
    const settings = await chrome.storage.sync.get(['saveAsType', 'saveLocation']);
    const saveAsType = settings.saveAsType === 'default' ? 'downloads' : (settings.saveAsType || 'prompt');

    const saveAs = saveAsType === 'prompt';
    const subfolder = saveAsType === 'custom'
        ? sanitizeSubfolderPath(settings.saveLocation || '')
        : '';

    return { saveAs, subfolder, forAutoSave };
}


const AI_ASSISTANT_TARGETS = {chatgpt:true, claude:true, claude_console:true, copilot:true, gemini:true};
const TRANSCRIPT_VERSION_NOTICES = new Set([
    'Transcript version: Machine-translated derivative. Original retained locally; translation may be inaccurate.',
    'Transcript version: Corrected derivative. The original provider transcript is retained locally.',
    'Transcript version: Original provider transcript. Local corrections were not included.'
]);

async function openAiAssistantTabs(providers, prompt, meetingTitle) {
    if (!Array.isArray(providers) || !providers.length || typeof prompt !== 'string') return;
    const id = `handoff_${crypto.randomUUID()}`;
    await chrome.storage.local.set({[id]:{providers:providers.filter(key => Object.hasOwn(AI_ASSISTANT_TARGETS,key)),prompt,meetingTitle}});
    await chrome.tabs.create({url:chrome.runtime.getURL(`handoff.html?id=${id}`)});
}

function applyAliasesToTranscript(transcriptArray, aliases = {}) {
    if (Object.keys(aliases).length === 0) {
        return transcriptArray;
    }
    return transcriptArray.map(entry => {
        const newName = aliases[entry.Name]?.trim();
        return {
            ...entry,
            Name: newName || entry.Name
        };
    });
}

function applyAliasesToAttendeeReport(attendeeReport, aliases = {}) {
    if (!attendeeReport || Object.keys(aliases).length === 0) {
        return attendeeReport;
    }
    
    // Create a new report with aliased names
    const aliasedReport = {
        ...attendeeReport,
        attendeeList: attendeeReport.attendeeList.map(name => {
            const aliasedName = aliases[name]?.trim();
            return aliasedName || name;
        }),
        currentAttendees: attendeeReport.currentAttendees.map(attendee => ({
            ...attendee,
            name: aliases[attendee.name]?.trim() || attendee.name
        })),
        attendeeHistory: attendeeReport.attendeeHistory.map(event => ({
            ...event,
            name: aliases[event.name]?.trim() || event.name
        }))
    };
    
    return aliasedReport;
}

// --- Core Actions ---
async function downloadFile(filename, content, mimeType, options = {}) {
    const normalizedOptions = typeof options === 'boolean' ? { automatic: options } : options;
    const { automatic = false, saveAs = true, contentEncoding = 'utf8', previewText = '', profile = null } = normalizedOptions || {};
    const id = `export_${crypto.randomUUID()}`;
    const pathParts = String(filename || '').split(/[\\/]+/);
    const leafName = (pathParts.pop() || '').replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '');
    if (!leafName || leafName === '.' || leafName === '..') throw new Error('Invalid export filename');
    const safeName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(leafName) ? '_' + leafName : leafName;
    const safeFolder = sanitizeSubfolderPath(pathParts.join('/'));
    const browserFilename = safeFolder ? `${safeFolder}/${safeName}` : safeName;
    await chrome.storage.local.set({[id]:{
        filename:safeName.slice(0,200),
        browserFilename:browserFilename.slice(0,240),
        content,
        contentEncoding,
        previewText,
        profile,
        mimeType,
        automatic,
        saveAs,
        autoStart:true,
        createdAt:new Date().toISOString()
    }});
    await chrome.tabs.create({url:chrome.runtime.getURL(`export.html?job=${id}`), active:saveAs});
}

async function generateFilename(pattern, meetingTitle, format, attendeeReport, recordingStartTime) {
    const referenceDate = recordingStartTime ? new Date(recordingStartTime) : new Date();
    const validDate = isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
    const dateStr = validDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = validDate.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
    const attendeeCount = attendeeReport ? attendeeReport.totalUniqueAttendees : 0;

    const replacements = {
        '{date}': dateStr,
        '{time}': timeStr,
        '{datetime}': `${dateStr}_${timeStr}`,
        '{title}': getSanitizedMeetingName(meetingTitle),
        '{format}': format,
        '{attendees}': attendeeCount > 0 ? `${attendeeCount}_attendees` : ''
    };

    let filename = pattern || '{date}_{title}_{format}';
    for (const [key, value] of Object.entries(replacements)) {
        filename = filename.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    
    // Clean up any double underscores or trailing underscores
    filename = filename.replace(/__+/g, '_').replace(/_+$/, '');
    
    return filename;
}

async function saveTranscript(meetingTitle, transcriptArray, aliases, format, recordingStartTime, saveOptions = {}, attendeeReport = null, versionNotice = '') {
    const processedTranscript = applyAliasesToTranscript(transcriptArray, aliases);
    const processedAttendeeReport = applyAliasesToAttendeeReport(attendeeReport, aliases);

    // Get filename pattern from settings
    const { filenamePattern } = await chrome.storage.sync.get('filenamePattern');
    const requestedFormat = typeof format === 'string' ? format.toLowerCase() : 'txt';
    const normalizedFormat = requestedFormat === 'webvtt' ? 'vtt' : ['md', 'txt', 'docx', 'srt', 'vtt'].includes(requestedFormat) ? requestedFormat : 'txt';
    const filename = await generateFilename(filenamePattern, meetingTitle, normalizedFormat, processedAttendeeReport, recordingStartTime);

    let normalizedOptions = saveOptions;
    if (typeof saveOptions === 'boolean' || saveOptions === undefined) {
        normalizedOptions = { saveAs: saveOptions !== false };
    }

    const { forAutoSave = false, subfolder = '', saveAs = true } = normalizedOptions || {};
    const sanitizedFolder = sanitizeSubfolderPath(subfolder);

    const profile = CaptionKeepExportProfiles.createProfile({
        format:normalizedFormat,
        meetingTitle,
        transcript:processedTranscript,
        attendeeReport:processedAttendeeReport,
        versionNotice
    });

    // Add extension to filename
    const fullFilename = sanitizedFolder ? `${sanitizedFolder}/${filename}.${profile.extension}` : `${filename}.${profile.extension}`;
    await downloadFile(fullFilename, profile.content, profile.mimeType, {
        automatic:forAutoSave,
        saveAs,
        contentEncoding:profile.contentEncoding,
        previewText:profile.previewText,
        profile:{format:profile.format, subsetCount:profile.subsetCount, sourceIds:profile.sourceIds,
            warnings:profile.warnings, timingBasis:profile.timingBasis}
    });
}

// --- State Management ---
let lastAutoSaveId = null;
let autoSaveInProgress = false;
const VIEWER_PAYLOAD_TTL_MS = 5 * 60 * 1000;

async function cleanupViewerPayloads() {
    const data = await chrome.storage.local.get(null);
    const now = Date.now();
    const expired = Object.entries(data).filter(([key, value]) => key.startsWith('viewer_payload_')
        && (!Number.isFinite(value?.expiresAt) || value.expiresAt <= now)).map(([key]) => key);
    if (expired.length) await chrome.storage.local.remove(expired);
}

async function createViewerTab(transcriptArray, sender, message) {
    const key = `viewer_payload_${crypto.randomUUID()}`;
    const createdAt = Date.now();
    await chrome.storage.local.set({[key]: {transcriptArray, sourceTabId:sender.tab?.id,
        sessionId:message.sessionId, meetingTitle:message.meetingTitle, source:message.source || null,
        isHistorical:!!message.isHistorical, createdAt, expiresAt:createdAt + VIEWER_PAYLOAD_TTL_MS}});
    await chrome.tabs.create({url:chrome.runtime.getURL(`viewer.html?payload=${key}`)});
}

function updateBadge(isCapturing) {
    if (isCapturing) {
        chrome.action.setBadgeText({ text: 'ON' });
        chrome.action.setBadgeBackgroundColor({ color: '#28a745' }); // Green
    } else {
        chrome.action.setBadgeText({ text: 'OFF' });
        chrome.action.setBadgeBackgroundColor({ color: '#6c757d' }); // Grey
    }
}

// --- Event Listeners ---
// Helper function to chunk arrays
function chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

// Helper function to calculate duration
function calculateDuration(transcriptArray) {
    if (!transcriptArray || transcriptArray.length === 0) return '0 min';
    
    try {
        const firstTime = new Date(transcriptArray[0].Time);
        const lastTime = new Date(transcriptArray[transcriptArray.length - 1].Time);
        
        // Check if dates are valid
        if (isNaN(firstTime.getTime()) || isNaN(lastTime.getTime())) {
            // Fallback: estimate based on caption count (avg 3 seconds per caption)
            const estimatedMinutes = Math.round((transcriptArray.length * 3) / 60);
            return `~${estimatedMinutes} min`;
        }
        
        const durationMs = lastTime - firstTime;
        const minutes = Math.round(durationMs / 60000);
        
        if (minutes < 60) {
            return `${minutes} min`;
        } else {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return `${hours}h ${mins}m`;
        }
    } catch (error) {
        // If all else fails, show caption count
        return `${transcriptArray.length} captions`;
    }
}

chrome.runtime.onInstalled.addListener(() => {
    updateBadge(false);
    cleanupViewerPayloads().catch(() => {});
    queueManagedHistoryPolicy().catch(error => console.warn('[CaptionKeep] Could not apply managed history policy:', error.message));
});

chrome.runtime.onStartup.addListener(() => {
    updateBadge(false);
    cleanupViewerPayloads().catch(() => {});
    queueManagedHistoryPolicy().catch(error => console.warn('[CaptionKeep] Could not apply managed history policy:', error.message));
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName === 'managed') queueManagedHistoryPolicy().catch(error => console.warn('[CaptionKeep] Could not apply managed history policy:', error.message));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (message?.message === 'get_capture_surface') {
        const providerId = String(message.providerId || 'meeting').toLowerCase().replace(/[^a-z0-9-]/g, '');
        const tabId = sender.tab?.id;
        sendResponse(Number.isInteger(tabId)
            ? {ok: true, surfaceId: `${providerId || 'meeting'}-tab-${tabId}`}
            : {ok: false, error: 'Capture surface is unavailable'});
        return false;
    }
    const handled = new Set(['save_session_history','retry_archive','delete_session','clear_sessions','reset_aliases',
        'get_corrections','save_correction','undo_correction','save_correction_dictionary','apply_correction_dictionary',
        'get_entitlement_state','get_meeting_extras','save_meeting_extras','delete_meeting_extras',
        'download_captions','save_on_leave','open_ai_assistants','display_captions','update_badge_status','error_logged',
        'graph_get_status','graph_connect','graph_disconnect','graph_list_recent_meetings','graph_import_transcript']);
    if (!handled.has(message?.message)) return false;
    if (sender.id !== chrome.runtime.id) return false;
    const extensionPageOnly = ['retry_archive','delete_session','clear_sessions','get_corrections','save_correction','undo_correction',
        'save_correction_dictionary','apply_correction_dictionary','graph_get_status','graph_connect','graph_disconnect',
        'graph_list_recent_meetings','graph_import_transcript','get_meeting_extras','save_meeting_extras','delete_meeting_extras'];
    if (extensionPageOnly.includes(message.message) && !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
    (async () => {
        const { speakerAliases } = await chrome.storage.session.get('speakerAliases');
        let responsePayload = {};

        switch (message.message) {
            case 'graph_get_status':
                {
                    const policy = await readEffectivePolicy();
                    responsePayload = await CaptionKeepGraphTranscript.status(policy.settings);
                }
                break;

            case 'graph_connect':
                {
                    const policy = await readEffectivePolicy();
                    responsePayload = await CaptionKeepGraphTranscript.connect(policy.settings);
                }
                break;

            case 'graph_disconnect':
                responsePayload = await CaptionKeepGraphTranscript.disconnect();
                break;

            case 'graph_list_recent_meetings':
                {
                    const policy = await readEffectivePolicy();
                    responsePayload = await CaptionKeepGraphTranscript.discoverRecentMeetings(policy.settings);
                }
                break;

            case 'graph_import_transcript':
                {
                    const policy = await readEffectivePolicy();
                    if (policy.settings.disableSessionHistory) {
                        throw new Error('Official transcript import requires local session history, which your organization has disabled.');
                    }
                    const imported = await CaptionKeepGraphTranscript.importTranscript(policy.settings, message.joinUrl);
                    const manager = new SessionManager(true, historyOptions(policy.settings));
                    const sessionId = await manager.saveSession(imported.transcript, imported.title, null, {
                        source: imported.source,
                        rawSource: imported.rawSource
                    });
                    await createViewerTab(imported.transcript, sender, {
                        sessionId,
                        meetingTitle: imported.title,
                        source: imported.source,
                        isHistorical: true
                    });
                    responsePayload = {
                        sessionId,
                        captionCount: imported.transcript.length,
                        sourceSha256: imported.source.sourceSha256
                    };
                }
                break;

            case 'save_session_history':
                {
                    const operation = historyQueue.then(async () => {
                        const policy = await readEffectivePolicy(['trackAttendees']);
                        const manager = new SessionManager(true, historyOptions(policy.settings));
                        if (policy.settings.disableSessionHistory) {
                            await manager.clearAllSessions();
                            if (/^backup_[a-f0-9-]+$/.test(message.backupKey || '')) await chrome.storage.local.remove(message.backupKey);
                            return;
                        }
                        await manager.saveSession(message.transcriptArray, message.meetingTitle,
                            policy.settings.trackAttendees === false ? null : message.attendeeReport, {
                            sourceSessionId:message.recordingStartTime,
                            recordedAt:message.recordingStartTime
                        });
                        await chrome.storage.local.remove('archive_last_error');
                        if (/^backup_[a-f0-9-]+$/.test(message.backupKey || '')) await chrome.storage.local.remove(message.backupKey);
                    });
                    historyQueue = operation.catch(() => {});
                    try {
                        await operation;
                    } catch (error) {
                        await chrome.storage.local.set({archive_last_error:{
                            occurredAt:new Date().toISOString(),
                            sourceSessionId:String(message.recordingStartTime || '').slice(0, 200),
                            message:String(error?.message || 'Archive save failed').slice(0, 300),
                            retryable:true
                        }}).catch(() => {});
                        throw error;
                    }
                }
                break;
            case 'retry_archive':
                {
                    if (!/^backup_[a-z0-9-]+$/i.test(message.sessionId || '')) throw new Error('Recovery snapshot is invalid');
                    const operation = historyQueue.then(async () => {
                        const policy = await readEffectivePolicy(['trackAttendees']);
                        if (policy.settings.disableSessionHistory) throw new Error('Transcript archive is disabled by your organization.');
                        const backup = (await chrome.storage.local.get(message.sessionId))[message.sessionId];
                        if (!Array.isArray(backup?.transcript) || !backup.transcript.length) throw new Error('Recovery snapshot not found');
                        const archivedSessionId = await new SessionManager(true, historyOptions(policy.settings)).saveSession(
                            backup.transcript,
                            backup.meetingTitle,
                            policy.settings.trackAttendees === false ? null : attendeeReportFromBackup(backup),
                            {sourceSessionId:backup.recordingStartTime, recordedAt:backup.recordingStartTime}
                        );
                        await migrateCorrectionRecords(message.sessionId, backup.recordingStartTime);
                        await removeMatchingActiveCheckpoint(backup);
                        await chrome.storage.local.remove([message.sessionId, 'archive_last_error']);
                        return archivedSessionId;
                    });
                    historyQueue = operation.catch(() => {});
                    await operation;
                    return;
                }
            case 'delete_session':
            case 'clear_sessions':
                {
                    const operation = historyQueue.then(() => message.message === 'clear_sessions'
                        ? new SessionManager(true).clearAllSessions()
                        : new SessionManager(true).deleteSession(message.sessionId));
                    historyQueue = operation.catch(() => {});
                    await operation;
                }
                break;
            case 'reset_aliases':
                await chrome.storage.session.remove('speakerAliases');
                break;
            case 'get_entitlement_state':
                return CaptionKeepEntitlements.resolveStored();
            case 'get_meeting_extras':
            case 'save_meeting_extras':
            case 'delete_meeting_extras': {
                const operation = historyQueue.then(async () => {
                    await correctionAuthority(message.sessionId, message.historical);
                    const key = CaptionKeepMeetingExtras.storageKey(message.sessionId);
                    if (message.message === 'delete_meeting_extras') {
                        await chrome.storage.local.remove(key);
                        return {};
                    }
                    const policy = await readEffectivePolicy(['privacyScrubberEnabled','profanityFilterEnabled','customScrubTerms']);
                    if (policy.settings.disableSessionHistory) throw new Error('Local meeting retention is disabled by your organization.');
                    const previous = (await chrome.storage.local.get(key))[key] || {};
                    if (message.message === 'get_meeting_extras') {
                        const extras = CaptionKeepMeetingExtras.normalize(previous);
                        if (policy.settings.forceScrubbedExport) {
                            extras.screenshot = '';
                            for (const item of extras.messages) {
                                const scrubOptions = {profanityFilterEnabled:!!policy.settings.profanityFilterEnabled, customTerms:policy.settings.customScrubTerms || []};
                                item.text = CaptionKeepPrivacyScrubber.scrub(item.text, scrubOptions).text;
                                item.speaker = CaptionKeepPrivacyScrubber.scrub(item.speaker, scrubOptions).text;
                                item.links = item.links.map(link => CaptionKeepPrivacyScrubber.scrub(link, scrubOptions).text);
                            }
                        }
                        return {extras};
                    }
                    const incoming = CaptionKeepMeetingExtras.normalize(message.extras);
                    if (incoming.screenshot && policy.settings.forceScrubbedExport) throw new Error('Images cannot be automatically masked for managed scrubbed output.');
                    let extras = incoming;
                    if (policy.settings.forceScrubbedExport || policy.settings.privacyScrubberEnabled !== false) {
                        for (const item of extras.messages) {
                            const scrubOptions = {profanityFilterEnabled:!!policy.settings.profanityFilterEnabled, customTerms:policy.settings.customScrubTerms || []};
                            item.text = CaptionKeepPrivacyScrubber.scrub(item.text, scrubOptions).text;
                            item.speaker = CaptionKeepPrivacyScrubber.scrub(item.speaker, scrubOptions).text;
                            item.links = item.links.map(link => CaptionKeepPrivacyScrubber.scrub(link, scrubOptions).text);
                        }
                    }
                    if (policy.settings.forceScrubbedExport) extras.screenshot = '';
                    extras = CaptionKeepMeetingExtras.merge(previous, extras);
                    if (policy.settings.forceScrubbedExport) extras.screenshot = '';
                    await chrome.storage.local.set({[key]:extras});
                    return {extras};
                });
                historyQueue = operation.catch(() => {});
                return await operation;
            }
            case 'get_corrections':
            case 'save_correction':
            case 'undo_correction':
            case 'save_correction_dictionary':
            case 'apply_correction_dictionary':
                {
                    const operation = historyQueue.then(async () => {
                        if (message.message === 'save_correction_dictionary') {
                            return new CaptionKeepCorrections.CorrectionManager(true).saveDictionary(message.entries);
                        }
                        const authority = await correctionAuthority(message.sessionId, message.historical,
                            message.message !== 'get_corrections');
                        if (!authority.source) return authority.manager.getCorrections(message.sessionId);
                        if (message.message === 'get_corrections') return authority.manager.getCorrections(message.sessionId);
                        if (message.message === 'apply_correction_dictionary') {
                            return authority.manager.applyDictionary(message.sessionId, authority.source.transcript,
                                CaptionKeepCorrections.normalizeDictionary(message.dictionary));
                        }
                        const source = authoritativeCaption(authority.source.transcript, message.sourceKey);
                        if (message.message === 'undo_correction') {
                            return authority.manager.undoCorrection(message.sessionId, source.caption, source.index);
                        }
                        await authority.manager.saveCorrection(message.sessionId, source.caption, source.index,
                            message.replacementText, message.kind, message.dictionaryVersion);
                        return authority.manager.getCorrections(message.sessionId);
                    });
                    historyQueue = operation.catch(() => {});
                    return await operation;
                }

            case 'download_captions':
                console.log('[Teams Caption Saver] Download request received:', {
                    format: message.format,
                    transcriptCount: message.transcriptArray?.length,
                    hasAttendeeReport: !!message.attendeeReport,
                    attendeeCount: message.attendeeReport?.totalUniqueAttendees || 0
                });
                {
                    const policy = await readEffectivePolicy(['profanityFilterEnabled', 'customScrubTerms']);
                    const output = await prepareManagedExport(message.meetingTitle, message.transcriptArray, message.attendeeReport, policy, speakerAliases);
                    const saveOptions = await resolveSavePreferences({ forAutoSave: false });
                    await saveTranscript(
                        output.meetingTitle,
                        output.transcriptArray,
                        {},
                        message.format,
                        message.recordingStartTime,
                        saveOptions,
                        output.attendeeReport,
                        TRANSCRIPT_VERSION_NOTICES.has(message.versionNotice) ? message.versionNotice : ''
                    );
                }
                break;

            case 'save_on_leave':
                // Generate unique ID for this save request
                const saveId = `${message.meetingTitle}_${message.recordingStartTime}`;

                // Prevent duplicate saves
                if (autoSaveInProgress || lastAutoSaveId === saveId) {
                    console.log('Auto-save already in progress or completed for this meeting, skipping...');
                    break;
                }
                
                autoSaveInProgress = true;
                lastAutoSaveId = saveId;

                try {
                    const settings = await chrome.storage.sync.get(['autoSaveOnEnd', 'defaultSaveFormat']);
                    const policy = await readEffectivePolicy(['profanityFilterEnabled', 'customScrubTerms']);
                    if (settings.autoSaveOnEnd && message.transcriptArray.length > 0 && !policy.settings.disableFileExport) {
                        let formatToSave = typeof settings.defaultSaveFormat === 'string'
                            ? settings.defaultSaveFormat.toLowerCase()
                            : 'txt';
                        if (!['txt', 'md', 'docx'].includes(formatToSave)) {
                            formatToSave = 'txt';
                        }
                        console.log(`Auto-saving transcript in ${formatToSave.toUpperCase()} format.`);
                        const output = await prepareManagedExport(message.meetingTitle, message.transcriptArray, message.attendeeReport, policy, speakerAliases);
                        const saveOptions = await resolveSavePreferences({ forAutoSave: true });
                        await saveTranscript(
                            output.meetingTitle,
                            output.transcriptArray,
                            {},
                            formatToSave,
                            message.recordingStartTime,
                            saveOptions,
                            output.attendeeReport
                        );
                        console.log('Export queued; file completion is shown in the export page.');
                    }
                } catch (error) {
                    console.error('Auto-save failed:', error);
                    // Reset state on error to allow retry
                    lastAutoSaveId = null;
                    throw error;
                } finally {
                    autoSaveInProgress = false;
                }
                break;

            case 'open_ai_assistants':
                if ((await readEffectivePolicy()).settings.disableAiHandoff) throw new Error('AI handoff is disabled by your organization.');
                await openAiAssistantTabs(message.providers, message.prompt, message.meetingTitle);
                break;

            case 'display_captions':
                await createViewerTab(message.transcriptArray, sender, message);
                break;
            
            case 'update_badge_status':
                updateBadge(message.capturing);
                // Reset auto-save state when starting a new capture session
                if (message.capturing) {
                    lastAutoSaveId = null;
                    autoSaveInProgress = false;
                    console.log('New capture session started, auto-save state reset.');
                }
                break;
                
            case 'error_logged':
                // Central error logging - could send to analytics service
                console.warn('[Teams Caption Saver] Error logged:', message.error);
                // Could implement error reporting here
                break;
        }
        return responsePayload;
    })().then(result => sendResponse({
        ok:true,
        ...(result && typeof result === 'object' && !Array.isArray(result) ? result : {}),
        value:result
    }), error => sendResponse({ok:false, error:error.message, code:error.code || 'UNEXPECTED_ERROR'}));
    
    return true; // Indicates that the response will be sent asynchronously
});
