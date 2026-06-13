import * as assert from 'assert';
import { renderQualityMetricsHtml, QualityMetricsInput } from '../../../ui/statusPanel';

/**
 * REAL tests for the exported renderQualityMetricsHtml() (Issue #19).
 * Calls the actual production function (extracted from StatusPanel._getStatusHtml)
 * rather than a simulated re-implementation, so it fails if the reward-vocabulary
 * rendering or the at-risk/cold-project semantics regress.
 */
function base(overrides: Partial<QualityMetricsInput> = {}): QualityMetricsInput {
    return { helpful_total: 0, harmful_total: 0, ...overrides };
}

suite('renderQualityMetricsHtml — reward vocabulary (#19)', () => {

    test('reward > 0: shows Cumulative Reward + tier bar, no at-risk, no legacy Trust Score', () => {
        const html = renderQualityMetricsHtml(base({
            patterns_with_v15_reward: 5,
            cumulative_reward_total: 3.5,
            hot_total: 2, warm_total: 1, cold_total: 0,
            at_risk_count: 0,
            helpful_total: 10, harmful_total: 2
        }));
        assert.ok(html.includes('Cumulative Reward'), 'shows Cumulative Reward');
        assert.ok(html.includes('3.50'), 'reward formatted to 2 decimals');
        assert.ok(html.includes('Tier Distribution') && html.includes('🔥 2'), 'shows tier bar');
        assert.ok(!html.includes('Trust Score'), 'legacy Trust Score hidden when reward data present');
        assert.ok(!html.includes('At-Risk'), 'no at-risk badge when reward >= 0');
    });

    test('reward < 0 with at_risk_count > 0: shows at-risk badge', () => {
        const html = renderQualityMetricsHtml(base({
            patterns_with_v15_reward: 5,
            cumulative_reward_total: -2.5,
            at_risk_count: 3
        }));
        assert.ok(html.includes('At-Risk Patterns'), 'shows at-risk label');
        assert.ok(html.includes('at-risk-badge') && html.includes('>3<'), 'shows at-risk count');
        assert.ok(html.includes('-2.50'), 'negative reward shown');
    });

    test('cold project (reward 0, at_risk 0): ranking-signal note, NOT a bare 0.00 or at-risk', () => {
        const html = renderQualityMetricsHtml(base({
            patterns_with_v15_reward: 4,
            cumulative_reward_total: 0,
            at_risk_count: 0
        }));
        assert.ok(html.includes('Ranking Signal'), 'shows ranking-signal note');
        assert.ok(html.includes('No credited traces yet'), 'explains cold project');
        assert.ok(!html.includes('Cumulative Reward'), 'does not show a bare reward value');
        assert.ok(!html.includes('At-Risk'), 'no at-risk for uncredited project');
    });

    test('reward == 0 is NEVER at-risk even if at_risk_count > 0 (semantics gate)', () => {
        const html = renderQualityMetricsHtml(base({
            patterns_with_v15_reward: 4,
            cumulative_reward_total: 0,
            at_risk_count: 5 // server inconsistency: must NOT badge because reward is not < 0
        }));
        assert.ok(html.includes('Cumulative Reward') && html.includes('0.00'), 'shows reward 0.00 (not cold branch)');
        assert.ok(!html.includes('At-Risk'), 'reward == 0 must not be badged as at-risk');
    });

    test('no v15 reward data: legacy helpful/harmful + Trust Score fallback', () => {
        const html = renderQualityMetricsHtml(base({
            patterns_with_v15_reward: 0,
            helpful_total: 8, harmful_total: 2
        }));
        assert.ok(html.includes('Trust Score'), 'legacy Trust Score shown');
        assert.ok(html.includes('80%'), 'trust score = 8/(8+2) = 80%');
        assert.ok(html.includes('👍 Helpful') && html.includes('👎 Harmful'), 'legacy helpful/harmful shown');
        assert.ok(!html.includes('Cumulative Reward') && !html.includes('Tier Distribution'), 'no reward vocab');
    });

    test('patterns_with_v15_reward undefined: legacy fallback with 100% trust on empty', () => {
        const html = renderQualityMetricsHtml(base({ helpful_total: 0, harmful_total: 0 }));
        assert.ok(html.includes('Trust Score') && html.includes('100%'), 'defaults to 100% trust when no data');
    });
});
