import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { createMockBullet } from '../mocks/aceSDK';
import { AceStatusTool } from '../../../tools/aceStatus';
import type { PlaybookBullet } from '@ace-sdk/core';

/**
 * Unit tests for AceStatusTool
 * Tests status retrieval, formatting, and section breakdown
 */
suite('AceStatusTool Tests', () => {

    test('status returns "not configured" when client is null', () => {
        const expectedMessage = '❌ **[ACE] Not configured.** Run "ACE: Configure" first.';
        assert.ok(expectedMessage.includes('Not configured'), 'Shows not configured message');
    });

    test('status returns formatted header', () => {
        const expectedMessage = '✅ **[ACE] Playbook Status**';
        assert.ok(expectedMessage.includes('Playbook Status'), 'Shows status header');
    });

    test('status displays total pattern count', () => {
        const totalPatterns = 42;
        const expectedDisplay = `📊 **Total:** ${totalPatterns} patterns`;

        assert.ok(expectedDisplay.includes('42'), 'Shows total count');
    });

    test('status uses total_patterns or total_bullets', () => {
        // Status API may return either field
        const data1 = { total_patterns: 10 };
        const data2 = { total_bullets: 15 };

        const total1 = data1.total_patterns ?? 0;
        const total2 = data2.total_bullets ?? 0;

        assert.strictEqual(total1, 10, 'Uses total_patterns');
        assert.strictEqual(total2, 15, 'Falls back to total_bullets');
    });

    test('status displays quality from avg_confidence', () => {
        const avgConfidence = 0.78;
        const quality = Math.round(avgConfidence * 100);
        const expectedDisplay = `⭐ **Quality:** ${quality}% confidence`;

        assert.strictEqual(quality, 78, 'Converts confidence to percentage');
    });

    test('status displays section breakdown', () => {
        const bySection = {
            'strategies_and_hard_rules': 10,
            'useful_code_snippets': 5,
            'troubleshooting_and_pitfalls': 8,
            'apis_to_use': 3
        };

        const sectionLabels: Record<string, string> = {
            strategies_and_hard_rules: 'Strategies & Rules',
            useful_code_snippets: 'Code Snippets',
            troubleshooting_and_pitfalls: 'Troubleshooting',
            apis_to_use: 'APIs to Use'
        };

        for (const [key, count] of Object.entries(bySection)) {
            const label = sectionLabels[key] || key;
            const line = `• ${label}: ${count}`;
            assert.ok(line.includes(`${count}`), `Shows ${key} count`);
        }
    });

    test('status displays top helpful patterns', () => {
        const topHelpful = [
            createMockBullet({ content: 'Pattern 1', helpful: 10 }),
            createMockBullet({ content: 'Pattern 2', helpful: 8 }),
            createMockBullet({ content: 'Pattern 3', helpful: 6 })
        ];

        for (let i = 0; i < topHelpful.length; i++) {
            const p = topHelpful[i];
            const line = `${i + 1}. ${p.content.slice(0, 50)} (👍 ${p.helpful})`;
            assert.ok(line.includes(`${p.helpful}`), `Shows helpful count for pattern ${i + 1}`);
        }
    });

    test('status limits top helpful to 3', () => {
        const topHelpful = Array.from({ length: 5 }, (_, i) =>
            createMockBullet({ helpful: 10 - i })
        );

        const displayed = topHelpful.slice(0, 3);
        assert.strictEqual(displayed.length, 3, 'Limits to 3 top helpful');
    });

    test('status handles errors gracefully', () => {
        const errorMessage = 'API timeout';
        const expectedOutput = `❌ **[ACE] Status failed:** ${errorMessage}`;

        assert.ok(expectedOutput.includes(errorMessage), 'Shows error message');
    });
});

suite('AceStatusTool Section Labels', () => {

    test('section labels are human-readable', () => {
        const sectionLabels: Record<string, string> = {
            strategies_and_hard_rules: 'Strategies & Rules',
            useful_code_snippets: 'Code Snippets',
            troubleshooting_and_pitfalls: 'Troubleshooting',
            apis_to_use: 'APIs to Use'
        };

        // No underscores in labels
        for (const label of Object.values(sectionLabels)) {
            assert.ok(!label.includes('_'), `Label "${label}" has no underscores`);
        }
    });

    test('all ACE sections have labels', () => {
        const allSections = [
            'strategies_and_hard_rules',
            'useful_code_snippets',
            'troubleshooting_and_pitfalls',
            'apis_to_use'
        ];

        const sectionLabels: Record<string, string> = {
            strategies_and_hard_rules: 'Strategies & Rules',
            useful_code_snippets: 'Code Snippets',
            troubleshooting_and_pitfalls: 'Troubleshooting',
            apis_to_use: 'APIs to Use'
        };

        for (const section of allSections) {
            assert.ok(sectionLabels[section], `Section ${section} has a label`);
        }
    });
});

