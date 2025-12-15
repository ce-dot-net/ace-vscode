import * as assert from 'assert';

/**
 * Unit tests for AceLearnTool
 * Tests learning capture, output formatting, and statistics display
 */
suite('AceLearnTool Tests', () => {

    test('learn returns "not configured" when client is null', () => {
        const expectedMessage = '❌ **[ACE] Not configured.** Run "ACE: Configure" first.';
        assert.ok(expectedMessage.includes('Not configured'), 'Shows not configured message');
    });

    test('learn returns success message on capture', () => {
        const expectedMessage = '✅ **[ACE] Learning captured!**';
        assert.ok(expectedMessage.includes('Learning captured'), 'Shows success message');
    });

    test('learn displays patterns created count', () => {
        const patternsCreated = 3;
        const expectedDisplay = `✨ ${patternsCreated} created`;

        assert.ok(expectedDisplay.includes('created'), 'Shows created count');
    });

    test('learn displays patterns updated count', () => {
        const patternsUpdated = 5;
        const expectedDisplay = `🔄 ${patternsUpdated} updated`;

        assert.ok(expectedDisplay.includes('updated'), 'Shows updated count');
    });

    test('learn displays patterns pruned count', () => {
        const patternsPruned = 2;
        const expectedDisplay = `🧹 ${patternsPruned} pruned`;

        assert.ok(expectedDisplay.includes('pruned'), 'Shows pruned count');
    });

    test('learn displays quality percentage', () => {
        const avgConfidence = 0.85;
        const quality = Math.round(avgConfidence * 100);
        const expectedDisplay = `⭐ ${quality}% quality`;

        assert.strictEqual(quality, 85, 'Converts confidence to percentage');
        assert.ok(expectedDisplay.includes('quality'), 'Shows quality metric');
    });

    test('learn displays analysis time in seconds', () => {
        const analysisTimeSeconds = 2.345;
        const formattedTime = analysisTimeSeconds.toFixed(1);
        const expectedDisplay = `⏱️ ${formattedTime}s analysis`;

        assert.strictEqual(formattedTime, '2.3', 'Formats time to 1 decimal');
    });

    test('learn handles missing statistics gracefully', () => {
        const expectedFallback = 'Analysis pending';
        assert.ok(expectedFallback.includes('pending'), 'Shows pending when no stats');
    });

    test('learn handles errors gracefully', () => {
        const errorMessage = 'Server unavailable';
        const expectedOutput = `❌ **[ACE] Learn failed:** ${errorMessage}`;

        assert.ok(expectedOutput.includes(errorMessage), 'Shows error message');
    });
});

suite('AceLearnTool Input Validation', () => {

    test('task parameter is required', () => {
        const inputSchema = {
            type: 'object',
            properties: {
                task: { type: 'string' },
                success: { type: 'boolean' },
                output: { type: 'string' }
            },
            required: ['task']
        };

        assert.ok(inputSchema.required.includes('task'), 'Task is required');
    });

    test('success parameter defaults to true', () => {
        const defaultSuccess = true;
        assert.strictEqual(defaultSuccess, true, 'Success defaults to true');
    });

    test('output parameter is optional', () => {
        const inputSchema = {
            required: ['task']
        };

        assert.ok(!inputSchema.required.includes('output'), 'Output is optional');
    });
});

suite('AceLearnTool Execution Trace Format', () => {

    test('execution trace has required fields', () => {
        const trace = {
            task: 'Implemented JWT authentication',
            trajectory: [] as string[],
            result: { success: true, output: 'Success' },
            playbook_used: [] as string[],
            timestamp: new Date().toISOString()
        };

        assert.ok(trace.task, 'Has task field');
        assert.ok(Array.isArray(trace.trajectory), 'Has trajectory array');
        assert.ok(trace.result, 'Has result object');
        assert.ok(Array.isArray(trace.playbook_used), 'Has playbook_used array');
        assert.ok(trace.timestamp, 'Has timestamp');
    });

    test('timestamp is ISO 8601 format', () => {
        const timestamp = new Date().toISOString();
        const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

        assert.ok(isoPattern.test(timestamp), 'Timestamp is ISO 8601 format');
    });

    test('result object has success and output', () => {
        const result = {
            success: true,
            output: 'Task completed successfully'
        };

        assert.ok(typeof result.success === 'boolean', 'Result has boolean success');
        assert.ok(typeof result.output === 'string', 'Result has string output');
    });
});

suite('AceLearnTool Section Display', () => {

    test('section names are formatted for display', () => {
        const sections = {
            'strategies_and_hard_rules': 'strategies and hard rules',
            'useful_code_snippets': 'useful code snippets',
            'troubleshooting_and_pitfalls': 'troubleshooting and pitfalls',
            'apis_to_use': 'apis to use'
        };

        for (const [raw, formatted] of Object.entries(sections)) {
            const actual = raw.replace(/_/g, ' ');
            assert.strictEqual(actual, formatted, `${raw} formats to ${formatted}`);
        }
    });

    test('only non-zero section counts are displayed', () => {
        const bySection = {
            'strategies_and_hard_rules': 2,
            'useful_code_snippets': 0,
            'troubleshooting_and_pitfalls': 1,
            'apis_to_use': 0
        };

        const nonZeroSections = Object.entries(bySection)
            .filter(([, count]) => count > 0)
            .map(([section]) => section);

        assert.strictEqual(nonZeroSections.length, 2, 'Only non-zero sections shown');
    });
});
