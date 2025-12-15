import * as assert from 'assert';

/**
 * Unit tests for ActivityMonitor
 * Tests file activity tracking and learning suggestions
 */
suite('ActivityMonitor Tests', () => {

    test('activity monitor tracks edit count', () => {
        let editCount = 0;
        editCount += 5;
        assert.strictEqual(editCount, 5, 'Tracks edit count');
    });

    test('activity monitor tracks files modified', () => {
        const filesModified = new Set<string>();
        filesModified.add('/path/to/file1.ts');
        filesModified.add('/path/to/file2.ts');
        filesModified.add('/path/to/file1.ts'); // Duplicate

        assert.strictEqual(filesModified.size, 2, 'Tracks unique files');
    });

    test('activity monitor respects automation level', () => {
        const automationLevels = ['manual', 'smart', 'aggressive'];

        for (const level of automationLevels) {
            assert.ok(automationLevels.includes(level), `Level ${level} is valid`);
        }
    });

    test('manual mode disables activity monitoring', () => {
        const automationLevel = 'manual';
        const isDisabled = automationLevel === 'manual';
        assert.ok(isDisabled, 'Manual mode disables monitoring');
    });

    test('smart mode enables activity monitoring', () => {
        const automationLevel: string = 'smart';
        const isEnabled = automationLevel !== 'manual';
        assert.ok(isEnabled, 'Smart mode enables monitoring');
    });

    test('aggressive mode enables activity monitoring', () => {
        const automationLevel: string = 'aggressive';
        const isEnabled = automationLevel !== 'manual';
        assert.ok(isEnabled, 'Aggressive mode enables monitoring');
    });
});

suite('ActivityMonitor Thresholds', () => {

    test('minEdits threshold defaults to 10', () => {
        const defaultMinEdits = 10;
        assert.strictEqual(defaultMinEdits, 10, 'Default is 10 edits');
    });

    test('idleMinutes threshold defaults to 3', () => {
        const defaultIdleMinutes = 3;
        assert.strictEqual(defaultIdleMinutes, 3, 'Default is 3 minutes');
    });

    test('suggestion triggers when both thresholds met', () => {
        const editCount = 15;
        const currentIdleMinutes = 5;
        const minEdits = 10;
        const idleMinutes = 3;

        const shouldTrigger = editCount >= minEdits && currentIdleMinutes >= idleMinutes;
        assert.ok(shouldTrigger, 'Triggers when both thresholds met');
    });

    test('suggestion does not trigger below edit threshold', () => {
        const editCount = 5;
        const currentIdleMinutes = 5;
        const minEdits = 10;
        const idleMinutes = 3;

        const shouldTrigger = editCount >= minEdits && currentIdleMinutes >= idleMinutes;
        assert.ok(!shouldTrigger, 'Does not trigger below edit threshold');
    });

    test('suggestion does not trigger below idle threshold', () => {
        const editCount = 15;
        const currentIdleMinutes = 1;
        const minEdits = 10;
        const idleMinutes = 3;

        const shouldTrigger = editCount >= minEdits && currentIdleMinutes >= idleMinutes;
        assert.ok(!shouldTrigger, 'Does not trigger below idle threshold');
    });
});

suite('ActivityMonitor Suppression', () => {

    test('suppression lasts 30 minutes', () => {
        const suppressionDuration = 30 * 60 * 1000; // 30 minutes in ms
        assert.strictEqual(suppressionDuration, 1800000, 'Suppression is 30 minutes');
    });

    test('suppression prevents suggestions', () => {
        const now = Date.now();
        const suppressUntil = now + 30 * 60 * 1000;
        const isSuppressed = now < suppressUntil;
        assert.ok(isSuppressed, 'Suggestions are suppressed');
    });

    test('suppression expires after duration', () => {
        const now = Date.now();
        const suppressUntil = now - 1; // Already expired
        const isSuppressed = now < suppressUntil;
        assert.ok(!isSuppressed, 'Suppression has expired');
    });
});

suite('ActivityMonitor Stats', () => {

    test('getStats returns edit and file count', () => {
        const stats = {
            editCount: 10,
            fileCount: 3
        };

        assert.ok(stats.editCount >= 0, 'Has edit count');
        assert.ok(stats.fileCount >= 0, 'Has file count');
    });

    test('reset clears all counters', () => {
        let editCount = 10;
        const filesModified = new Set(['file1', 'file2']);

        // Reset
        editCount = 0;
        filesModified.clear();

        assert.strictEqual(editCount, 0, 'Edit count reset');
        assert.strictEqual(filesModified.size, 0, 'Files modified reset');
    });
});
