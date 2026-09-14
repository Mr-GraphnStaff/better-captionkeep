importScripts('sessionManager.js');
let historyQueue = Promise.resolve();
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

    // Auto-save should never show a dialog
    const saveAs = !forAutoSave && saveAsType === 'prompt';
    const subfolder = saveAsType === 'custom'
        ? sanitizeSubfolderPath(settings.saveLocation || '')
        : '';

    return { saveAs, subfolder, forAutoSave };
}


const AI_ASSISTANT_TARGETS = {chatgpt:true, claude:true, claude_console:true, copilot:true, gemini:true};

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

// --- Formatting Functions ---
function formatAsTxt(transcript, attendeeReport) {
    let content = '';
    
    console.log('[Teams Caption Saver] formatAsTxt called with:', {
        transcriptLength: transcript?.length,
        hasAttendeeReport: !!attendeeReport,
        attendeeCount: attendeeReport?.totalUniqueAttendees || 0,
        attendeeList: attendeeReport?.attendeeList || []
    });
    
    // Add attendee information if available
    if (attendeeReport && attendeeReport.totalUniqueAttendees > 0) {
        content += '=== MEETING ATTENDEES ===\n';
        content += `Total Attendees: ${attendeeReport.totalUniqueAttendees}\n`;
        content += `Meeting Start: ${new Date(attendeeReport.meetingStartTime).toLocaleString()}\n`;
        content += '\nAttendee List:\n';
        attendeeReport.attendeeList.forEach(name => {
            content += `- ${name}\n`;
        });
        content += '\n=== TRANSCRIPT ===\n';
    }
    
    content += transcript.map(entry => `[${entry.Time}] ${entry.Name}: ${entry.Text}`).join('\n');
    return content;
}

function formatAsMarkdown(transcript, attendeeReport) {
    let content = '';
    
    // Add attendee information if available
    if (attendeeReport && attendeeReport.totalUniqueAttendees > 0) {
        content += '# Meeting Attendees\n\n';
        content += `**Total Attendees:** ${attendeeReport.totalUniqueAttendees}\n\n`;
        content += `**Meeting Start:** ${new Date(attendeeReport.meetingStartTime).toLocaleString()}\n\n`;
        content += '## Attendee List\n\n';
        attendeeReport.attendeeList.forEach(name => {
            content += `- ${name}\n`;
        });
        content += '\n---\n\n# Transcript\n\n';
    }
    
    let lastSpeaker = null;
    content += transcript.map(entry => {
        if (entry.Name !== lastSpeaker) {
            lastSpeaker = entry.Name;
            return `\n**${entry.Name}** (${entry.Time}):\n> ${entry.Text}`;
        }
        return `> ${entry.Text}`;
    }).join('\n').trim();
    
    return content;
}

// --- Core Actions ---
async function downloadFile(filename, content, mimeType, automatic = false) {
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
        mimeType,
        automatic,
        createdAt:new Date().toISOString()
    }});
    await chrome.tabs.create({url:chrome.runtime.getURL(`export.html?job=${id}`), active:!automatic});
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

