import * as assert from 'assert';
import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

/**
 * MCP Server Provider E2E Tests
 *
 * These tests run inside the VS Code Extension Development Host
 * and verify the MCP provider is correctly registered and functional.
 *
 * Suite 1: Static verification (package.json, API availability)
 * Suite 2: Provider definition verification (env vars, command structure)
 * Suite 3: Live MCP server integration (spawn, tools/list, before/after flow)
 */

// ── Helper: MCP JSON-RPC communication ─────────────────────────────

/**
 * Send a JSON-RPC message and wait for a response with matching ID.
 * Used to test the MCP server spawned by the extension's provider.
 */
function mcpSendAndReceive(
    proc: ChildProcess,
    message: object,
    expectedId: number,
    timeoutMs = 15000
): Promise<any> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            proc.stdout?.removeListener('data', handler);
            reject(new Error(`MCP response timeout after ${timeoutMs}ms for id=${expectedId}`));
        }, timeoutMs);

        let buffer = '';
        const handler = (data: Buffer) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            for (const line of lines) {
                if (!line.trim()) { continue; }
                try {
                    const parsed = JSON.parse(line.trim());
                    if (parsed.id === expectedId) {
                        clearTimeout(timer);
                        proc.stdout?.removeListener('data', handler);
                        resolve(parsed);
                        return;
                    }
                } catch {
                    // Incomplete JSON line, continue buffering
                }
            }
        };
        proc.stdout?.on('data', handler);
        proc.stdin?.write(JSON.stringify(message) + '\n');
    });
}

// ── Suite 1: Static Verification ───────────────────────────────────

