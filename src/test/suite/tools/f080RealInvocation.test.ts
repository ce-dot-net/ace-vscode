import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AceLearnTool } from '../../../tools/aceLearn';
import { AceSearchTool } from '../../../tools/aceSearch';
import {
    saveSession,
    getSession,
    clearSession,
    getSessionKey,
    SESSION_TTL
} from '../../../services/sessionStorage';
import * as aceClientModule from '../../../services/aceClient';

/**
 * REAL-INVOCATION F-080 tests.
 *
 * Unlike chat/f080Commands.test.ts (which re-implements the trace/collection logic
 * inline and would still pass if the production code were reverted), these tests
 * actually invoke AceLearnTool.invoke() / AceSearchTool.invoke() and assert on the
 * object handed to the SDK and on the rendered output — so they fail if the F-080
 * threading in src/tools/aceSearch.ts or src/tools/aceLearn.ts regresses.
 */

function makeCancellationToken(): vscode.CancellationToken {
    return {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => {} })
    } as vscode.CancellationToken;
}

function invocation<T>(input: T): vscode.LanguageModelToolInvocationOptions<T> {
    return { input, toolInvocationToken: undefined } as unknown as vscode.LanguageModelToolInvocationOptions<T>;
}

function resultToString(result: vscode.LanguageModelToolResult): string {
    const r = result as unknown as { content: { value: string }[] };
    return r.content.map(p => p.value).join('');
}

const KEY = getSessionKey(); // 'default' (no folder context, matches the tool handlers)

suite('F-080 real invocation — AceLearnTool threads session fields into the trace (#16/#17/#23)', () => {
    let sandbox: sinon.SinonSandbox;
    let storeStub: sinon.SinonStub;
    let fakeClient: { storeExecutionTraceStream: sinon.SinonStub };

    setup(() => {
        sandbox = sinon.createSandbox();
        clearSession(KEY);
        storeStub = sandbox.stub().resolves({});
        fakeClient = { storeExecutionTraceStream: storeStub };
    });

    teardown(() => {
        sandbox.restore();
        clearSession(KEY);
    });

    function makeTool() {
        return new AceLearnTool(
            () => fakeClient as unknown as ReturnType<typeof aceClientModule.getAceClient>
        );
    }

    test('forwards retrieval_id, applied_log_ids and session_id when a search session exists', async () => {
        saveSession(KEY, {
            session_id: 'sess_abc',
            pattern_ids: ['p1', 'p2'],
            query: 'q',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL,
            retrieval_id: 'ret-123',
            applied_log_ids: [1, 2, 3]
        });

        await makeTool().invoke(
            invocation({ task: 'did a thing', success: true, output: 'ok' }),
            makeCancellationToken()
        );

        assert.ok(storeStub.calledOnce, 'storeExecutionTraceStream invoked once');
        const trace = storeStub.firstCall.args[0];
        assert.strictEqual(trace.retrieval_id, 'ret-123', 'retrieval_id threaded into trace');
        assert.deepStrictEqual(trace.applied_log_ids, [1, 2, 3], 'applied_log_ids threaded into trace');
        assert.strictEqual(trace.session_id, 'sess_abc', 'session_id threaded into trace');
        assert.deepStrictEqual(trace.playbook_used, ['p1', 'p2'], 'playbook_used taken from session');
    });

    test('omits F-080 keys entirely (not undefined) when no prior search session', async () => {
        clearSession(KEY);
        await makeTool().invoke(invocation({ task: 'standalone', success: true }), makeCancellationToken());

        const trace = storeStub.firstCall.args[0];
        assert.ok(!('retrieval_id' in trace), 'retrieval_id key absent (not undefined)');
        assert.ok(!('applied_log_ids' in trace), 'applied_log_ids key absent (not undefined)');
        assert.ok(!('session_id' in trace), 'session_id key absent (not undefined)');
    });

    test('omits applied_log_ids when the session carries none', async () => {
        saveSession(KEY, {
            session_id: 'sess_x',
            pattern_ids: ['p1'],
            query: 'q',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL,
            retrieval_id: 'r1'
            // no applied_log_ids
        });
        await makeTool().invoke(invocation({ task: 't' }), makeCancellationToken());

        const trace = storeStub.firstCall.args[0];
        assert.strictEqual(trace.retrieval_id, 'r1', 'retrieval_id still threaded');
        assert.ok(!('applied_log_ids' in trace), 'applied_log_ids absent when none collected');
    });

    test('renders reward_tier, signed positive delta and patterns_rewarded from LearningResponse (#23)', async () => {
        storeStub.resolves({ reward_tier: 'hot', cumulative_v15_reward_delta: 0.75, patterns_rewarded: 2 });

        const out = resultToString(
            await makeTool().invoke(invocation({ task: 't' }), makeCancellationToken())
        );
        assert.ok(out.includes('hot tier'), `tier shown: ${out}`);
        assert.ok(out.includes('+0.75 delta'), `signed positive delta shown: ${out}`);
        assert.ok(out.includes('2 patterns rewarded'), `patterns_rewarded shown: ${out}`);
    });

    test('renders negative delta sign, and omits the reward line when no reward fields present', async () => {
        storeStub.resolves({ reward_tier: 'cold', cumulative_v15_reward_delta: -0.2 });
        let out = resultToString(await makeTool().invoke(invocation({ task: 't' }), makeCancellationToken()));
        assert.ok(out.includes('-0.20 delta'), `negative delta shown: ${out}`);

        storeStub.resolves({ learning_statistics: { patterns_created: 1 } });
        out = resultToString(await makeTool().invoke(invocation({ task: 't' }), makeCancellationToken()));
        assert.ok(!out.includes('Reward:'), `no reward line when fields absent: ${out}`);
    });
});

