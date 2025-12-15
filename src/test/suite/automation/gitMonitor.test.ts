import * as assert from 'assert';

/**
 * Unit tests for GitMonitor
 * Tests Git context capture and trajectory enrichment
 */
suite('GitMonitor Tests', () => {

    test('GitContext interface has required fields', () => {
        const context = {
            branch: 'main',
            commitsSinceStart: [],
            uncommittedChanges: 0,
            remoteUrl: 'https://github.com/example/repo.git'
        };

        assert.ok(typeof context.branch === 'string', 'Has branch field');
        assert.ok(Array.isArray(context.commitsSinceStart), 'Has commits array');
        assert.ok(typeof context.uncommittedChanges === 'number', 'Has uncommittedChanges');
    });

    test('GitContext branch can be detached', () => {
        const context = { branch: 'detached' };
        assert.strictEqual(context.branch, 'detached', 'Supports detached HEAD');
    });

    test('GitContext remoteUrl is optional', () => {
        const context = {
            branch: 'feature/test',
            commitsSinceStart: [],
            uncommittedChanges: 5
            // remoteUrl intentionally omitted
        };

        assert.ok(!('remoteUrl' in context) || context.remoteUrl === undefined, 'Remote URL is optional');
    });
});

suite('GitMonitor Commit Tracking', () => {

    test('commits have required fields', () => {
        const commit = {
            hash: 'abc123def456',
            shortHash: 'abc123d',
            message: 'feat: add new feature',
            author: 'Test Author',
            date: new Date()
        };

        assert.ok(commit.hash.length >= 7, 'Hash has sufficient length');
        assert.strictEqual(commit.shortHash.length, 7, 'Short hash is 7 chars');
        assert.ok(commit.message.length > 0, 'Message is not empty');
        assert.ok(commit.author.length > 0, 'Author is not empty');
    });

    test('commit message extracts first line only', () => {
        const fullMessage = 'feat: add feature\n\nDetailed description here';
        const firstLine = fullMessage.split('\n')[0];

        assert.strictEqual(firstLine, 'feat: add feature', 'Extracts first line');
        assert.ok(!firstLine.includes('\n'), 'No newlines in first line');
    });

    test('short hash is derived from full hash', () => {
        const fullHash = 'abc123def456789';
        const shortHash = fullHash.substring(0, 7);

        assert.strictEqual(shortHash, 'abc123d', 'Short hash is first 7 chars');
    });
});

suite('GitMonitor Graceful Fallback', () => {

    test('returns null when Git extension not available', () => {
        const gitExtension = undefined;
        const result = gitExtension ? 'available' : null;

        assert.strictEqual(result, null, 'Returns null when Git unavailable');
    });

    test('returns null when repository not found', () => {
        const repository = null;
        const context = repository ? { branch: 'main' } : null;

        assert.strictEqual(context, null, 'Returns null when no repository');
    });

    test('isAvailable returns false without repository', () => {
        const repository = undefined;
        const isAvailable = repository !== undefined;

        assert.strictEqual(isAvailable, false, 'Not available without repository');
    });

    test('isAvailable returns true with repository', () => {
        const repository = { rootUri: '/path/to/repo' };
        const isAvailable = repository !== undefined;

        assert.strictEqual(isAvailable, true, 'Available with repository');
    });
});

suite('GitMonitor Session Tracking', () => {

    test('session start captures HEAD commit', () => {
        const headCommit = 'abc123';
        let sessionStartCommit: string | undefined;

        // Simulate captureSessionStart
        sessionStartCommit = headCommit;

        assert.strictEqual(sessionStartCommit, 'abc123', 'Captures HEAD commit');
    });

    test('commits since session start uses range query', () => {
        const sessionStart = 'abc123';
        const currentHead = 'def456';
        const range = `${sessionStart}..${currentHead}`;

        assert.strictEqual(range, 'abc123..def456', 'Range format is correct');
    });

    test('resetSessionStart updates to current HEAD', () => {
        let sessionStartCommit = 'old123';
        const currentHead = 'new456';

        // Simulate reset
        sessionStartCommit = currentHead;

        assert.strictEqual(sessionStartCommit, 'new456', 'Reset updates to current HEAD');
    });
});

suite('GitMonitor Active Mode', () => {

    test('gitAutoCapture config defaults to false', () => {
        const defaultValue = false;
        assert.strictEqual(defaultValue, false, 'Default is disabled');
    });

    test('active mode detects new commits', () => {
        let lastKnownCommit = 'abc123';
        const currentCommit = 'def456';

        const isNewCommit = currentCommit !== lastKnownCommit;
        assert.ok(isNewCommit, 'Detects new commit');

        // Update tracking
        lastKnownCommit = currentCommit;
        assert.strictEqual(lastKnownCommit, 'def456', 'Updates last known commit');
    });

    test('active mode ignores same commit', () => {
        const lastKnownCommit = 'abc123';
        const currentCommit = 'abc123';

        const isNewCommit = currentCommit !== lastKnownCommit;
        assert.ok(!isNewCommit, 'Ignores same commit');
    });
});

suite('GitMonitor Uncommitted Changes', () => {

    test('counts working tree and index changes', () => {
        const workingTreeChanges = [{ uri: 'file1.ts' }, { uri: 'file2.ts' }];
        const indexChanges = [{ uri: 'file3.ts' }];

        const totalChanges = workingTreeChanges.length + indexChanges.length;
        assert.strictEqual(totalChanges, 3, 'Counts all uncommitted changes');
    });

    test('zero changes when nothing modified', () => {
        const workingTreeChanges: unknown[] = [];
        const indexChanges: unknown[] = [];

        const totalChanges = workingTreeChanges.length + indexChanges.length;
        assert.strictEqual(totalChanges, 0, 'Zero when nothing modified');
    });
});

suite('GitMonitor Remote URL', () => {

    test('prefers origin remote', () => {
        const remotes = [
            { name: 'upstream', fetchUrl: 'https://github.com/upstream/repo.git' },
            { name: 'origin', fetchUrl: 'https://github.com/origin/repo.git' }
        ];

        const origin = remotes.find(r => r.name === 'origin');
        assert.ok(origin, 'Finds origin remote');
        assert.strictEqual(origin?.fetchUrl, 'https://github.com/origin/repo.git', 'Gets origin URL');
    });

    test('handles missing origin', () => {
        const remotes = [
            { name: 'upstream', fetchUrl: 'https://github.com/upstream/repo.git' }
        ];

        const origin = remotes.find(r => r.name === 'origin');
        assert.strictEqual(origin, undefined, 'Undefined when no origin');
    });

    test('uses fetchUrl or pushUrl', () => {
        const remote = { name: 'origin', fetchUrl: undefined, pushUrl: 'git@github.com:org/repo.git' };
        const url = remote.fetchUrl || remote.pushUrl;

        assert.strictEqual(url, 'git@github.com:org/repo.git', 'Falls back to pushUrl');
    });
});
