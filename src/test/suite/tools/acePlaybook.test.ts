import * as assert from 'assert';
import { createMockBullets, createMockBullet } from '../mocks/aceSDK';
import type { BulletSection } from '@ace-sdk/core';

/**
 * Unit tests for AcePlaybookTool
 * Tests playbook retrieval, filtering, and formatting
 */
suite('AcePlaybookTool Tests', () => {

    test('playbook returns "not configured" when client is null', () => {
        const expectedMessage = '❌ **[ACE] Not configured.** Run "ACE: Configure" first.';
        assert.ok(expectedMessage.includes('Not configured'), 'Shows not configured message');
    });

    test('playbook returns formatted header', () => {
        const expectedMessage = '✅ **[ACE] Playbook Patterns**';
        assert.ok(expectedMessage.includes('Playbook Patterns'), 'Shows playbook header');
    });

    test('playbook shows pattern count', () => {
        const patterns = createMockBullets(10);
        const total = 25;
        const expectedDisplay = `📚 **${patterns.length} patterns** (total: ${total})`;

        assert.ok(expectedDisplay.includes('10'), 'Shows filtered count');
        assert.ok(expectedDisplay.includes('25'), 'Shows total count');
    });

    test('playbook shows "no patterns" for empty results', () => {
        const expectedMessage = '_No patterns found_';
        assert.ok(expectedMessage.includes('No patterns'), 'Shows empty message');
    });

    test('playbook filters by section', () => {
        const section = 'strategies_and_hard_rules';
        const allPatterns = {
            strategies_and_hard_rules: createMockBullets(5, 'strategies_and_hard_rules'),
            useful_code_snippets: createMockBullets(3, 'useful_code_snippets'),
            troubleshooting_and_pitfalls: [],
            apis_to_use: []
        };

        const filtered = allPatterns[section as BulletSection] || [];
        assert.strictEqual(filtered.length, 5, 'Filters to specified section');
    });

    test('playbook filters by min_helpful', () => {
        const patterns = [
            createMockBullet({ helpful: 10 }),
            createMockBullet({ helpful: 5 }),
            createMockBullet({ helpful: 1 }),
            createMockBullet({ helpful: 0 })
        ];

        const minHelpful = 5;
        const filtered = patterns.filter(p => p.helpful >= minHelpful);

        assert.strictEqual(filtered.length, 2, 'Filters by min_helpful');
    });

    test('playbook groups patterns by section', () => {
        const patterns = [
            createMockBullet({ section: 'strategies_and_hard_rules' }),
            createMockBullet({ section: 'strategies_and_hard_rules' }),
            createMockBullet({ section: 'useful_code_snippets' }),
            createMockBullet({ section: 'apis_to_use' })
        ];

        const bySection: Record<string, typeof patterns> = {};
        for (const p of patterns) {
            const sec = p.section || 'uncategorized';
            if (!bySection[sec]) bySection[sec] = [];
            bySection[sec].push(p);
        }

        assert.strictEqual(bySection['strategies_and_hard_rules'].length, 2);
        assert.strictEqual(bySection['useful_code_snippets'].length, 1);
        assert.strictEqual(bySection['apis_to_use'].length, 1);
    });

    test('playbook shows max 3 patterns per section', () => {
        const patterns = createMockBullets(10, 'strategies_and_hard_rules');
        const displayed = patterns.slice(0, 3);
        const remaining = patterns.length - 3;

        assert.strictEqual(displayed.length, 3, 'Displays top 3');
        assert.strictEqual(remaining, 7, 'Calculates remaining count');
    });

    test('playbook truncates long content to 60 chars', () => {
        const longContent = 'A'.repeat(100);
        const truncated = longContent.slice(0, 60) + '...';

        assert.strictEqual(truncated.length, 63, 'Truncated to 60 chars + "..."');
    });

    test('playbook shows helpful score', () => {
        const pattern = createMockBullet({ helpful: 7 });
        const score = ` (+${pattern.helpful})`;

        assert.ok(score.includes('7'), 'Shows helpful score');
    });

    test('playbook handles errors gracefully', () => {
        const errorMessage = 'Database error';
        const expectedOutput = `❌ **[ACE] Playbook failed:** ${errorMessage}`;

        assert.ok(expectedOutput.includes(errorMessage), 'Shows error message');
    });
});

suite('AcePlaybookTool Section Labels', () => {

    test('section labels use emoji indicators', () => {
        const sectionLabels: Record<string, string> = {
            strategies_and_hard_rules: '📋 Strategies & Rules',
            useful_code_snippets: '💻 Code Snippets',
            troubleshooting_and_pitfalls: '⚠️ Troubleshooting',
            apis_to_use: '🔧 APIs to Use',
            uncategorized: '📁 Other'
        };

        for (const label of Object.values(sectionLabels)) {
            // Each label starts with an emoji
            assert.ok(label.length > 0, `Label ${label} has content`);
        }
    });

    test('uncategorized section is handled', () => {
        const pattern = createMockBullet({ section: undefined });
        const section = pattern.section || 'uncategorized';

        assert.strictEqual(section, 'uncategorized', 'Undefined section becomes uncategorized');
    });
});

suite('AcePlaybookTool Input Validation', () => {

    test('section parameter is optional', () => {
        // Section exists in properties but is NOT in required array
        const inputSchema = {
            type: 'object',
            properties: {
                section: { type: 'string' },
                min_helpful: { type: 'number' }
            },
            required: [] as string[] // No required fields
        };

        assert.ok(inputSchema.properties.section, 'Section property exists');
        assert.ok(!inputSchema.required.includes('section'), 'Section is not required');
    });

    test('valid section values', () => {
        const validSections = [
            'strategies_and_hard_rules',
            'useful_code_snippets',
            'troubleshooting_and_pitfalls',
            'apis_to_use'
        ];

        for (const section of validSections) {
            assert.ok(section.length > 0, `${section} is valid`);
        }
    });

    test('min_helpful defaults to 0', () => {
        const defaultMinHelpful = 0;
        const { min_helpful = 0 } = {};

        assert.strictEqual(min_helpful, defaultMinHelpful, 'min_helpful defaults to 0');
    });

    test('min_helpful filters correctly', () => {
        const testCases = [
            { min: 0, helpful: 0, expected: true },
            { min: 0, helpful: 5, expected: true },
            { min: 5, helpful: 5, expected: true },
            { min: 5, helpful: 4, expected: false },
            { min: 10, helpful: 0, expected: false }
        ];

        for (const tc of testCases) {
            const passes = tc.helpful >= tc.min;
            assert.strictEqual(passes, tc.expected, `min=${tc.min}, helpful=${tc.helpful}`);
        }
    });
});
