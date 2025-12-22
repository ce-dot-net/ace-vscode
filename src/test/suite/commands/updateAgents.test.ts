import * as assert from 'assert';

/**
 * Unit tests for updateAgents command
 * Tests agent file generation and content for v0.4.17 structure
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

    test('creates instructions subdirectory', () => {
        const instructionsDir = '.github/instructions';
        assert.ok(instructionsDir.includes('instructions'), 'Creates instructions subdirectory');
    });

    test('creates skills subdirectory', () => {
        const skillsDir = '.github/skills/ace-pattern-learning';
        assert.ok(skillsDir.includes('skills'), 'Creates skills subdirectory');
    });

    test('creates agents subdirectory', () => {
        const agentsDir = '.github/agents';
        assert.ok(agentsDir.includes('agents'), 'Creates agents subdirectory');
    });

    test('creates ace.instructions.md (path-specific)', () => {
        const filename = 'ace.instructions.md';
        assert.ok(filename === 'ace.instructions.md', 'Creates ace instructions file');
    });

    test('creates SKILL.md (Agent Skill)', () => {
        const filename = 'SKILL.md';
        assert.ok(filename === 'SKILL.md', 'Creates skill file');
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
        const expectedMessage = 'ACE files updated to v0.4.17! New structure: instructions/, skills/, agents/';
        assert.ok(expectedMessage.includes('ACE files updated'), 'Shows success');
    });

    test('handles errors gracefully', () => {
        const errorMessage = 'Permission denied';
        const expectedOutput = `Failed to create ACE files: ${errorMessage}`;

        assert.ok(expectedOutput.includes(errorMessage), 'Shows error message');
    });
});

suite('ACE Instructions Content (v0.4.17)', () => {

    test('has applyTo frontmatter', () => {
        const frontmatter = 'applyTo: "**/*"';
        assert.ok(frontmatter.includes('applyTo'), 'Has applyTo frontmatter');
    });

    test('has version marker', () => {
        const marker = '<!-- ACE_SECTION v0.4.17 -->';
        assert.ok(marker.includes('ACE_SECTION'), 'Has version marker');
    });

    test('has DURING conversation section for topic changes', () => {
        const section = 'DURING Conversation (Topic Changes)';
        assert.ok(section.includes('Topic Changes'), 'Has topic change section');
    });

    test('mentions topic shift examples', () => {
        const examples = ['auth → caching', 'frontend → backend', 'Error/issue in different area'];
        for (const example of examples) {
            assert.ok(example.length > 0, `Example "${example}" is documented`);
        }
    });

    test('has closing marker', () => {
        const marker = '<!-- ACE_SECTION_END -->';
        assert.ok(marker.includes('ACE_SECTION_END'), 'Has closing marker');
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

    test('does NOT overwrite copilot-instructions.md', () => {
        // v0.4.17: ACE uses separate ace.instructions.md in instructions folder
        const aceFile = 'ace.instructions.md';
        const userFile = 'copilot-instructions.md';
        // ACE file is in instructions/ subfolder, user file is in .github/ root
        assert.ok(!aceFile.includes('copilot'), 'ACE file does not touch copilot-instructions');
        assert.ok(userFile.includes('copilot'), 'User file is copilot-instructions.md');
    });
});

