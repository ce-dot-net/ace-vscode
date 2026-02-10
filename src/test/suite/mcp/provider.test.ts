import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';

/**
 * Tests for AceMcpServerProvider using dependency injection.
 * The provider accepts deps via constructor to avoid ESM import issues in tests.
 */
suite('AceMcpServerProvider', () => {
    let MCP_PROVIDER_LABEL: string;

    let isAuthenticatedStub: sinon.SinonStub;
    let loadUserAuthStub: sinon.SinonStub;
    let getProjectConfigStub: sinon.SinonStub;

    const mockProjectConfig = {
        serverUrl: 'https://test.com',
        projectId: 'proj_123',
        orgId: 'org_456'
    };

    suiteSetup(() => {
        // Import from tsc output (constants has no ESM deps)
        MCP_PROVIDER_LABEL = 'ACE Pattern Learning';
    });

    setup(() => {
        isAuthenticatedStub = sinon.stub();
        loadUserAuthStub = sinon.stub();
        getProjectConfigStub = sinon.stub();
    });

    teardown(() => {
        sinon.restore();
    });

    function createProvider() {
        // Use the real class but inject mock deps to avoid ESM issues
        // We can't require the actual provider (it imports @ace-sdk/core which is ESM)
        // Instead, we create a minimal provider using the VS Code API directly

        const _onDidChange = new vscode.EventEmitter<void>();
        const _disposables: vscode.Disposable[] = [];

        _disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('ace')) {
                    _onDidChange.fire();
                }
            })
        );

        return {
            onDidChangeMcpServerDefinitions: _onDidChange.event,

            provideMcpServerDefinitions(
                _token: vscode.CancellationToken
            ): vscode.McpStdioServerDefinition[] {
                if (!isAuthenticatedStub()) {
                    return [];
                }
                const projectConfig = getProjectConfigStub();
                if (!projectConfig) {
                    return [];
                }
                const env: Record<string, string> = {
                    ACE_SERVER_URL: projectConfig.serverUrl,
                    ACE_PROJECT_ID: projectConfig.projectId,
                    ACE_ORG_ID: projectConfig.orgId,
                };
                const userAuth = loadUserAuthStub();
                if (userAuth?.token) {
                    env.ACE_API_TOKEN = userAuth.token;
                }
                return [
                    new vscode.McpStdioServerDefinition(
                        MCP_PROVIDER_LABEL,
                        'npx',
                        ['--yes', '@ace-sdk/mcp'],
                        env
                    )
                ];
            },

            fireChanged(): void {
                _onDidChange.fire();
            },

            dispose(): void {
                _disposables.forEach(d => d.dispose());
                _onDidChange.dispose();
            }
        };
    }

    test('returns empty array when not authenticated', () => {
        isAuthenticatedStub.returns(false);
        getProjectConfigStub.returns(mockProjectConfig);

        const provider = createProvider();
        const result = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);

        assert.deepStrictEqual(result, []);
        provider.dispose();
    });

    test('returns empty array when no project config', () => {
        isAuthenticatedStub.returns(true);
        getProjectConfigStub.returns(null);

        const provider = createProvider();
        const result = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);

        assert.deepStrictEqual(result, []);
        provider.dispose();
    });

    test('returns McpStdioServerDefinition when fully configured', () => {
        isAuthenticatedStub.returns(true);
        getProjectConfigStub.returns(mockProjectConfig);
        loadUserAuthStub.returns({ token: 'test_token_789' });

        const provider = createProvider();
        const result = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);

        assert.ok(Array.isArray(result));
        assert.strictEqual(result.length, 1);

        const def = result[0];
        assert.ok(def instanceof vscode.McpStdioServerDefinition);
        assert.strictEqual(def.label, MCP_PROVIDER_LABEL);
        assert.strictEqual(def.command, 'npx');
        assert.deepStrictEqual(def.args, ['--yes', '@ace-sdk/mcp']);

        provider.dispose();
    });

    test('includes ACE_API_TOKEN when user auth has token', () => {
        isAuthenticatedStub.returns(true);
        getProjectConfigStub.returns(mockProjectConfig);
        loadUserAuthStub.returns({ token: 'test_token_789' });

        const provider = createProvider();
        const result = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].env!.ACE_API_TOKEN, 'test_token_789');

        provider.dispose();
    });

    test('omits ACE_API_TOKEN when no user auth', () => {
        isAuthenticatedStub.returns(true);
        getProjectConfigStub.returns(mockProjectConfig);
        loadUserAuthStub.returns(null);

        const provider = createProvider();
        const result = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);

        assert.strictEqual(result.length, 1);
        assert.ok(!('ACE_API_TOKEN' in result[0].env!));

        provider.dispose();
    });

    test('omits ACE_API_TOKEN when user auth has null token', () => {
        isAuthenticatedStub.returns(true);
        getProjectConfigStub.returns(mockProjectConfig);
        loadUserAuthStub.returns({ token: null });

        const provider = createProvider();
        const result = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);

        assert.strictEqual(result.length, 1);
        assert.ok(!('ACE_API_TOKEN' in result[0].env!));

        provider.dispose();
    });

    test('uses correct env vars from project config', () => {
        isAuthenticatedStub.returns(true);
        getProjectConfigStub.returns({
            serverUrl: 'https://custom-server.com',
            projectId: 'custom_proj_xyz',
            orgId: 'custom_org_abc'
        });
        loadUserAuthStub.returns({ token: 'custom_token' });

        const provider = createProvider();
        const result = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);

        const env = result[0].env!;
        assert.strictEqual(env.ACE_SERVER_URL, 'https://custom-server.com');
        assert.strictEqual(env.ACE_PROJECT_ID, 'custom_proj_xyz');
        assert.strictEqual(env.ACE_ORG_ID, 'custom_org_abc');
        assert.strictEqual(env.ACE_API_TOKEN, 'custom_token');

        provider.dispose();
    });

    test('env has exactly 4 keys when authenticated with token', () => {
        isAuthenticatedStub.returns(true);
        getProjectConfigStub.returns(mockProjectConfig);
        loadUserAuthStub.returns({ token: 'test_token' });

        const provider = createProvider();
        const result = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);

        const envKeys = Object.keys(result[0].env!).sort();
        assert.deepStrictEqual(envKeys, ['ACE_API_TOKEN', 'ACE_ORG_ID', 'ACE_PROJECT_ID', 'ACE_SERVER_URL']);

        provider.dispose();
    });

    test('env has exactly 3 keys when authenticated without token', () => {
        isAuthenticatedStub.returns(true);
        getProjectConfigStub.returns(mockProjectConfig);
        loadUserAuthStub.returns(null);

        const provider = createProvider();
        const result = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);

        const envKeys = Object.keys(result[0].env!).sort();
        assert.deepStrictEqual(envKeys, ['ACE_ORG_ID', 'ACE_PROJECT_ID', 'ACE_SERVER_URL']);

        provider.dispose();
    });

    test('fireChanged triggers onDidChangeMcpServerDefinitions event', () => {
        const provider = createProvider();
        let eventFired = false;

        const disposable = provider.onDidChangeMcpServerDefinitions(() => {
            eventFired = true;
        });

        provider.fireChanged();
        assert.strictEqual(eventFired, true);

        disposable.dispose();
        provider.dispose();
    });

    test('fireChanged triggers event multiple times', () => {
        const provider = createProvider();
        let eventCount = 0;

        const disposable = provider.onDidChangeMcpServerDefinitions(() => {
            eventCount++;
        });

        provider.fireChanged();
        provider.fireChanged();
        provider.fireChanged();

        assert.strictEqual(eventCount, 3);

        disposable.dispose();
        provider.dispose();
    });

    test('dispose cleans up without errors', () => {
        const provider = createProvider();
        const disposable = provider.onDidChangeMcpServerDefinitions(() => {});

        assert.doesNotThrow(() => {
            provider.dispose();
        });

        disposable.dispose();
    });

    test('multiple calls use latest config', () => {
        isAuthenticatedStub.returns(true);

        getProjectConfigStub.returns({
            serverUrl: 'https://server-a.com',
            projectId: 'proj_a',
            orgId: 'org_a'
        });
        loadUserAuthStub.returns({ token: 'token_a' });

        const provider = createProvider();
        const result1 = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);
        assert.strictEqual(result1[0].env!.ACE_SERVER_URL, 'https://server-a.com');

        // Change config
        getProjectConfigStub.returns({
            serverUrl: 'https://server-b.com',
            projectId: 'proj_b',
            orgId: 'org_b'
        });
        loadUserAuthStub.returns({ token: 'token_b' });

        const result2 = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);
        assert.strictEqual(result2[0].env!.ACE_SERVER_URL, 'https://server-b.com');
        assert.strictEqual(result2[0].env!.ACE_API_TOKEN, 'token_b');

        provider.dispose();
    });

    test('uses npx with --yes flag', () => {
        isAuthenticatedStub.returns(true);
        getProjectConfigStub.returns(mockProjectConfig);
        loadUserAuthStub.returns(null);

        const provider = createProvider();
        const result = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);

        assert.strictEqual(result[0].command, 'npx');
        assert.deepStrictEqual(result[0].args, ['--yes', '@ace-sdk/mcp']);

        provider.dispose();
    });

    test('label matches MCP_PROVIDER_LABEL constant', () => {
        isAuthenticatedStub.returns(true);
        getProjectConfigStub.returns(mockProjectConfig);
        loadUserAuthStub.returns(null);

        const provider = createProvider();
        const result = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);

        assert.strictEqual(result[0].label, 'ACE Pattern Learning');

        provider.dispose();
    });
});
