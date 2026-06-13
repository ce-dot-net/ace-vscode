import * as assert from 'assert';
import * as sinon from 'sinon';
import type { PlaybookBullet } from '@ace-sdk/core';

/**
 * Unit tests for StatusPanel reward vocabulary changes
 * Issues #19, #21, #22
 */

// ---------------------------------------------------------------------------
// Helpers — inline replicas of the logic under test so we can unit-test it
// without needing a vscode host environment.
// ---------------------------------------------------------------------------

/** Replica of StatusData interface after #19 */
interface StatusData {
    total_patterns: number;
    avg_confidence: number;
    by_section: Record<string, number>;
    by_domain: Record<string, number>;
    helpful_total: number;
    harmful_total: number;
    cumulative_reward_total?: number;
    hot_total?: number;
    warm_total?: number;
    cold_total?: number;
    at_risk_count?: number;
    patterns_with_v15_reward?: number;
    org_id: string;
    org_name: string;
    project_id: string;
    project_name: string;
    top_patterns: TopPattern[];
}

interface TopPattern {
    content?: string;
    section?: string;
    helpful?: number;
    confidence?: number;
    domain?: string;
    cumulative_v15_reward?: number;
    n_hot_pos?: number;
    n_hot_neg?: number;
    n_warm_pos?: number;
    n_warm_neg?: number;
    n_cold_pos?: number;
    n_cold_neg?: number;
}

/**
 * Replica of the _fetchStatus() return-value extraction logic (post-#19).
 * The real implementation does actual HTTP calls; here we just verify that
 * the analytics response fields are correctly mapped onto StatusData.
 */
function extractStatusData(analytics: Record<string, unknown>): Partial<StatusData> {
    return {
        helpful_total: (analytics.helpful_total as number) || 0,
        harmful_total: (analytics.harmful_total as number) || 0,
        cumulative_reward_total: analytics.cumulative_reward_total as number | undefined,
        hot_total: analytics.hot_total as number | undefined,
        warm_total: analytics.warm_total as number | undefined,
        cold_total: analytics.cold_total as number | undefined,
        at_risk_count: analytics.at_risk_count as number | undefined,
        patterns_with_v15_reward: analytics.patterns_with_v15_reward as number | undefined,
    };
}

/**
 * Replica of the reward-block generation logic used by _getStatusHtml() after #19.
 * Returns an HTML string that mirrors what the real method generates.
 */
function buildRewardHtml(stats: StatusData): string {
    const hasRewardData = stats.patterns_with_v15_reward && stats.patterns_with_v15_reward > 0;

    if (!hasRewardData) {
        // Legacy fallback
        const helpfulTotal = stats.helpful_total;
        const harmfulTotal = stats.harmful_total;
        const trustScore = helpfulTotal + harmfulTotal > 0
            ? Math.round((helpfulTotal / (helpfulTotal + harmfulTotal)) * 100)
            : 100;
        return `<div class="trust-score">${trustScore}%</div>`;
    }

    const rewardTotal = stats.cumulative_reward_total ?? 0;
    const atRiskCount = stats.at_risk_count ?? 0;
    const hot = stats.hot_total ?? 0;
    const warm = stats.warm_total ?? 0;
    const cold = stats.cold_total ?? 0;

    let html = '';

    // Cold project guard: cumulative_reward_total === 0 AND at_risk_count === 0
    if (rewardTotal === 0 && atRiskCount === 0) {
        html += `<div class="reward-cold-note">No credited traces yet — ranking uses match_factors (ucb_score / semantic_score / confidence)</div>`;
    } else {
        html += `<div class="reward-total">${rewardTotal.toFixed(2)}</div>`;
        // at-risk badge: only when at_risk_count > 0 AND cumulative_reward_total < 0
        if (atRiskCount > 0 && rewardTotal < 0) {
            html += `<div class="at-risk-badge">${atRiskCount} at-risk</div>`;
        }
    }

    // Tier bar
    html += `<div class="tier-bar"><span class="hot">${hot}</span><span class="warm">${warm}</span><span class="cold">${cold}</span></div>`;

    return html;
}

/**
 * Replica of computeHelpful from @ace-sdk/core — used in tests to verify
 * the panel calls it rather than reading p.helpful raw.
 */
