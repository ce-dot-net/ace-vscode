import * as assert from 'assert';

// Tests will import from the service once created
// import {
//   generateSessionId,
//   saveSession,
//   getSession,
//   clearSession,
//   getSessionKey,
//   hasValidSession,
//   SESSION_TTL,
//   type SessionData
// } from '../../../services/sessionStorage';

suite('SessionStorage - Session ID Generation', () => {
    test('generateSessionId returns unique IDs', () => {
        // Import dynamically to allow RED phase to show failures
        const { generateSessionId } = require('../../../services/sessionStorage');
        const id1 = generateSessionId();
        const id2 = generateSessionId();
        assert.notStrictEqual(id1, id2);
    });

    test('generateSessionId format is sess_timestamp_random', () => {
        const { generateSessionId } = require('../../../services/sessionStorage');
        const id = generateSessionId();
        assert.ok(id.startsWith('sess_'), 'Should start with sess_');
        assert.ok(id.length >= 20, 'Should be at least 20 chars');
        assert.ok(/^sess_\d+_[a-z0-9]+$/.test(id), 'Should match format');
    });

    test('generateSessionId includes timestamp', () => {
        const { generateSessionId } = require('../../../services/sessionStorage');
        const before = Date.now();
        const id = generateSessionId();
        const after = Date.now();
        const timestamp = parseInt(id.split('_')[1], 10);
        assert.ok(timestamp >= before && timestamp <= after);
    });
});

suite('SessionStorage - getSessionKey', () => {
    test('returns "default" when no folder provided', () => {
        const { getSessionKey } = require('../../../services/sessionStorage');
        assert.strictEqual(getSessionKey(undefined), 'default');
    });

    test('returns folder URI string when folder provided', () => {
        const { getSessionKey } = require('../../../services/sessionStorage');
        const mockFolder = {
            uri: { toString: () => 'file:///path/to/folder' }
        } as any;
        assert.strictEqual(getSessionKey(mockFolder), 'file:///path/to/folder');
    });
});

suite('SessionStorage - Save and Retrieve', () => {
    setup(() => {
        const { clearSession } = require('../../../services/sessionStorage');
        // Clear all sessions before each test
        clearSession('test-key-1');
        clearSession('test-key-2');
        clearSession('default');
    });

    test('saveSession stores and getSession retrieves data', () => {
        const { saveSession, getSession, SESSION_TTL } = require('../../../services/sessionStorage');
        const data = {
            session_id: 'sess_test_123',
            pattern_ids: ['pat_1', 'pat_2', 'pat_3'],
            query: 'authentication patterns',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        };
        saveSession('test-key-1', data);
        const retrieved = getSession('test-key-1');
        assert.deepStrictEqual(retrieved, data);
    });

    test('getSession returns undefined for non-existent key', () => {
        const { getSession } = require('../../../services/sessionStorage');
        const result = getSession('non-existent-key');
        assert.strictEqual(result, undefined);
    });

    test('getSession returns undefined for expired session', () => {
        const { saveSession, getSession } = require('../../../services/sessionStorage');
        const data = {
            session_id: 'sess_expired',
            pattern_ids: ['p1'],
            query: 'test',
            timestamp: Date.now() - 100000,
            expires_at: Date.now() - 1000 // Already expired
        };
        saveSession('test-key-2', data);
        const retrieved = getSession('test-key-2');
        assert.strictEqual(retrieved, undefined);
    });

    test('getSession cleans up expired sessions', () => {
        const { saveSession, getSession, hasValidSession } = require('../../../services/sessionStorage');
        const data = {
            session_id: 'sess_cleanup',
            pattern_ids: ['p1'],
            query: 'test',
            timestamp: Date.now() - 100000,
            expires_at: Date.now() - 1000
        };
        saveSession('test-key-2', data);
        getSession('test-key-2'); // Should cleanup
        // Verify by checking hasValidSession
        assert.strictEqual(hasValidSession('test-key-2'), false);
    });
});

