// Session Manager - durable local completed-meeting archive.

class SessionManager {
    constructor(writer = false, options = {}) {
        this.writer = writer;
        const requestedMaximum = Number(options.maxStoredSessions);
        const requestedRetention = Number(options.sessionRetentionDays);
        this.MAX_SESSIONS = Number.isInteger(requestedMaximum) ? Math.min(10000, Math.max(1, requestedMaximum)) : null;
        this.RETENTION_DAYS = Number.isInteger(requestedRetention) ? Math.min(365, Math.max(1, requestedRetention)) : null;
        this.MAX_CHUNK_SIZE = 256 * 1024;
    }

    // Calculate approximate size of data in bytes
    calculateSize(obj) {
        return new Blob([JSON.stringify(obj)]).size;
    }

    // Split large transcripts into chunks
    chunkTranscript(transcriptArray) {
        const chunks = [];
        let currentChunk = [];
        let currentSize = 0;

        for (const item of transcriptArray) {
            const itemSize = this.calculateSize(item);
            if (currentChunk.length && currentSize + itemSize > this.MAX_CHUNK_SIZE) {
                chunks.push([...currentChunk]);
                currentChunk = [item];
                currentSize = itemSize;
            } else {
                currentChunk.push(item);
                currentSize += itemSize;
            }
        }
        
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        
        return chunks;
    }

    sessionKeys(metadata, includeCorrections = true) {
        const keys = [];
        const prefix = metadata?.storagePrefix || metadata?.id;
        for (let index = 0; index < Number(metadata?.chunkCount || 0); index += 1) {
            keys.push(`${prefix}_chunk_${index}`);
        }
        if (prefix) keys.push(`${prefix}_attendees`, `${prefix}_journal`);
        const correctionSessionId = includeCorrections && (metadata?.sourceSessionId || metadata?.id);
        if (correctionSessionId) {
            keys.push(`meeting_extras_${encodeURIComponent(String(correctionSessionId).trim())}`);
            keys.push(`derived_artifacts_${encodeURIComponent(String(correctionSessionId).trim())}`);
            keys.push(`rolling_notes_${encodeURIComponent(String(correctionSessionId).trim())}`);
            const encoded = encodeURIComponent(String(correctionSessionId).trim()).replace(/%/g, '_').slice(0, 240);
            if (encoded) keys.push(`transcript_corrections_${encoded}`);
        }
        if (typeof metadata?.sourceArtifactKey === 'string'
            && (metadata.sourceArtifactKey.startsWith(`${prefix}_`) || metadata.sourceArtifactKey.startsWith(`${metadata?.id}_`))) {
            keys.push(metadata.sourceArtifactKey);
        }
        return keys;
    }

    sourceIdentities(metadata) {
        return [...new Set([metadata?.id, metadata?.sourceSessionId].filter(Boolean).map(String))];
    }

    activeSourceIdentities(data) {
        const identities = new Set();
        for (const [key, value] of Object.entries(data)) {
            if (!/^active_capture_v[23]_/.test(key) || !Array.isArray(value?.transcript)) continue;
            for (const identity of [value.recordingStartTime, value.sessionId, value.sourceSessionId]) {
                if (typeof identity === 'string' && identity) identities.add(identity);
            }
        }
        return identities;
    }

    // Markers contain source quotes; deleting an archive must delete those copies too.
    async removeEvidenceMarkers(identities, {clearAll = false, preserve = new Set()} = {}) {
        const key = 'evidenceBoardMarkersV1';
        const stored = await chrome.storage.local.get(key);
        if (!Array.isArray(stored[key])) return;
        const removed = new Set(identities.map(String));
        const retained = stored[key].filter(marker => preserve.has(String(marker?.sessionId))
            || (!clearAll && !removed.has(String(marker?.sessionId))));
        if (retained.length === stored[key].length) return;
        if (retained.length) await chrome.storage.local.set({[key]:retained});
        else await chrome.storage.local.remove(key);
    }