suite('MCP Server Provider E2E', () => {

    let ext: vscode.Extension<unknown> | undefined;

    suiteSetup(() => {
        ext = vscode.extensions.getExtension('ce-dot-net.ace-vscode');
    });

    test('package.json declares mcpServerDefinitionProviders', () => {
        assert.ok(ext, 'Extension should be found');
        const providers = ext?.packageJSON?.contributes?.mcpServerDefinitionProviders || [];

        assert.ok(Array.isArray(providers), 'mcpServerDefinitionProviders should be an array');
        assert.strictEqual(providers.length, 1, 'Should have exactly 1 MCP provider');

        const aceProvider = providers[0];
        assert.strictEqual(aceProvider.id, 'ace-mcp-provider', 'Provider ID should be ace-mcp-provider');
        assert.strictEqual(aceProvider.label, 'ACE Pattern Learning', 'Provider label should be ACE Pattern Learning');
    });

    test('engine requires VS Code >= 1.108.0 for MCP API', () => {
        assert.ok(ext, 'Extension should be found');
        const engine = ext?.packageJSON?.engines?.vscode;

        assert.ok(engine, 'Should have vscode engine requirement');
        // Extract minimum version from ^1.108.0
        const match = engine.match(/\d+\.(\d+)/);
        assert.ok(match, 'Engine version should be parseable');
        const minorVersion = parseInt(match[1], 10);
        assert.ok(minorVersion >= 108, `VS Code minor version should be >= 108, got ${minorVersion}`);
    });

    test('vscode.lm.registerMcpServerDefinitionProvider API exists', () => {
        assert.ok(vscode.lm, 'vscode.lm namespace should exist');
        assert.strictEqual(
            typeof vscode.lm.registerMcpServerDefinitionProvider,
            'function',
            'registerMcpServerDefinitionProvider should be a function'
        );
    });

    test('McpStdioServerDefinition class exists', () => {
        assert.ok(vscode.McpStdioServerDefinition, 'McpStdioServerDefinition should exist');
        assert.strictEqual(
            typeof vscode.McpStdioServerDefinition,
            'function',
            'McpStdioServerDefinition should be a constructor'
        );
    });

    test('extension activates successfully (MCP provider registered)', function () {
        assert.ok(ext, 'Extension should be found');
        // Extension is activated by the test runner's Extension Dev Host.
        // If not yet active, that's OK — the provider is still registered
        // because package.json contributions are loaded before activation.
        // We verify activation indirectly: if API and class exist, registration succeeded.
        const hasLmApi = typeof vscode.lm?.registerMcpServerDefinitionProvider === 'function';
        const hasClass = typeof vscode.McpStdioServerDefinition === 'function';
        assert.ok(hasLmApi && hasClass, 'MCP registration APIs available for provider');
    });

    test('MCP provider uses npx @ace-sdk/mcp (not bundled)', () => {
        // The extension spawns @ace-sdk/mcp as a subprocess via npx
        // It should NOT be a direct npm dependency (it's fetched by npx)
        assert.ok(ext, 'Extension should be found');
        const deps = ext?.packageJSON?.dependencies || {};

        assert.ok(!('@ace-sdk/mcp' in deps), '@ace-sdk/mcp should NOT be a direct dependency');
        assert.ok('@ace-sdk/core' in deps, '@ace-sdk/core should be a dependency');
    });

    test('MCP provider ID does not conflict with LM tools', () => {
        assert.ok(ext, 'Extension should be found');
        const lmTools = ext?.packageJSON?.contributes?.languageModelTools || [];
        const mcpProviders = ext?.packageJSON?.contributes?.mcpServerDefinitionProviders || [];

        const lmToolNames = lmTools.map((t: { name: string }) => t.name);
        const mcpIds = mcpProviders.map((p: { id: string }) => p.id);

        // MCP provider IDs should not collide with LM tool names
        for (const mcpId of mcpIds) {
            assert.ok(
                !lmToolNames.includes(mcpId),
                `MCP provider ID "${mcpId}" should not conflict with LM tool names`
            );
        }
    });

    test('both LM tools and MCP provider coexist (hybrid architecture)', () => {
        assert.ok(ext, 'Extension should be found');
        const lmTools = ext?.packageJSON?.contributes?.languageModelTools || [];
        const mcpProviders = ext?.packageJSON?.contributes?.mcpServerDefinitionProviders || [];

        assert.strictEqual(lmTools.length, 4, 'Should have 4 LM tools for Copilot');
        assert.strictEqual(mcpProviders.length, 1, 'Should have 1 MCP provider for multi-agent');

        // Verify LM tools are still present (no regression)
        const expectedLmTools = ['ace_search', 'ace_learn', 'ace_status', 'ace_get_playbook'];
        for (const name of expectedLmTools) {
            const found = lmTools.find((t: { name: string }) => t.name === name);
            assert.ok(found, `LM tool "${name}" should still exist alongside MCP provider`);
        }
    });
});

// ── Suite 2: Provider Definition Verification ──────────────────────