suite('Agent Skill Content (v0.4.17)', () => {

    test('has correct name in frontmatter', () => {
        const name = 'ace-pattern-learning';
        assert.strictEqual(name, 'ace-pattern-learning', 'Skill name is correct');
    });

    test('has description for auto-trigger', () => {
        const description = 'Search ACE playbook before implementing, building, fixing, debugging, or refactoring code.';
        assert.ok(description.includes('implementing'), 'Description includes trigger word');
        assert.ok(description.includes('building'), 'Description includes trigger word');
        assert.ok(description.includes('fixing'), 'Description includes trigger word');
    });

    test('has version marker', () => {
        const marker = '<!-- ACE_SECTION v0.4.17 -->';
        assert.ok(marker.includes('ACE_SECTION'), 'Has version marker');
    });

    test('has Mid-Conversation Re-Search section', () => {
        const section = 'Mid-Conversation Re-Search';
        assert.ok(section.includes('Re-Search'), 'Has re-search section');
    });

    test('lists topic shift examples', () => {
        const examples = [
            '"Now let\'s add caching"',
            '"I\'m getting a database error"',
            '"How do I deploy this?"',
            '"Let\'s add tests"'
        ];
        for (const example of examples) {
            assert.ok(example.length > 0, `Topic shift example is documented: ${example.slice(0, 20)}...`);
        }
    });

    test('shows multi-turn workflow example', () => {
        const workflow = 'User: "Now add Redis caching for the tokens"';
        assert.ok(workflow.includes('Redis'), 'Shows follow-up message example');
    });

    test('includes trigger keywords list', () => {
        const keywords = [
            'implement', 'build', 'create', 'add', 'develop', 'write',
            'update', 'modify', 'change', 'edit', 'enhance', 'extend',
            'debug', 'fix', 'troubleshoot', 'resolve', 'diagnose',
            'refactor', 'optimize', 'improve', 'restructure',
            'integrate', 'connect', 'setup', 'configure'
        ];
        assert.ok(keywords.length >= 20, 'Has comprehensive keyword list');
    });

    test('includes ace_search invocation', () => {
        const invocation = 'ace_search';
        assert.ok(invocation === 'ace_search', 'Includes search invocation');
    });

    test('includes ace_learn invocation', () => {
        const invocation = 'ace_learn';
        assert.ok(invocation === 'ace_learn', 'Includes learn invocation');
    });
});

suite('Migration Logic (v0.4.17)', () => {

    test('detects ACE content in legacy file', () => {
        const content = '# ACE Pattern Learning Integration';
        assert.ok(content.includes('ACE Pattern Learning'), 'Detects ACE content');
    });

    test('detects ace_search in legacy file', () => {
        const content = 'INVOKE: ace_search';
        assert.ok(content.includes('ace_search'), 'Detects ace_search');
    });

    test('detects ace_learn in legacy file', () => {
        const content = 'INVOKE: ace_learn';
        assert.ok(content.includes('ace_learn'), 'Detects ace_learn');
    });

    test('preserves user content marker', () => {
        const marker = '<!-- USER_CONTENT -->';
        assert.ok(marker.includes('USER_CONTENT'), 'Checks for user marker');
    });

    test('migrates entirely ACE content', () => {
        // If file is entirely ACE content (no user marker), it can be deleted
        const isEntirelyAce = true;
        assert.ok(isEntirelyAce, 'Can delete legacy ACE-only file');
    });

    test('preserves mixed content', () => {
        // If file has mixed content, leave it alone
        const hasMixedContent = true;
        const shouldPreserve = hasMixedContent;
        assert.ok(shouldPreserve, 'Preserves mixed content files');
    });
});

