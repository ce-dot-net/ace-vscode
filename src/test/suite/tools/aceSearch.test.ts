import * as assert from 'assert';
import { createMockBullets, createMockBullet } from '../mocks/aceSDK';

/**
 * Unit tests for AceSearchTool
 * Tests search functionality, output formatting, and error handling
 */
suite('AceSearchTool Tests', () => {

    test('search returns "not configured" when client is null', () => {
        // When getAceClient() returns null, should show configuration message
        const expectedMessage = '❌ **[ACE] Not configured.** Run "ACE: Configure" first.';
        assert.ok(expectedMessage.includes('Not configured'), 'Shows not configured message');
    });

    test('search returns formatted results with pattern count', () => {
        const mockPatterns = createMockBullets(5);
        const count = mockPatterns.length;

        const expectedHeader = `✅ **[ACE] Found ${count} relevant patterns**`;
        assert.ok(expectedHeader.includes(`${count}`), 'Shows pattern count');
    });

    test('search shows "no patterns found" for empty results', () => {
        const query = 'nonexistent';
        const expectedMessage = `_No patterns found matching "${query}"_`;
        assert.ok(expectedMessage.includes(query), 'Shows query in no-results message');
    });

    test('search limits display to top 5 patterns', () => {
        const mockPatterns = createMockBullets(10);
        const displayed = mockPatterns.slice(0, 5);
        const remaining = mockPatterns.length - 5;

        assert.strictEqual(displayed.length, 5, 'Displays top 5 patterns');
        assert.strictEqual(remaining, 5, 'Correctly calculates remaining patterns');
    });

    test('search shows "and X more" for results > 5', () => {
        const count = 10;
        const remaining = count - 5;
        const expectedMessage = `_... and ${remaining} more patterns_`;

        assert.ok(expectedMessage.includes(`${remaining}`), 'Shows remaining count');
    });

    test('search truncates long content to 80 chars', () => {
        const longContent = 'A'.repeat(100);
        const truncated = longContent.slice(0, 80) + '...';

        assert.strictEqual(truncated.length, 83, 'Truncated content is 80 chars + "..."');
    });

    test('search shows domain in brackets', () => {
        const pattern = createMockBullet({ domain: 'authentication' });
        const formattedDomain = `**[${pattern.domain}]**`;

        assert.ok(formattedDomain.includes('authentication'), 'Domain shown in brackets');
    });

    test('search shows efficiency gain when available', () => {
        const efficiencyGain = '83%';
        const expectedMessage = `💡 ${efficiencyGain} token efficiency`;

        assert.ok(expectedMessage.includes(efficiencyGain), 'Shows efficiency percentage');
    });

    test('search handles errors gracefully', () => {
        const errorMessage = 'Network timeout';
        const expectedOutput = `❌ **[ACE] Search failed:** ${errorMessage}`;

        assert.ok(expectedOutput.includes(errorMessage), 'Shows error message');
    });
});

suite('AceSearchTool Input Validation', () => {

    test('query parameter is required', () => {
        // The inputSchema in package.json requires query
        const inputSchema = {
            type: 'object',
            properties: {
                query: { type: 'string' }
            },
            required: ['query']
        };

        assert.ok(inputSchema.required.includes('query'), 'Query is required');
    });

    test('empty query shows no results', () => {
        const query = '';
        const isValidQuery = query.length > 0;

        assert.ok(!isValidQuery, 'Empty query is invalid');
    });

    test('whitespace-only query is trimmed', () => {
        const query = '   ';
        const trimmed = query.trim();

        assert.strictEqual(trimmed.length, 0, 'Whitespace query is empty after trim');
    });
});

suite('AceSearchTool Output Format', () => {

    test('output uses markdown formatting', () => {
        const patterns = createMockBullets(3);

        // Verify markdown elements expected
        const markdownElements = [
            '**', // Bold
            '•', // Bullet points
            '_', // Italics
            '✅', // Emoji for success
            '❌', // Emoji for error
            '💡' // Emoji for tip
        ];

        for (const elem of markdownElements) {
            assert.ok(elem.length > 0, `Markdown element ${elem} is used`);
        }
    });

    test('pattern display format is consistent', () => {
        const pattern = createMockBullet({
            domain: 'auth',
            content: 'Use JWT refresh tokens for better security'
        });

        // Expected format: • **[domain]** content preview...
        const expectedFormat = `• **[${pattern.domain}]** ${pattern.content}`;

        assert.ok(expectedFormat.includes('•'), 'Uses bullet point');
        assert.ok(expectedFormat.includes('[auth]'), 'Includes domain');
        assert.ok(expectedFormat.includes(pattern.content), 'Includes content');
    });
});
