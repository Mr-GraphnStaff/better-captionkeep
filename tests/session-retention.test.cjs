const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../teams-captions-saver/sessionManager.js'), 'utf8');
const archiveId = 'session_11111111-1111-4111-8111-111111111111';
const currentPrefix = `${archiveId}_generation_22222222-2222-4222-8222-222222222222`;
const abandonedPrefix = `${archiveId}_generation_33333333-3333-4333-8333-333333333333`;

function harness(initial = {}, initialSession = {}) {
    const data = structuredClone(initial);
    const sessionData = structuredClone(initialSession);
    const failures = {};
    function area(values) {
        return {
            get: async keys => {
                const selected = keys === null ? Object.keys(values) : Array.isArray(keys) ? keys : [keys];
                return structuredClone(Object.fromEntries(selected.filter(key => key in values).map(key => [key, values[key]])));
            },
            set: async updates => {
                if (failures.set?.(updates)) throw new Error('Storage rejected');
                Object.assign(values, structuredClone(updates));
            },
            remove: async keys => {
                for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
            }
        };
    }
    const context = vm.createContext({
        chrome: {storage:{local:area(data), session:area(sessionData)}}, crypto, Blob,
        console:{log(){}, error(){}}, Date
    });
    vm.runInContext(source, context);
    return {data, sessionData, failures, manager:options => vm.runInContext(`new SessionManager(true, ${JSON.stringify(options || {})})`, context)};
}

function metadata(id, sourceSessionId, timestamp = '2026-10-01T00:00:00Z') {
    return {id, sourceSessionId, timestamp, chunkCount:1, captionCount:1};
}

function marker(id, sessionId) {
    return {id, sessionId, text:'Synthetic source excerpt', markedText:'Synthetic original excerpt'};
}

test('archive deletion erases source-bound excerpts while preserving other meetings and shared settings', async () => {
    const h = harness({session_index:[metadata('archive', 'source')], archive_chunk_0:[{Text:'raw'}],
        evidenceBoardMarkersV1:[marker('archived-id', 'archive'), marker('source-id', 'source'), marker('other', 'unrelated')],
        terminology_dictionary_v1:{entries:['shared']}});
    await h.manager().deleteSession('archive');
    assert.equal(h.data.archive_chunk_0, undefined);
    assert.deepEqual(h.data.evidenceBoardMarkersV1.map(item => item.id), ['other']);
    assert.deepEqual(h.data.terminology_dictionary_v1, {entries:['shared']});
});

test('explicit deletion also erases temporary derivatives for that source', async () => {
    const h = harness({session_index:[metadata('archive', 'source')], archive_chunk_0:[{}]},
        {rolling_notes_source:{draft:'temporary'}, derived_artifacts_source:[{}], rolling_notes_other:{draft:'keep'},
            review_source_live_notes_source:{context:{sessionId:'source'}}, review_source_transcript_qa_source:{context:{sessionId:'source'}},
            handoff_template_source:{templateSnapshot:{id:'synthetic'}}, review_source_live_notes_other:{context:{sessionId:'other'}}});
    await h.manager().deleteSession('archive');
    assert.equal(h.sessionData.rolling_notes_source, undefined);
    assert.equal(h.sessionData.derived_artifacts_source, undefined);
    assert(h.sessionData.rolling_notes_other);
    assert.equal(h.sessionData.review_source_live_notes_source, undefined);
    assert.equal(h.sessionData.review_source_transcript_qa_source, undefined);
    assert.equal(h.sessionData.handoff_template_source, undefined);
    assert(h.sessionData.review_source_live_notes_other);
});

test('expiry and maximum-history pruning erase excerpts only for pruned sources', async () => {
    const h = harness({session_index:[metadata('expired', 'expired-source', '2020-01-01T00:00:00Z'),
        metadata('older', 'older-source'), metadata('newer', 'newer-source', '2026-10-02T00:00:00Z')],
        expired_chunk_0:[{}], older_chunk_0:[{}], newer_chunk_0:[{}],
        evidenceBoardMarkersV1:[marker('expired', 'expired-source'), marker('older', 'older-source'), marker('newer', 'newer-source')]});
    const manager = h.manager({sessionRetentionDays:30, maxStoredSessions:1});
    assert.equal(await manager.pruneExpiredSessions(Date.parse('2026-10-13T00:00:00Z')), 1);
    assert.deepEqual(h.data.evidenceBoardMarkersV1.map(item => item.id), ['older', 'newer']);
    assert.equal(await manager.pruneExcessSessions(), 1);
    assert.deepEqual(h.data.evidenceBoardMarkersV1.map(item => item.id), ['newer']);
    assert.equal(h.data.older_chunk_0, undefined);
    assert(h.data.newer_chunk_0);
});