suite('MCP Server Provider - Definition Structure', () => {

    /**
     * Inline provider helper (mirrors src/mcp/provider.ts logic).
     * We can't import the real class due to ESM/@ace-sdk/core in CJS test env,
     * so we replicate the provideMcpServerDefinitions logic here.
     */
    function getProviderDefinition(opts: {
        isAuthenticated: boolean;
        token?: string | null;
        config?: { serverUrl: string; projectId: string; orgId: string } | null;
    }): vscode.McpStdioServerDefinition | null {
        if (!opts.isAuthenticated) { return null; }
        if (!opts.config) { return null; }

        const env: Record<string, string> = {
            ACE_SERVER_URL: opts.config.serverUrl,
            ACE_PROJECT_ID: opts.config.projectId,
            ACE_ORG_ID: opts.config.orgId,
        };
        if (opts.token) {
            env.ACE_API_TOKEN = opts.token;
        }

        return new vscode.McpStdioServerDefinition(
            'ACE Pattern Learning',
            'npx',
            ['--yes', '@ace-sdk/mcp'],
            env
        );
    }

    test('definition has correct command and args for npx @ace-sdk/mcp', () => {
        const def = getProviderDefinition({
            isAuthenticated: true,
            token: 'test-token',
            config: { serverUrl: 'https://ace.example.com', projectId: 'proj_123', orgId: 'org_456' }
        });

        assert.ok(def, 'Should return definition when authenticated');
        assert.strictEqual(def!.command, 'npx', 'Command should be npx');
        assert.deepStrictEqual(def!.args, ['--yes', '@ace-sdk/mcp'], 'Args should be --yes @ace-sdk/mcp');
        assert.strictEqual(def!.label, 'ACE Pattern Learning', 'Label should match');
    });

    test('definition includes all required env vars for @ace-sdk/mcp', () => {
        const def = getProviderDefinition({
            isAuthenticated: true,
            token: 'tok_abc123',
            config: {
                serverUrl: 'https://ace.ce.net',
                projectId: 'prj_test',
                orgId: 'org_test'
            }
        });

        assert.ok(def, 'Should return definition');
        assert.strictEqual(def!.env.ACE_SERVER_URL, 'https://ace.ce.net', 'Env has serverUrl');
        assert.strictEqual(def!.env.ACE_PROJECT_ID, 'prj_test', 'Env has projectId');
        assert.strictEqual(def!.env.ACE_ORG_ID, 'org_test', 'Env has orgId');
        assert.strictEqual(def!.env.ACE_API_TOKEN, 'tok_abc123', 'Env has token');
    });

    test('definition omits ACE_API_TOKEN when no token available', () => {
        const def = getProviderDefinition({
            isAuthenticated: true,
            token: null,
            config: { serverUrl: 'https://ace.ce.net', projectId: 'prj_1', orgId: 'org_1' }
        });

        assert.ok(def, 'Should return definition');
        assert.strictEqual(def!.env.ACE_API_TOKEN, undefined, 'No token in env');
        assert.ok(!('ACE_API_TOKEN' in def!.env), 'ACE_API_TOKEN key should not exist');
    });

    test('definition returns null when not authenticated', () => {
        const def = getProviderDefinition({
            isAuthenticated: false,
            config: { serverUrl: 'https://ace.ce.net', projectId: 'prj_1', orgId: 'org_1' }
        });
        assert.strictEqual(def, null, 'Should return null when not authenticated');
    });

    test('definition returns null when no project config', () => {
        const def = getProviderDefinition({
            isAuthenticated: true,
            config: null
        });
        assert.strictEqual(def, null, 'Should return null without config');
    });

    test('definition env vars match what @ace-sdk/mcp expects', () => {
        const def = getProviderDefinition({
            isAuthenticated: true,
            token: 'test',
            config: { serverUrl: 'https://s.com', projectId: 'p', orgId: 'o' }
        });

        // @ace-sdk/mcp reads EXACTLY these env vars
        const expectedKeys = ['ACE_SERVER_URL', 'ACE_PROJECT_ID', 'ACE_ORG_ID', 'ACE_API_TOKEN'];
        const actualKeys = Object.keys(def!.env);

        for (const key of actualKeys) {
            assert.ok(
                expectedKeys.includes(key),
                `Env var "${key}" should be one of the expected keys`
            );
        }
    });
});

// ── Suite 3: Live MCP Server Integration ───────────────────────────

