// Session Manager - Handles storage of meeting history with size management
// Local storage is quota limited across all keys; 8KB/item applies to sync storage.

class SessionManager {
    constructor(writer = false) {
        this.writer = writer;
        this.MAX_SESSIONS = 10;
        this.MAX_CHUNK_SIZE = 7000; // Stay under 8KB limit per key
        this.STORAGE_QUOTA = 8 * 1024 * 1024; // Reserve 8MB for sessions (leaving 2MB for settings)
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
            if (currentSize + itemSize > this.MAX_CHUNK_SIZE) {
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

    // Save a meeting session with automatic chunking
    async saveSession(transcriptArray, meetingTitle, attendeeReport = null) {
        try {
            const sessionId = `session_${crypto.randomUUID()}`;
            const chunks = this.chunkTranscript(transcriptArray);
            
            // Create session metadata
            const metadata = {
                id: sessionId,
                title: meetingTitle || 'Untitled Meeting',
                timestamp: new Date().toISOString(),
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString(),
                captionCount: transcriptArray.length,
                chunkCount: chunks.length,
                duration: this.calculateDuration(transcriptArray),
                speakers: [...new Set(transcriptArray.map(c => c.Name))].slice(0, 10), // Limit to 10 speakers
                attendees: attendeeReport?.attendeeList?.slice(0, 20), // Limit attendees
                attendeeCount: attendeeReport?.totalUniqueAttendees || 0,
                preview: transcriptArray.slice(0, 3).map(c => `${c.Name}: ${c.Text.substring(0, 50)}`).join(' | '),
                size: this.calculateSize(transcriptArray)
            };

            // Stage data first. On failure, remove only this new session; retain existing history.
            const staged = Object.fromEntries(chunks.map((chunk, index) => [`${sessionId}_chunk_${index}`, chunk]));
            if (attendeeReport) staged[`${sessionId}_attendees`] = attendeeReport;
            try {
                await chrome.storage.local.set(staged);
                const index = await this.getStoredIndex();
                index.push(metadata);
                index.sort((a,b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
                await chrome.storage.local.set({session_index:index});
            } catch (error) {
                await chrome.storage.local.remove(Object.keys(staged));
                throw error;
            }
            const index = await this.getStoredIndex();
            for (const old of index.slice(this.MAX_SESSIONS)) await this.deleteSession(old.id);

            console.log(`[SessionManager] Saved session ${sessionId} with ${chunks.length} chunks`);
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
            const chunkKeys = [];
            for (let i = 0; i < metadata.chunkCount; i++) {
                chunkKeys.push(`${sessionId}_chunk_${i}`);
            }
            
            const chunks = await chrome.storage.local.get(chunkKeys);
            const transcriptArray = [];
            
            for (let i = 0; i < metadata.chunkCount; i++) {
                const chunk = chunks[`${sessionId}_chunk_${i}`];
                if (!Array.isArray(chunk)) throw new Error('Incomplete transcript: missing chunk. Remaining data was retained.');
                transcriptArray.push(...chunk);
            }

            if (transcriptArray.length !== metadata.captionCount) throw new Error('Incomplete transcript: caption count mismatch');

            // Load attendee data if exists
            const attendeeData = await chrome.storage.local.get(`${sessionId}_attendees`);
            
            return {
                transcript: transcriptArray,
                metadata: metadata,
                attendeeReport: attendeeData[`${sessionId}_attendees`] || null
            };
            
        } catch (error) {
            console.error('[SessionManager] Failed to load session:', error);
            throw error;
        }
    }

    // Delete a session
    async deleteSession(sessionId) {
        if (!this.writer) {
            const result = await chrome.runtime.sendMessage({message:'delete_session', sessionId});
            if (!result?.ok) throw new Error(result?.error || 'Delete failed');
            return;
        }
        if (sessionId === 'transcriptBackup' || sessionId.startsWith('backup_')) {
            await chrome.storage.local.remove(sessionId);
            return;
        }
        try {
            const index = await this.getSessionIndex();
            const metadata = index.find(s => s.id === sessionId);
            
            if (!metadata) return;

            // Delete all chunks
            const keysToDelete = [];
            for (let i = 0; i < metadata.chunkCount; i++) {
                keysToDelete.push(`${sessionId}_chunk_${i}`);
            }
            keysToDelete.push(`${sessionId}_attendees`);
            
            await chrome.storage.local.remove(keysToDelete);
            
            // Update index
            const newIndex = index.filter(s => s.id !== sessionId);
            await chrome.storage.local.set({ 'session_index': newIndex });
            
            console.log(`[SessionManager] Deleted session ${sessionId}`);
            
        } catch (error) {
            throw error;
        }
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
            timestamp:value.lastBackup || new Date().toISOString(), date:new Date(value.lastBackup || Date.now()).toLocaleDateString(),
            captionCount:value.transcript.length, duration:'Recovery snapshot', speakers:[...new Set(value.transcript.map(c=>c.Name))]}));
        return [...(data.session_index || []), ...snapshots].sort((a,b) => Date.parse(b.timestamp)-Date.parse(a.timestamp));
    }

    // Update session index with new metadata
    async updateSessionIndex(metadata) {
        let index = await this.getSessionIndex();
        
        // Remove any existing entry with same ID
        index = index.filter(s => s.id !== metadata.id);
        index.sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp));
        
        // Add new metadata
        index.push(metadata);
        
        // Keep only recent sessions
        if (index.length > this.MAX_SESSIONS) {
            // Delete oldest sessions
            const toDelete = index.slice(0, index.length - this.MAX_SESSIONS);
            for (const session of toDelete) {
                await this.deleteSession(session.id);
            }
            index = index.slice(-this.MAX_SESSIONS);
        }
        
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

    // Clean up old sessions to make room
    async cleanupOldSessions(requiredSpace) {
        const index = await this.getSessionIndex();
        let freedSpace = 0;
        
        // Delete oldest sessions first
        for (const session of [...index].sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp))) {
            if (freedSpace >= requiredSpace) break;
            
            freedSpace += session.size || 0;
            await this.deleteSession(session.id);
        }
    }

    // Get storage statistics
    async getStorageStats() {
        const usage = await this.getStorageUsage();
        const index = await this.getSessionIndex();
        
        return {
            usedBytes: usage,
            usedMB: (usage / (1024 * 1024)).toFixed(2),
            quotaMB: (this.STORAGE_QUOTA / (1024 * 1024)).toFixed(2),
            percentUsed: ((usage / this.STORAGE_QUOTA) * 100).toFixed(1),
            sessionCount: index.length,
            oldestSession: index[index.length - 1]?.date || 'N/A',
            newestSession: index[0]?.date || 'N/A'
        };
    }

    // Clear all sessions
    async clearAllSessions() {
        if (!this.writer) {
            const result = await chrome.runtime.sendMessage({message:'clear_sessions'});
            if (!result?.ok) throw new Error(result?.error || 'Clear failed');
            return;
        }
        const index = await this.getSessionIndex();
        
        for (const session of index) {
            await this.deleteSession(session.id);
        }
        
        await chrome.storage.local.set({ 'session_index': [] });
        console.log('[SessionManager] Cleared all sessions');
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionManager;
}