    async removeTemporaryArtifacts(identities, preserve = new Set()) {
        if (!chrome.storage.session) return;
        const keys = this.temporaryArtifactKeys(identities.filter(id => !preserve.has(String(id))));
        if (keys.length) await chrome.storage.session.remove([...new Set(keys)]);
    }

    temporaryArtifactKeys(identities) {
        return identities.flatMap(id => {
            const encoded = encodeURIComponent(String(id).trim());
            return [...this.sessionKeys({id}).filter(key =>
                /^(?:transcript_corrections_|meeting_extras_|derived_artifacts_|rolling_notes_)/.test(key)),
                `review_source_live_notes_${encoded}`, `review_source_transcript_qa_${encoded}`,
                `handoff_template_${encoded}`];
        });
    }

    ownedGenerationKeys(sessionId, data, prefix = '') {
        const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
        if (!new RegExp(`^session_${uuid}$`, 'i').test(sessionId || '')) return [];
        const pattern = new RegExp(`^${sessionId}_generation_${uuid}_(?:chunk_\\d+|attendees|source|journal)$`, 'i');
        return Object.keys(data).filter(key => pattern.test(key) && (!prefix || key.startsWith(`${prefix}_`)));
    }

    completeGeneration(metadata, data) {
        if (!metadata || !Number.isInteger(metadata.chunkCount) || metadata.chunkCount < 1) return false;
        const prefix = metadata.storagePrefix || metadata.id;
        let count = 0;
        for (let index = 0; index < metadata.chunkCount; index += 1) {
            const chunk = data[`${prefix}_chunk_${index}`];
            if (!Array.isArray(chunk)) return false;
            count += chunk.length;
        }
        return count === metadata.captionCount
            && (!metadata.sourceArtifactKey || typeof data[metadata.sourceArtifactKey] === 'string');
    }

    // A journal proves which generation an interrupted write owned. A lone unindexed
    // generation may be the only recoverable copy and is deliberately left intact.
    async cleanupAbandonedGenerations(now = Date.now()) {
        if (!this.writer) return 0;
        const data = await chrome.storage.local.get(null);
        const index = Array.isArray(data.session_index) ? data.session_index : [];
        const protectedKeys = new Set(index.flatMap(metadata => this.sessionKeys(metadata, false)));
        const obsolete = new Set();
        for (const [key, journal] of Object.entries(data)) {
            if (journal?.version !== 1 || key !== `${journal.storagePrefix}_journal`
                || !this.ownedGenerationKeys(journal.sessionId, data, journal.storagePrefix).includes(key)) continue;
            const current = index.find(metadata => metadata.id === journal.sessionId);
            if (!this.completeGeneration(current, data)) continue;
            if (current.storagePrefix === journal.storagePrefix) {
                // Publication succeeded. Only the named previous generation is retired.
                if (journal.previousStoragePrefix) {
                    for (const item of this.ownedGenerationKeys(journal.sessionId, data, journal.previousStoragePrefix)) {
                        if (!protectedKeys.has(item)) obsolete.add(item);
                    }
                }
                obsolete.add(key);
            } else if (Number.isFinite(journal.createdAt) && now - journal.createdAt >= 24 * 60 * 60 * 1000) {
                // An unpublished replacement can be removed after a grace period,
                // only while a complete published generation remains available.
                for (const item of this.ownedGenerationKeys(journal.sessionId, data, journal.storagePrefix)) {
                    if (!protectedKeys.has(item)) obsolete.add(item);
                }
            }
        }
        if (obsolete.size) await chrome.storage.local.remove([...obsolete]);
        return obsolete.size;
    }

    normalizeSourceMetadata(source = null) {
        if (!source || typeof source !== 'object') return null;
        const allowed = ['type', 'provider', 'importedAt', 'createdDateTime', 'contentType', 'speakerAttribution',
            'tenantId', 'meetingIdSha256', 'transcriptIdSha256', 'sourceSha256'];
        const normalized = {};
        for (const key of allowed) {
            if (typeof source[key] === 'string' && source[key].length <= 200) normalized[key] = source[key];
        }
        return normalized.type ? normalized : null;
    }

