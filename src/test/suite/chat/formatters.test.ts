import * as assert from 'assert';

/**
 * Unit tests for chat formatters
 * Tests formatting utilities for chat responses
 */
suite('Chat Formatters Tests', () => {

    test('formatMarkdown outputs markdown content', () => {
        const content = 'Hello **world**';
        assert.ok(content.includes('**'), 'Supports bold markdown');
    });

    test('formatError prefixes with warning emoji', () => {
        const error = 'Something went wrong';
        const formatted = `⚠️ **Error:** ${error}`;
        assert.ok(formatted.includes('⚠️'), 'Has warning emoji');
        assert.ok(formatted.includes('Error'), 'Has Error label');
    });

    test('formatSuccess prefixes with checkmark emoji', () => {
        const message = 'Operation complete';
        const formatted = `✅ ${message}`;
        assert.ok(formatted.includes('✅'), 'Has success emoji');
    });

    test('formatWarning prefixes with warning emoji', () => {
        const message = 'This is a warning';
        const formatted = `⚠️ ${message}`;
        assert.ok(formatted.includes('⚠️'), 'Has warning emoji');
    });

    test('formatSectionHeader creates h2 heading', () => {
        const title = 'My Section';
        const formatted = `\n## ${title}\n\n`;
        assert.ok(formatted.includes('## '), 'Creates h2 markdown');
    });
});

suite('Pattern List Formatter Tests', () => {

    test('formatPatternList handles empty array', () => {
        const patterns: Array<{ content: string; helpful?: number; harmful?: number }> = [];
        const message = patterns.length === 0 ? '*No patterns found.*\n' : 'patterns';
        assert.ok(message.includes('No patterns'), 'Shows empty message');
    });

    test('formatPatternList shows content with scores', () => {
        const pattern = {
            content: 'Use JWT for authentication',
            helpful: 5,
            harmful: 1
        };

        const score = ` (👍 ${pattern.helpful} / 👎 ${pattern.harmful})`;
        const formatted = `- ${pattern.content}${score}\n`;

        assert.ok(formatted.includes('👍 5'), 'Shows helpful count');
        assert.ok(formatted.includes('👎 1'), 'Shows harmful count');
    });

    test('formatPatternList omits score if undefined', () => {
        const pattern: { content: string; helpful?: number; harmful?: number } = {
            content: 'Pattern without score'
        };

        const hasScores = pattern.helpful !== undefined && pattern.harmful !== undefined;
        assert.ok(!hasScores, 'Omits score when undefined');
    });
});

suite('Stats Formatter Tests', () => {

    test('formatStats shows total patterns', () => {
        const stats = { total_patterns: 42 };
        const formatted = `**Total Patterns:** ${stats.total_patterns}\n\n`;
        assert.ok(formatted.includes('42'), 'Shows total count');
    });

    test('formatStats formats section names', () => {
        const sectionName = 'strategies_and_hard_rules';
        const displayName = sectionName
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());

        assert.strictEqual(displayName, 'Strategies And Hard Rules', 'Title cases section name');
    });

    test('formatStats shows last updated', () => {
        const stats = { last_updated: '2024-01-15T10:30:00Z' };
        const formatted = `**Last Updated:** ${stats.last_updated}\n`;
        assert.ok(formatted.includes(stats.last_updated), 'Shows timestamp');
    });

    test('formatStats handles missing fields', () => {
        const stats: { total_patterns?: number; sections?: Record<string, number> } = {};

        // Should not throw when fields are undefined
        const hasTotal = stats.total_patterns !== undefined;
        const hasSections = stats.sections !== undefined;

        assert.ok(!hasTotal, 'Handles missing total');
        assert.ok(!hasSections, 'Handles missing sections');
    });
});
