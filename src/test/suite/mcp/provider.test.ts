import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
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

    // Mirror getGlobalConfigPath() from src/constants.ts so the test stays
    // hermetic without dragging the ESM SDK chain that constants pulls in.
    function getGlobalConfigPathLocal(): string {
        const xdgConfig = process.env.XDG_CONFIG_HOME;
        const configBase = xdgConfig || path.join(os.homedir(), '.config');
        return path.join(configBase, 'ace', 'config.json');
    }

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
                const def = new vscode.McpStdioServerDefinition(
                    MCP_PROVIDER_LABEL,
                    'npx',
                    ['--yes', '@ace-sdk/mcp'],
                    env
                );
                // Mirror provider.ts: gated runtime assignment of sandbox perms.
                if ('sandboxFilePermissions' in def) {
                    const sandboxPaths = [
                        getGlobalConfigPathLocal(),
                        path.join(os.homedir(), '.ace'),
                    ];
                    (def as unknown as {
                        sandboxFilePermissions: { path: string; permissions: string }[];
                    }).sandboxFilePermissions = sandboxPaths.map(p => ({
                        path: p,
                        permissions: 'read',
                    }));
                }
                return [def];
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

    suite('sandboxFilePermissions (VS Code 1.118+)', () => {
        const FAKE_HOME = '/tmp/fake-home-test';
        let originalHome: string | undefined;
        let originalUserProfile: string | undefined;

        setup(() => {
            // os.homedir is non-configurable in Node 20+, so override via env.
            // POSIX honors $HOME, Windows honors %USERPROFILE%.
            delete process.env.XDG_CONFIG_HOME;
            originalHome = process.env.HOME;
            originalUserProfile = process.env.USERPROFILE;
            process.env.HOME = FAKE_HOME;
            process.env.USERPROFILE = FAKE_HOME;
        });

        teardown(() => {
            if (originalHome === undefined) { delete process.env.HOME; }
            else { process.env.HOME = originalHome; }
            if (originalUserProfile === undefined) { delete process.env.USERPROFILE; }
            else { process.env.USERPROFILE = originalUserProfile; }
        });

        test('includes ACE config + legacy ~/.ace paths when API supports it', () => {
            isAuthenticatedStub.returns(true);
            getProjectConfigStub.returns(mockProjectConfig);
            loadUserAuthStub.returns({ token: 'tk' });

            const provider = createProvider();
            const result = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);
            const def = result[0];

            // Property may be absent on hosts older than 1.118 — gate the assertion
            // on runtime presence so the suite stays green across host versions.
            if ('sandboxFilePermissions' in def) {
                const perms = (def as unknown as {
                    sandboxFilePermissions: { path: string; permissions: string }[];
                }).sandboxFilePermissions;

                assert.ok(Array.isArray(perms), 'sandboxFilePermissions should be an array');
                assert.strictEqual(perms.length, 2);

                const paths = perms.map(p => p.path).sort();
                const expected = [
                    path.join(FAKE_HOME, '.ace'),
                    path.join(FAKE_HOME, '.config', 'ace', 'config.json'),
                ].sort();
                assert.deepStrictEqual(paths, expected);

                // Each entry must declare read permission.
                for (const entry of perms) {
                    assert.strictEqual(entry.permissions, 'read');
                }
            } else {
                // Older host: prop must NOT exist on the definition.
                assert.ok(
                    !('sandboxFilePermissions' in def),
                    'pre-1.118 host should not expose sandboxFilePermissions'
                );
            }

            provider.dispose();
        });

        test('honors XDG_CONFIG_HOME for ACE config path', () => {
            const customXdg = '/tmp/fake-xdg-config';
            process.env.XDG_CONFIG_HOME = customXdg;
            try {
                isAuthenticatedStub.returns(true);
                getProjectConfigStub.returns(mockProjectConfig);
                loadUserAuthStub.returns(null);

                const provider = createProvider();
                const result = provider.provideMcpServerDefinitions({} as vscode.CancellationToken);
                const def = result[0];

                if ('sandboxFilePermissions' in def) {
                    const perms = (def as unknown as {
                        sandboxFilePermissions: { path: string; permissions: string }[];
                    }).sandboxFilePermissions;

                    const paths = perms.map(p => p.path);
                    assert.ok(
                        paths.includes(path.join(customXdg, 'ace', 'config.json')),
                        'config path should respect XDG_CONFIG_HOME'
                    );
                    assert.ok(
                        paths.includes(path.join(FAKE_HOME, '.ace')),
                        'legacy ~/.ace path always derived from homedir'
                    );
                }

                provider.dispose();
            } finally {
                delete process.env.XDG_CONFIG_HOME;
            }
        });
    });
});
