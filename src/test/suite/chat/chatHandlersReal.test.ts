import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { handleTop } from '../../../chat/commands/top';
import { handleSearch } from '../../../chat/commands/search';
import { handleLearn, historyToTrajectory } from '../../../chat/commands/learn';
import * as chatContext from '../../../chat/utils/chatContext';
import {
    saveSession,
    getSession,
    clearSession,
    getSessionKey,
    SESSION_TTL
} from '../../../services/sessionStorage';
import type { AceClient, PlaybookBullet } from '@ace-sdk/core';

/**
 * REAL-INVOCATION tests for the chat command handlers (/top, /search, /learn).
 *
 * These actually call handleTop/handleSearch/handleLearn with a stubbed
 * chatContext.getClientForChat, so they fail if the #21 reward-sort, the #18
 * session_id/task_intent forwarding, or the F-080 trace threading regress —
 * unlike chat/topReward.test.ts and chat/f080Commands.test.ts which simulate
 * the logic inline.
 */

function makeStream(): { stream: vscode.ChatResponseStream; getOutput: () => string } {
    let output = '';
    const stream = {
        markdown: (v: string | vscode.MarkdownString) => {
            output += typeof v === 'string' ? v : v.value;
        },
        progress: (_msg: string) => {},
        reference: (_value: unknown) => {},
        anchor: (_value: unknown) => {},
        button: (_command: vscode.Command) => {},
        filetree: (_value: vscode.ChatResponseFileTree[], _baseUri: vscode.Uri) => {},
        push: (_part: vscode.ChatResponsePart) => {}
    } as unknown as vscode.ChatResponseStream;
    return { stream, getOutput: () => output };
}

function makeChatRequest(prompt = ''): vscode.ChatRequest {
    return {
        prompt,
        command: '',
        references: [],
        model: {} as vscode.LanguageModelChat,
        toolInvocationToken: undefined
    } as unknown as vscode.ChatRequest;
}

function makeCancellationToken(): vscode.CancellationToken {
    return {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => {} })
    } as vscode.CancellationToken;
}

function makeBullet(overrides: Partial<PlaybookBullet> = {}): PlaybookBullet {
    return {
        id: `b_${Math.random().toString(36).slice(2, 7)}`,
        content: 'pattern content',
        section: 'strategies_and_hard_rules',
        helpful: 0,
        harmful: 0,
        confidence: 0.9,
        evidence: [],
        observations: 1,
        created_at: new Date().toISOString(),
        last_used: null,
        root_cause: '',
        error_context: '',
        ...overrides
    };
}

const KEY = getSessionKey(); // folder undefined → 'default'
const ctx = [] as unknown as vscode.ChatContext;

function stubClient(sandbox: sinon.SinonSandbox, fakeClient: unknown): void {
    sandbox.stub(chatContext, 'getClientForChat').returns({
        client: fakeClient as AceClient,
        folder: undefined
    });
    sandbox.stub(chatContext, 'formatProjectContext').returns(undefined);
}

suite('chat /top real invocation — reward sort + label (#21)', () => {
    let sandbox: sinon.SinonSandbox;
    let getTop: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        getTop = sandbox.stub();
        stubClient(sandbox, { getTopPatterns: getTop });
    });
    teardown(() => sandbox.restore());

    test('fetches without min_helpful, sorts by reward desc, labels "reward: X.XX"', async () => {
        getTop.resolves([
            makeBullet({ content: 'AAA half', cumulative_v15_reward: 0.5 }),
            makeBullet({ content: 'BBB three', cumulative_v15_reward: 3.0 }),
            makeBullet({ content: 'CCC one', cumulative_v15_reward: 1.0 })
        ]);

        const { stream, getOutput } = makeStream();
        await handleTop(makeChatRequest('3'), ctx, stream, makeCancellationToken());
        const out = getOutput();

        const args = getTop.firstCall.args[0];
        assert.ok(!('min_helpful' in args), 'min_helpful must NOT be sent');
        assert.strictEqual(args.limit, 20, 'fetch limit = max(count*2, 20)');

        assert.ok(out.indexOf('BBB three') < out.indexOf('CCC one'), 'reward 3.0 before 1.0');
        assert.ok(out.indexOf('CCC one') < out.indexOf('AAA half'), 'reward 1.0 before 0.5');
        assert.ok(out.includes('reward: 3.00'), `reward label shown: ${out}`);
    });

    test('falls back to computeHelpful label when cumulative_v15_reward absent', async () => {
        getTop.resolves([makeBullet({ content: 'legacy pattern', n_hot_pos: 2, n_warm_pos: 0, n_cold_pos: 0 } as Partial<PlaybookBullet>)]);

        const { stream, getOutput } = makeStream();
        await handleTop(makeChatRequest('1'), ctx, stream, makeCancellationToken());
        const out = getOutput();

        assert.ok(out.includes('👍 2.0'), `computeHelpful fallback label (👍 2.0) shown: ${out}`);
        assert.ok(!out.includes('reward:'), 'no reward label when cumulative_v15_reward absent');
    });
});