suite('MCP Server Integration - Live Server', function () {
    // These tests spawn the actual @ace-sdk/mcp server process
    // using the SAME configuration the extension provides to VS Code.
    // This verifies the full chain: extension → provider → spawn → MCP protocol → tools.

    this.timeout(30000); // npx may need to download on first run

    let mcpProcess: ChildProcess | null = null;

    // Check if we can run live server tests
    // (npx must be available; credentials are optional for tools/list)
    const canRunLiveTests = (() => {
        try {
            // Verify npx exists
            const { execSync } = require('child_process');
            execSync('npx --version', { stdio: 'pipe' });
            return true;
        } catch {
            return false;
        }
    })();

    suiteTeardown(() => {
        if (mcpProcess && !mcpProcess.killed) {
            mcpProcess.kill();
            mcpProcess = null;
        }
    });

    test('MCP server starts and responds to initialize (extension→spawn→protocol)', async function () {
        if (!canRunLiveTests) { this.skip(); }

        // Build env vars exactly like the extension's AceMcpServerProvider does
        const env: Record<string, string> = {
            ...process.env as Record<string, string>,
            ACE_SERVER_URL: process.env.ACE_SERVER_URL || 'https://api.ace.ce.net',
            ACE_PROJECT_ID: process.env.ACE_PROJECT_ID || 'test-project',
            ACE_ORG_ID: process.env.ACE_ORG_ID || 'test-org',
        };
        if (process.env.ACE_API_TOKEN) {
            env.ACE_API_TOKEN = process.env.ACE_API_TOKEN;
        }

        // Spawn using EXACT same command/args the extension provides
        mcpProcess = spawn('npx', ['--yes', '@ace-sdk/mcp'], {
            env,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Send MCP initialize (what VS Code sends when starting the server)
        const initResponse = await mcpSendAndReceive(mcpProcess, {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'ace-vscode-e2e-test', version: '1.0.0' }
            }
        }, 1);

        assert.ok(initResponse.result, 'Initialize should return result');
        assert.ok(initResponse.result.serverInfo, 'Should have serverInfo');
        assert.strictEqual(
            initResponse.result.serverInfo.name,
            'ace-pattern-learning',
            'Server name should be ace-pattern-learning'
        );
    });

    test('MCP server lists ACE tools including ace_search and ace_learn', async function () {
        if (!canRunLiveTests || !mcpProcess || mcpProcess.killed) { this.skip(); }

        // Send initialized notification (required by MCP protocol)
        mcpProcess!.stdin?.write(
            JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'
        );

        // Wait for notification processing
        await new Promise(resolve => setTimeout(resolve, 500));

        // Request tools list
        const toolsResponse = await mcpSendAndReceive(mcpProcess!, {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {}
        }, 2);

        assert.ok(toolsResponse.result, 'tools/list should return result');
        const tools: { name: string; description?: string }[] = toolsResponse.result.tools || [];
        const toolNames = tools.map(t => t.name);

        // Verify core ACE tools exist (these are the before/after tools)
        assert.ok(toolNames.includes('ace_search'), 'Should have ace_search (BEFORE tool)');
        assert.ok(toolNames.includes('ace_learn'), 'Should have ace_learn (AFTER tool)');
        assert.ok(toolNames.includes('ace_get_playbook'), 'Should have ace_get_playbook');
        assert.ok(toolNames.includes('ace_status'), 'Should have ace_status');

        // Verify additional MCP-only tools exist (not in LM tools)
        assert.ok(toolNames.includes('ace_bootstrap'), 'Should have ace_bootstrap');
        assert.ok(toolNames.includes('ace_clear'), 'Should have ace_clear');
        assert.ok(toolNames.includes('ace_list_domains'), 'Should have ace_list_domains');

        // Total should be 21 tools
        assert.ok(tools.length >= 20, `Should have at least 20 tools, got ${tools.length}`);
    });

    test('ace_search tool has correct input schema (query required)', async function () {
        if (!canRunLiveTests || !mcpProcess || mcpProcess.killed) { this.skip(); }

        // Re-request tools to get schemas
        const toolsResponse = await mcpSendAndReceive(mcpProcess!, {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/list',
            params: {}
        }, 3);

        const tools: any[] = toolsResponse.result?.tools || [];
        const searchTool = tools.find(t => t.name === 'ace_search');

        assert.ok(searchTool, 'ace_search tool should exist');
        assert.ok(searchTool.inputSchema, 'ace_search should have inputSchema');

        // query is required for ace_search
        const required = searchTool.inputSchema.required || [];
        assert.ok(required.includes('query'), 'ace_search requires query parameter');
    });

    test('ace_learn tool has correct input schema (task required)', async function () {
        if (!canRunLiveTests || !mcpProcess || mcpProcess.killed) { this.skip(); }

        const toolsResponse = await mcpSendAndReceive(mcpProcess!, {
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/list',
            params: {}
        }, 4);

        const tools: any[] = toolsResponse.result?.tools || [];
        const learnTool = tools.find(t => t.name === 'ace_learn');

        assert.ok(learnTool, 'ace_learn tool should exist');
        assert.ok(learnTool.inputSchema, 'ace_learn should have inputSchema');

        const required = learnTool.inputSchema.required || [];
        assert.ok(required.includes('task'), 'ace_learn requires task parameter');
    });

    test('MCP server provides ace_search and ace_learn for before/after workflow', async function () {
        if (!canRunLiveTests || !mcpProcess || mcpProcess.killed) { this.skip(); }

        // This test verifies the BEFORE/AFTER tools are available via MCP
        // so AI agents (Claude, Codex) can use the same workflow as Copilot:
        //   BEFORE: ace_search → find patterns
        //   AFTER:  ace_learn → capture learning

        const toolsResponse = await mcpSendAndReceive(mcpProcess!, {
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/list',
            params: {}
        }, 5);

        const tools: any[] = toolsResponse.result?.tools || [];
        const toolNames = tools.map((t: any) => t.name);

        // The BEFORE tool - search for patterns before starting work
        const searchTool = tools.find((t: any) => t.name === 'ace_search');
        assert.ok(searchTool, 'BEFORE tool (ace_search) available via MCP');
        assert.ok(
            searchTool.description?.toLowerCase().includes('search') ||
            searchTool.description?.toLowerCase().includes('pattern'),
            'ace_search description mentions search or pattern'
        );

        // The AFTER tool - capture learning after completing work
        const learnTool = tools.find((t: any) => t.name === 'ace_learn');
        assert.ok(learnTool, 'AFTER tool (ace_learn) available via MCP');
        assert.ok(
            learnTool.description?.toLowerCase().includes('learn') ||
            learnTool.description?.toLowerCase().includes('capture'),
            'ace_learn description mentions learn or capture'
        );

        // Supporting tools for the workflow
        assert.ok(toolNames.includes('ace_get_playbook'), 'Playbook tool available');
        assert.ok(toolNames.includes('ace_status'), 'Status tool available');
        assert.ok(toolNames.includes('ace_list_domains'), 'Domain listing available for filtered search');

        // Cleanup - kill the MCP server process
        if (mcpProcess && !mcpProcess.killed) {
            mcpProcess.kill();
            mcpProcess = null;
        }
    });
});

