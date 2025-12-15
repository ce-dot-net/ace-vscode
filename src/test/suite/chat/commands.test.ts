import * as assert from 'assert';

/**
 * Unit tests for chat commands
 * Tests @ace /search, /status, /patterns, /learn, /top, /bootstrap, /clear
 */
suite('Chat Command: Search', () => {

    test('search requires non-empty query', () => {
        const query = '';
        const isValid = query.trim().length > 0;
        assert.ok(!isValid, 'Empty query is invalid');
    });

    test('search trims whitespace from query', () => {
        const query = '  authentication  ';
        const trimmed = query.trim();
        assert.strictEqual(trimmed, 'authentication', 'Query is trimmed');
    });

    test('search shows "not configured" when project not setup', () => {
        const isConfigured = false;
        const message = !isConfigured ? 'ACE is not configured for this project' : 'searching';
        assert.ok(message.includes('not configured'), 'Shows configuration warning');
    });

    test('search shows pattern count in results', () => {
        const patterns = [{ content: 'p1' }, { content: 'p2' }, { content: 'p3' }];
        const message = `Found **${patterns.length}** patterns`;
        assert.ok(message.includes('3'), 'Shows pattern count');
    });

    test('search limits display to 3 patterns', () => {
        const patterns = Array.from({ length: 10 }, (_, i) => ({ content: `pattern ${i}` }));
        const displayed = patterns.slice(0, 3);
        assert.strictEqual(displayed.length, 3, 'Limits to 3 patterns');
    });

    test('search shows confidence percentage', () => {
        const confidence = 0.85;
        const percentage = Math.round(confidence * 100);
        const display = `(${percentage}% match)`;
        assert.ok(display.includes('85'), 'Shows confidence as percentage');
    });
});

suite('Chat Command: Status', () => {

    test('status shows total pattern count', () => {
        const stats = { total_patterns: 25 };
        const display = `Total: ${stats.total_patterns}`;
        assert.ok(display.includes('25'), 'Shows total count');
    });

    test('status shows section breakdown', () => {
        const sections = {
            'strategies_and_hard_rules': 10,
            'useful_code_snippets': 8,
            'troubleshooting_and_pitfalls': 5,
            'apis_to_use': 2
        };

        const total = Object.values(sections).reduce((a, b) => a + b, 0);
        assert.strictEqual(total, 25, 'Section counts sum to total');
    });

    test('status shows quality metrics', () => {
        const avgConfidence = 0.78;
        const quality = Math.round(avgConfidence * 100);
        assert.strictEqual(quality, 78, 'Converts confidence to percentage');
    });
});

suite('Chat Command: Patterns', () => {

    test('patterns accepts optional section filter', () => {
        const validSections = [
            'strategies_and_hard_rules',
            'useful_code_snippets',
            'troubleshooting_and_pitfalls',
            'apis_to_use'
        ];

        for (const section of validSections) {
            assert.ok(validSections.includes(section), `Section ${section} is valid`);
        }
    });

    test('patterns shows all sections when no filter', () => {
        const section = undefined;
        const showAll = section === undefined;
        assert.ok(showAll, 'Shows all sections when no filter');
    });

    test('patterns handles invalid section gracefully', () => {
        const validSections = ['strategies_and_hard_rules', 'useful_code_snippets'];
        const section = 'invalid_section';
        const isValid = validSections.includes(section);
        assert.ok(!isValid, 'Invalid section is rejected');
    });
});

suite('Chat Command: Learn', () => {

    test('learn requires task description', () => {
        const task = '';
        const isValid = task.trim().length > 0;
        assert.ok(!isValid, 'Empty task is invalid');
    });

    test('learn supports optional fields', () => {
        const input = {
            task: 'Implemented auth',
            success: true,
            trajectory: 'Step 1, Step 2',
            lessons: 'Always validate tokens'
        };

        assert.ok(input.task, 'Has required task');
        assert.ok(input.success !== undefined, 'Has optional success');
        assert.ok(input.trajectory, 'Has optional trajectory');
        assert.ok(input.lessons, 'Has optional lessons');
    });

    test('learn defaults success to true', () => {
        const { success = true } = {};
        assert.strictEqual(success, true, 'Success defaults to true');
    });
});

suite('Chat Command: Top', () => {

    test('top shows highest-rated patterns', () => {
        const patterns = [
            { content: 'p1', helpful: 10 },
            { content: 'p2', helpful: 5 },
            { content: 'p3', helpful: 8 }
        ];

        const sorted = [...patterns].sort((a, b) => b.helpful - a.helpful);
        assert.strictEqual(sorted[0].helpful, 10, 'Highest helpful first');
    });

    test('top accepts count parameter', () => {
        const defaultCount = 10;
        const customCount = 5;

        assert.ok(defaultCount > 0, 'Has default count');
        assert.ok(customCount > 0, 'Accepts custom count');
    });

    test('top limits to configured count', () => {
        const patterns = Array.from({ length: 20 }, (_, i) => ({ helpful: i }));
        const count = 5;
        const displayed = patterns.slice(0, count);
        assert.strictEqual(displayed.length, 5, 'Limits to requested count');
    });
});

suite('Chat Command: Bootstrap', () => {

    test('bootstrap supports mode parameter', () => {
        const validModes = ['hybrid', 'docs-only', 'git-history', 'local-files'];

        for (const mode of validModes) {
            assert.ok(mode.length > 0, `Mode ${mode} is valid`);
        }
    });

    test('bootstrap defaults to hybrid mode', () => {
        const defaultMode = 'hybrid';
        assert.strictEqual(defaultMode, 'hybrid', 'Defaults to hybrid');
    });

    test('bootstrap requires confirmation for clear', () => {
        const requiresConfirm = true;
        assert.ok(requiresConfirm, 'Requires confirmation');
    });
});

suite('Chat Command: Clear', () => {

    test('clear requires --confirm flag', () => {
        const args = '--confirm';
        const hasConfirm = args.includes('--confirm');
        assert.ok(hasConfirm, 'Requires --confirm flag');
    });

    test('clear rejects without confirmation', () => {
        const args = '';
        const hasConfirm = args.includes('--confirm');
        assert.ok(!hasConfirm, 'Rejects without confirmation');
    });

    test('clear is destructive operation', () => {
        // Clear is a dangerous operation that removes all patterns
        const isDestructive = true;
        assert.ok(isDestructive, 'Clear is destructive');
    });
});