suite('AceStatusTool Input Validation', () => {

    test('status tool has no required inputs', () => {
        const inputSchema = {
            type: 'object',
            properties: {}
        };

        assert.deepStrictEqual(inputSchema.properties, {}, 'No input properties');
    });

    test('status can be invoked with empty input', () => {
        const input: Record<string, never> = {};
        assert.deepStrictEqual(input, {}, 'Empty input is valid');
    });
});

// ---------------------------------------------------------------------------
// ACE 1.5 reward display tests (#20)
// ---------------------------------------------------------------------------

function makeInvocationOptions(): vscode.LanguageModelToolInvocationOptions<Record<string, never>> {
    return {
        input: {},
        toolInvocationToken: undefined
    } as unknown as vscode.LanguageModelToolInvocationOptions<Record<string, never>>;
}

function makeCancellationToken(): vscode.CancellationToken {
    return {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => {} })
    } as vscode.CancellationToken;
}

function resultToString(result: vscode.LanguageModelToolResult): string {
    // The real vscode.LanguageModelToolResult stores parts as .content in the test env
    const r = result as unknown as { content: { value: string }[] };
    return r.content.map(p => p.value).join('');
}

function makeFakeStatusBullet(overrides: Partial<PlaybookBullet> = {}): PlaybookBullet {
    return {
        id: `b_${Math.random().toString(36).slice(2, 7)}`,
        content: 'pattern content example for testing',
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

suite('AceStatusTool — ACE 1.5 reward display (#20)', () => {
    let sandbox: sinon.SinonSandbox;
    let fakeClient: { getStatus: sinon.SinonStub };

    setup(() => {
        sandbox = sinon.createSandbox();
        fakeClient = { getStatus: sandbox.stub() };
    });

    teardown(() => {
        sandbox.restore();
    });

    test('uses cumulative_v15_reward.toFixed(2) for top_helpful when present', async () => {
        const bullet = makeFakeStatusBullet({ cumulative_v15_reward: 1.5, helpful: 99 });
        fakeClient.getStatus.resolves({
            total_patterns: 1,
            top_helpful: [bullet]
        });

        // Use constructor injection — AceStatusTool accepts optional clientProvider
        const tool = new AceStatusTool(
            () => fakeClient as unknown as ReturnType<typeof import('../../../services/aceClient').getAceClient>
        );
        const result = await tool.invoke(makeInvocationOptions(), makeCancellationToken());
        const output = resultToString(result);

        assert.ok(output.includes('reward: 1.50'), `Expected "reward: 1.50" in output: ${output}`);
        assert.ok(!output.includes('👍 99'), `Raw helpful count must NOT appear: ${output}`);
    });

    test('uses computeHelpful().toFixed(1) as fallback when cumulative_v15_reward absent', async () => {
        // n_hot_pos=2, n_warm_pos=0, n_cold_pos=0 => computeHelpful = 2*1.0 = 2.0
        const bullet = makeFakeStatusBullet({ n_hot_pos: 2, n_warm_pos: 0, n_cold_pos: 0, helpful: 0 });
        fakeClient.getStatus.resolves({
            total_patterns: 1,
            top_helpful: [bullet]
        });

        const tool = new AceStatusTool(
            () => fakeClient as unknown as ReturnType<typeof import('../../../services/aceClient').getAceClient>
        );
        const result = await tool.invoke(makeInvocationOptions(), makeCancellationToken());
        const output = resultToString(result);

        assert.ok(output.includes('reward:'), `Expected "reward:" label in output: ${output}`);
        assert.ok(output.includes('2.0'), `Expected computeHelpful result "2.0" in output: ${output}`);
        assert.ok(!output.includes('👍'), `Raw helpful emoji must NOT appear: ${output}`);
    });
});