test('Clear All erases orphan excerpts but preserves explicitly checkpointed live-session data', async () => {
    const h = harness({session_index:[metadata('completed', 'finished'), metadata('saved-live', 'live')],
        completed_chunk_0:[{}], 'saved-live_chunk_0':[{}],
        active_capture_v3_meet_surface:{recordingStartTime:'live', transcript:[{Text:'still recording'}]},
        evidenceBoardMarkersV1:[marker('finished', 'finished'), marker('orphan', 'unknown'), marker('live', 'live')],
        rolling_notes_live:{draft:'live note'}, derived_artifacts_live:[{id:'live'}],
        rolling_notes_finished:{draft:'old note'}, terminology_dictionary_v1:{entries:[]}});
    await h.manager().clearAllSessions();
    assert.deepEqual(h.data.session_index, []);
    assert.deepEqual(h.data.evidenceBoardMarkersV1.map(item => item.id), ['live']);
    assert.equal(h.data.rolling_notes_finished, undefined);
    assert.equal(h.data.completed_chunk_0, undefined);
    assert.equal(h.data['saved-live_chunk_0'], undefined);
    assert(h.data.rolling_notes_live);
    assert(h.data.derived_artifacts_live);
    assert(h.data.active_capture_v3_meet_surface);
    assert(h.data.terminology_dictionary_v1);
});

test('Clear All without an active checkpoint removes the complete marker record', async () => {
    const h = harness({session_index:[], evidenceBoardMarkersV1:[marker('orphan', 'unindexed')],
        unrelatedPreference:'keep'});
    await h.manager().clearAllSessions();
    assert.equal(h.data.evidenceBoardMarkersV1, undefined);
    assert.equal(h.data.unrelatedPreference, 'keep');
});

test('managed retention denial can erase persistent derivatives even for a live checkpoint', async () => {
    const h = harness({session_index:[], active_capture_v2_surface:{recordingStartTime:'live', transcript:[{}]},
        evidenceBoardMarkersV1:[marker('live', 'live')], rolling_notes_live:{draft:'active'}},
        {rolling_notes_live:{draft:'temporary active'}, rolling_notes_ended:{draft:'expired temporary'}});
    await h.manager().clearAllSessions({preserveActive:false});
    assert.equal(h.data.evidenceBoardMarkersV1, undefined);
    assert.equal(h.data.rolling_notes_live, undefined);
    assert(h.data.active_capture_v2_surface);
    assert(h.sessionData.rolling_notes_live);
    assert.equal(h.sessionData.rolling_notes_ended, undefined);
});

test('automatic archive pruning retains a source still owned by an active checkpoint', async () => {
    const h = harness({session_index:[metadata('old-archive', 'live', '2020-01-01T00:00:00Z')],
        'old-archive_chunk_0':[{}], active_capture_v2_surface:{recordingStartTime:'live', transcript:[{}]},
        evidenceBoardMarkersV1:[marker('live', 'live'), marker('archive', 'old-archive')], rolling_notes_live:{draft:'active'}});
    assert.equal(await h.manager({sessionRetentionDays:30}).pruneExpiredSessions(), 1);
    assert.equal(h.data['old-archive_chunk_0'], undefined);
    assert.deepEqual(h.data.evidenceBoardMarkersV1.map(item => item.id), ['live']);
    assert(h.data.rolling_notes_live);
});

test('recovery deletion erases both recovery and stable-source excerpts', async () => {
    const h = harness({backup_test:{recordingStartTime:'stable', transcript:[{}]},
        evidenceBoardMarkersV1:[marker('recovery', 'backup_test'), marker('source', 'stable'), marker('other', 'other')]});
    await h.manager().deleteSession('backup_test');
    assert.equal(h.data.backup_test, undefined);
    assert.deepEqual(h.data.evidenceBoardMarkersV1.map(item => item.id), ['other']);
});

test('failed excerpt removal leaves the authoritative archive intact for a retry', async () => {
    const h = harness({session_index:[metadata('archive', 'source')], archive_chunk_0:[{Text:'raw'}],
        evidenceBoardMarkersV1:[marker('source', 'source'), marker('other', 'other')]});
    h.failures.set = updates => Object.hasOwn(updates, 'evidenceBoardMarkersV1');
    await assert.rejects(h.manager().deleteSession('archive'), /Storage rejected/);
    assert(h.data.archive_chunk_0);
    assert.equal(h.data.session_index.length, 1);
});

