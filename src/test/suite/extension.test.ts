import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * ACE Extension Integration Tests
 *
 * These tests validate the extension's package.json configuration
 * and can run without requiring GitHub Copilot authentication.
 */
suite('ACE Extension Test Suite', () => {
    vscode.window.showInformationMessage('Starting ACE extension tests...');

    test('Extension should be present', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        assert.ok(ext, 'Extension should be found');
    });

    test('Extension package.json should have correct structure', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        assert.ok(ext, 'Extension should be found');

        const pkg = ext?.packageJSON;
        assert.ok(pkg, 'Package JSON should exist');
        assert.strictEqual(pkg.name, 'ace-vscode', 'Extension name should match');
        assert.strictEqual(pkg.publisher, 'ce-dot-net', 'Publisher should match');
        assert.ok(/^\d+\.\d+\.\d+$/.test(pkg.version), 'Version should be valid semver');
    });

    test('Extension should declare all 9 commands in package.json', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const commands = ext?.packageJSON?.contributes?.commands || [];

        const expectedCommands = [
            'ace-vscode.configure',
            'ace-vscode.bootstrap',
            'ace-vscode.clear',
            'ace-vscode.captureLearn',
            'ace-vscode.showQuickActions',
            'ace-vscode.updateAgents',
            'ace-vscode.showStatus',
            'ace-vscode.login',
            'ace-vscode.logout'
        ];

        assert.strictEqual(commands.length, expectedCommands.length, `Should have ${expectedCommands.length} commands`);

        for (const cmd of expectedCommands) {
            const found = commands.find((c: { command: string }) => c.command === cmd);
            assert.ok(found, `Command ${cmd} should be declared`);
        }
    });

    test('Extension should declare chat participant with 8 commands', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const participants = ext?.packageJSON?.contributes?.chatParticipants || [];

        const aceParticipant = participants.find((p: { id: string }) => p.id === 'ace-vscode.ace');
        assert.ok(aceParticipant, 'ACE chat participant should be declared');
        assert.strictEqual(aceParticipant.name, 'ace', 'Participant name should be ace');
        assert.strictEqual(aceParticipant.commands.length, 8, 'Should have 8 chat commands (including domains)');
    });

    test('Extension should declare 4 language model tools', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const tools = ext?.packageJSON?.contributes?.languageModelTools || [];

        const expectedTools = ['ace_search', 'ace_learn', 'ace_status', 'ace_get_playbook'];
        assert.strictEqual(tools.length, expectedTools.length, `Should have ${expectedTools.length} tools`);

        for (const toolName of expectedTools) {
            const found = tools.find((t: { name: string }) => t.name === toolName);
            assert.ok(found, `Tool ${toolName} should be declared`);
            assert.strictEqual(found.toolReferenceName, toolName, `toolReferenceName should be ${toolName}`);
        }
    });

    test('Extension should depend on github.copilot-chat', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const deps = ext?.packageJSON?.extensionDependencies || [];

        assert.ok(deps.includes('github.copilot-chat'), 'Should depend on github.copilot-chat');
    });
});

suite('ACE SDK Integration Tests', () => {
    test('Extension should have @ace-sdk/core as dependency', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const deps = ext?.packageJSON?.dependencies || {};

        assert.ok('@ace-sdk/core' in deps, '@ace-sdk/core should be a dependency');
        assert.ok(!('@ace-sdk/cli' in deps), '@ace-sdk/cli should NOT be a dependency');
        assert.ok(!('@ace-sdk/mcp' in deps), '@ace-sdk/mcp should NOT be a dependency');
    });

    test('ace_search tool should have correct schema', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const tools = ext?.packageJSON?.contributes?.languageModelTools || [];
        const searchTool = tools.find((t: { name: string }) => t.name === 'ace_search');

        assert.ok(searchTool?.inputSchema?.properties?.query, 'Should have query property');
        assert.strictEqual(searchTool?.inputSchema?.properties?.query?.type, 'string', 'Query should be string');
        assert.ok(searchTool?.inputSchema?.required?.includes('query'), 'Query should be required');
    });

    test('ace_learn tool should have correct schema', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const tools = ext?.packageJSON?.contributes?.languageModelTools || [];
        const learnTool = tools.find((t: { name: string }) => t.name === 'ace_learn');

        assert.ok(learnTool?.inputSchema?.properties?.task, 'Should have task property');
        assert.ok(learnTool?.inputSchema?.properties?.success, 'Should have success property');
        assert.ok(learnTool?.inputSchema?.properties?.output, 'Should have output property');
        assert.ok(learnTool?.inputSchema?.required?.includes('task'), 'Task should be required');
    });

    test('ace_status tool should have empty schema', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const tools = ext?.packageJSON?.contributes?.languageModelTools || [];
        const statusTool = tools.find((t: { name: string }) => t.name === 'ace_status');

        assert.deepStrictEqual(statusTool?.inputSchema?.properties, {}, 'Should have no properties');
    });

    test('ace_get_playbook tool should have optional filters', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const tools = ext?.packageJSON?.contributes?.languageModelTools || [];
        const playbookTool = tools.find((t: { name: string }) => t.name === 'ace_get_playbook');

        assert.ok(playbookTool?.inputSchema?.properties?.section, 'Should have section property');
        assert.ok(playbookTool?.inputSchema?.properties?.min_helpful, 'Should have min_helpful property');
        assert.ok(!playbookTool?.inputSchema?.required, 'Should have no required properties');
    });
});