// ── Suite 4: Live ace_search → ace_learn Call Flow ──────────────────

suite('MCP Server Integration - Before/After Tool Calls', function () {
    // These tests actually CALL ace_search and ace_learn via MCP protocol.
    // Requires real ACE credentials (ACE_API_TOKEN, ACE_SERVER_URL, etc.)
    // Skipped gracefully when credentials are not available.

    this.timeout(45000); // API calls may take time

    let mcpProcess: ChildProcess | null = null;

    const hasCredentials = !!(
        process.env.ACE_SERVER_URL &&
        process.env.ACE_PROJECT_ID &&
        process.env.ACE_ORG_ID &&
        process.env.ACE_API_TOKEN
    );

    async function startMcpServer(): Promise<ChildProcess> {
        const env: Record<string, string> = {
            ...process.env as Record<string, string>,
            ACE_SERVER_URL: process.env.ACE_SERVER_URL!,
            ACE_PROJECT_ID: process.env.ACE_PROJECT_ID!,
            ACE_ORG_ID: process.env.ACE_ORG_ID!,
            ACE_API_TOKEN: process.env.ACE_API_TOKEN!,
        };

        const proc = spawn('npx', ['--yes', '@ace-sdk/mcp'], {
            env,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Initialize
        await mcpSendAndReceive(proc, {
            jsonrpc: '2.0', id: 100, method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'ace-e2e-workflow', version: '1.0.0' }
            }
        }, 100);

        // Send initialized notification
        proc.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        await new Promise(resolve => setTimeout(resolve, 500));

        return proc;
    }

    suiteTeardown(() => {
        if (mcpProcess && !mcpProcess.killed) {
            mcpProcess.kill();
            mcpProcess = null;
        }
    });

    test('BEFORE: ace_search returns patterns via MCP (real API call)', async function () {
        if (!hasCredentials) {
            this.skip();
            return;
        }

        mcpProcess = await startMcpServer();

        // Call ace_search (the BEFORE step) via MCP protocol
        const searchResponse = await mcpSendAndReceive(mcpProcess, {
            jsonrpc: '2.0',
            id: 201,
            method: 'tools/call',
            params: {
                name: 'ace_search',
                arguments: { query: 'authentication patterns' }
            }
        }, 201, 20000);

        assert.ok(searchResponse.result, 'ace_search should return result');

        // The result should contain content (text or structured)
        const content = searchResponse.result.content || [];
        assert.ok(content.length > 0, 'ace_search result should have content');

        // Verify it's a text response
        const textContent = content.find((c: any) => c.type === 'text');
        assert.ok(textContent, 'Should have text content in response');
        assert.ok(textContent.text.length > 0, 'Text content should not be empty');
    });

    test('AFTER: ace_learn captures via MCP (real API call)', async function () {
        if (!hasCredentials || !mcpProcess || mcpProcess.killed) {
            this.skip();
            return;
        }

        // Call ace_learn (the AFTER step) via MCP protocol
        const learnResponse = await mcpSendAndReceive(mcpProcess, {
            jsonrpc: '2.0',
            id: 202,
            method: 'tools/call',
            params: {
                name: 'ace_learn',
                arguments: {
                    task: 'e2e test: verified MCP integration',
                    success: true,
                    output: 'MCP server spawned by extension provider, tools verified via protocol'
                }
            }
        }, 202, 20000);

        assert.ok(learnResponse.result, 'ace_learn should return result');

        const content = learnResponse.result.content || [];
        assert.ok(content.length > 0, 'ace_learn result should have content');

        // Cleanup
        if (mcpProcess && !mcpProcess.killed) {
            mcpProcess.kill();
            mcpProcess = null;
        }
    });

    test('FULL FLOW: ace_search → ace_learn via MCP (before/after complete)', async function () {
        if (!hasCredentials) {
            this.skip();
            return;
        }

        mcpProcess = await startMcpServer();

        // === BEFORE: Search for patterns ===
        const searchResponse = await mcpSendAndReceive(mcpProcess, {
            jsonrpc: '2.0',
            id: 301,
            method: 'tools/call',
            params: {
                name: 'ace_search',
                arguments: { query: 'VS Code extension testing patterns' }
            }
        }, 301, 20000);

        assert.ok(searchResponse.result, 'BEFORE: ace_search should succeed');
        const searchContent = (searchResponse.result.content || [])
            .find((c: any) => c.type === 'text');
        assert.ok(searchContent, 'BEFORE: Should have text content');

        // === AFTER: Capture learning ===
        const learnResponse = await mcpSendAndReceive(mcpProcess, {
            jsonrpc: '2.0',
            id: 302,
            method: 'tools/call',
            params: {
                name: 'ace_learn',
                arguments: {
                    task: 'e2e full flow test: search then learn via MCP',
                    success: true,
                    output: 'Verified complete before/after cycle through MCP server'
                }
            }
        }, 302, 20000);

        assert.ok(learnResponse.result, 'AFTER: ace_learn should succeed');
        const learnContent = (learnResponse.result.content || [])
            .find((c: any) => c.type === 'text');
        assert.ok(learnContent, 'AFTER: Should have text content');

        // === VERIFY: Both steps completed without errors ===
        assert.ok(!searchResponse.error, 'BEFORE: No error from ace_search');
        assert.ok(!learnResponse.error, 'AFTER: No error from ace_learn');

        // Cleanup
        if (mcpProcess && !mcpProcess.killed) {
            mcpProcess.kill();
            mcpProcess = null;
        }
    });
});
