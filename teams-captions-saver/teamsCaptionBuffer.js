(function(root) {
    'use strict';

    function normalizeText(value) {
        return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    function isProgressiveRevision(previousText, nextText) {
        const previous = normalizeText(previousText);
        const next = normalizeText(nextText);
        if (!previous || !next) return false;
        if (previous === next || previous.startsWith(next) || next.startsWith(previous)) return true;

        const previousWords = new Set(previous.split(' '));
        const nextWords = new Set(next.split(' '));
        let shared = 0;
        for (const word of previousWords) if (nextWords.has(word)) shared++;
        return shared / Math.max(1, Math.min(previousWords.size, nextWords.size)) >= 0.6;
    }

    function alignExactRows(previousRows, currentRows) {
        const previousCount = previousRows.length;
        const currentCount = currentRows.length;
        const scores = Array.from({length: previousCount + 1}, () => Array(currentCount + 1).fill(0));
        const matches = [];
        const same = (left, right) => left.Name === right.Name && normalizeText(left.Text) === normalizeText(right.Text);

        for (let i = 1; i <= previousCount; i++) {
            for (let j = 1; j <= currentCount; j++) {
                scores[i][j] = same(previousRows[i - 1], currentRows[j - 1])
                    ? scores[i - 1][j - 1] + 1
                    : Math.max(scores[i - 1][j], scores[i][j - 1]);
            }
        }

        let i = previousCount;
        let j = currentCount;
        while (i > 0 && j > 0) {
            if (same(previousRows[i - 1], currentRows[j - 1])) {
                matches.push([i - 1, j - 1]);
                i--;
                j--;
            } else if (scores[i - 1][j] >= scores[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
        return matches.reverse();
    }

    function create(options = {}) {
        const quietMs = options.quietMs ?? 1500;
        const maxPendingMs = options.maxPendingMs ?? 10000;
        const singleRowRemountMs = options.singleRowRemountMs ?? 3000;
        const now = options.now || (() => new Date());
        const schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
        const cancel = options.cancel || (timer => clearTimeout(timer));
        const onCommit = options.onCommit || (() => {});
        const records = new Map();
        let identityKeys = new WeakMap();
        let previousRows = [];
        let nextId = 1;

        function clearTimers(record) {
            if (record.quietTimer) cancel(record.quietTimer);
            if (record.maxTimer) cancel(record.maxTimer);
            record.quietTimer = null;
            record.maxTimer = null;
        }

        function commit(key) {
            const record = records.get(key);
            if (!record || !record.dirty) return;
            clearTimers(record);
            const isNew = !record.committed;
            record.committed = true;
            record.dirty = false;
            onCommit({
                Name: record.Name,
                Text: record.Text,
                Time: record.Time,
                key: record.key,
                capturedAt: record.lastChangedAt
            }, isNew);
        }

        function scheduleCommit(record) {
            if (record.quietTimer) cancel(record.quietTimer);
            record.quietTimer = schedule(() => commit(record.key), quietMs);
            if (!record.maxTimer) record.maxTimer = schedule(() => commit(record.key), maxPendingMs);
        }

        function createRecord(row, observedAt) {
            const key = `teams-caption-${nextId++}`;
            const record = {
                key,
                Name: row.Name,
                Text: row.Text,
                Time: row.Time,
                lastChangedAt: observedAt,
                lastObservedMs: Date.parse(observedAt),
                committed: false,
                dirty: true,
                quietTimer: null,
                maxTimer: null
            };
            records.set(key, record);
            scheduleCommit(record);
            return record;
        }

        function updateRecord(record, row, observedAt, observedMs) {
            record.lastObservedMs = observedMs;
            if (record.Name === row.Name && record.Text === row.Text) return;
            record.Name = row.Name;
            record.Text = row.Text;
            record.lastChangedAt = observedAt;
            record.dirty = true;
            scheduleCommit(record);
        }

        function observeSnapshot(inputRows) {
            const observedDate = now();
            const observedAt = observedDate.toISOString();
            const observedMs = observedDate.getTime();
            const rows = inputRows
                .map(row => ({identity: row.identity, Name: String(row.Name || '').trim(), Text: String(row.Text || '').trim(), Time: row.Time}))
                .filter(row => row.identity && row.Name && row.Text);
            const keys = Array(rows.length).fill(null);
            const usedKeys = new Set();

            rows.forEach((row, index) => {
                const key = identityKeys.get(row.identity);
                if (key && records.has(key) && !usedKeys.has(key)) {
                    keys[index] = key;
                    usedKeys.add(key);
                }
            });

            for (const [previousIndex, currentIndex] of alignExactRows(previousRows, rows)) {
                const key = previousRows[previousIndex].key;
                const record = records.get(key);
                const multiRowSnapshot = previousRows.length > 1 || rows.length > 1;
                const recentSingleRow = record && observedMs - record.lastObservedMs <= singleRowRemountMs;
                if (!keys[currentIndex] && !usedKeys.has(key) && record && (multiRowSnapshot || recentSingleRow)) {
                    keys[currentIndex] = key;
                    usedKeys.add(key);
                }
            }

            rows.forEach((row, index) => {
                if (keys[index]) return;
                const previous = previousRows[index];
                const record = previous && records.get(previous.key);
                const recentlyObserved = record && observedMs - record.lastObservedMs <= singleRowRemountMs;
                if (record && recentlyObserved && !usedKeys.has(record.key) && record.Name === row.Name && isProgressiveRevision(record.Text, row.Text)) {
                    keys[index] = record.key;
                    usedKeys.add(record.key);
                }
            });

            rows.forEach((row, index) => {
                let record = keys[index] ? records.get(keys[index]) : null;
                if (!record) {
                    record = createRecord(row, observedAt);
                    keys[index] = record.key;
                } else {
                    updateRecord(record, row, observedAt, observedMs);
                }
                identityKeys.set(row.identity, record.key);
            });

            const visibleKeys = new Set(keys);
            for (const previous of previousRows) {
                const record = records.get(previous.key);
                if (record?.dirty && !visibleKeys.has(previous.key)) commit(previous.key);
            }

            previousRows = rows.map((row, index) => ({...row, key: keys[index]}));
        }

        function flushAll() {
            for (const key of records.keys()) commit(key);
        }

        function reset() {
            for (const record of records.values()) clearTimers(record);
            records.clear();
            previousRows = [];
            identityKeys = new WeakMap();
            nextId = 1;
        }

        return Object.freeze({observeSnapshot, flushAll, reset});
    }

    root.CaptionKeepTeamsCaptionBuffer = Object.freeze({create});
})(globalThis);