suite('F-080 real invocation — AceSearchTool forwards + persists session fields (#16/#17/#18/#24)', () => {
    let sandbox: sinon.SinonSandbox;
    let searchStub: sinon.SinonStub;
    let fakeClient: { searchPatterns: sinon.SinonStub };

    setup(() => {
        sandbox = sinon.createSandbox();
        clearSession(KEY);
        searchStub = sandbox.stub();
        fakeClient = { searchPatterns: searchStub };
        sandbox
            .stub(aceClientModule, 'getAceClient')
            .returns(fakeClient as unknown as ReturnType<typeof aceClientModule.getAceClient>);
    });

    teardown(() => {
        sandbox.restore();
        clearSession(KEY);
    });

    test('passes session_id and task_intent to searchPatterns()', async () => {
        searchStub.resolves({ similar_patterns: [], retrieval_id: 'r1' });

        await new AceSearchTool().invoke(
            invocation({ query: 'auth', task_intent: 'refactor' }),
            makeCancellationToken()
        );

        const opts = searchStub.firstCall.args[0];
        assert.match(opts.session_id, /^sess_/, 'session_id forwarded to the server');
        assert.strictEqual(opts.task_intent, 'refactor', 'task_intent forwarded to the server');
    });

    test('omits task_intent key when not provided', async () => {
        searchStub.resolves({ similar_patterns: [], retrieval_id: 'r1' });

        await new AceSearchTool().invoke(invocation({ query: 'auth' }), makeCancellationToken());

        const opts = searchStub.firstCall.args[0];
        assert.ok(!('task_intent' in opts), 'task_intent absent when not supplied (never undefined)');
    });

    test('persists retrieval_id and applied_log_ids (from match_factors) into the session', async () => {
        searchStub.resolves({
            retrieval_id: 'ret-9',
            similar_patterns: [
                { id: 'p1', content: 'a', domain: 'd', match_factors: { semantic_score: 0.9, retrieval_log_id: 1 } },
                { id: 'p2', content: 'b', domain: 'd', match_factors: { semantic_score: 0.8, retrieval_log_id: 2 } },
                { id: 'p3', content: 'c', domain: 'd', match_factors: {} } // cold → excluded
            ]
        });

        await new AceSearchTool().invoke(invocation({ query: 'auth' }), makeCancellationToken());

        const session = getSession(KEY);
        assert.ok(session, 'session saved');
        assert.strictEqual(session!.retrieval_id, 'ret-9', 'retrieval_id persisted');
        assert.deepStrictEqual(session!.applied_log_ids, [1, 2], 'applied_log_ids collected, cold/empty excluded');
        assert.strictEqual(
            session!.session_id,
            searchStub.firstCall.args[0].session_id,
            'same session_id is both sent to server and stored locally'
        );
    });

    test('badges ⚠️ at-risk for negative reward but NOT for reward 0 (#24 semantics)', async () => {
        searchStub.resolves({
            retrieval_id: 'r',
            similar_patterns: [
                { id: 'neg', content: 'harmful pattern here', domain: 'd', cumulative_v15_reward: -0.5, payload_version: 15, match_factors: {} },
                { id: 'zero', content: 'fresh uncredited pattern', domain: 'd', cumulative_v15_reward: 0, payload_version: 15, match_factors: {} }
            ]
        });

        const out = resultToString(
            await new AceSearchTool().invoke(invocation({ query: 'x' }), makeCancellationToken())
        );
        const negLine = out.split('\n').find(l => l.includes('harmful pattern here')) || '';
        const zeroLine = out.split('\n').find(l => l.includes('fresh uncredited pattern')) || '';
        assert.ok(negLine.includes('at-risk'), `negative-reward pattern is badged: ${negLine}`);
        assert.ok(!zeroLine.includes('at-risk'), `reward==0 pattern is NOT badged (neutral/uncredited): ${zeroLine}`);
    });

    test('surfaces expanded neighbors hint, highest reward first, when result.expanded present (#24)', async () => {
        searchStub.resolves({
            retrieval_id: 'r',
            similar_patterns: [{ id: 'p1', content: 'a', domain: 'd', match_factors: {} }],
            expanded: [
                { pattern_id: 'abcdef123456', cumulative_reward: 2.0 },
                { pattern_id: 'zzzzzz999999', cumulative_reward: 5.0 }
            ]
        });

        const out = resultToString(
            await new AceSearchTool().invoke(invocation({ query: 'x' }), makeCancellationToken())
        );
        assert.ok(out.includes('Expanded neighbors'), `expanded hint shown: ${out}`);
        assert.ok(out.includes('zzzzzz99'), 'highest-reward neighbor id (truncated to 8) is shown');
    });
});