test('journaled abandoned replacement cleanup preserves current, recent, unowned and lone recovery generations', async () => {
    const now = Date.now();
    const loneId = 'session_44444444-4444-4444-8444-444444444444';
    const lonePrefix = `${loneId}_generation_55555555-5555-4555-8555-555555555555`;
    const recentPrefix = `${archiveId}_generation_66666666-6666-4666-8666-666666666666`;
    const h = harness({session_index:[{...metadata(archiveId, 'source'), storagePrefix:currentPrefix}],
        [`${currentPrefix}_chunk_0`]:[{Text:'authoritative'}],
        [`${abandonedPrefix}_chunk_0`]:[{Text:'obsolete'}],
        [`${abandonedPrefix}_journal`]:{version:1, sessionId:archiveId, storagePrefix:abandonedPrefix, createdAt:now - 2 * 86400000},
        [`${recentPrefix}_chunk_0`]:[{Text:'may be in progress'}],
        [`${recentPrefix}_journal`]:{version:1, sessionId:archiveId, storagePrefix:recentPrefix, createdAt:now},
        [`${lonePrefix}_chunk_0`]:[{Text:'only recovery'}],
        [`${lonePrefix}_journal`]:{version:1, sessionId:loneId, storagePrefix:lonePrefix, createdAt:now - 2 * 86400000},
        archive_generation_custom_chunk_0:[{Text:'unowned'}]});
    assert.equal(await h.manager().cleanupAbandonedGenerations(now), 2);
    assert.equal(h.data[`${abandonedPrefix}_chunk_0`], undefined);
    assert(h.data[`${currentPrefix}_chunk_0`]);
    assert(h.data[`${recentPrefix}_chunk_0`]);
    assert(h.data[`${lonePrefix}_chunk_0`]);
    assert(h.data.archive_generation_custom_chunk_0);
});

test('orphan cleanup retains replacement data when the published archive is incomplete', async () => {
    const now = Date.now();
    const h = harness({session_index:[{...metadata(archiveId, 'source'), storagePrefix:currentPrefix}],
        [`${abandonedPrefix}_chunk_0`]:[{Text:'recoverable'}],
        [`${abandonedPrefix}_journal`]:{version:1, sessionId:archiveId, storagePrefix:abandonedPrefix, createdAt:now - 2 * 86400000}});
    assert.equal(await h.manager().cleanupAbandonedGenerations(now), 0);
    assert(h.data[`${abandonedPrefix}_chunk_0`]);
});

test('a published journal retires only its named older generation', async () => {
    const h = harness({session_index:[{...metadata(archiveId, 'source'), storagePrefix:currentPrefix}],
        [`${currentPrefix}_chunk_0`]:[{Text:'current'}],
        [`${currentPrefix}_journal`]:{version:1, sessionId:archiveId, storagePrefix:currentPrefix,
            previousStoragePrefix:abandonedPrefix, createdAt:Date.now()},
        [`${abandonedPrefix}_chunk_0`]:[{Text:'old'}], preference:'preserved'});
    assert.equal(await h.manager().cleanupAbandonedGenerations(), 2);
    assert.equal(h.data[`${currentPrefix}_journal`], undefined);
    assert.equal(h.data[`${abandonedPrefix}_chunk_0`], undefined);
    assert(h.data[`${currentPrefix}_chunk_0`]);
    assert.equal(h.data.preference, 'preserved');
});

test('successful saves remove staging journals and failed publication rolls back staged ownership', async () => {
    const h = harness();
    const manager = h.manager();
    const id = await manager.saveSession([{Name:'A', Text:'current', Time:'10:00'}], 'Synthetic', null, {sourceSessionId:'stable'});
    const before = structuredClone(h.data.session_index[0]);
    assert.equal(Object.keys(h.data).some(key => key.endsWith('_journal')), false);
    h.failures.set = updates => Object.hasOwn(updates, 'session_index');
    await assert.rejects(manager.saveSession([{Name:'A', Text:'replacement', Time:'10:00'}], 'Synthetic', null,
        {sourceSessionId:'stable'}), /Storage rejected/);
    assert.equal(h.data.session_index[0].id, id);
    assert.equal(h.data.session_index[0].storagePrefix, before.storagePrefix);
    assert.equal((await manager.loadSession(id)).transcript[0].Text, 'current');
    assert.deepEqual(Object.keys(h.data).filter(key => key.includes('_generation_')), [`${before.storagePrefix}_chunk_0`]);
});

test('explicit deletion removes owned abandoned generations even without an old journal', async () => {
    const h = harness({session_index:[{...metadata(archiveId, 'source'), storagePrefix:currentPrefix}],
        [`${currentPrefix}_chunk_0`]:[{}], [`${abandonedPrefix}_source`]:'obsolete raw source',
        preference:'preserved'});
    await h.manager().deleteSession(archiveId);
    assert.equal(h.data[`${abandonedPrefix}_source`], undefined);
    assert.equal(h.data.preference, 'preserved');
});
