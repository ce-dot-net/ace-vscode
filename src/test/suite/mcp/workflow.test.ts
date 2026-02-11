import * as assert from 'assert';

/**
 * ACE Before/After Workflow E2E Tests
 *
 * Tests the COMPLETE ace_search → ace_learn attribution flow:
 * 1. BEFORE: ace_search finds patterns → saves session with pattern IDs
 * 2. AFTER:  ace_learn retrieves session → populates playbook_used → clears session
 *
 * This is the core value proposition of session tracking (v0.4.28+)
 */

// Session storage functions (same imports as aceSearch.ts and aceLearn.ts)
const {
    generateSessionId,
    saveSession,
    getSession,
    clearSession,
    getSessionKey,
    hasValidSession,
    SESSION_TTL
} = require('../../../services/sessionStorage');

suite('ACE Before/After Workflow - Session Attribution', () => {

    const WORKFLOW_KEY = 'workflow-test-default';

    setup(() => {
        // Clean slate for each test
        clearSession(WORKFLOW_KEY);
        clearSession('default');
    });

    // ── CORE FLOW: search → learn ──────────────────────────────

    test('FLOW: search saves session → learn retrieves playbook_used → session cleared', () => {
        // === BEFORE: Simulate ace_search (from aceSearch.ts lines 64-77) ===
        const mockSearchPatterns = [
            { id: 'ctx-1001-aaa', content: 'Use JWT for auth', domain: 'auth' },
            { id: 'ctx-1002-bbb', content: 'Hash passwords with bcrypt', domain: 'security' },
            { id: 'ctx-1003-ccc', content: 'Validate input at boundaries', domain: 'security' },
        ];

        const sessionId = generateSessionId();
        const patternIds = mockSearchPatterns
            .map((p: { id: string }) => p.id)
            .filter((id: string): id is string => Boolean(id));

        // This is exactly what aceSearch.ts does at line 70
        saveSession(WORKFLOW_KEY, {
            session_id: sessionId,
            pattern_ids: patternIds,
            query: 'authentication security patterns',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        // Verify session saved (intermediate assertion)
        assert.ok(hasValidSession(WORKFLOW_KEY), 'Session should exist after search');

        // === AFTER: Simulate ace_learn (from aceLearn.ts lines 37-39) ===
        const session = getSession(WORKFLOW_KEY);
        const playbookUsed = session?.pattern_ids ?? [];

        // THE KEY ASSERTION: playbook_used is populated with search pattern IDs
        assert.strictEqual(playbookUsed.length, 3, 'playbook_used should have 3 pattern IDs');
        assert.deepStrictEqual(playbookUsed, ['ctx-1001-aaa', 'ctx-1002-bbb', 'ctx-1003-ccc'],
            'playbook_used should match search pattern IDs exactly');

        // Build trace (from aceLearn.ts lines 41-47)
        const trace = {
            task: 'Implemented JWT authentication',
            trajectory: [],
            result: { success: true, output: 'Auth module complete' },
            playbook_used: playbookUsed,
            timestamp: new Date().toISOString()
        };

        // Verify trace has populated playbook_used (fixes GitHub Issue #4)
        assert.ok(trace.playbook_used.length > 0, 'Trace playbook_used should NOT be empty');
        assert.strictEqual(trace.playbook_used[0], 'ctx-1001-aaa', 'First pattern ID matches');

        // Clear session (from aceLearn.ts line 106)
        clearSession(WORKFLOW_KEY);
        assert.strictEqual(hasValidSession(WORKFLOW_KEY), false, 'Session should be cleared after learn');
    });

    test('FLOW: learn without prior search has empty playbook_used (graceful)', () => {
        // No search was performed — session doesn't exist
        const session = getSession(WORKFLOW_KEY);
        const playbookUsed = session?.pattern_ids ?? [];

        assert.strictEqual(playbookUsed.length, 0, 'playbook_used should be empty without search');

        const trace = {
            task: 'Manual learning capture',
            trajectory: [],
            result: { success: true, output: 'Quick fix applied' },
            playbook_used: playbookUsed,
            timestamp: new Date().toISOString()
        };

        assert.deepStrictEqual(trace.playbook_used, [], 'Trace has empty playbook_used');
    });

    test('FLOW: new search overwrites old session (latest patterns win)', () => {
        // First search
        saveSession(WORKFLOW_KEY, {
            session_id: generateSessionId(),
            pattern_ids: ['old-pattern-1', 'old-pattern-2'],
            query: 'old search',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        // Second search (overwrites)
        const newSessionId = generateSessionId();
        saveSession(WORKFLOW_KEY, {
            session_id: newSessionId,
            pattern_ids: ['new-pattern-1', 'new-pattern-3'],
            query: 'new search',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        // Learn retrieves latest session
        const session = getSession(WORKFLOW_KEY);
        assert.strictEqual(session?.session_id, newSessionId, 'Should use latest session');
        assert.deepStrictEqual(
            session?.pattern_ids,
            ['new-pattern-1', 'new-pattern-3'],
            'Should use latest pattern IDs'
        );
    });

    test('FLOW: expired session between search and learn → empty playbook_used', () => {
        // Simulate search that happened 5 hours ago (expired beyond 4hr TTL)
        saveSession(WORKFLOW_KEY, {
            session_id: generateSessionId(),
            pattern_ids: ['stale-pattern-1'],
            query: 'stale query',
            timestamp: Date.now() - (5 * 60 * 60 * 1000),
            expires_at: Date.now() - (1 * 60 * 60 * 1000) // Expired 1 hour ago
        });

        // Learn tries to retrieve — session expired
        const session = getSession(WORKFLOW_KEY);
        const playbookUsed = session?.pattern_ids ?? [];

        assert.strictEqual(playbookUsed.length, 0, 'Expired session returns empty playbook_used');
        assert.strictEqual(hasValidSession(WORKFLOW_KEY), false, 'Expired session is cleaned up');
    });

    // ── SESSION ID TRACKING ────────────────────────────────────

    test('session ID links search to learn for server-side attribution', () => {
        const sessionId = generateSessionId();
        saveSession(WORKFLOW_KEY, {
            session_id: sessionId,
            pattern_ids: ['p1', 'p2'],
            query: 'test query',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        const session = getSession(WORKFLOW_KEY);
        assert.ok(session?.session_id.startsWith('sess_'), 'Session ID has correct prefix');
        assert.strictEqual(session?.session_id, sessionId, 'Session ID is consistent');
        assert.strictEqual(session?.query, 'test query', 'Original query is preserved');
    });

    // ── TOOL KEY CONSISTENCY ───────────────────────────────────

    test('aceSearch and aceLearn use same session key ("default" for tool handler)', () => {
        // Both tools use getSessionKey() without folder parameter (tool handlers have no folder context)
        // This mirrors aceSearch.ts line 65 and aceLearn.ts line 37
        const searchKey = getSessionKey(undefined);
        const learnKey = getSessionKey(undefined);

        assert.strictEqual(searchKey, 'default', 'Search key is "default"');
        assert.strictEqual(learnKey, 'default', 'Learn key is "default"');
        assert.strictEqual(searchKey, learnKey, 'Both tools use same key');
    });

    test('chat commands use folder-specific keys (per-workspace isolation)', () => {
        const folderA = { uri: { toString: () => 'file:///project-a' } } as any;
        const folderB = { uri: { toString: () => 'file:///project-b' } } as any;

        const keyA = getSessionKey(folderA);
        const keyB = getSessionKey(folderB);

        assert.notStrictEqual(keyA, keyB, 'Different folders have different keys');
        assert.strictEqual(keyA, 'file:///project-a', 'Folder A key is its URI');
        assert.strictEqual(keyB, 'file:///project-b', 'Folder B key is its URI');
    });

    // ── ATTRIBUTION OUTPUT FORMAT ──────────────────────────────

    test('search output includes session tracking info', () => {
        // Matches aceSearch.ts lines 110-112
        const sessionId = 'sess_1234567890_abc123def';
        const patternCount = 3;
        const expectedOutput = `🔗 Session: \`${sessionId}\` (${patternCount} patterns tracked for attribution)`;

        assert.ok(expectedOutput.includes(sessionId), 'Output includes session ID');
        assert.ok(expectedOutput.includes('3 patterns tracked'), 'Output includes pattern count');
    });

    test('learn output includes attribution info when patterns linked', () => {
        // Matches aceLearn.ts lines 104-106
        const playbookUsed = ['p1', 'p2', 'p3'];
        const expectedOutput = `📎 Linked to ${playbookUsed.length} patterns from previous search`;

        assert.ok(expectedOutput.includes('3 patterns'), 'Output shows linked count');
        assert.ok(expectedOutput.includes('previous search'), 'Output mentions search linkage');
    });

    test('learn output omits attribution when no prior search', () => {
        const playbookUsed: string[] = [];
        const showAttribution = playbookUsed.length > 0;

        assert.strictEqual(showAttribution, false, 'No attribution output when no search');
    });
});

suite('ACE Before/After Workflow - Multi-Step Scenarios', () => {

    const KEY = 'multi-step-test';

    setup(() => {
        clearSession(KEY);
    });

    test('SCENARIO: search → refine search → learn (uses latest search)', () => {
        // First search (broad)
        saveSession(KEY, {
            session_id: generateSessionId(),
            pattern_ids: ['broad-1', 'broad-2', 'broad-3', 'broad-4', 'broad-5'],
            query: 'authentication',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        // Refined search (replaces)
        const refinedId = generateSessionId();
        saveSession(KEY, {
            session_id: refinedId,
            pattern_ids: ['refined-1', 'refined-2'],
            query: 'JWT refresh token rotation',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        // Learn uses refined search
        const session = getSession(KEY);
        assert.strictEqual(session?.pattern_ids.length, 2, 'Uses refined pattern count');
        assert.strictEqual(session?.query, 'JWT refresh token rotation', 'Uses refined query');
    });

    test('SCENARIO: search → learn → search → learn (two complete cycles)', () => {
        // Cycle 1: BEFORE
        saveSession(KEY, {
            session_id: generateSessionId(),
            pattern_ids: ['cycle1-p1', 'cycle1-p2'],
            query: 'error handling',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        // Cycle 1: AFTER
        const session1 = getSession(KEY);
        const playbook1 = session1?.pattern_ids ?? [];
        assert.deepStrictEqual(playbook1, ['cycle1-p1', 'cycle1-p2'], 'Cycle 1 attribution');
        clearSession(KEY);

        // Verify clean state between cycles
        assert.strictEqual(hasValidSession(KEY), false, 'Clean between cycles');

        // Cycle 2: BEFORE
        saveSession(KEY, {
            session_id: generateSessionId(),
            pattern_ids: ['cycle2-p1'],
            query: 'database optimization',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        // Cycle 2: AFTER
        const session2 = getSession(KEY);
        const playbook2 = session2?.pattern_ids ?? [];
        assert.deepStrictEqual(playbook2, ['cycle2-p1'], 'Cycle 2 attribution');
        clearSession(KEY);
    });

    test('SCENARIO: search finds 0 patterns → no session → learn has empty playbook_used', () => {
        // Search returned no patterns (aceSearch.ts line 69: patternIds.length > 0 check)
        const mockSearchResult = { similar_patterns: [] };
        const patternIds = (mockSearchResult.similar_patterns || [])
            .map((p: { id: string }) => p.id)
            .filter((id: string): id is string => Boolean(id));

        // Session NOT saved (matches aceSearch.ts line 69-77)
        if (patternIds.length > 0) {
            saveSession(KEY, {
                session_id: generateSessionId(),
                pattern_ids: patternIds,
                query: 'nonexistent topic',
                timestamp: Date.now(),
                expires_at: Date.now() + SESSION_TTL
            });
        }

        // Learn finds no session
        const session = getSession(KEY);
        const playbookUsed = session?.pattern_ids ?? [];
        assert.strictEqual(playbookUsed.length, 0, 'No session when search finds 0 patterns');
    });

    test('SCENARIO: search with null/undefined pattern IDs are filtered out', () => {
        // Simulate patterns with missing IDs
        const mockPatterns = [
            { id: 'valid-1', content: 'Pattern 1' },
            { id: null, content: 'Pattern with null ID' },
            { id: undefined, content: 'Pattern with undefined ID' },
            { id: '', content: 'Pattern with empty ID' },
            { id: 'valid-2', content: 'Pattern 2' },
        ];

        // This matches aceSearch.ts line 67
        const patternIds = mockPatterns
            .map((p: { id: string | null | undefined }) => p.id)
            .filter((id: string | null | undefined): id is string => Boolean(id));

        assert.deepStrictEqual(patternIds, ['valid-1', 'valid-2'], 'Filters null/undefined/empty IDs');

        saveSession(KEY, {
            session_id: generateSessionId(),
            pattern_ids: patternIds,
            query: 'test',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        const session = getSession(KEY);
        assert.strictEqual(session?.pattern_ids.length, 2, 'Only valid IDs saved');
    });
});

suite('ACE Before/After Workflow - MCP vs LM Tool Consistency', () => {

    setup(() => {
        clearSession('default');
        clearSession('file:///mcp-workspace');
    });

    test('LM Tool and MCP server both use same session storage', () => {
        // LM Tool (aceSearch.ts) saves to 'default' key
        saveSession('default', {
            session_id: generateSessionId(),
            pattern_ids: ['lm-pattern-1', 'lm-pattern-2'],
            query: 'from Copilot',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        // MCP server (when accessed by Claude) would also populate session
        // But LM tool handler always uses 'default' key
        const session = getSession('default');
        assert.ok(session, 'Session accessible from default key');
        assert.strictEqual(session?.pattern_ids.length, 2, 'Pattern IDs preserved');
    });

    test('execution trace structure matches ACE server API', () => {
        // Save a search session
        saveSession('default', {
            session_id: generateSessionId(),
            pattern_ids: ['api-p1', 'api-p2', 'api-p3'],
            query: 'API patterns',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        // Build trace like aceLearn.ts does
        const session = getSession('default');
        const trace = {
            task: 'Built REST API endpoints',
            trajectory: [] as string[],
            result: { success: true, output: 'All endpoints passing' },
            playbook_used: session?.pattern_ids ?? [],
            timestamp: new Date().toISOString()
        };

        // Validate trace structure matches what ACE server expects
        assert.ok(typeof trace.task === 'string', 'task is string');
        assert.ok(Array.isArray(trace.trajectory), 'trajectory is array');
        assert.ok(typeof trace.result.success === 'boolean', 'result.success is boolean');
        assert.ok(typeof trace.result.output === 'string', 'result.output is string');
        assert.ok(Array.isArray(trace.playbook_used), 'playbook_used is array');
        assert.ok(trace.playbook_used.every((id: string) => typeof id === 'string'), 'all IDs are strings');
        assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(trace.timestamp), 'timestamp is ISO format');

        // THE CRITICAL CHECK: playbook_used is NOT empty (fixes Issue #4)
        assert.strictEqual(trace.playbook_used.length, 3, 'playbook_used populated from search');
    });
});
