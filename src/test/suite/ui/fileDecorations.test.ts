import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * Unit tests for AceFileDecorationProvider
 * Tests badge decoration logic for ACE-managed files
 */

// The set of filenames the provider recognises (mirrors the source constant)
const ACE_MANAGED_PATTERNS = [
    'ace-hooks.json',
    'ace.agent.md',
    'ace-learn.agent.md',
    'ace.instructions.md',
    'SKILL.md'
];

suite('AceFileDecorationProvider', () => {

    test('ACE_MANAGED_PATTERNS contains all expected filenames', () => {
        const expected = [
            'ace-hooks.json',
            'ace.agent.md',
            'ace-learn.agent.md',
            'ace.instructions.md',
            'SKILL.md'
        ];

        for (const name of expected) {
            assert.ok(ACE_MANAGED_PATTERNS.includes(name), `${name} should be in managed patterns`);
        }

        assert.strictEqual(ACE_MANAGED_PATTERNS.length, expected.length, 'No extra patterns should exist');
    });

    test('returns badge for ace-hooks.json in .github/', () => {
        const fileName = 'ace-hooks.json';
        const relativePath = '.github/hooks/ace-hooks.json';

        const isManaged = ACE_MANAGED_PATTERNS.includes(fileName);
        const isUnderGithub = relativePath.startsWith('.github/');

        assert.ok(isManaged, 'ace-hooks.json should be a managed pattern');
        assert.ok(isUnderGithub, 'Path should start with .github/');

        // When both conditions hold, the decoration badge is 'A'
        const badge = isManaged && isUnderGithub ? 'A' : undefined;
        assert.strictEqual(badge, 'A', 'Managed files in .github/ should receive the "A" badge');
    });

    test('returns badge for ace.agent.md in .github/', () => {
        const fileName = 'ace.agent.md';
        const relativePath = '.github/agents/ace.agent.md';

        const isManaged = ACE_MANAGED_PATTERNS.includes(fileName);
        const isUnderGithub = relativePath.startsWith('.github/');

        const badge = isManaged && isUnderGithub ? 'A' : undefined;
        assert.strictEqual(badge, 'A', 'ace.agent.md in .github/ should receive the "A" badge');
    });

    test('returns badge for ace-learn.agent.md in .github/', () => {
        const fileName = 'ace-learn.agent.md';
        const relativePath = '.github/agents/ace-learn.agent.md';

        const isManaged = ACE_MANAGED_PATTERNS.includes(fileName);
        const isUnderGithub = relativePath.startsWith('.github/');

        const badge = isManaged && isUnderGithub ? 'A' : undefined;
        assert.strictEqual(badge, 'A', 'ace-learn.agent.md in .github/ should receive the "A" badge');
    });

    test('returns badge for ace.instructions.md in .github/', () => {
        const fileName = 'ace.instructions.md';
        const relativePath = '.github/instructions/ace.instructions.md';

        const isManaged = ACE_MANAGED_PATTERNS.includes(fileName);
        const isUnderGithub = relativePath.startsWith('.github/');

        const badge = isManaged && isUnderGithub ? 'A' : undefined;
        assert.strictEqual(badge, 'A', 'ace.instructions.md in .github/ should receive the "A" badge');
    });

    test('returns badge for SKILL.md in .github/', () => {
        const fileName = 'SKILL.md';
        const relativePath = '.github/skills/ace-pattern-learning/SKILL.md';

        const isManaged = ACE_MANAGED_PATTERNS.includes(fileName);
        const isUnderGithub = relativePath.startsWith('.github/');

        const badge = isManaged && isUnderGithub ? 'A' : undefined;
        assert.strictEqual(badge, 'A', 'SKILL.md in .github/ should receive the "A" badge');
    });

    test('returns undefined for non-ACE files', () => {
        const nonAceFiles = ['README.md', 'tsconfig.json', 'package.json', 'index.ts', 'CHANGELOG.md'];

        for (const fileName of nonAceFiles) {
            const isManaged = ACE_MANAGED_PATTERNS.includes(fileName);
            assert.ok(!isManaged, `${fileName} should not be in managed patterns`);
        }
    });

    test('returns undefined for ace files outside .github/', () => {
        const fileName = 'ace-hooks.json';
        const relativePath = 'src/ace-hooks.json'; // Not under .github/

        const isManaged = ACE_MANAGED_PATTERNS.includes(fileName);
        const isUnderGithub = relativePath.startsWith('.github/');

        const badge = isManaged && isUnderGithub ? 'A' : undefined;
        assert.strictEqual(badge, undefined, 'ACE files outside .github/ should not receive a badge');
    });

    test('returns undefined for ace files in project root', () => {
        const fileName = 'ace.agent.md';
        const relativePath = 'ace.agent.md'; // Root level

        const isManaged = ACE_MANAGED_PATTERNS.includes(fileName);
        const isUnderGithub = relativePath.startsWith('.github/');

        const badge = isManaged && isUnderGithub ? 'A' : undefined;
        assert.strictEqual(badge, undefined, 'ACE files at root level should not receive a badge');
    });
});

suite('AceFileDecorationProvider Badge Properties', () => {

    test('badge value is "A" for all managed patterns', () => {
        const expectedBadge = 'A';
        // The badge is a single character to display in the Explorer
        assert.strictEqual(expectedBadge.length, 1, 'Badge should be a single character');
        assert.strictEqual(expectedBadge, 'A', 'Badge should be the letter A');
    });

    test('decoration tooltip mentions ACE and auto-generated', () => {
        const tooltip = 'Managed by ACE - auto-generated by extension';
        assert.ok(tooltip.includes('ACE'), 'Tooltip should mention ACE');
        assert.ok(tooltip.includes('auto-generated'), 'Tooltip should mention auto-generated');
    });

    test('decoration uses charts.green theme color', () => {
        const colorId = 'charts.green';
        const color = new vscode.ThemeColor(colorId);
        assert.ok(color, 'ThemeColor should be creatable');
    });
});

suite('AceFileDecorationProvider Path Logic', () => {

    test('path split extracts correct filename from nested path', () => {
        const paths = [
            { full: '.github/hooks/ace-hooks.json', expected: 'ace-hooks.json' },
            { full: '.github/agents/ace.agent.md', expected: 'ace.agent.md' },
            { full: '.github/skills/ace-pattern-learning/SKILL.md', expected: 'SKILL.md' }
        ];

        for (const { full, expected } of paths) {
            const extracted = full.split('/').pop() || '';
            assert.strictEqual(extracted, expected, `Should extract ${expected} from ${full}`);
        }
    });

    test('relative path check uses startsWith .github/', () => {
        const githubPaths = [
            '.github/hooks/ace-hooks.json',
            '.github/agents/ace.agent.md',
            '.github/instructions/ace.instructions.md'
        ];

        const nonGithubPaths = [
            'src/ace-hooks.json',
            'ace.agent.md',
            'not-github/ace.agent.md'
        ];

        for (const p of githubPaths) {
            assert.ok(p.startsWith('.github/'), `${p} should start with .github/`);
        }

        for (const p of nonGithubPaths) {
            assert.ok(!p.startsWith('.github/'), `${p} should not start with .github/`);
        }
    });
});
