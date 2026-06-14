import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { handleStatus } from '../../../chat/commands/status';
import type { PlaybookBullet } from '@ace-sdk/core';

// ---------------------------------------------------------------------------
// Local helpers — do NOT use or modify mocks/aceSDK.ts
// ---------------------------------------------------------------------------

interface FakePlaybookStats {
    total_patterns?: number;
    total_bullets?: number;
    avg_confidence?: number;
    by_section?: Record<string, number>;
    top_helpful?: PlaybookBullet[];
    helpful_total?: number;
    harmful_total?: number;
    cumulative_reward_total?: number;
    hot_total?: number;
    warm_total?: number;
    cold_total?: number;
    at_risk_count?: number;
    patterns_with_v15_reward?: number;
}

function makeFakeBullet(overrides: Partial<PlaybookBullet> = {}): PlaybookBullet {
    return {
        id: `b_${Math.random().toString(36).slice(2, 7)}`,
        content: 'test pattern content',
        section: 'strategies_and_hard_rules',
        helpful: 5,
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

/** Accumulates all markdown strings written to stream.markdown() */
function makeStream(): { stream: vscode.ChatResponseStream; getOutput: () => string } {
    let output = '';
    const stream = {
        markdown: (v: string | vscode.MarkdownString) => {
            if (typeof v === 'string') {
                output += v;
            } else {
                output += v.value;
            }
        },
        // Provide stub no-ops for other methods used by the handler
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
        command: 'status',
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

// ---------------------------------------------------------------------------
// Suite: handleStatus — reward aggregate display (#20)
// ---------------------------------------------------------------------------

suite('handleStatus — ACE 1.5 reward aggregates', () => {
    let sandbox: sinon.SinonSandbox;
    let fakeClient: { getStatus: sinon.SinonStub };

    setup(() => {
        sandbox = sinon.createSandbox();
        fakeClient = { getStatus: sandbox.stub() };
    });

    teardown(() => {
        sandbox.restore();
    });

    /**
     * Build a handleStatus call using constructor-injected deps.
     * handleStatus accepts optional `deps` as its last parameter so tests
     * can bypass the real config/client lookup.
     */
    async function invokeHandleStatus(stats: FakePlaybookStats): Promise<string> {
        fakeClient.getStatus.resolves(stats);
        const { stream, getOutput } = makeStream();
        await handleStatus(
            makeChatRequest(),
            [] as unknown as vscode.ChatContext,
            stream,
            makeCancellationToken(),
            /* deps */ {
                isGloballyConfigured: () => true,
                getClientForChat: () => ({ client: fakeClient as unknown as import('@ace-sdk/core').AceClient, folder: undefined }),
                getProjectConfig: () => null,
                formatProjectContext: () => {}
            }
        );
        return getOutput();
    }

    // -----------------------------------------------------------------------
    // Test 1: reward aggregates shown when cumulative_reward_total is present
    // -----------------------------------------------------------------------
    test('shows "Cumulative Reward" and NOT "Total Helpful" when cumulative_reward_total present', async () => {
        const output = await invokeHandleStatus({
            total_patterns: 5,
            cumulative_reward_total: 10,
            hot_total: 3,
            warm_total: 1,
            cold_total: 1,
            patterns_with_v15_reward: 5
        });

        assert.ok(output.includes('Cumulative Reward'), `Expected "Cumulative Reward" in output: ${output}`);
        assert.ok(!output.includes('Total Helpful'), `"Total Helpful" must NOT appear when reward aggregates present: ${output}`);
    });

    // -----------------------------------------------------------------------
    // Test 2: Hot / Warm / Cold line included when cumulative_reward_total present
    // -----------------------------------------------------------------------
    test('shows "Hot / Warm / Cold" line when cumulative_reward_total present', async () => {
        const output = await invokeHandleStatus({
            total_patterns: 5,
            cumulative_reward_total: 10,
            hot_total: 3,
            warm_total: 2,
            cold_total: 1,
            patterns_with_v15_reward: 5
        });

        assert.ok(output.includes('Hot / Warm / Cold'), `Expected "Hot / Warm / Cold" in output: ${output}`);
        assert.ok(output.includes('3'), 'hot_total value present');
        assert.ok(output.includes('2'), 'warm_total value present');
        assert.ok(output.includes('1'), 'cold_total value present');
    });

    // -----------------------------------------------------------------------
    // Test 3: at_risk_count shown only when > 0
    // -----------------------------------------------------------------------
    test('shows "At-Risk Patterns" line only when at_risk_count > 0', async () => {
        const outputWithRisk = await invokeHandleStatus({
            total_patterns: 5,
            cumulative_reward_total: 5,
            at_risk_count: 2,
            patterns_with_v15_reward: 5
        });
        assert.ok(outputWithRisk.includes('At-Risk Patterns'), `Expected "At-Risk Patterns" when at_risk_count=2: ${outputWithRisk}`);

        const outputNoRisk = await invokeHandleStatus({
            total_patterns: 5,
            cumulative_reward_total: 5,
            at_risk_count: 0,
            patterns_with_v15_reward: 5
        });
        assert.ok(!outputNoRisk.includes('At-Risk Patterns'), `"At-Risk Patterns" must NOT appear when at_risk_count=0: ${outputNoRisk}`);
    });

    // -----------------------------------------------------------------------
    // Test 4: cold project (reward=0, at_risk=0) → ranking signal note, not bare "0"
    // -----------------------------------------------------------------------
    test('cold project (reward=0, at_risk=0) shows ranking signal note, not bare "Cumulative Reward: 0"', async () => {
        const output = await invokeHandleStatus({
            total_patterns: 3,
            cumulative_reward_total: 0,
            at_risk_count: undefined,
            patterns_with_v15_reward: 5
        });
        assert.ok(!output.includes('At-Risk Patterns'), `"At-Risk Patterns" must NOT appear when at_risk_count undefined: ${output}`);
        assert.ok(!output.includes('Cumulative Reward: 0'), `bare "Cumulative Reward: 0" must NOT appear for cold project: ${output}`);
        assert.ok(
            output.includes('Ranking Signal') || output.includes('ranking'),
            `ranking signal note must appear for cold project: ${output}`
        );
    });

    // -----------------------------------------------------------------------
    // Test 5: legacy fallback when cumulative_reward_total absent
    // -----------------------------------------------------------------------
    test('falls back to "Total Helpful" when cumulative_reward_total absent', async () => {
        const output = await invokeHandleStatus({
            total_patterns: 5,
            helpful_total: 12,
            harmful_total: 2
        });

        assert.ok(output.includes('Total Helpful'), `Expected "Total Helpful" in legacy fallback: ${output}`);
        assert.ok(!output.includes('Cumulative Reward'), `"Cumulative Reward" must NOT appear in legacy fallback: ${output}`);
    });

    // -----------------------------------------------------------------------
    // Test 6: legacy fallback omits harmful line when harmful_total absent
    // -----------------------------------------------------------------------
    test('legacy fallback omits "Total Harmful" line when harmful_total absent', async () => {
        const output = await invokeHandleStatus({
            total_patterns: 5,
            helpful_total: 7
        });

        assert.ok(output.includes('Total Helpful'), `Expected "Total Helpful" in output: ${output}`);
        assert.ok(!output.includes('Total Harmful'), `"Total Harmful" must NOT appear when harmful_total absent: ${output}`);
    });
});