async function saveTranscript(meetingTitle, transcriptArray, aliases, format, recordingStartTime, saveOptions = {}, attendeeReport = null) {
    const processedTranscript = applyAliasesToTranscript(transcriptArray, aliases);
    const processedAttendeeReport = applyAliasesToAttendeeReport(attendeeReport, aliases);

    // Get filename pattern from settings
    const { filenamePattern } = await chrome.storage.sync.get('filenamePattern');
    const requestedFormat = typeof format === 'string' ? format.toLowerCase() : 'txt';
    const normalizedFormat = ['md', 'txt'].includes(requestedFormat) ? requestedFormat : 'txt';
    const filename = await generateFilename(filenamePattern, meetingTitle, normalizedFormat, processedAttendeeReport, recordingStartTime);

    let normalizedOptions = saveOptions;
    if (typeof saveOptions === 'boolean' || saveOptions === undefined) {
        normalizedOptions = { saveAs: saveOptions !== false };
    }

    const { forAutoSave = false, subfolder = '' } = normalizedOptions || {};
    const sanitizedFolder = sanitizeSubfolderPath(subfolder);

    let content;
    let extension;
    let mimeType;

    switch (normalizedFormat) {
        case 'md':
            content = formatAsMarkdown(processedTranscript, processedAttendeeReport);
            extension = 'md';
            mimeType = 'text/markdown';
            break;
        case 'txt':
        default:
            content = formatAsTxt(processedTranscript, processedAttendeeReport);
            extension = 'txt';
            mimeType = 'text/plain';
            break;
    }

    // Add extension to filename
    const fullFilename = sanitizedFolder ? `${sanitizedFolder}/${filename}.${extension}` : `${filename}.${extension}`;
    await downloadFile(fullFilename, content, mimeType, forAutoSave);
}

// --- State Management ---
let lastAutoSaveId = null;
let autoSaveInProgress = false;

async function createViewerTab(transcriptArray, sender, message) {
    const key = `viewer_payload_${crypto.randomUUID()}`;
    await chrome.storage.local.set({[key]: {transcriptArray, sourceTabId:sender.tab?.id,
        sessionId:message.sessionId, meetingTitle:message.meetingTitle}});
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
});

chrome.runtime.onStartup.addListener(() => {
    updateBadge(false);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handled = new Set(['save_session_history','delete_session','clear_sessions','reset_aliases',
        'download_captions','save_on_leave','open_ai_assistants','display_captions','update_badge_status','error_logged']);
    if (!handled.has(message?.message)) return false;
    if (sender.id !== chrome.runtime.id) return false;
    if (['delete_session','clear_sessions'].includes(message.message) && !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
    (async () => {
        const { speakerAliases } = await chrome.storage.session.get('speakerAliases');

        switch (message.message) {
            case 'save_session_history':
                {
                    const operation = historyQueue.then(async () => {
                        const manager = new SessionManager(true);
                        await manager.saveSession(message.transcriptArray, message.meetingTitle, message.attendeeReport);
                        if (/^backup_[a-f0-9-]+$/.test(message.backupKey || '')) await chrome.storage.local.remove(message.backupKey);
                    });
                    historyQueue = operation.catch(() => {});
                    await operation;
                }
                break;
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

            case 'download_captions':
                console.log('[Teams Caption Saver] Download request received:', {
                    format: message.format,
                    transcriptCount: message.transcriptArray?.length,
                    hasAttendeeReport: !!message.attendeeReport,
                    attendeeCount: message.attendeeReport?.totalUniqueAttendees || 0
                });
                {
                    const saveOptions = await resolveSavePreferences({ forAutoSave: false });
                    await saveTranscript(
                        message.meetingTitle,
                        message.transcriptArray,
                        speakerAliases,
                        message.format,
                        message.recordingStartTime,
                        saveOptions,
                        message.attendeeReport
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
                    if (settings.autoSaveOnEnd && message.transcriptArray.length > 0) {
                        let formatToSave = typeof settings.defaultSaveFormat === 'string'
                            ? settings.defaultSaveFormat.toLowerCase()
                            : 'txt';
                        if (!['txt', 'md'].includes(formatToSave)) {
                            formatToSave = 'txt';
                        }
                        console.log(`Auto-saving transcript in ${formatToSave.toUpperCase()} format.`);
                        const saveOptions = await resolveSavePreferences({ forAutoSave: true });
                        await saveTranscript(
                            message.meetingTitle,
                            message.transcriptArray,
                            speakerAliases,
                            formatToSave,
                            message.recordingStartTime,
                            saveOptions,
                            message.attendeeReport
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
    })().then(() => sendResponse({ok:true}), error => sendResponse({ok:false, error:error.message}));
    
    return true; // Indicates that the response will be sent asynchronously
});