suite('F-080 tool path — trajectory from session + consume-on-read', () => {
    let sandbox: sinon.SinonSandbox;
    let searchStub: sinon.SinonStub;
    let storeStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        clearSession(KEY);
        searchStub = sandbox.stub().resolves({
            retrieval_id: 'r',
            similar_patterns: [{ id: 'p1', content: 'a', domain: 'd', match_factors: {} }]
        });
        storeStub = sandbox.stub().resolves({});
        // Both tools resolve through the stubbed module singleton (AceLearnTool's
        // default clientProvider is getAceClient, AceSearchTool calls it directly).
        sandbox.stub(aceClientModule, 'getAceClient').returns(
            { searchPatterns: searchStub, storeExecutionTraceStream: storeStub } as unknown as ReturnType<typeof aceClientModule.getAceClient>
        );
    });

    teardown(() => {
        sandbox.restore();
        clearSession(KEY);
    });

    test('ace_learn trajectory is built from the accumulated ace_search step (#1)', async () => {
        await new AceSearchTool().invoke(invocation({ query: 'jwt auth', task_intent: 'explore' }), makeCancellationToken());
        await new AceLearnTool().invoke(invocation({ task: 'added jwt' }), makeCancellationToken());

        const trace = storeStub.firstCall.args[0];
        assert.deepStrictEqual(
            trace.trajectory,
            ['Searched: "jwt auth" (intent: explore)', 'Task: added jwt'],
            'trajectory = accumulated search step(s) + final task'
        );
    });

    test('invariant #3 — a 0-pattern search still persists the pinned session_id so ace_learn can anchor it', async () => {
        // Search returns 0 patterns, but the server still stamped a retrieval row with the
        // pinned session_id. The session_id MUST survive this early-exit path.
        searchStub.resolves({ retrieval_id: 'ret-empty', similar_patterns: [] });
        await new AceSearchTool().invoke(invocation({ query: 'nothing matches here' }), makeCancellationToken());

        const pinned = searchStub.firstCall.args[0].session_id;
        const session = getSession(KEY);
        assert.ok(session, 'session persisted even with 0 patterns (early-exit safety)');
        assert.strictEqual(session!.session_id, pinned, 'persisted session_id == the one pinned to the server');

        // ace_learn must re-attach the SAME id byte-identically (invariant #2) → anchored trace
        await new AceLearnTool().invoke(invocation({ task: 'did the work anyway' }), makeCancellationToken());
        const trace = storeStub.firstCall.args[0];
        assert.strictEqual(trace.session_id, pinned, 'learn trace carries the same pinned session_id → server can credit');
    });

    test('multiple searches accumulate, then ace_learn consumes the session (consume-on-read)', async () => {
        await new AceSearchTool().invoke(invocation({ query: 'first' }), makeCancellationToken());
        await new AceSearchTool().invoke(invocation({ query: 'second' }), makeCancellationToken());

        assert.deepStrictEqual(
            getSession(KEY)?.trajectory,
            ['Searched: "first"', 'Searched: "second"'],
            'search steps accumulate across the task window'
        );

        await new AceLearnTool().invoke(invocation({ task: 't' }), makeCancellationToken());
        assert.deepStrictEqual(storeStub.firstCall.args[0].trajectory, ['Searched: "first"', 'Searched: "second"', 'Task: t']);

        // consume-on-read: the session is cleared so it cannot be re-attributed
        assert.strictEqual(getSession(KEY), undefined, 'session consumed after learn');

        await new AceLearnTool().invoke(invocation({ task: 't2' }), makeCancellationToken());
        assert.deepStrictEqual(
            storeStub.secondCall.args[0].trajectory,
            ['Task: t2'],
            'a later learn does not re-use the consumed search trajectory'
        );
    });
});