    isExpired(metadata, now = Date.now()) {
        if (!this.RETENTION_DAYS) return false;
        const timestamp = Date.parse(metadata?.timestamp || '');
        return Number.isFinite(timestamp) && timestamp < now - (this.RETENTION_DAYS * 24 * 60 * 60 * 1000);
    }

    async pruneExpiredSessions(now = Date.now()) {
        if (!this.writer || !this.RETENTION_DAYS) return 0;
        const index = await this.getStoredIndex();
        const expired = index.filter(session => this.isExpired(session, now));
        if (!expired.length) return 0;
        const data = await chrome.storage.local.get(null);
        const active = this.activeSourceIdentities(data);
        const keys = expired.flatMap(session => [
            ...this.sessionKeys(session, !active.has(String(session.sourceSessionId || session.id))),
            ...this.ownedGenerationKeys(session.id, data)
        ]);
        await this.removeEvidenceMarkers(expired.flatMap(session => this.sourceIdentities(session)), {preserve:active});
        await this.removeTemporaryArtifacts(expired.flatMap(session => this.sourceIdentities(session)), active);
        if (keys.length) await chrome.storage.local.remove(keys);
        await chrome.storage.local.set({session_index:index.filter(session => !this.isExpired(session, now))});
        return expired.length;
    }

    async pruneExcessSessions() {
        if (!this.writer || !this.MAX_SESSIONS) return 0;
        const index = await this.getStoredIndex();
        if (index.length <= this.MAX_SESSIONS) return 0;
        const sorted = [...index].sort((a, b) => Date.parse(b.timestamp || '') - Date.parse(a.timestamp || ''));
        const retained = sorted.slice(0, this.MAX_SESSIONS);
        const excess = sorted.slice(this.MAX_SESSIONS);
        const data = await chrome.storage.local.get(null);
        const active = this.activeSourceIdentities(data);
        const keys = excess.flatMap(session => [
            ...this.sessionKeys(session, !active.has(String(session.sourceSessionId || session.id))),
            ...this.ownedGenerationKeys(session.id, data)
        ]);
        await this.removeEvidenceMarkers(excess.flatMap(session => this.sourceIdentities(session)), {preserve:active});
        await this.removeTemporaryArtifacts(excess.flatMap(session => this.sourceIdentities(session)), active);
        if (keys.length) await chrome.storage.local.remove(keys);
        await chrome.storage.local.set({session_index:retained});
        return excess.length;
    }