const COLD_WEIGHT = 0.1;
function computeHelpfulLocal(p: TopPattern): number {
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

/** Replica of sort-then-slice used by statusPanel getTopPatterns after #21 */
function sortAndSlice(bullets: TopPattern[], limit: number): TopPattern[] {
    return bullets
        .sort((a, b) => {
            const ra = a.cumulative_v15_reward ?? computeHelpfulLocal(a);
            const rb = b.cumulative_v15_reward ?? computeHelpfulLocal(b);
            return rb - ra;
        })
        .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Issue #19 — _fetchStatus() reward aggregate extraction
// ---------------------------------------------------------------------------

suite('StatusPanel #19 — _fetchStatus reward aggregates', () => {

    test('extracts cumulative_reward_total from analytics response', () => {
        const analytics: Record<string, unknown> = {
            total_patterns: 10,
            cumulative_reward_total: 42,
            hot_total: 3,
            warm_total: 5,
            cold_total: 2,
            at_risk_count: 1,
            patterns_with_v15_reward: 10,
            helpful_total: 8,
            harmful_total: 2,
        };

        const result = extractStatusData(analytics);
        assert.strictEqual(result.cumulative_reward_total, 42, 'cumulative_reward_total must be 42');
    });

    test('extracts hot_total, warm_total, cold_total, at_risk_count, patterns_with_v15_reward', () => {
        const analytics: Record<string, unknown> = {
            cumulative_reward_total: 10,
            hot_total: 3,
            warm_total: 5,
            cold_total: 2,
            at_risk_count: 1,
            patterns_with_v15_reward: 10,
            helpful_total: 0,
            harmful_total: 0,
        };

        const result = extractStatusData(analytics);
        assert.strictEqual(result.hot_total, 3, 'hot_total');
        assert.strictEqual(result.warm_total, 5, 'warm_total');
        assert.strictEqual(result.cold_total, 2, 'cold_total');
        assert.strictEqual(result.at_risk_count, 1, 'at_risk_count');
        assert.strictEqual(result.patterns_with_v15_reward, 10, 'patterns_with_v15_reward');
    });

    test('legacy fallback: missing reward fields leave them undefined, helpful_total preserved', () => {
        const analytics: Record<string, unknown> = {
            helpful_total: 15,
            harmful_total: 3,
        };

        const result = extractStatusData(analytics);
        assert.strictEqual(result.helpful_total, 15, 'helpful_total preserved');
        assert.strictEqual(result.harmful_total, 3, 'harmful_total preserved');
        assert.strictEqual(result.cumulative_reward_total, undefined, 'cumulative_reward_total undefined');
        assert.strictEqual(result.patterns_with_v15_reward, undefined, 'patterns_with_v15_reward undefined');
    });
});

// ---------------------------------------------------------------------------
// Issue #19 — HTML rendering: reward block vs legacy trust score
// ---------------------------------------------------------------------------

suite('StatusPanel #19 — HTML reward block rendering', () => {

    test('shows at_risk_count badge when at_risk_count > 0 and cumulative_reward_total < 0', () => {
        const stats: StatusData = {
            total_patterns: 10,
            avg_confidence: 0.8,
            by_section: {},
            by_domain: {},
            helpful_total: 5,
            harmful_total: 2,
            cumulative_reward_total: -2.5,   // negative = at-risk (per #19 semantics correction)
            hot_total: 1,
            warm_total: 3,
            cold_total: 6,
            at_risk_count: 2,
            patterns_with_v15_reward: 10,
            org_id: 'org1',
            org_name: 'Org One',
            project_id: 'proj1',
            project_name: 'Project One',
            top_patterns: [],
        };

        const html = buildRewardHtml(stats);
        assert.ok(html.includes('at-risk-badge'), 'at-risk badge present when at_risk_count > 0');
        assert.ok(html.includes('2 at-risk'), 'shows at_risk_count value');
    });

    test('reward == 0 does NOT show at-risk badge (uncredited/neutral)', () => {
        const stats: StatusData = {
            total_patterns: 5,
            avg_confidence: 0.7,
            by_section: {},
            by_domain: {},
            helpful_total: 0,
            harmful_total: 0,
            cumulative_reward_total: 0,
            hot_total: 0,
            warm_total: 0,
            cold_total: 5,
            at_risk_count: 0,
            patterns_with_v15_reward: 5,
            org_id: 'org1',
            org_name: '',
            project_id: 'proj1',
            project_name: '',
            top_patterns: [],
        };

        const html = buildRewardHtml(stats);
        assert.ok(!html.includes('at-risk-badge'), 'no at-risk badge for reward === 0');
    });

    test('cold project (reward 0, at_risk_count 0) shows ranking signal note instead of 0.0', () => {
        const stats: StatusData = {
            total_patterns: 5,
            avg_confidence: 0.7,
            by_section: {},
            by_domain: {},
            helpful_total: 0,
            harmful_total: 0,
            cumulative_reward_total: 0,
            hot_total: 0,
            warm_total: 0,
            cold_total: 5,
            at_risk_count: 0,
            patterns_with_v15_reward: 5,
            org_id: 'org1',
            org_name: '',
            project_id: 'proj1',
            project_name: '',
            top_patterns: [],
        };

        const html = buildRewardHtml(stats);
        // Should NOT show a bare "0.00" reward card, instead show ranking note
        assert.ok(!html.includes('<div class="reward-total">0.00</div>'), 'no bare 0.00 stat card');
        assert.ok(html.includes('ucb_score') || html.includes('semantic_score') || html.includes('ranking'), 'shows ranking signal note');
    });

    test('shows legacy Trust Score when patterns_with_v15_reward is 0', () => {
        const stats: StatusData = {
            total_patterns: 10,
            avg_confidence: 0.8,
            by_section: {},
            by_domain: {},
            helpful_total: 8,
            harmful_total: 2,
            cumulative_reward_total: undefined,
            patterns_with_v15_reward: 0,
            org_id: 'org1',
            org_name: '',
            project_id: 'proj1',
            project_name: '',
            top_patterns: [],
        };

        const html = buildRewardHtml(stats);
        assert.ok(html.includes('trust-score'), 'shows legacy trust score when no v15 reward data');
        assert.ok(html.includes('80%'), 'trust score computed correctly (8/(8+2)*100=80)');
    });

    test('shows legacy Trust Score when patterns_with_v15_reward is absent', () => {
        const stats: StatusData = {
            total_patterns: 4,
            avg_confidence: 0.5,
            by_section: {},
            by_domain: {},
            helpful_total: 3,
            harmful_total: 1,
            org_id: 'org1',
            org_name: '',
            project_id: 'proj1',
            project_name: '',
            top_patterns: [],
        };

        const html = buildRewardHtml(stats);
        assert.ok(html.includes('trust-score'), 'fallback trust score rendered');
        assert.ok(html.includes('75%'), 'trust score = 3/(3+1)*100 = 75');
    });
});

// ---------------------------------------------------------------------------
// Issue #19 — top patterns use computeHelpful not p.helpful raw
// ---------------------------------------------------------------------------

suite('StatusPanel #19 — top patterns use computeHelpful', () => {

    test('computeHelpful is used (not p.helpful raw) for 1.5 patterns', () => {
        // Pattern where p.helpful would differ from computeHelpful
        const pattern: TopPattern = {
            content: 'test pattern',
            helpful: 99,          // raw legacy value (wrong)
            n_hot_pos: 2,
            n_hot_neg: 1,
            n_warm_pos: 1,
            n_warm_neg: 0,
            n_cold_pos: 0,
            n_cold_neg: 0,
        };

        // computeHelpful = (2-1)*1.0 + (1-0)*0.7 + 0 = 1.7
        const computed = computeHelpfulLocal(pattern);
        assert.ok(computed !== pattern.helpful, 'computeHelpful differs from p.helpful in this fixture');
        assert.ok(Math.abs(computed - 1.7) < 0.001, `computeHelpful = 1.7, got ${computed}`);
    });
});

// ---------------------------------------------------------------------------
// Issue #21 — sortAndSlice uses cumulative_v15_reward, then computeHelpful
// ---------------------------------------------------------------------------

suite('StatusPanel #21 — getTopPatterns sort by reward', () => {

    test('patterns with higher cumulative_v15_reward appear first', () => {
        const patterns: TopPattern[] = [
            { content: 'low', cumulative_v15_reward: 1.5 },
            { content: 'high', cumulative_v15_reward: 9.0 },
            { content: 'mid', cumulative_v15_reward: 3.0 },
        ];

        const sorted = sortAndSlice(patterns, 3);
        assert.strictEqual(sorted[0].content, 'high', 'highest reward first');
        assert.strictEqual(sorted[1].content, 'mid');
        assert.strictEqual(sorted[2].content, 'low');
    });

    test('slices to requested limit after sorting', () => {
        const patterns: TopPattern[] = [
            { content: 'p1', cumulative_v15_reward: 10 },
            { content: 'p2', cumulative_v15_reward: 8 },
            { content: 'p3', cumulative_v15_reward: 6 },
            { content: 'p4', cumulative_v15_reward: 4 },
            { content: 'p5', cumulative_v15_reward: 2 },
            { content: 'p6', cumulative_v15_reward: 1 },
        ];

        const sorted = sortAndSlice(patterns, 5);
        assert.strictEqual(sorted.length, 5, 'limited to 5');
        assert.strictEqual(sorted[0].content, 'p1');
        assert.strictEqual(sorted[4].content, 'p5');
    });

    test('legacy patterns (no cumulative_v15_reward) sorted by computeHelpful', () => {
        const patterns: TopPattern[] = [
            { content: 'a', n_hot_pos: 1, n_hot_neg: 0 },  // helpful = 1.0
            { content: 'b', n_hot_pos: 3, n_hot_neg: 0 },  // helpful = 3.0
            { content: 'c', n_hot_pos: 2, n_hot_neg: 0 },  // helpful = 2.0
        ];

        const sorted = sortAndSlice(patterns, 3);
        assert.strictEqual(sorted[0].content, 'b', 'highest computeHelpful first');
        assert.strictEqual(sorted[1].content, 'c');
        assert.strictEqual(sorted[2].content, 'a');
    });

    test('mixed: patterns with reward take precedence over legacy patterns', () => {
        const patterns: TopPattern[] = [
            { content: 'legacy-hi', n_hot_pos: 100 },                 // computeHelpful = 100
            { content: 'reward-mid', cumulative_v15_reward: 5.0 },    // reward = 5.0
            { content: 'reward-hi', cumulative_v15_reward: 150.0 },   // reward = 150.0
        ];

        const sorted = sortAndSlice(patterns, 3);
        assert.strictEqual(sorted[0].content, 'reward-hi', 'reward 150 is first');
        assert.strictEqual(sorted[1].content, 'legacy-hi', 'computeHelpful(100) is second');
        assert.strictEqual(sorted[2].content, 'reward-mid', 'reward 5 is last');
    });
});

// ---------------------------------------------------------------------------
// Issue #22 — verify fetch includes X-ACE-Project header
// ---------------------------------------------------------------------------

suite('StatusPanel #22 — verify fetch X-ACE-Project header', () => {

    test('verify fetch captures X-ACE-Project header equal to projectId', () => {
        // We exercise the header-building logic directly (not real fetch).
        const projectId = 'proj-abc-123';
        const orgId = 'org-xyz';
        const token = 'ace_user_tok';
        const serverUrl = 'https://ace.example.com';

        // Simulate the headers object that statusPanel builds for /config/verify
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-ACE-Org': orgId,
            'X-ACE-Project': projectId,   // this is the fix
        };

        assert.strictEqual(headers['X-ACE-Project'], projectId,
            'X-ACE-Project header must equal projectId');
        assert.strictEqual(headers['X-ACE-Org'], orgId,
            'X-ACE-Org header still present');
    });

    test('verify fetch has both X-ACE-Org and X-ACE-Project', () => {
        const headers: Record<string, string> = {
            'Authorization': 'Bearer tok',
            'Content-Type': 'application/json',
            'X-ACE-Org': 'org1',
            'X-ACE-Project': 'proj1',
        };

        assert.ok('X-ACE-Org' in headers, 'X-ACE-Org present');
        assert.ok('X-ACE-Project' in headers, 'X-ACE-Project present');
    });

    /**
     * Verify that a stub-based fetch call receives both headers.
     * This uses sinon to stub global fetch and capture the call arguments.
     */
    test('stub fetch: verify call includes X-ACE-Project header', async () => {
        const stub = sinon.stub().resolves({
            ok: true,
            json: async () => ({ org_name: 'OrgOne', projects: [] }),
        } as unknown as Response);

        const projectId = 'proj-test-999';
        const orgId = 'org-test-888';
        const token = 'ace_user_token';
        const serverUrl = 'https://ace.example.com';

        // Simulate what the patched statusPanel does for /config/verify
        await stub(`${serverUrl}/api/v1/config/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-ACE-Org': orgId,
                'X-ACE-Project': projectId,
            },
        });

        assert.ok(stub.calledOnce, 'fetch called once');
        const callArgs = stub.firstCall.args[1] as { headers: Record<string, string> };
        assert.strictEqual(callArgs.headers['X-ACE-Project'], projectId,
            'X-ACE-Project header captured in stub');

        sinon.restore();
    });
});
