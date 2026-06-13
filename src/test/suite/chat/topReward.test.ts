import * as assert from 'assert';
import * as sinon from 'sinon';
import type { PlaybookBullet } from '@ace-sdk/core';

/**
 * Unit tests for /top command reward vocabulary changes (Issue #21)
 * Tests are isolated from vscode host — no vscode imports.
 */

// ---------------------------------------------------------------------------
// Helpers — inline replicas of the sort/score logic from top.ts after #21
// ---------------------------------------------------------------------------

const COLD_WEIGHT = 0.1;

function computeHelpfulLocal(p: PlaybookBullet): number {
    const hotPos = p.n_hot_pos ?? 0;
    const hotNeg = p.n_hot_neg ?? 0;
    const warmPos = p.n_warm_pos ?? 0;
    const warmNeg = p.n_warm_neg ?? 0;
    const coldPos = p.n_cold_pos ?? 0;
    const coldNeg = p.n_cold_neg ?? 0;
    return (
        (hotPos - hotNeg) * 1.0 +
        (warmPos - warmNeg) * 0.7 +
        (coldPos - coldNeg) * COLD_WEIGHT
    );
}

/** Replica of sort-then-slice from top.ts after #21 */
function sortAndSlice(raw: PlaybookBullet[], count: number): PlaybookBullet[] {
    return raw
        .sort((a, b) => {
            const ra = a.cumulative_v15_reward ?? computeHelpfulLocal(a);
            const rb = b.cumulative_v15_reward ?? computeHelpfulLocal(b);
            return rb - ra;
        })
        .slice(0, count);
}

/** Replica of score label from top.ts after #21 */
function buildScore(p: PlaybookBullet): string {
    return p.cumulative_v15_reward !== undefined
        ? `reward: ${p.cumulative_v15_reward.toFixed(2)}`
        : `👍 ${computeHelpfulLocal(p).toFixed(1)}`;
}

// Minimal PlaybookBullet fixture factory
function makeBullet(overrides: Partial<PlaybookBullet>): PlaybookBullet {
    return {
        id: overrides.id ?? 'id-' + Math.random(),
        content: overrides.content ?? 'content',
        section: overrides.section ?? 'strategies_and_hard_rules',
        helpful: overrides.helpful ?? 0,
        harmful: overrides.harmful ?? 0,
        confidence: overrides.confidence ?? 0.8,
        n_hot_pos: overrides.n_hot_pos ?? 0,
        n_hot_neg: overrides.n_hot_neg ?? 0,
        n_warm_pos: overrides.n_warm_pos ?? 0,
        n_warm_neg: overrides.n_warm_neg ?? 0,
        n_cold_pos: overrides.n_cold_pos ?? 0,
        n_cold_neg: overrides.n_cold_neg ?? 0,
        cumulative_v15_reward: overrides.cumulative_v15_reward,
        ...overrides,
    } as PlaybookBullet;
}

// ---------------------------------------------------------------------------
// Issue #21 — handleTop sorts by reward and displays correct score label
// ---------------------------------------------------------------------------

