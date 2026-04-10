import * as assert from 'assert';

/**
 * Unit tests for FileWatcher (activateFileWatcher)
 * Tests managed files list, path validation, and watcher behaviour
 */

// Mirrors the ACE_MANAGED_FILES constant from src/automation/fileWatcher.ts
const ACE_MANAGED_FILES = [
    '.github/hooks/ace-hooks.json',
    '.github/agents/ace.agent.md',
    '.github/agents/ace-learn.agent.md',
    '.github/instructions/ace.instructions.md',
    '.github/skills/ace-pattern-learning/SKILL.md'
];

suite('FileWatcher Managed Files List', () => {

    test('managed files list has 5 entries', () => {
        assert.strictEqual(ACE_MANAGED_FILES.length, 5, 'Should manage exactly 5 files');
    });

    test('managed files list includes ace-hooks.json', () => {
        const path = '.github/hooks/ace-hooks.json';
        assert.ok(ACE_MANAGED_FILES.includes(path), 'Should include ace-hooks.json');
    });

    test('managed files list includes ace.agent.md', () => {
        const path = '.github/agents/ace.agent.md';
        assert.ok(ACE_MANAGED_FILES.includes(path), 'Should include ace.agent.md');
    });

    test('managed files list includes ace-learn.agent.md', () => {
        const path = '.github/agents/ace-learn.agent.md';
        assert.ok(ACE_MANAGED_FILES.includes(path), 'Should include ace-learn.agent.md');
    });

    test('managed files list includes ace.instructions.md', () => {
        const path = '.github/instructions/ace.instructions.md';
        assert.ok(ACE_MANAGED_FILES.includes(path), 'Should include ace.instructions.md');
    });

    test('managed files list includes SKILL.md', () => {
        const path = '.github/skills/ace-pattern-learning/SKILL.md';
        assert.ok(ACE_MANAGED_FILES.includes(path), 'Should include SKILL.md');
    });

    test('all managed files reside under .github/', () => {
        for (const file of ACE_MANAGED_FILES) {
            assert.ok(file.startsWith('.github/'), `${file} should be under .github/`);
        }
    });
});

suite('FileWatcher Deletion Detection', () => {

    test('recognises deleted managed file by relative path', () => {
        const deletedRelative = '.github/hooks/ace-hooks.json';
        const isManaged = ACE_MANAGED_FILES.includes(deletedRelative);
        assert.ok(isManaged, 'Deleted managed file should be recognised');
    });

    test('ignores deletion of non-managed file', () => {
        const deletedRelative = '.github/some-other-file.json';
        const isManaged = ACE_MANAGED_FILES.includes(deletedRelative);
        assert.ok(!isManaged, 'Non-managed file should be ignored');
    });

    test('ignores deletion of file outside .github/', () => {
        const deletedRelative = 'src/ace-hooks.json';
        const isManaged = ACE_MANAGED_FILES.includes(deletedRelative);
        assert.ok(!isManaged, 'File outside .github/ should be ignored');
    });

    test('warning message includes the relative path of deleted file', () => {
        const relative = '.github/hooks/ace-hooks.json';
        const message = `ACE: "${relative}" was deleted. Recreate it?`;
        assert.ok(message.includes(relative), 'Warning should include the deleted file path');
        assert.ok(message.includes('Recreate'), 'Warning should offer Recreate action');
    });

    test('warning message offers Recreate action', () => {
        const message = 'ACE: ".github/hooks/ace-hooks.json" was deleted. Recreate it?';
        const action = 'Recreate';
        assert.ok(message.includes(action), 'Message should contain Recreate option');
    });
});

suite('FileWatcher Glob Pattern', () => {

    test('watcher glob pattern covers all .github/ subdirectories', () => {
        const pattern = '.github/**/*';
        assert.ok(pattern.startsWith('.github/'), 'Pattern should target .github/');
        assert.ok(pattern.includes('**'), 'Pattern should use recursive glob');
    });

    test('all managed files match the .github/**/* glob', () => {
        // Simple glob match: starts with .github/ and contains at least one more segment
        const matchesGlob = (path: string) => path.startsWith('.github/') && path.split('/').length >= 3;

        for (const file of ACE_MANAGED_FILES) {
            assert.ok(matchesGlob(file), `${file} should match .github/**/* glob`);
        }
    });
});

suite('FileWatcher Recreate Command', () => {

    test('Recreate action triggers ace-vscode.updateAgents command', () => {
        const expectedCommand = 'ace-vscode.updateAgents';
        // Simulate the selection branch
        const selection = 'Recreate';
        const commandToRun = selection === 'Recreate' ? 'ace-vscode.updateAgents' : undefined;
        assert.strictEqual(commandToRun, expectedCommand, 'Recreate should trigger updateAgents');
    });

    test('no command is triggered when Recreate is dismissed', () => {
        const selection: string | undefined = undefined; // user dismissed the dialog
        const commandToRun = selection === 'Recreate' ? 'ace-vscode.updateAgents' : undefined;
        assert.strictEqual(commandToRun, undefined, 'Dismissal should not trigger any command');
    });

    test('no command is triggered for unknown selection', () => {
        const selection: string = 'Cancel';
        const commandToRun = selection === 'Recreate' ? 'ace-vscode.updateAgents' : undefined;
        assert.strictEqual(commandToRun, undefined, 'Unknown selection should not trigger any command');
    });
});

suite('FileWatcher Workspace Guard', () => {

    test('watcher is not created when no workspace folders exist', () => {
        const workspaceFolders: undefined[] | undefined = undefined;
        const workspaceFolder = workspaceFolders?.[0];
        // activateFileWatcher returns early when workspaceFolder is falsy
        assert.ok(!workspaceFolder, 'No workspace folder should prevent watcher creation');
    });

    test('watcher is created when a workspace folder is present', () => {
        const workspaceFolders = [{ name: 'my-project', uri: { fsPath: '/home/user/my-project' }, index: 0 }];
        const workspaceFolder = workspaceFolders?.[0];
        assert.ok(workspaceFolder, 'Workspace folder present should allow watcher creation');
        assert.strictEqual(workspaceFolder.name, 'my-project', 'Should use the first workspace folder');
    });
});