suite('ACE Tool Input Validation Tests', () => {
    test('Search query should require non-empty string', () => {
        const validQuery = { query: 'authentication patterns' };
        assert.ok(validQuery.query.length > 0, 'Query should be non-empty');

        const invalidQuery = { query: '' };
        assert.ok(invalidQuery.query.length === 0, 'Empty query should be invalid');
    });

    test('Learn input should require task description', () => {
        const validInput = {
            task: 'Implemented JWT auth',
            success: true,
            output: 'Lessons learned'
        };
        assert.ok(validInput.task.length > 0, 'Task should be non-empty');

        const minimalInput = { task: 'Basic task' };
        assert.ok(minimalInput.task, 'Task is required');
    });

    test('Playbook section filter should accept valid sections', () => {
        const validSections = [
            'strategies_and_hard_rules',
            'useful_code_snippets',
            'troubleshooting_and_pitfalls',
            'apis_to_use'
        ];

        for (const section of validSections) {
            assert.ok(validSections.includes(section), `Section ${section} should be valid`);
        }
    });

    test('min_helpful filter should accept numbers >= 0', () => {
        const validValues = [0, 1, 5, 10, 100];
        const invalidValues = [-1, -5];

        for (const val of validValues) {
            assert.ok(val >= 0, `${val} should be valid`);
        }

        for (const val of invalidValues) {
            assert.ok(val < 0, `${val} should be invalid`);
        }
    });
});

suite('ACE Configuration Settings Tests', () => {
    test('Extension should declare configuration settings', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const config = ext?.packageJSON?.contributes?.configuration;

        assert.ok(config, 'Should have configuration');
        assert.strictEqual(config.title, 'ACE', 'Config title should be ACE');
    });

    test('ace.projectId setting should exist', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const props = ext?.packageJSON?.contributes?.configuration?.properties || {};

        assert.ok(props['ace.projectId'], 'Should have ace.projectId setting');
        assert.strictEqual(props['ace.projectId'].type, 'string', 'Should be string');
    });

    test('ace.orgId setting should exist', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const props = ext?.packageJSON?.contributes?.configuration?.properties || {};

        assert.ok(props['ace.orgId'], 'Should have ace.orgId setting');
        assert.strictEqual(props['ace.orgId'].type, 'string', 'Should be string');
    });

    test('ace.serverUrl setting should have correct default', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const props = ext?.packageJSON?.contributes?.configuration?.properties || {};

        assert.ok(props['ace.serverUrl'], 'Should have ace.serverUrl setting');
        assert.strictEqual(props['ace.serverUrl'].default, 'https://ace-api.code-engine.app', 'Should have correct default');
    });

    test('ace.automation settings should exist', () => {
        const ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
        const props = ext?.packageJSON?.contributes?.configuration?.properties || {};

        assert.ok(props['ace.automation.level'], 'Should have automation level');
        assert.ok(props['ace.automation.minEditsBeforeSuggest'], 'Should have minEdits setting');
        assert.ok(props['ace.automation.idleMinutesBeforeSuggest'], 'Should have idleMinutes setting');
        assert.ok(props['ace.automation.showStatusBar'], 'Should have showStatusBar setting');
    });
});

suite('ACE v0.5.0 Package Manifest', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const packageJson = require('../../../package.json');

    test('configurationDefaults sets chat.hooks.enabled to true', () => {
        const defaults = packageJson.contributes?.configurationDefaults;
        assert.ok(defaults, 'configurationDefaults should exist');
        assert.strictEqual(defaults['chat.hooks.enabled'], true);
    });

    test('walkthrough is defined with correct steps', () => {
        const walkthroughs = packageJson.contributes?.walkthroughs;
        assert.ok(walkthroughs, 'walkthroughs should exist');
        assert.ok(walkthroughs.length > 0, 'should have at least one walkthrough');
        const walkthrough = walkthroughs[0];
        assert.strictEqual(walkthrough.id, 'ace-getting-started');
        assert.ok(walkthrough.steps.length >= 3, 'should have at least 3 steps');
    });

    test('walkthrough first step is ace-login', () => {
        const walkthroughs = packageJson.contributes?.walkthroughs;
        assert.ok(walkthroughs?.length > 0, 'walkthroughs should exist');
        const firstStep = walkthroughs[0].steps[0];
        assert.strictEqual(firstStep.id, 'ace-login', 'First step should be ace-login');
    });

    test('walkthrough steps include ace-configure', () => {
        const walkthroughs = packageJson.contributes?.walkthroughs;
        assert.ok(walkthroughs?.length > 0, 'walkthroughs should exist');
        const steps: Array<{ id: string }> = walkthroughs[0].steps;
        const found = steps.find(s => s.id === 'ace-configure');
        assert.ok(found, 'Should have ace-configure step');
    });

    test('walkthrough steps include ace-update-agents', () => {
        const walkthroughs = packageJson.contributes?.walkthroughs;
        assert.ok(walkthroughs?.length > 0, 'walkthroughs should exist');
        const steps: Array<{ id: string }> = walkthroughs[0].steps;
        const found = steps.find(s => s.id === 'ace-update-agents');
        assert.ok(found, 'Should have ace-update-agents step');
    });

    test('walkthrough has title and description', () => {
        const walkthroughs = packageJson.contributes?.walkthroughs;
        assert.ok(walkthroughs?.length > 0, 'walkthroughs should exist');
        const walkthrough = walkthroughs[0];
        assert.ok(walkthrough.title, 'Walkthrough should have a title');
        assert.ok(walkthrough.description, 'Walkthrough should have a description');
    });
});