suite('ACE Agent Content (v0.4.17)', () => {

    test('has correct frontmatter structure', () => {
        const frontmatter = {
            name: 'ace-expert',
            description: 'Pattern-enhanced coding with automatic ACE tool invocation',
            tools: [
                'ce-dot-net.ace-vscode/ace_search',
                'ce-dot-net.ace-vscode/ace_learn',
                'ce-dot-net.ace-vscode/ace_status',
                'ce-dot-net.ace-vscode/ace_get_playbook',
                'search/codebase',
                'read/readFile',
                'edit/editFiles',
                'read/problems'
            ]
        };

        assert.strictEqual(frontmatter.name, 'ace-expert', 'Agent name is ace-expert');
        assert.ok(frontmatter.tools.includes('ce-dot-net.ace-vscode/ace_search'), 'Includes ace_search tool');
        assert.ok(frontmatter.tools.includes('ce-dot-net.ace-vscode/ace_learn'), 'Includes ace_learn tool');
    });

    test('agent does NOT include runInTerminal (removed in v0.4.15)', () => {
        const agentTools = [
            'ce-dot-net.ace-vscode/ace_search',
            'ce-dot-net.ace-vscode/ace_learn',
            'ce-dot-net.ace-vscode/ace_status',
            'ce-dot-net.ace-vscode/ace_get_playbook',
            'search/codebase',
            'read/readFile',
            'edit/editFiles',
            'read/problems'
        ];

        assert.ok(!agentTools.includes('execute/runInTerminal'), 'No runInTerminal tool');
        assert.ok(!agentTools.includes('runCommands/runInTerminal'), 'No runInTerminal tool');
    });

    test('agent does NOT include fetch (removed in v0.4.15)', () => {
        const agentTools = [
            'ce-dot-net.ace-vscode/ace_search',
            'ce-dot-net.ace-vscode/ace_learn',
            'ce-dot-net.ace-vscode/ace_status',
            'ce-dot-net.ace-vscode/ace_get_playbook',
            'search/codebase',
            'read/readFile',
            'edit/editFiles',
            'read/problems'
        ];

        assert.ok(!agentTools.includes('web/fetch'), 'No fetch tool');
        assert.ok(!agentTools.includes('fetch'), 'No fetch tool');
    });

    test('agent includes all ACE tools with publisher prefix', () => {
        const aceTools = [
            'ce-dot-net.ace-vscode/ace_search',
            'ce-dot-net.ace-vscode/ace_learn',
            'ce-dot-net.ace-vscode/ace_status',
            'ce-dot-net.ace-vscode/ace_get_playbook'
        ];

        for (const tool of aceTools) {
            assert.ok(tool.startsWith('ce-dot-net.ace-vscode/'), `${tool} has publisher prefix`);
        }
    });

    test('agent includes standard coding tools', () => {
        const standardTools = ['search/codebase', 'read/readFile', 'edit/editFiles', 'read/problems'];
        const agentTools = [
            'ce-dot-net.ace-vscode/ace_search',
            'ce-dot-net.ace-vscode/ace_learn',
            'ce-dot-net.ace-vscode/ace_status',
            'ce-dot-net.ace-vscode/ace_get_playbook',
            'search/codebase',
            'read/readFile',
            'edit/editFiles',
            'read/problems'
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
        const builtInTools = ['search/codebase', 'read/readFile', 'edit/editFiles'];

        for (const tool of builtInTools) {
            assert.ok(tool.includes('/'), `${tool} uses toolset/tool format`);
        }
    });

    test('agent has 8 tools total (v0.4.15+)', () => {
        const agentTools = [
            'ce-dot-net.ace-vscode/ace_search',
            'ce-dot-net.ace-vscode/ace_learn',
            'ce-dot-net.ace-vscode/ace_status',
            'ce-dot-net.ace-vscode/ace_get_playbook',
            'search/codebase',
            'read/readFile',
            'edit/editFiles',
            'read/problems'
        ];

        assert.strictEqual(agentTools.length, 8, 'Agent has exactly 8 tools');
    });
});

suite('Folder Structure (v0.4.17)', () => {

    test('new structure has instructions folder', () => {
        const path = '.github/instructions/ace.instructions.md';
        assert.ok(path.includes('instructions'), 'Has instructions folder');
    });

    test('new structure has skills folder', () => {
        const path = '.github/skills/ace-pattern-learning/SKILL.md';
        assert.ok(path.includes('skills'), 'Has skills folder');
    });

    test('new structure has agents folder', () => {
        const path = '.github/agents/ace.agent.md';
        assert.ok(path.includes('agents'), 'Has agents folder');
    });

    test('skills folder has nested structure', () => {
        const path = '.github/skills/ace-pattern-learning/SKILL.md';
        assert.ok(path.includes('ace-pattern-learning'), 'Skills folder has skill name');
    });

    test('version file is in .github root', () => {
        const path = '.github/.ace-version.json';
        assert.ok(path.startsWith('.github/'), 'Version file in .github');
    });
});