suite('chat /search real invocation — session_id + task_intent + F-080 persistence (#16/#17/#18)', () => {
    let sandbox: sinon.SinonSandbox;
    let search: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        clearSession(KEY);
        search = sandbox.stub();
        stubClient(sandbox, { searchPatterns: search });
    });
    teardown(() => { sandbox.restore(); clearSession(KEY); });

    test('forwards session_id + task_intent (flag parsed), persists retrieval_id + applied_log_ids', async () => {
        search.resolves({
            retrieval_id: 'rs',
            similar_patterns: [
                { id: 'p1', content: 'a', domain: 'd', match_factors: { semantic_score: 0.9, retrieval_log_id: 7 } }
            ]
        });

        const { stream } = makeStream();
        await handleSearch(makeChatRequest('auth --task-intent explore'), ctx, stream, makeCancellationToken());

        const opts = search.firstCall.args[0];
        assert.strictEqual(opts.query, 'auth', 'flag stripped from query');
        assert.match(opts.session_id, /^sess_/, 'session_id forwarded');
        assert.strictEqual(opts.task_intent, 'explore', 'task_intent forwarded from --task-intent flag');

        const session = getSession(KEY);
        assert.ok(session, 'session persisted');
        assert.strictEqual(session!.retrieval_id, 'rs', 'retrieval_id persisted');
        assert.deepStrictEqual(session!.applied_log_ids, [7], 'applied_log_ids persisted');
    });

    test('omits task_intent when no flag present', async () => {
        search.resolves({ retrieval_id: 'rs', similar_patterns: [] });
        const { stream } = makeStream();
        await handleSearch(makeChatRequest('just a query'), ctx, stream, makeCancellationToken());

        const opts = search.firstCall.args[0];
        assert.ok(!('task_intent' in opts), 'task_intent absent when no flag (never undefined)');
    });
});

suite('chat /learn real invocation — F-080 trace threading + reward render (#16/#17/#23)', () => {
    let sandbox: sinon.SinonSandbox;
    let store: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        clearSession(KEY);
        store = sandbox.stub().resolves({});
        stubClient(sandbox, { storeExecutionTraceStream: store });
    });
    teardown(() => { sandbox.restore(); clearSession(KEY); });

    test('threads retrieval_id/applied_log_ids/session_id and renders reward tier+delta', async () => {
        saveSession(KEY, {
            session_id: 'sess_l',
            pattern_ids: ['x'],
            query: 'q',
            timestamp: Date.now(),
            expires_at: Date.now() + SESSION_TTL,
            retrieval_id: 'rl',
            applied_log_ids: [4, 5]
        });
        store.resolves({ reward_tier: 'warm', cumulative_v15_reward_delta: 0.3, patterns_rewarded: 1 });

        const { stream, getOutput } = makeStream();
        await handleLearn(makeChatRequest('did the thing'), ctx, stream, makeCancellationToken());

        const trace = store.firstCall.args[0];
        assert.strictEqual(trace.retrieval_id, 'rl', 'retrieval_id threaded');
        assert.deepStrictEqual(trace.applied_log_ids, [4, 5], 'applied_log_ids threaded');
        assert.strictEqual(trace.session_id, 'sess_l', 'session_id threaded');

        const out = getOutput();
        assert.ok(out.includes('warm tier'), `reward tier shown: ${out}`);
        assert.ok(out.includes('+0.30 delta'), `reward delta shown: ${out}`);
    });

    test('omits F-080 keys entirely when no prior search session', async () => {
        clearSession(KEY);
        const { stream } = makeStream();
        await handleLearn(makeChatRequest('standalone learn'), ctx, stream, makeCancellationToken());

        const trace = store.firstCall.args[0];
        assert.ok(!('retrieval_id' in trace), 'retrieval_id key absent');
        assert.ok(!('applied_log_ids' in trace), 'applied_log_ids key absent');
        assert.ok(!('session_id' in trace), 'session_id key absent');
    });

    test('populates trace.trajectory from ChatContext.history (#1)', async () => {
        clearSession(KEY);
        const history = [
            { prompt: 'how do I add JWT auth?' },                              // request turn
            { response: [{ value: { value: 'Use refresh-token rotation.' } }] } // response turn
        ] as unknown as vscode.ChatContext['history'];
        const context = { history } as unknown as vscode.ChatContext;

        const { stream } = makeStream();
        await handleLearn(makeChatRequest('implemented JWT auth'), context, stream, makeCancellationToken());

        const trace = store.firstCall.args[0];
        assert.deepStrictEqual(
            trace.trajectory,
            ['User: how do I add JWT auth?', 'Assistant: Use refresh-token rotation.', 'Task: implemented JWT auth'],
            'trajectory built from history turns + final task'
        );
    });
});

suite('learn.ts historyToTrajectory (#1)', () => {
    test('maps request turns to "User:" and response turns to "Assistant:"', () => {
        const history = [
            { prompt: 'first question' },
            { response: [{ value: { value: 'an answer' } }] },
            { prompt: 'follow up' }
        ] as unknown as ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>;

        assert.deepStrictEqual(historyToTrajectory(history), [
            'User: first question',
            'Assistant: an answer',
            'User: follow up'
        ]);
    });

    test('skips empty prompts/responses and returns [] for empty history', () => {
        assert.deepStrictEqual(historyToTrajectory([]), []);
        const history = [
            { prompt: '   ' },
            { response: [] }
        ] as unknown as ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>;
        assert.deepStrictEqual(historyToTrajectory(history), []);
    });
});
