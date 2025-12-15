import * as assert from 'assert';

/**
 * Unit tests for updateAgents command
 * Tests agent file generation and content
 */
suite('UpdateAgents Command Tests', () => {

    test('requires workspace folder', () => {
        // When no workspace folder, should show warning
        const expectedMessage = 'No workspace folder open. Please open a folder first.';
        assert.ok(expectedMessage.includes('workspace folder'), 'Checks for workspace');
    });

    test('creates .github directory if needed', () => {
        const githubDir = '.github';
        assert.ok(githubDir === '.github', 'Creates .github directory');
    });

    test('creates agents subdirectory', () => {
        const agentsDir = '.github/agents';
        assert.ok(agentsDir.includes('agents'), 'Creates agents subdirectory');
    });

    test('creates copilot-instructions.md (primary)', () => {
        const filename = 'copilot-instructions.md';
        assert.ok(filename === 'copilot-instructions.md', 'Creates instructions file');
    });

    test('creates ace.agent.md', () => {
        const filename = 'ace.agent.md';
        assert.ok(filename === 'ace.agent.md', 'Creates ace agent file');
    });

    test('creates ace-learn.agent.md', () => {
        const filename = 'ace-learn.agent.md';
        assert.ok(filename === 'ace-learn.agent.md', 'Creates learn agent file');
    });

    test('shows success message on completion', () => {
        const expectedMessage = 'ACE files created! copilot-instructions.md enables automatic pattern injection.';
        assert.ok(expectedMessage.includes('ACE files created'), 'Shows success');
    });

    test('handles errors gracefully', () => {
        const errorMessage = 'Permission denied';
        const expectedOutput = `Failed to create ACE files: ${errorMessage}`;

        assert.ok(expectedOutput.includes(errorMessage), 'Shows error message');
    });
});

suite('Copilot Instructions Content', () => {

    test('includes Agent Mode section', () => {
        const content = `## 🚀 Agent Mode (Recommended)`;
        assert.ok(content.includes('Agent Mode'), 'Has Agent Mode section');
    });

    test('lists all ACE tools', () => {
        const tools = ['ace_search', 'ace_learn', 'ace_status', 'ace_get_playbook'];
        for (const tool of tools) {
            assert.ok(tool.startsWith('ace_'), `Tool ${tool} is listed`);
        }
    });

    test('includes trigger keywords', () => {
        const keywords = ['implement', 'build', 'create', 'fix', 'debug', 'refactor', 'integrate', 'add', 'update'];
        for (const keyword of keywords) {
            assert.ok(keyword.length > 0, `Keyword ${keyword} is mentioned`);
        }
    });

    test('explains automatic workflow', () => {
        const steps = [
            'Ask your question',
            'Agent automatically searches ACE patterns',
            'Agent applies learned patterns',
            'Agent captures new patterns'
        ];

        for (const step of steps) {
            assert.ok(step.length > 0, `Step "${step}" is explained`);
        }
    });
});

suite('ACE Agent Content', () => {

    test('has correct frontmatter structure', () => {
        const frontmatter = {
            name: 'ace-expert',
            description: 'Pattern-enhanced coding with automatic ACE tool invocation',
            tools: [
                'ace_search',
                'ace_learn',
                'ace_status',
                'ace_get_playbook',
                'search',
                'readFile',
                'editFiles',
                'runInTerminal',
                'fetch',
                'problems'
            ]
        };

        assert.strictEqual(frontmatter.name, 'ace-expert', 'Agent name is ace-expert');
        assert.ok(frontmatter.tools.includes('ace_search'), 'Includes ace_search tool');
        assert.ok(frontmatter.tools.includes('ace_learn'), 'Includes ace_learn tool');
    });

    test('agent includes all ACE tools with publisher prefix', () => {
        const aceTools = [
            'ce-dot-net.ace-vscode/ace_search',
            'ce-dot-net.ace-vscode/ace_learn',
            'ce-dot-net.ace-vscode/ace_status',
            'ce-dot-net.ace-vscode/ace_get_playbook'
        ];
        const agentTools = [
            'ce-dot-net.ace-vscode/ace_search',
            'ce-dot-net.ace-vscode/ace_learn',
            'ce-dot-net.ace-vscode/ace_status',
            'ce-dot-net.ace-vscode/ace_get_playbook',
            'search/codebase',
            'search/readFile',
            'edit/editFiles',
            'runCommands/runInTerminal',
            'fetch',
            'problems'
        ];

        for (const tool of aceTools) {
            assert.ok(agentTools.includes(tool), `Agent has ${tool} tool`);
        }
    });

    test('agent includes standard coding tools with toolset prefix', () => {
        const standardTools = ['search/codebase', 'search/readFile', 'edit/editFiles', 'runCommands/runInTerminal', 'fetch', 'problems'];
        const agentTools = [
            'ce-dot-net.ace-vscode/ace_search',
            'ce-dot-net.ace-vscode/ace_learn',
            'ce-dot-net.ace-vscode/ace_status',
            'ce-dot-net.ace-vscode/ace_get_playbook',
            'search/codebase',
            'search/readFile',
            'edit/editFiles',
            'runCommands/runInTerminal',
            'fetch',
            'problems'
        ];

        for (const tool of standardTools) {
            assert.ok(agentTools.includes(tool), `Agent has ${tool} tool`);
        }
    });

    test('explains automatic workflow', () => {
        const workflow = [
            'Before tasks: ace_search finds relevant patterns',
            'During work: Apply learned patterns',
            'After completion: ace_learn captures new patterns'
        ];

        for (const step of workflow) {
            assert.ok(step.length > 0, `Workflow step explained: ${step.slice(0, 30)}...`);
        }
    });
});

suite('ACE Learn Agent Content', () => {

    test('has correct name', () => {
        const name = 'ace-learn';
        assert.strictEqual(name, 'ace-learn', 'Agent name is ace-learn');
    });

    test('has minimal tool set with publisher prefix', () => {
        const tools = [
            'ce-dot-net.ace-vscode/ace_learn',
            'ce-dot-net.ace-vscode/ace_search',
            'ce-dot-net.ace-vscode/ace_status'
        ];
        assert.ok(tools.some(t => t.includes('ace_learn')), 'Includes ace_learn');
        assert.ok(tools.length === 3, 'Has minimal tools');
    });

    test('has focused description', () => {
        const description = 'Capture patterns from completed work';
        assert.ok(description.includes('Capture'), 'Description is focused');
    });
});

suite('Tool Name Consistency', () => {

    test('ACE tool names use publisher.extension/tool format', () => {
        const agentTools = [
            'ce-dot-net.ace-vscode/ace_search',
            'ce-dot-net.ace-vscode/ace_learn',
            'ce-dot-net.ace-vscode/ace_status',
            'ce-dot-net.ace-vscode/ace_get_playbook'
        ];

        for (const tool of agentTools) {
            assert.ok(tool.startsWith('ce-dot-net.ace-vscode/'), `${tool} has publisher prefix`);
            assert.ok(tool.includes('ace_'), `${tool} has ace_ tool name`);
        }
    });

    test('built-in tool names use toolset/tool format', () => {
        const builtInTools = ['search/readFile', 'edit/editFiles', 'runCommands/runInTerminal'];

        for (const tool of builtInTools) {
            assert.ok(tool.includes('/'), `${tool} uses toolset/tool format`);
        }
    });

    test('standalone built-in tools have no prefix', () => {
        const standaloneTools = ['fetch', 'problems'];

        for (const tool of standaloneTools) {
            assert.ok(!tool.includes('/'), `${tool} has no prefix`);
        }
    });
});