    // Stage a complete generation, publish metadata atomically, then remove the prior generation.
    async saveSession(transcriptArray, meetingTitle, attendeeReport = null, options = {}) {
        try {
            if (!Array.isArray(transcriptArray) || !transcriptArray.length) throw new Error('Cannot archive an empty transcript');
            await this.cleanupAbandonedGenerations();
            await this.pruneExpiredSessions();
            await this.pruneExcessSessions();
            const originalIndex = await this.getStoredIndex();
            const sourceSessionId = String(options.sourceSessionId || '').trim().slice(0, 200);
            const existing = sourceSessionId ? originalIndex.find(item => item.sourceSessionId === sourceSessionId) : null;
            const sessionId = existing?.id || `session_${crypto.randomUUID()}`;
            const storagePrefix = `${sessionId}_generation_${crypto.randomUUID()}`;
            const chunks = this.chunkTranscript(transcriptArray);
            const recordedAt = new Date(options.recordedAt || sourceSessionId || Date.now());
            const timestamp = Number.isFinite(recordedAt.getTime()) ? recordedAt.toISOString() : new Date().toISOString();
            const source = this.normalizeSourceMetadata(options.source);
            const rawSource = typeof options.rawSource === 'string' ? options.rawSource : null;
            if (rawSource && this.calculateSize(rawSource) > 4 * 1024 * 1024) {
                throw new Error('Source transcript exceeds the local-storage limit');
            }
            const metadata = {
                id: sessionId,
                archiveVersion: 1,
                sourceSessionId:sourceSessionId || existing?.sourceSessionId || null,
                storagePrefix,
                title: meetingTitle || 'Untitled Meeting',
                timestamp,
                archivedAt:new Date().toISOString(),
                date: new Date(timestamp).toLocaleDateString(),
                time: new Date(timestamp).toLocaleTimeString(),
                captionCount: transcriptArray.length,
                chunkCount: chunks.length,
                duration: this.calculateDuration(transcriptArray),
                speakers: [...new Set(transcriptArray.map(c => c.Name))].slice(0, 10), // Limit to 10 speakers
                attendees: attendeeReport?.attendeeList?.slice(0, 20), // Limit attendees
                attendeeCount: attendeeReport?.totalUniqueAttendees || 0,
                preview: transcriptArray.slice(0, 3).map(c => `${c.Name}: ${c.Text.substring(0, 50)}`).join(' | '),
                size: this.calculateSize(transcriptArray) + (rawSource ? this.calculateSize(rawSource) : 0),
                source,
                sourceArtifactKey: rawSource ? `${storagePrefix}_source` : null
            };
            if (this.isExpired(metadata)) {
                throw new Error('This recovery snapshot is outside the managed transcript retention period.');
            }
            const staged = Object.fromEntries(chunks.map((chunk, index) => [`${storagePrefix}_chunk_${index}`, chunk]));
            staged[`${storagePrefix}_journal`] = {
                version:1, sessionId, storagePrefix, createdAt:Date.now(),
                previousStoragePrefix:existing?.storagePrefix || ''
            };
            if (attendeeReport) staged[`${storagePrefix}_attendees`] = attendeeReport;
            if (rawSource) staged[metadata.sourceArtifactKey] = rawSource;
            const nextIndex = [...originalIndex.filter(item => item.id !== sessionId), metadata]
                .sort((a,b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
            try {
                await chrome.storage.local.set(staged);
                await chrome.storage.local.set({session_index:nextIndex});
            } catch (error) {
                await chrome.storage.local.remove(Object.keys(staged));
                throw error;
            }
            if (existing) {
                const obsolete = this.sessionKeys(existing, false);
                if (obsolete.length) await chrome.storage.local.remove(obsolete);
            }
            await chrome.storage.local.remove(`${storagePrefix}_journal`);
            await this.pruneExcessSessions();
            console.log(`[SessionManager] Archived session ${sessionId} with ${chunks.length} chunks`);
            return sessionId;
            
        } catch (error) {
            console.error('[SessionManager] Failed to save session:', error);
            throw error;
        }
    }

    // Load a session from storage
    async loadSession(sessionId) {
        try {
            if (sessionId === 'transcriptBackup' || sessionId.startsWith('backup_')) {
                const data = await chrome.storage.local.get(sessionId);
                const backup = data[sessionId];
                if (!backup?.transcript) throw new Error('Recovery snapshot not found');
                return {transcript:backup.transcript, metadata:(await this.getSessionIndex()).find(s => s.id === sessionId), attendeeReport:null};
            }
            const index = await this.getStoredIndex();
            const metadata = index.find(s => s.id === sessionId);
            
            if (!metadata) {
                throw new Error('Session not found');
            }

            // Load all chunks
            const storagePrefix = metadata.storagePrefix || sessionId;
            const chunkKeys = [];
            for (let i = 0; i < metadata.chunkCount; i++) {
                chunkKeys.push(`${storagePrefix}_chunk_${i}`);
            }
            
            const chunks = await chrome.storage.local.get(chunkKeys);
            const transcriptArray = [];
            
            for (let i = 0; i < metadata.chunkCount; i++) {
                const chunk = chunks[`${storagePrefix}_chunk_${i}`];
                if (!Array.isArray(chunk)) throw new Error('Incomplete transcript: missing chunk. Remaining data was retained.');
                transcriptArray.push(...chunk);
            }

            if (transcriptArray.length !== metadata.captionCount) throw new Error('Incomplete transcript: caption count mismatch');

            // Load attendee data if exists
            const extraKeys = [`${storagePrefix}_attendees`];
            if (metadata.sourceArtifactKey) extraKeys.push(metadata.sourceArtifactKey);
            const attendeeData = await chrome.storage.local.get(extraKeys);
            
            return {
                transcript: transcriptArray,
                metadata: metadata,
                attendeeReport: attendeeData[`${storagePrefix}_attendees`] || null,
                sourceArtifact: metadata.sourceArtifactKey ? attendeeData[metadata.sourceArtifactKey] || null : null
            };
            
        } catch (error) {
            console.error('[SessionManager] Failed to load session:', error);
            throw error;
        }
    }

    // Delete a session
    async deleteSession(sessionId, {preserveSources = new Set()} = {}) {
        if (!this.writer) {
            const result = await chrome.runtime.sendMessage({message:'delete_session', sessionId});
            if (!result?.ok) throw new Error(result?.error || 'Delete failed');
            return;
        }
        if (sessionId === 'transcriptBackup' || sessionId.startsWith('backup_')) {
            const stored = await chrome.storage.local.get(sessionId);
            const stableId = stored[sessionId]?.recordingStartTime || sessionId;
            await this.removeEvidenceMarkers([sessionId, stableId]);
            await this.removeTemporaryArtifacts([sessionId, stableId]);
            const correctionKeys = [sessionId, stableId].map(value => {
                const encoded = encodeURIComponent(String(value).trim()).replace(/%/g, '_').slice(0, 240);
                return encoded ? `transcript_corrections_${encoded}` : null;
            }).filter(Boolean);
            await chrome.storage.local.remove([sessionId, ...correctionKeys,
                `meeting_extras_${encodeURIComponent(String(stableId).trim())}`,
                `derived_artifacts_${encodeURIComponent(String(stableId).trim())}`,
                `rolling_notes_${encodeURIComponent(String(stableId).trim())}`]);
            if (chrome.storage.session) await chrome.storage.session.remove(correctionKeys);
            return;
        }
        try {
            const index = await this.getStoredIndex();
            const metadata = index.find(s => s.id === sessionId);
            
            if (!metadata) return;

            // Delete all chunks
            const preserveSource = preserveSources.has(String(metadata.sourceSessionId || metadata.id));
            const keysToDelete = this.sessionKeys(metadata, !preserveSource);
            const data = await chrome.storage.local.get(null);
            keysToDelete.push(...this.ownedGenerationKeys(metadata.id, data));
            await this.removeEvidenceMarkers(this.sourceIdentities(metadata), {preserve:preserveSources});
            await this.removeTemporaryArtifacts(this.sourceIdentities(metadata), preserveSources);
            await chrome.storage.local.remove(keysToDelete);
            
            // Update index
            const newIndex = index.filter(s => s.id !== sessionId);
            await chrome.storage.local.set({ 'session_index': newIndex });
            
            console.log(`[SessionManager] Deleted session ${sessionId}`);
            
        } catch (error) {
            throw error;
        }
    }

    async retryRecovery(sessionId) {
        if (this.writer) throw new Error('Archive retry must be requested from an extension page');
        const result = await chrome.runtime.sendMessage({message:'retry_archive', sessionId});
        if (!result?.ok) throw new Error(result?.error || 'Archive retry failed');
        return result.sessionId;
    }

    // Get list of all sessions
    async getStoredIndex() {
        const {session_index = []} = await chrome.storage.local.get('session_index');
        return session_index;
    }

    async getSessionIndex() {
        const data = await chrome.storage.local.get(null);
        const recovery = Object.entries(data).filter(([key,value]) =>
            (key === 'transcriptBackup' || key.startsWith('backup_')) && Array.isArray(value?.transcript) && value.transcript.length);
        const snapshots = recovery.map(([id,value]) => ({id, title:'Recovery: ' + (value.meetingTitle || 'Meeting'),
            sourceSessionId:value.recordingStartTime || id,
            timestamp:value.lastBackup || new Date().toISOString(), date:new Date(value.lastBackup || Date.now()).toLocaleDateString(),
            captionCount:value.transcript.length, duration:'Recovery snapshot', speakers:[...new Set(value.transcript.map(c=>c.Name))]}));
        return [...(data.session_index || []), ...snapshots].sort((a,b) => Date.parse(b.timestamp)-Date.parse(a.timestamp));
    }

    normalizeSearchValue(value) {
        return String(value || '').normalize('NFKC').toLocaleLowerCase();
    }

    createSearchSnippet(text, query) {
        const source = String(text || '');
        const normalized = this.normalizeSearchValue(source);
        const match = normalized.indexOf(query);
        if (match < 0) return source.slice(0, 160);
        const start = Math.max(0, match - 60);
        const end = Math.min(source.length, match + query.length + 100);
        return `${start ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`;
    }

    async searchSessions(query, options = {}) {
        const needle = this.normalizeSearchValue(query).trim().slice(0, 200);
        if (!needle) return {results:[], searchedSessions:0, skippedSessions:[]};
        const titleFilter = this.normalizeSearchValue(options.title).trim();
        const speakerFilter = this.normalizeSearchValue(options.speaker).trim();
        const from = options.dateFrom ? Date.parse(options.dateFrom) : Number.NEGATIVE_INFINITY;
        const to = options.dateTo ? Date.parse(options.dateTo) : Number.POSITIVE_INFINITY;
        const newestFirst = options.order !== 'oldest';
        const limit = Math.min(100, Math.max(1, Number(options.limit) || 100));
        const offset = Math.min(1000000, Math.max(0, Number(options.offset) || 0));
        const index = (await this.getStoredIndex()).filter(metadata => {
            const timestamp = Date.parse(metadata.timestamp || '');
            if (Number.isFinite(from) && (!Number.isFinite(timestamp) || timestamp < from)) return false;
            if (Number.isFinite(to) && (!Number.isFinite(timestamp) || timestamp > to)) return false;
            if (titleFilter && !this.normalizeSearchValue(metadata.title).includes(titleFilter)) return false;
            return true;
        }).sort((left, right) => (newestFirst ? -1 : 1) * (Date.parse(left.timestamp) - Date.parse(right.timestamp)));
        const results = [];
        const skippedSessions = [];
        let searchedSessions = 0;
        let matchingCaptions = 0;
        let hasMore = false;
        searchLoop: for (const metadata of index) {
            try {
                const session = await this.loadSession(metadata.id);
                searchedSessions += 1;
                for (const [captionIndex, caption] of session.transcript.entries()) {
                    const text = this.normalizeSearchValue(caption?.Text);
                    const speaker = this.normalizeSearchValue(caption?.Name);
                    if (speakerFilter && !speaker.includes(speakerFilter)) continue;
                    if (!text.includes(needle) && !speaker.includes(needle)) continue;
                    matchingCaptions += 1;
                    if (matchingCaptions <= offset) continue;
                    if (results.length >= limit) {
                        hasMore = true;
                        break searchLoop;
                    }
                    results.push({
                        sessionId:metadata.id,
                        captionIndex,
                        sourceKey:String(caption?.key || `caption-${captionIndex + 1}`),
                        title:metadata.title || 'Untitled Meeting',
                        timestamp:metadata.timestamp,
                        date:metadata.date || new Date(metadata.timestamp).toLocaleDateString(),
                        speaker:String(caption?.Name || 'Unknown speaker'),
                        time:String(caption?.Time || 'time unavailable'),
                        snippet:this.createSearchSnippet(caption?.Text, needle)
                    });
                }
            } catch (error) {
                skippedSessions.push({sessionId:metadata.id, title:metadata.title || 'Untitled Meeting', error:String(error.message || 'Unreadable archive')});
            }
        }
        return {
            results,
            searchedSessions,
            skippedSessions,
            offset,
            hasMore,
            nextOffset:hasMore ? offset + results.length : null
        };
    }

    // Update session index with new metadata
    async updateSessionIndex(metadata) {
        let index = await this.getStoredIndex();
        
        // Remove any existing entry with same ID
        index = index.filter(s => s.id !== metadata.id);
        index.sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp));
        
        // Add new metadata
        index.push(metadata);
        
        // Sort by timestamp (newest first)
        index.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        await chrome.storage.local.set({ 'session_index': index });
    }

