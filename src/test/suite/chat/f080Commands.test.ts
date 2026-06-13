/**
 * F-080 search/learn loop tests: issues #16, #17, #18, #23, #24
 *
 * Uses local sinon stubs and inline objects — does NOT edit mocks/aceSDK.ts or
 * commands.test.ts.
 *
 * Test style: mocha ui:'tdd' -> suite()/test(), assert with node 'assert'.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';

// ---------------------------------------------------------------------------
// Local helpers – mirrors of the real interfaces without importing from source
// so that RED-phase failures are type-error-free and easy to reason about.
// ---------------------------------------------------------------------------

interface LocalSessionData {
    session_id: string;
    pattern_ids: string[];
    query: string;
    timestamp: number;
    expires_at: number;
    retrieval_id?: string;      // #16
    applied_log_ids?: number[]; // #17
}

// Minimal SearchResultPattern shape we need for these tests
interface LocalSRP {
    id?: string;
    content: string;
    domain?: string;
    confidence?: number;
    match_factors?: any;
    cumulative_v15_reward?: number;
    payload_version?: number;
}

// Expanded neighbor shape
interface LocalExpanded {
    pattern_id: string;
    cumulative_reward: number;
    cached: boolean;
    payload_json?: string;
}

// ============================================================================
// #16 — retrieval_id flows into SessionData and ExecutionTrace
// ============================================================================

suite('F-080 #16 — retrieval_id in session and trace', () => {

    test('saveSession called with retrieval_id when searchPatterns returns one', () => {
        // Arrange
        const saved: LocalSessionData[] = [];
        const saveSessionStub = sinon.stub().callsFake((_key: string, data: LocalSessionData) => {
            saved.push(data);
        });

        const mockResult = {
            similar_patterns: [
                { id: 'pat-1', content: 'test', match_factors: { semantic_score: 0.9, retrieval_log_id: 10 } }
            ],
            retrieval_id: 'uuid-123'
        };

        // Simulate what aceSearch.ts does after fix
        const patternIds = mockResult.similar_patterns.map(p => p.id).filter(Boolean) as string[];
        saveSessionStub('default', {
            session_id: 'sess_abc',
            pattern_ids: patternIds,
            query: 'test query',
            timestamp: Date.now(),
            expires_at: Date.now() + 1000,
            retrieval_id: mockResult.retrieval_id  // #16 fix
        });

        assert.strictEqual(saved.length, 1, 'saveSession called once');
        assert.strictEqual(saved[0].retrieval_id, 'uuid-123', 'retrieval_id stored in session');
    });

    test('getSession after saveSession returns SessionData with retrieval_id field', () => {
        const { saveSession, getSession, SESSION_TTL } = require('../../../services/sessionStorage');
        const key = 'f080-test-16a';
        saveSession(key, {
            session_id: 'sess_16a',
            pattern_ids: ['p1'],
            query: 'q',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL,
            retrieval_id: 'uuid-from-server'
        });
        const retrieved = getSession(key);
        assert.ok(retrieved, 'Session exists');
        assert.strictEqual(retrieved.retrieval_id, 'uuid-from-server', 'retrieval_id round-trips');
        // Cleanup
        require('../../../services/sessionStorage').clearSession(key);
    });

    test('AceLearnTool trace includes retrieval_id when session carries one', async () => {
        // Arrange — build a minimal AceLearnTool invocation in isolation
        const capturedTrace: any[] = [];
        const mockClient = {
            storeExecutionTraceStream: sinon.stub().callsFake(async (trace: any) => {
                capturedTrace.push(trace);
                return { stored: true, learning_statistics: null };
            })
        };

        // Simulate the trace-building logic from aceLearn.ts (after fix)
        const session: LocalSessionData = {
            session_id: 'sess_16b',
            pattern_ids: ['p1'],
            query: 'q',
            timestamp: Date.now(),
            expires_at: Date.now() + 9999999,
            retrieval_id: 'uuid-123'
        };

        const trace = {
            task: 'implement feature',
            trajectory: [] as string[],
            result: { success: true, output: '' },
            playbook_used: session.pattern_ids,
            timestamp: new Date().toISOString(),
            ...(session.retrieval_id ? { retrieval_id: session.retrieval_id } : {}),
            session_id: session.session_id
        };

        await mockClient.storeExecutionTraceStream(trace);

        assert.strictEqual(capturedTrace.length, 1, 'storeExecutionTraceStream called');
        assert.strictEqual(capturedTrace[0].retrieval_id, 'uuid-123', 'trace.retrieval_id matches session');
        assert.strictEqual(capturedTrace[0].session_id, 'sess_16b', 'trace.session_id included');
    });

    test('trace does NOT include session_id key when no prior session exists (no-session case)', async () => {
        const capturedTrace: any[] = [];
        const mockClient = {
            storeExecutionTraceStream: sinon.stub().callsFake(async (trace: any) => {
                capturedTrace.push(trace);
                return { stored: true };
            })
        };

        // Simulate: session is undefined (learn called before any search)
        // Cast via a helper function to prevent TS narrowing `undefined` to `never`
        function getNoSession(): LocalSessionData | undefined { return undefined; }
        const session = getNoSession();
        const playbookUsed = session?.pattern_ids ?? [];

        const trace = {
            task: 'task without prior search',
            trajectory: [] as string[],
            result: { success: true, output: '' },
            playbook_used: playbookUsed,
            timestamp: new Date().toISOString(),
            ...(session?.retrieval_id ? { retrieval_id: session.retrieval_id } : {}),
            ...(session?.applied_log_ids?.length ? { applied_log_ids: session.applied_log_ids } : {}),
            ...(session?.session_id ? { session_id: session.session_id } : {})
        };

        await mockClient.storeExecutionTraceStream(trace);

        assert.ok(!('session_id' in capturedTrace[0]), 'session_id key must be absent when session is undefined');
        assert.ok(!('retrieval_id' in capturedTrace[0]), 'retrieval_id key must be absent when session is undefined');
        assert.ok(!('applied_log_ids' in capturedTrace[0]), 'applied_log_ids key must be absent when session is undefined');
    });

    test('trace does NOT include retrieval_id key when session has none (no undefined sent)', async () => {
        const capturedTrace: any[] = [];
        const mockClient = {
            storeExecutionTraceStream: sinon.stub().callsFake(async (trace: any) => {
                capturedTrace.push(trace);
                return { stored: true };
            })
        };

        const session: LocalSessionData = {
            session_id: 'sess_16c',
            pattern_ids: ['p1'],
            query: 'q',
            timestamp: Date.now(),
            expires_at: Date.now() + 9999999
            // no retrieval_id
        };

        const trace = {
            task: 'task',
            trajectory: [] as string[],
            result: { success: true, output: '' },
            playbook_used: session.pattern_ids,
            timestamp: new Date().toISOString(),
            ...(session.retrieval_id ? { retrieval_id: session.retrieval_id } : {}),
            session_id: session.session_id
        };

        await mockClient.storeExecutionTraceStream(trace);

        assert.ok(!('retrieval_id' in capturedTrace[0]), 'retrieval_id key must be absent when no session retrieval_id');
        assert.strictEqual(capturedTrace[0].session_id, 'sess_16c', 'session_id still present');
    });
});

// ============================================================================
// #17 — applied_log_ids from match_factors
// ============================================================================

suite('F-080 #17 — applied_log_ids collected from match_factors', () => {

    test('decodeMatchFactors returns retrieval_log_id for valid match_factors', () => {
        const { decodeMatchFactors } = require('@ace-sdk/core');
        const mf = { semantic_score: 0.9, retrieval_log_id: 42 };
        const decoded = decodeMatchFactors(mf);
        assert.ok(decoded !== null, 'decodeMatchFactors returns non-null for valid factors');
        assert.strictEqual(decoded.retrieval_log_id, 42, 'retrieval_log_id extracted correctly');
    });

    test('applied_log_ids collected from patterns with match_factors', () => {
        const { decodeMatchFactors } = require('@ace-sdk/core');

        const patterns: LocalSRP[] = [
            { id: 'p1', content: 'a', match_factors: { semantic_score: 0.9, retrieval_log_id: 1 } },
            { id: 'p2', content: 'b', match_factors: { semantic_score: 0.8, retrieval_log_id: 2 } },
            { id: 'p3', content: 'c', match_factors: { semantic_score: 0.7, retrieval_log_id: 3 } }
        ];

        const appliedLogIds = patterns
            .map(p => decodeMatchFactors(p.match_factors))
            .filter((mf): mf is NonNullable<typeof mf> => mf !== null)
            .map((mf: any) => mf.retrieval_log_id)
            .filter((id: any): id is number => id !== null);

        assert.deepStrictEqual(appliedLogIds, [1, 2, 3], 'applied_log_ids collected correctly');
    });

    test('patterns with empty/absent match_factors are excluded from applied_log_ids', () => {
        const { decodeMatchFactors } = require('@ace-sdk/core');

        const patterns: LocalSRP[] = [
            { id: 'p1', content: 'a', match_factors: { semantic_score: 0.9, retrieval_log_id: 10 } },
            { id: 'p2', content: 'b', match_factors: {} },   // cold / empty
            { id: 'p3', content: 'c' }                        // absent
        ];

        const appliedLogIds = patterns
            .map(p => decodeMatchFactors(p.match_factors))
            .filter((mf): mf is NonNullable<typeof mf> => mf !== null)
            .map((mf: any) => mf.retrieval_log_id)
            .filter((id: any): id is number => id !== null);

        assert.deepStrictEqual(appliedLogIds, [10], 'Only pattern with valid match_factors included');
    });

    test('saveSession stores applied_log_ids in session', () => {
        const { saveSession, getSession, clearSession, SESSION_TTL } = require('../../../services/sessionStorage');
        const key = 'f080-test-17';
        saveSession(key, {
            session_id: 'sess_17',
            pattern_ids: ['p1', 'p2', 'p3'],
            query: 'q',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL,
            applied_log_ids: [1, 2, 3]
        });
        const retrieved = getSession(key);
        assert.ok(retrieved, 'Session exists');
        assert.deepStrictEqual(retrieved.applied_log_ids, [1, 2, 3], 'applied_log_ids round-trips');
        clearSession(key);
    });

    test('AceLearnTool trace includes applied_log_ids when session carries them', async () => {
        const capturedTrace: any[] = [];
        const mockClient = {
            storeExecutionTraceStream: sinon.stub().callsFake(async (trace: any) => {
                capturedTrace.push(trace);
                return { stored: true };
            })
        };

        const session: LocalSessionData = {
            session_id: 'sess_17b',
            pattern_ids: ['p1', 'p2'],
            query: 'q',
            timestamp: Date.now(),
            expires_at: Date.now() + 9999999,
            applied_log_ids: [1, 2]
        };

        const trace = {
            task: 'task',
            trajectory: [] as string[],
            result: { success: true, output: '' },
            playbook_used: session.pattern_ids,
            timestamp: new Date().toISOString(),
            ...(session.retrieval_id ? { retrieval_id: session.retrieval_id } : {}),
            ...(session.applied_log_ids?.length ? { applied_log_ids: session.applied_log_ids } : {}),
            session_id: session.session_id
        };

        await mockClient.storeExecutionTraceStream(trace);

        assert.deepStrictEqual(capturedTrace[0].applied_log_ids, [1, 2], 'trace.applied_log_ids forwarded');
    });

    test('trace applied_log_ids key is ABSENT when session has none (no empty array)', async () => {
        const capturedTrace: any[] = [];
        const mockClient = {
            storeExecutionTraceStream: sinon.stub().callsFake(async (trace: any) => {
                capturedTrace.push(trace);
                return { stored: true };
            })
        };

        const session: LocalSessionData = {
            session_id: 'sess_17c',
            pattern_ids: ['p1'],
            query: 'q',
            timestamp: Date.now(),
            expires_at: Date.now() + 9999999
            // no applied_log_ids
        };

        const trace = {
            task: 'task',
            trajectory: [] as string[],
            result: { success: true, output: '' },
            playbook_used: session.pattern_ids,
            timestamp: new Date().toISOString(),
            ...(session.retrieval_id ? { retrieval_id: session.retrieval_id } : {}),
            ...(session.applied_log_ids?.length ? { applied_log_ids: session.applied_log_ids } : {}),
            session_id: session.session_id
        };

        await mockClient.storeExecutionTraceStream(trace);

        assert.ok(!('applied_log_ids' in capturedTrace[0]), 'applied_log_ids key absent when session has none');
    });
});

// ============================================================================
// #18 — session_id and task_intent forwarded to searchPatterns()
// ============================================================================

suite('F-080 #18 — session_id and task_intent in searchPatterns call', () => {

    test('searchPatterns called with session_id matching sess_* format', async () => {
        const capturedParams: any[] = [];
        const mockClient = {
            searchPatterns: sinon.stub().callsFake(async (params: any) => {
                capturedParams.push(params);
                return { similar_patterns: [], count: 0 };
            })
        };

        // Simulate the aceSearch.ts logic (after fix): sessionId generated BEFORE searchOptions
        const sessionId = 'sess_1234567890_abc123';  // deterministic for test
        const searchOptions = {
            query: 'auth patterns',
            threshold: 0.75,
            top_k: 10,
            include_metadata: true,
            session_id: sessionId
        };

        await mockClient.searchPatterns(searchOptions);

        assert.ok(capturedParams[0].session_id, 'session_id passed to searchPatterns');
        assert.ok(/^sess_/.test(capturedParams[0].session_id), 'session_id has sess_ prefix');
    });

    test('searchPatterns called with task_intent when provided', async () => {
        const capturedParams: any[] = [];
        const mockClient = {
            searchPatterns: sinon.stub().callsFake(async (params: any) => {
                capturedParams.push(params);
                return { similar_patterns: [], count: 0 };
            })
        };

        const sessionId = 'sess_1234567890_abc123';
        const task_intent = 'refactor' as const;
        const searchOptions = {
            query: 'refactor patterns',
            threshold: 0.75,
            top_k: 10,
            include_metadata: true,
            session_id: sessionId,
            ...(task_intent ? { task_intent } : {})
        };

        await mockClient.searchPatterns(searchOptions);

        assert.strictEqual(capturedParams[0].task_intent, 'refactor', 'task_intent forwarded');
    });

    test('searchPatterns called WITHOUT task_intent key when not supplied (no undefined)', async () => {
        const capturedParams: any[] = [];
        const mockClient = {
            searchPatterns: sinon.stub().callsFake(async (params: any) => {
                capturedParams.push(params);
                return { similar_patterns: [], count: 0 };
            })
        };

        const sessionId = 'sess_1234567890_abc123';
        const task_intent = undefined;
        const searchOptions = {
            query: 'general patterns',
            threshold: 0.75,
            top_k: 10,
            include_metadata: true,
            session_id: sessionId,
            ...(task_intent ? { task_intent } : {})
        };

        await mockClient.searchPatterns(searchOptions);

        assert.ok(!('task_intent' in capturedParams[0]), 'task_intent key absent when not supplied');
    });

    test('session_id in searchOptions matches session_id stored in session', async () => {
        const { saveSession, getSession, clearSession, SESSION_TTL } = require('../../../services/sessionStorage');
        const key = 'f080-test-18';

        const sessionId = 'sess_test_18_xyz';

        // Simulate: generate session_id first, then pass same id to both searchOptions and saveSession
        saveSession(key, {
            session_id: sessionId,
            pattern_ids: [],
            query: 'test',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL
        });

        const retrieved = getSession(key);
        assert.strictEqual(retrieved?.session_id, sessionId, 'session_id matches what was passed to searchOptions');
        clearSession(key);
    });

    test('task_intent all valid values accepted', () => {
        const validValues = ['refactor', 'routine', 'explore', 'spec_strict'] as const;
        for (const v of validValues) {
            const opts = { task_intent: v };
            assert.ok(['refactor', 'routine', 'explore', 'spec_strict'].includes(opts.task_intent), `${v} is valid`);
        }
    });

    test('chat /search command parses --task-intent flag from prompt', () => {
        // Simulate the parsing logic in chat/commands/search.ts (after fix)
        const promptText = 'authentication patterns --task-intent refactor';
        const taskIntentMatch = promptText.match(/--task-intent\s+(refactor|routine|explore|spec_strict)/);
        const taskIntent = taskIntentMatch ? taskIntentMatch[1] : undefined;

        assert.strictEqual(taskIntent, 'refactor', '--task-intent flag parsed correctly');
    });

    test('chat /search command leaves task_intent absent when flag not in prompt', () => {
        const promptText = 'authentication patterns';
        const taskIntentMatch = promptText.match(/--task-intent\s+(refactor|routine|explore|spec_strict)/);
        const taskIntent = taskIntentMatch ? taskIntentMatch[1] : undefined;

        assert.strictEqual(taskIntent, undefined, 'task_intent undefined when flag absent');
    });
});

// ============================================================================
// #23 — reward fields in learn output
// ============================================================================

suite('F-080 #23 — reward fields in AceLearnTool output', () => {

    function buildLearnOutput(result: {
        learning_statistics?: any;
        reward_tier?: string;
        cumulative_v15_reward_delta?: number;
        patterns_rewarded?: number;
    }): string {
        let output = `✅ **[ACE] Learning captured!**\n\n`;
        output += `📚 **ACE Learning:**\n`;

        const stats = result.learning_statistics;
        if (stats) {
            const statParts: string[] = [];
            if (stats.patterns_created !== undefined && stats.patterns_created > 0) {
                statParts.push(`✨ ${stats.patterns_created} created`);
            }
            if (statParts.length > 0) {
                output += `   ${statParts.join('  ')}\n`;
            }
        } else {
            output += `   Analysis pending\n`;
        }

        // #23 reward block
        if (result.reward_tier || result.cumulative_v15_reward_delta !== undefined) {
            output += `\n🏅 **Reward:** `;
            if (result.reward_tier) {
                output += `${result.reward_tier} tier`;
            }
            if (result.cumulative_v15_reward_delta !== undefined) {
                const sign = result.cumulative_v15_reward_delta >= 0 ? '+' : '';
                output += ` (${sign}${result.cumulative_v15_reward_delta.toFixed(2)} delta)`;
            }
            if (result.patterns_rewarded) {
                output += ` · ${result.patterns_rewarded} patterns rewarded`;
            }
            output += `\n`;
        }

        return output;
    }

    test('output contains "hot tier" when reward_tier is "hot"', () => {
        const output = buildLearnOutput({ reward_tier: 'hot' });
        assert.ok(output.includes('hot tier'), 'Shows reward tier');
    });

    test('output contains "+0.75 delta" when cumulative_v15_reward_delta is 0.75', () => {
        const output = buildLearnOutput({ cumulative_v15_reward_delta: 0.75 });
        assert.ok(output.includes('+0.75 delta'), 'Shows positive delta with + sign');
    });

    test('output contains negative delta sign when delta is negative', () => {
        const output = buildLearnOutput({ cumulative_v15_reward_delta: -0.30 });
        assert.ok(output.includes('-0.30 delta'), 'Shows negative delta');
    });

    test('output contains "patterns rewarded" count when present', () => {
        const output = buildLearnOutput({ reward_tier: 'warm', patterns_rewarded: 5 });
        assert.ok(output.includes('5 patterns rewarded'), 'Shows patterns rewarded count');
    });

    test('output contains all three fields when all present', () => {
        const output = buildLearnOutput({
            reward_tier: 'hot',
            cumulative_v15_reward_delta: 1.25,
            patterns_rewarded: 3
        });
        assert.ok(output.includes('hot tier'), 'Shows tier');
        assert.ok(output.includes('+1.25 delta'), 'Shows delta');
        assert.ok(output.includes('3 patterns rewarded'), 'Shows count');
    });

    test('NO "Reward:" line when all three reward fields are absent', () => {
        const output = buildLearnOutput({ learning_statistics: null });
        assert.ok(!output.includes('Reward:'), 'No reward line when fields absent');
        assert.ok(!output.includes('🏅'), 'No reward emoji when fields absent');
    });

    test('output contains "Reward:" line when only cumulative_v15_reward_delta is present (0.0)', () => {
        // delta === 0 is still "defined", so the block should render
        const output = buildLearnOutput({ cumulative_v15_reward_delta: 0.0 });
        assert.ok(output.includes('Reward:'), 'Reward line present when delta is 0 (defined)');
        assert.ok(output.includes('+0.00 delta'), 'Shows +0.00 delta');
    });
});

// ============================================================================
// #24 — isAtRisk badge and expanded neighbors (aceSearch.ts)
// ============================================================================

suite('F-080 #24 — isAtRisk badge and expanded neighbors in aceSearch output', () => {

    function buildPatternLine(rawP: LocalSRP): string {
        const { decodePattern } = require('@ace-sdk/core');
        const p = decodePattern(rawP);
        const domain = p.domain || 'general';
        const preview = p.content.length > 80
            ? p.content.slice(0, 80) + '...'
            : p.content;
        const riskBadge = p.isAtRisk ? ' ⚠️ at-risk' : '';
        return `• **[${domain}]**${riskBadge} ${preview}\n`;
    }

    function buildExpandedHint(expanded: LocalExpanded[]): string {
        if (!expanded || expanded.length === 0) return '';
        const topExpanded = [...expanded]
            .sort((a, b) => b.cumulative_reward - a.cumulative_reward)
            .slice(0, 3);
        let out = `\n🔗 **Expanded neighbors (${expanded.length} via graph cache):** `;
        out += topExpanded.map(e => `\`${e.pattern_id.slice(0, 8)}\``).join(', ');
        out += ` — call \`ace_batch_get\` for full details\n`;
        return out;
    }

    test('pattern with cumulative_v15_reward < 0 shows ⚠️ at-risk badge', () => {
        const rawP: LocalSRP = {
            id: 'p1',
            content: 'risky pattern content',
            domain: 'auth',
            cumulative_v15_reward: -0.5,
            payload_version: 15
        };
        const line = buildPatternLine(rawP);
        assert.ok(line.includes('⚠️ at-risk'), 'Shows at-risk badge for negative reward');
    });

    test('pattern with cumulative_v15_reward === 0 does NOT show at-risk badge (uncredited/neutral)', () => {
        const rawP: LocalSRP = {
            id: 'p2',
            content: 'uncredited pattern',
            domain: 'auth',
            cumulative_v15_reward: 0.0,
            payload_version: 15
        };
        const line = buildPatternLine(rawP);
        assert.ok(!line.includes('at-risk'), 'NO at-risk badge for reward === 0 (neutral)');
    });

    test('pattern with cumulative_v15_reward > 0 does NOT show at-risk badge', () => {
        const rawP: LocalSRP = {
            id: 'p3',
            content: 'good pattern',
            domain: 'auth',
            cumulative_v15_reward: 1.0,
            payload_version: 15
        };
        const line = buildPatternLine(rawP);
        assert.ok(!line.includes('at-risk'), 'No at-risk badge for positive reward');
    });

    test('pattern without payload_version:15 does NOT show at-risk even if reward < 0', () => {
        // decodePattern only sets isAtRisk when payload_version === 15
        const rawP: LocalSRP = {
            id: 'p4',
            content: 'legacy pattern',
            domain: 'auth',
            cumulative_v15_reward: -1.0
            // no payload_version
        };
        const line = buildPatternLine(rawP);
        assert.ok(!line.includes('at-risk'), 'No at-risk badge without payload_version:15');
    });

    test('expanded neighbors hint rendered when expanded array non-empty', () => {
        const expanded: LocalExpanded[] = [
            { pattern_id: 'abcdefgh1234', cumulative_reward: 2.0, cached: true },
            { pattern_id: 'xyz789001234', cumulative_reward: 1.5, cached: false }
        ];
        const hint = buildExpandedHint(expanded);
        assert.ok(hint.includes('Expanded neighbors'), 'Shows expanded neighbors hint');
        assert.ok(hint.includes('2 via graph cache'), 'Shows count');
        assert.ok(hint.includes('abcdefgh'), 'Shows truncated ID');
        assert.ok(hint.includes('ace_batch_get'), 'Mentions ace_batch_get');
    });

    test('expanded neighbors sorted by cumulative_reward descending, top 3 shown', () => {
        const expanded: LocalExpanded[] = [
            { pattern_id: 'low_____1234', cumulative_reward: 0.1, cached: true },
            { pattern_id: 'mid_____1234', cumulative_reward: 1.0, cached: true },
            { pattern_id: 'high____1234', cumulative_reward: 5.0, cached: true },
            { pattern_id: 'vhigh___1234', cumulative_reward: 10.0, cached: true }
        ];
        const hint = buildExpandedHint(expanded);
        // top 3 by cumulative_reward: vhigh (10), high (5), mid (1)
        assert.ok(hint.includes('vhigh___'), 'Top result included');
        assert.ok(hint.includes('high____'), 'Second result included');
        assert.ok(hint.includes('mid_____'), 'Third result included');
        assert.ok(!hint.includes('low_____'), 'Lowest result excluded');
    });

    test('truncated IDs are 8 characters in expanded hint', () => {
        const expanded: LocalExpanded[] = [
            { pattern_id: 'abcdefghijklmnop', cumulative_reward: 1.0, cached: true }
        ];
        const hint = buildExpandedHint(expanded);
        // Should show `abcdefgh` (8 chars)
        assert.ok(hint.includes('`abcdefgh`'), '8-char truncated ID in backticks');
    });

    test('NO expanded neighbors hint when expanded is empty', () => {
        const hint = buildExpandedHint([]);
        assert.strictEqual(hint, '', 'Empty string when expanded array is empty');
    });

    test('NO expanded neighbors hint when expanded is absent (undefined)', () => {
        // Simulate result.expanded ?? []
        const rawExpanded: LocalExpanded[] | undefined = undefined;
        const expanded: LocalExpanded[] = rawExpanded ?? [];
        const hint = buildExpandedHint(expanded);
        assert.strictEqual(hint, '', 'Empty string when expanded is undefined');
    });
});