suite('SessionStorage - clearSession', () => {
    test('clearSession removes existing session', () => {
        const { saveSession, getSession, clearSession, hasValidSession, SESSION_TTL } = require('../../../services/sessionStorage');
        const data = {
            session_id: 'sess_to_clear',
            pattern_ids: ['p1', 'p2'],
            query: 'clear test',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        };
        saveSession('clear-key', data);
        assert.ok(hasValidSession('clear-key'));
        clearSession('clear-key');
        assert.strictEqual(getSession('clear-key'), undefined);
    });

    test('clearSession does not throw for non-existent key', () => {
        const { clearSession } = require('../../../services/sessionStorage');
        assert.doesNotThrow(() => clearSession('non-existent'));
    });
});

suite('SessionStorage - hasValidSession', () => {
    setup(() => {
        const { clearSession } = require('../../../services/sessionStorage');
        clearSession('valid-key');
        clearSession('expired-key');
    });

    test('returns true for valid session', () => {
        const { saveSession, hasValidSession, SESSION_TTL } = require('../../../services/sessionStorage');
        const data = {
            session_id: 'sess_valid',
            pattern_ids: ['p1'],
            query: 'valid',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        };
        saveSession('valid-key', data);
        assert.strictEqual(hasValidSession('valid-key'), true);
    });

    test('returns false for expired session', () => {
        const { saveSession, hasValidSession } = require('../../../services/sessionStorage');
        const data = {
            session_id: 'sess_expired',
            pattern_ids: ['p1'],
            query: 'expired',
            timestamp: Date.now() - 100000,
            expires_at: Date.now() - 1000
        };
        saveSession('expired-key', data);
        assert.strictEqual(hasValidSession('expired-key'), false);
    });

    test('returns false for non-existent session', () => {
        const { hasValidSession } = require('../../../services/sessionStorage');
        assert.strictEqual(hasValidSession('no-session'), false);
    });
});

suite('SessionStorage - Folder/Workspace Isolation', () => {
    const folderA = 'file:///project-a';
    const folderB = 'file:///project-b';

    setup(() => {
        const { clearSession } = require('../../../services/sessionStorage');
        clearSession(folderA);
        clearSession(folderB);
        clearSession('default');
    });

    test('sessions are isolated between folders', () => {
        const { saveSession, getSession, SESSION_TTL } = require('../../../services/sessionStorage');
        saveSession(folderA, {
            session_id: 'sess_A',
            pattern_ids: ['a1', 'a2'],
            query: 'folder A query',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });
        saveSession(folderB, {
            session_id: 'sess_B',
            pattern_ids: ['b1'],
            query: 'folder B query',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        assert.strictEqual(getSession(folderA)?.session_id, 'sess_A');
        assert.strictEqual(getSession(folderB)?.session_id, 'sess_B');
        assert.strictEqual(getSession(folderA)?.pattern_ids.length, 2);
        assert.strictEqual(getSession(folderB)?.pattern_ids.length, 1);
    });

    test('clearing one folder does not affect others', () => {
        const { saveSession, getSession, clearSession, SESSION_TTL } = require('../../../services/sessionStorage');
        saveSession(folderA, {
            session_id: 'sess_A',
            pattern_ids: ['a1'],
            query: 'A',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });
        saveSession(folderB, {
            session_id: 'sess_B',
            pattern_ids: ['b1'],
            query: 'B',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        clearSession(folderA);

        assert.strictEqual(getSession(folderA), undefined);
        assert.strictEqual(getSession(folderB)?.session_id, 'sess_B');
    });

    test('default key works for workspace-level tools', () => {
        const { saveSession, getSession, SESSION_TTL } = require('../../../services/sessionStorage');
        saveSession('default', {
            session_id: 'sess_default',
            pattern_ids: ['d1', 'd2', 'd3'],
            query: 'workspace query',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        const session = getSession('default');
        assert.strictEqual(session?.session_id, 'sess_default');
        assert.strictEqual(session?.pattern_ids.length, 3);
    });
});

suite('SessionStorage - SESSION_TTL Export', () => {
    test('SESSION_TTL is 4 hours in milliseconds', () => {
        const { SESSION_TTL } = require('../../../services/sessionStorage');
        assert.strictEqual(SESSION_TTL, 4 * 60 * 60 * 1000);
    });
});