    // Calculate meeting duration from transcript
    calculateDuration(transcriptArray) {
        if (transcriptArray.length === 0) return '0 min';
        
        const firstTime = new Date(transcriptArray[0].capturedAt);
        const lastTime = new Date(transcriptArray[transcriptArray.length - 1].capturedAt);
        const durationMs = lastTime - firstTime;
        if (!Number.isFinite(durationMs)) return 'Unknown duration';
        const minutes = Math.max(0, Math.round(durationMs / 60000));
        
        if (minutes < 60) {
            return `${minutes} min`;
        } else {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return `${hours}h ${mins}m`;
        }
    }

    // Get current storage usage
    async getStorageUsage() {
        return chrome.storage.local.getBytesInUse(null);
    }

    // Get storage statistics
    async getStorageStats() {
        const usage = await this.getStorageUsage();
        const index = await this.getStoredIndex();
        
        return {
            usedBytes: usage,
            usedMB: (usage / (1024 * 1024)).toFixed(2),
            quotaMB: null,
            percentUsed: null,
            sessionCount: index.length,
            oldestSession: index[index.length - 1]?.date || 'N/A',
            newestSession: index[0]?.date || 'N/A'
        };
    }

    // Clear all sessions
    async clearAllSessions({preserveActive = true} = {}) {
        if (!this.writer) {
            const result = await chrome.runtime.sendMessage({message:'clear_sessions'});
            if (!result?.ok) throw new Error(result?.error || 'Clear failed');
            return;
        }
        const initialData = await chrome.storage.local.get(null);
        const index = Array.isArray(initialData.session_index) ? initialData.session_index : [];
        // Clear completed history without erasing a meeting that is still recording.
        const active = preserveActive ? this.activeSourceIdentities(initialData) : new Set();
        const temporaryActive = this.activeSourceIdentities(initialData);
        
        for (const session of index) {
            await this.deleteSession(session.id, {preserveSources:temporaryActive});
        }
        const data = await chrome.storage.local.get(null);
        const orphanCorrections = Object.keys(data).filter(key => key.startsWith('transcript_corrections_')
            || key.startsWith('meeting_extras_') || key.startsWith('derived_artifacts_') || key.startsWith('rolling_notes_'));
        const activeKeys = new Set([...active].flatMap(id => this.sessionKeys({id})));
        if (orphanCorrections.length) await chrome.storage.local.remove(orphanCorrections.filter(key => !activeKeys.has(key)));
        await this.removeEvidenceMarkers([], {clearAll:true, preserve:active});
        if (chrome.storage.session) {
            const temporary = await chrome.storage.session.get(null);
            const preserveKeys = new Set(this.temporaryArtifactKeys([...temporaryActive]));
            const expiredKeys = Object.keys(temporary).filter(key =>
                /^(?:transcript_corrections_|meeting_extras_|derived_artifacts_|rolling_notes_|review_source_(?:live_notes|transcript_qa)_|handoff_template_)/.test(key)
                && !preserveKeys.has(key));
            if (expiredKeys.length) await chrome.storage.session.remove(expiredKeys);
        }
        
        await chrome.storage.local.set({ 'session_index': [] });
        console.log('[SessionManager] Cleared all sessions');
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionManager;
}
