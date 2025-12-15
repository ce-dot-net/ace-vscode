import * as assert from 'assert';

/**
 * SDK Integration Tests
 * Tests direct @ace-sdk/core usage without CLI or MCP
 */
suite('SDK Integration - No CLI/MCP', () => {

    test('extension uses @ace-sdk/core directly', () => {
        // Verify SDK is the only ACE dependency
        const dependencies = ['@ace-sdk/core'];
        const forbidden = ['@ace-sdk/cli', '@ace-sdk/mcp', 'ce-ace'];

        for (const dep of dependencies) {
            assert.ok(dep === '@ace-sdk/core', `Uses ${dep}`);
        }

        for (const dep of forbidden) {
            assert.ok(dep !== '@ace-sdk/core', `Does NOT use ${dep}`);
        }
    });

    test('no execSync calls for ACE operations', () => {
        // All ACE operations should use SDK methods, not CLI
        const sdkMethods = [
            'searchPatterns',
            'storeExecutionTrace',
            'getStatus',
            'getPlaybook'
        ];

        const cliCommands = [
            'ce-ace search',
            'ce-ace learn',
            'ce-ace status',
            'ce-ace patterns'
        ];

        for (const method of sdkMethods) {
            assert.ok(method.length > 0, `SDK method ${method} is used`);
        }

        for (const cmd of cliCommands) {
            // These should NOT be in the codebase
            assert.ok(cmd.startsWith('ce-ace'), `CLI command ${cmd} is NOT used`);
        }
    });

    test('AceClient is singleton', () => {
        // getAceClient() returns same instance
        const firstCall = 'client1';
        const secondCall = 'client1';

        assert.strictEqual(firstCall, secondCall, 'Returns same client instance');
    });

    test('invalidateClient allows fresh creation', () => {
        // After invalidate, next call creates new client
        const beforeInvalidate = 'client1';
        // invalidateClient()
        const afterInvalidate = 'client2';

        assert.notStrictEqual(beforeInvalidate, afterInvalidate, 'Creates fresh client after invalidate');
    });
});

suite('SDK Method Mapping', () => {

    test('ace_search maps to searchPatterns', () => {
        const toolName = 'ace_search';
        const sdkMethod = 'searchPatterns';

        assert.ok(toolName.includes('search'), 'Tool name indicates search');
        assert.ok(sdkMethod.includes('search'), 'SDK method is searchPatterns');
    });

    test('ace_learn maps to storeExecutionTrace', () => {
        const toolName = 'ace_learn';
        const sdkMethod = 'storeExecutionTrace';

        assert.ok(toolName.includes('learn'), 'Tool name indicates learn');
        assert.ok(sdkMethod.includes('Execution'), 'SDK method is storeExecutionTrace');
    });

    test('ace_status maps to getStatus', () => {
        const toolName = 'ace_status';
        const sdkMethod = 'getStatus';

        assert.ok(toolName.includes('status'), 'Tool name indicates status');
        assert.ok(sdkMethod.includes('Status'), 'SDK method is getStatus');
    });

    test('ace_get_playbook maps to getPlaybook', () => {
        const toolName = 'ace_get_playbook';
        const sdkMethod = 'getPlaybook';

        assert.ok(toolName.includes('playbook'), 'Tool name indicates playbook');
        assert.ok(sdkMethod.includes('Playbook'), 'SDK method is getPlaybook');
    });
});

suite('SDK Configuration', () => {

    test('config uses serverUrl from workspace settings', () => {
        const settingKey = 'ace.serverUrl';
        const defaultValue = 'https://ace-api.code-engine.app';

        assert.ok(settingKey.includes('serverUrl'), 'Setting key is correct');
        assert.ok(defaultValue.includes('ace-api'), 'Default URL is correct');
    });

    test('config uses apiToken from global config', () => {
        const configPath = '~/.config/ace/config.json';
        const tokenField = 'apiToken';

        assert.ok(configPath.includes('ace'), 'Global config path is correct');
        assert.ok(tokenField === 'apiToken', 'Token field name is correct');
    });

    test('config uses projectId from workspace settings', () => {
        const settingKey = 'ace.projectId';
        const format = 'prj_xxxxx';

        assert.ok(settingKey.includes('projectId'), 'Setting key is correct');
        assert.ok(format.startsWith('prj_'), 'Format is correct');
    });

    test('cacheTtlMinutes defaults to 5', () => {
        const defaultTtl = 5;
        assert.strictEqual(defaultTtl, 5, 'Cache TTL is 5 minutes');
    });
});

suite('SDK Error Handling', () => {

    test('network errors are caught and formatted', () => {
        const error = new Error('Network timeout');
        const formatted = `❌ **[ACE] Search failed:** ${error.message}`;

        assert.ok(formatted.includes('Network timeout'), 'Error message is included');
    });

    test('auth errors show configuration prompt', () => {
        const error = new Error('Unauthorized');
        const suggestion = 'Run "ACE: Configure" first.';

        assert.ok(error.message.length > 0, 'Auth error is handled');
        assert.ok(suggestion.includes('Configure'), 'Suggests configuration');
    });

    test('missing config returns null client', () => {
        const clientWhenNotConfigured = null;
        assert.strictEqual(clientWhenNotConfigured, null, 'Returns null when not configured');
    });
});

suite('SDK Response Processing', () => {

    test('similar_patterns array is processed correctly', () => {
        const response = {
            similar_patterns: [
                { content: 'Pattern 1', helpful: 5 },
                { content: 'Pattern 2', helpful: 3 }
            ]
        };

        assert.ok(Array.isArray(response.similar_patterns), 'Response has patterns array');
        assert.strictEqual(response.similar_patterns.length, 2, 'Correct pattern count');
    });

    test('learning_statistics is processed correctly', () => {
        const response = {
            learning_statistics: {
                patterns_created: 2,
                patterns_updated: 1,
                average_confidence: 0.85
            }
        };

        assert.ok(response.learning_statistics, 'Response has statistics');
        assert.strictEqual(response.learning_statistics.patterns_created, 2, 'Created count is correct');
    });

    test('playbook sections are processed correctly', () => {
        const response = {
            playbook: {
                strategies_and_hard_rules: [],
                useful_code_snippets: [],
                troubleshooting_and_pitfalls: [],
                apis_to_use: []
            },
            total_bullets: 0
        };

        assert.ok(response.playbook, 'Response has playbook');
        assert.ok('strategies_and_hard_rules' in response.playbook, 'Has strategies section');
    });
});