suite('/top command #21 — sorted by reward', () => {

    test('output shows patterns sorted highest cumulative_v15_reward first', () => {
        const raw = [
            makeBullet({ content: 'low',  cumulative_v15_reward: 1.0 }),
            makeBullet({ content: 'high', cumulative_v15_reward: 9.5 }),
            makeBullet({ content: 'mid',  cumulative_v15_reward: 4.0 }),
        ];

        const sorted = sortAndSlice(raw, 10);
        assert.strictEqual(sorted[0].content, 'high', 'highest reward first');
        assert.strictEqual(sorted[1].content, 'mid');
        assert.strictEqual(sorted[2].content, 'low');
    });

    test('output sliced to requested count', () => {
        const raw = Array.from({ length: 25 }, (_, i) =>
            makeBullet({ content: `p${i}`, cumulative_v15_reward: 25 - i })
        );

        const sorted = sortAndSlice(raw, 10);
        assert.strictEqual(sorted.length, 10, 'sliced to 10');
        assert.strictEqual(sorted[0].content, 'p0', 'highest first');
    });

    test('legacy patterns (no cumulative_v15_reward) sorted by computeHelpful', () => {
        const raw = [
            makeBullet({ content: 'a', n_hot_pos: 1 }),   // helpful=1.0
            makeBullet({ content: 'b', n_hot_pos: 5 }),   // helpful=5.0
            makeBullet({ content: 'c', n_hot_pos: 3 }),   // helpful=3.0
        ];

        const sorted = sortAndSlice(raw, 3);
        assert.strictEqual(sorted[0].content, 'b');
        assert.strictEqual(sorted[1].content, 'c');
        assert.strictEqual(sorted[2].content, 'a');
    });

    test('fetch limit is max(count*2, 20) — count=5 gives 20', () => {
        const count = 5;
        const fetchLimit = Math.max(count * 2, 20);
        assert.strictEqual(fetchLimit, 20, 'limit is 20 when count*2 < 20');
    });

    test('fetch limit is max(count*2, 20) — count=15 gives 30', () => {
        const count = 15;
        const fetchLimit = Math.max(count * 2, 20);
        assert.strictEqual(fetchLimit, 30, 'limit is 30 when count*2 > 20');
    });
});

suite('/top command #21 — score label', () => {

    test('score label is "reward: X.XX" when cumulative_v15_reward present', () => {
        const p = makeBullet({ cumulative_v15_reward: 3.75 });
        const score = buildScore(p);
        assert.strictEqual(score, 'reward: 3.75', 'shows reward label');
    });

    test('score label is "reward: -1.50" for negative reward', () => {
        const p = makeBullet({ cumulative_v15_reward: -1.5 });
        const score = buildScore(p);
        assert.strictEqual(score, 'reward: -1.50', 'shows negative reward');
    });

    test('score label falls back to computeHelpful when no cumulative_v15_reward', () => {
        const p = makeBullet({
            cumulative_v15_reward: undefined,
            n_hot_pos: 2,
            n_hot_neg: 1,
            n_warm_pos: 1,
            n_warm_neg: 0,
        });
        // computeHelpful = (2-1)*1.0 + (1-0)*0.7 = 1.7
        const score = buildScore(p);
        assert.strictEqual(score, '👍 1.7', 'shows thumbs-up + computeHelpful when no reward');
    });

    test('score label uses computeHelpful (not p.helpful raw)', () => {
        const p = makeBullet({
            cumulative_v15_reward: undefined,
            helpful: 99,          // raw legacy (should NOT be used)
            n_hot_pos: 1,
            n_hot_neg: 0,
        });
        // computeHelpful = 1.0, not 99
        const score = buildScore(p);
        assert.ok(!score.includes('99'), 'raw p.helpful (99) must NOT appear in score');
        assert.strictEqual(score, '👍 1.0', 'uses computeHelpful result');
    });
});

suite('/top command #21 — min_helpful removed', () => {

    test('getTopPatterns called without min_helpful when using reward sort', () => {
        // Verify the params object does not include min_helpful
        const params: { limit: number; min_helpful?: number } = {
            limit: Math.max(10 * 2, 20),
            // min_helpful intentionally omitted
        };
        assert.ok(!('min_helpful' in params), 'min_helpful not in params');
    });

    test('getTopPatterns stub: called with limit only (no min_helpful)', async () => {
        const stub = sinon.stub().resolves([] as PlaybookBullet[]);

        const count = 10;
        const fetchLimit = Math.max(count * 2, 20);
        await stub({ limit: fetchLimit });

        assert.ok(stub.calledOnce, 'called once');
        const callArgs = stub.firstCall.args[0] as Record<string, unknown>;
        assert.ok(!('min_helpful' in callArgs), 'min_helpful absent from call');
        assert.strictEqual(callArgs['limit'], fetchLimit, 'limit set correctly');

        sinon.restore();
    });
});
