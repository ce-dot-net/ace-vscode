import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { isAuthenticated as sdkIsAuthenticated, loadUserAuth as sdkLoadUserAuth } from '@ace-sdk/core';
import { getProjectConfig as getProjectConfigImpl, type AceProjectConfig } from '../services/config';
import { MCP_PROVIDER_LABEL, getGlobalConfigPath } from '../constants';

/**
 * Dependencies for testing (constructor injection).
 * Production code uses real SDK implementations by default.
 */
export interface McpProviderDeps {
    isAuthenticated: () => boolean;
    loadUserAuth: () => { token?: string | null } | null;
    getProjectConfig: (folder?: vscode.WorkspaceFolder) => AceProjectConfig | null;
}

/**
 * MCP Server Definition Provider for ACE Pattern Learning.
 * Registers @ace-sdk/mcp as a stdio MCP server so ALL AI agents
 * (Claude, Codex, Copilot) can use ACE's 21 MCP tools.
 *
 * Uses the same pattern as ace-cursor: spawns `npx @ace-sdk/mcp`
 * with config passed via environment variables.
 */
export class AceMcpServerProvider implements vscode.McpServerDefinitionProvider {
    private readonly _onDidChange = new vscode.EventEmitter<void>();
    readonly onDidChangeMcpServerDefinitions = this._onDidChange.event;

    private readonly _disposables: vscode.Disposable[] = [];
    private readonly deps: McpProviderDeps;

    constructor(deps?: McpProviderDeps) {
        this.deps = deps ?? {
            isAuthenticated: sdkIsAuthenticated,
            loadUserAuth: sdkLoadUserAuth,
            getProjectConfig: getProjectConfigImpl,
        };

        // Re-register MCP server when ACE config changes
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('ace')) {
                    this._onDidChange.fire();
                }
            })
        );
    }

    provideMcpServerDefinitions(
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.McpServerDefinition[]> {
        if (!this.deps.isAuthenticated()) {
            return [];
        }

        const projectConfig = this.deps.getProjectConfig();
        if (!projectConfig) {
            return [];
        }

        // Build env vars for the MCP subprocess
        // @ace-sdk/mcp reads these to configure its AceClient
        const env: Record<string, string> = {
            ACE_SERVER_URL: projectConfig.serverUrl,
            ACE_PROJECT_ID: projectConfig.projectId,
            ACE_ORG_ID: projectConfig.orgId,
            ACE_CLIENT_ID: 'copilot',
        };

        // Pass token explicitly (also available via config file,
        // but env var ensures it works even if config is stale)
        const userAuth = this.deps.loadUserAuth();
        if (userAuth?.token) {
            env.ACE_API_TOKEN = userAuth.token;
        }

        const def = new vscode.McpStdioServerDefinition(
            MCP_PROVIDER_LABEL,
            'npx',
            ['--yes', '@ace-sdk/mcp@^3.1.2'],
            env
        );

        // VS Code 1.118+ tightens MCP sandbox: $HOME paths denied by default.
        // Grant read access to ACE config locations so the MCP subprocess
        // (npx @ace-sdk/mcp) can read ~/.config/ace/config.json + legacy ~/.ace.
        // Cast: `sandboxFilePermissions` is 1.118-only and not yet declared in
        // @types/vscode. Gate on `'sandboxFilePermissions' in def` so pre-1.118
        // hosts (where the property is undeclared) simply skip assignment and
        // the spawned MCP runs unsandboxed as before.
        if ('sandboxFilePermissions' in def) {
            const sandboxPaths = [getGlobalConfigPath(), path.join(os.homedir(), '.ace')];
            (def as unknown as { sandboxFilePermissions: { path: string; permissions: string }[] })
                .sandboxFilePermissions = sandboxPaths.map(p => ({ path: p, permissions: 'read' }));
        }

        return [def];
    }

    /**
     * Signal that MCP server definitions have changed
     * (e.g., after login/logout or config update)
     */
    fireChanged(): void {
        this._onDidChange.fire();
    }

    dispose(): void {
        this._disposables.forEach(d => d.dispose());
        this._onDidChange.dispose();
    }
}
