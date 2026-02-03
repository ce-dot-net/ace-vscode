/**
 * ACE Configuration Panel - Device Login First Design
 * Uses @ace-sdk/core for auth and config management
 *
 * Three UI states:
 * 1. Not logged in - Show login button, hide org/project, disable save
 * 2. Logged in - Show user email, org/project selection, enable save
 * 3. Expired - Show re-login prompt, hide org/project, disable save
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { saveProjectConfig } from '../services/config';
import { DEFAULT_SERVER_URL } from '../constants';
import {
    isAuthenticated,
    listProjects,
    loadUserAuth,
    getDefaultOrgId,
    loadConfig,
    logout as sdkLogout
} from '@ace-sdk/core';
import { handleLogin } from '../commands/login';

/**
 * Escapes HTML special characters to prevent XSS
 */
function escapeHtml(str: string | undefined): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Format time remaining from ISO date string
 */
function formatTimeRemaining(isoDate: string | undefined): string {
    if (!isoDate) return '';
    const expires = new Date(isoDate).getTime();
    const now = Date.now();
    const diffMs = expires - now;
    if (diffMs <= 0) return 'Expired';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    return `${hours}h`;
}

/**
 * Configuration Panel - Device Login First Design (Cursor-style)
 */
export class ConfigPanel {
    public static currentPanel: ConfigPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _targetFolder: vscode.WorkspaceFolder | undefined;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, folder?: vscode.WorkspaceFolder) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel exists, show it (recreate if folder changed)
        if (ConfigPanel.currentPanel) {
            if (ConfigPanel.currentPanel._targetFolder?.uri.toString() === folder?.uri.toString()) {
                ConfigPanel.currentPanel._panel.reveal(column);
                return;
            }
            // Different folder - dispose and recreate
            ConfigPanel.currentPanel.dispose();
        }

        // Determine title based on folder context
        const title = folder
            ? `ACE Configuration - ${folder.name}`
            : 'ACE Configuration';

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'aceConfig',
            title,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        ConfigPanel.currentPanel = new ConfigPanel(panel, extensionUri, folder);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, folder?: vscode.WorkspaceFolder) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._targetFolder = folder;

        // Set initial HTML
        this._update();

        // Handle disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'save':
                        await this._saveConfiguration(message.data);
                        break;
                    case 'close':
                        this._panel.dispose();
                        break;
                    case 'updateAgents':
                        await vscode.commands.executeCommand('ace-vscode.updateAgents');
                        this._panel.webview.postMessage({
                            command: 'updateAgentsResult',
                            success: true
                        });
                        break;
                    case 'fetchProjects':
                        await this._fetchProjectsForOrg(message.orgId);
                        break;
                    case 'login':
                        await this._handleLogin();
                        break;
                    case 'logout':
                        await this._handleLogout();
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * Load existing configuration from SDK and workspace settings
     */
    private _loadExistingConfig(): {
        serverUrl?: string;
        orgId?: string;
        projectId?: string;
        orgs?: Record<string, { orgName: string; projects: Array<{ project_id: string; project_name?: string }> }>;
        auth?: {
            isLoggedIn: boolean;
            email?: string;
            organizations?: Array<{ org_id: string; name?: string; role?: string }>;
            expiresAt?: string;
            refreshExpiresAt?: string;
            absoluteExpiresAt?: string;
        };
    } | null {
        try {
            // Use SDK to load config
            const config = loadConfig();
            const userAuth = loadUserAuth();

            // Load workspace context from VSCode settings (folder-aware)
            const workspaceConfig = vscode.workspace.getConfiguration('ace', this._targetFolder?.uri);
            const projectId = workspaceConfig.get<string>('projectId') || '';
            let orgId = workspaceConfig.get<string>('orgId') || '';

            // Build orgs map from user auth organizations
            const orgs: Record<string, { orgName: string; projects: Array<{ project_id: string; project_name?: string }> }> = {};

            // Add orgs from user auth (device code flow)
            if (userAuth?.organizations) {
                for (const org of userAuth.organizations) {
                    if (org.org_id) {
                        orgs[org.org_id] = {
                            orgName: org.name || org.org_id,
                            projects: [] // Projects fetched on demand via listProjects()
                        };
                    }
                }
            }

            // Use SDK functions to check auth status
            const isLoggedIn = isAuthenticated();
            const defaultOrgId = getDefaultOrgId();

            // Determine orgId: workspace setting > default > first org
            if (!orgId) {
                orgId = defaultOrgId || Object.keys(orgs)[0] || '';
            }

            return {
                serverUrl: config?.serverUrl,
                orgId,
                projectId: projectId || config?.projectId,
                orgs,
                auth: isLoggedIn ? {
                    isLoggedIn: true,
                    email: userAuth?.email,
                    organizations: userAuth?.organizations,
                    expiresAt: userAuth?.expires_at,
                    refreshExpiresAt: userAuth?.refresh_expires_at,
                    absoluteExpiresAt: userAuth?.absolute_expires_at
                } : undefined
            };
        } catch {
            return null;
        }
    }

    /**
     * Fetch projects for a specific organization using SDK's listProjects()
     */
    private async _fetchProjectsForOrg(orgId: string) {
        try {
            // Use SDK's listProjects() which works with user tokens
            const allProjects = await listProjects();

            // Filter projects by orgId if specified
            const projects = allProjects.filter((p: { org_id?: string; orgId?: string }) => {
                const projectOrgId = p.org_id || p.orgId;
                return !orgId || projectOrgId === orgId;
            });

            this._panel.webview.postMessage({
                command: 'projectsResult',
                success: true,
                orgId: orgId,
                projects: projects
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'projectsResult',
                success: false,
                orgId: orgId,
                message: `Failed to fetch projects: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    /**
     * Handle browser-based login via device code flow
     */
    private async _handleLogin() {
        try {
            this._panel.webview.postMessage({
                command: 'loginStarted'
            });

            const user = await handleLogin();

            if (user) {
                this._panel.webview.postMessage({
                    command: 'loginResult',
                    success: true,
                    user: {
                        email: user.email,
                        organizations: user.organizations
                    }
                });
            } else {
                this._panel.webview.postMessage({
                    command: 'loginResult',
                    success: false,
                    message: 'Login cancelled'
                });
            }
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'loginResult',
                success: false,
                message: `Login failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    /**
     * Handle logout - clear auth tokens
     */
    private async _handleLogout() {
        try {
            this._panel.webview.postMessage({
                command: 'logoutStarted'
            });

            // Call SDK logout function
            sdkLogout();

            this._panel.webview.postMessage({
                command: 'logoutResult',
                success: true
            });

            vscode.window.showInformationMessage('ACE: Logged out successfully');
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'logoutResult',
                success: false,
                message: `Logout failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    /**
     * Save configuration - requires user to be logged in
     */
    private async _saveConfiguration(data: {
        serverUrl: string;
        orgId: string;
        projectId: string;
    }) {
        try {
            // Verify user is logged in
            if (!isAuthenticated()) {
                this._panel.webview.postMessage({
                    command: 'saveResult',
                    success: false,
                    message: 'Please login first using the "Login with Browser" button'
                });
                return;
            }

            const configDir = path.join(process.env.HOME || '', '.config', 'ace');
            const configPath = path.join(configDir, 'config.json');

            // Ensure directory exists
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            // Load existing config
            let existingConfig: Record<string, unknown> = {};
            if (fs.existsSync(configPath)) {
                try {
                    existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                } catch {
                    // Start fresh if invalid
                }
            }

            // Build config - user token flow only (no apiToken field)
            const config: Record<string, unknown> = {
                ...existingConfig,
                serverUrl: data.serverUrl,
                projectId: data.projectId,
                cacheTtlMinutes: (existingConfig.cacheTtlMinutes as number) || 120,
                auth: {
                    ...(existingConfig.auth as Record<string, unknown> || {}),
                    default_org_id: data.orgId
                }
            };

            // Write config with secure permissions
            if (process.platform !== 'win32') {
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
            } else {
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            }

            // Save project context to workspace (folder-aware)
            await saveProjectConfig(data.projectId, data.orgId, this._targetFolder);

            const folderMsg = this._targetFolder ? ` for "${this._targetFolder.name}"` : '';
            this._panel.webview.postMessage({
                command: 'saveResult',
                success: true,
                message: `Configuration saved${folderMsg}`
            });

            vscode.window.showInformationMessage(`ACE configured${folderMsg}! Use @ace in Copilot Chat.`);
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'saveResult',
                success: false,
                message: `Save failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private _update() {
        const existingConfig = this._loadExistingConfig();
        this._panel.webview.html = this._getConfigureHtml(existingConfig);
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private _getConfigureHtml(existingConfig: {
        serverUrl?: string;
        orgId?: string;
        projectId?: string;
        orgs?: Record<string, { orgName: string; projects: Array<{ project_id: string; project_name?: string }> }>;
        auth?: {
            isLoggedIn: boolean;
            email?: string;
            organizations?: Array<{ org_id: string; name?: string; role?: string }>;
            expiresAt?: string;
            refreshExpiresAt?: string;
            absoluteExpiresAt?: string;
        };
    } | null) {
        const nonce = this._getNonce();
        const cspSource = this._panel.webview.cspSource;

        // Check auth state
        const isLoggedIn = existingConfig?.auth?.isLoggedIn || false;
        const userEmail = existingConfig?.auth?.email || '';
        const accessExpiry = formatTimeRemaining(existingConfig?.auth?.expiresAt);
        const hardCapExpiry = formatTimeRemaining(existingConfig?.auth?.absoluteExpiresAt);
        const isExpired = accessExpiry === 'Expired' || hardCapExpiry === 'Expired';

        const serverUrl = escapeHtml(existingConfig?.serverUrl) || DEFAULT_SERVER_URL;
        const orgId = escapeHtml(existingConfig?.orgId) || '';
        const projectId = escapeHtml(existingConfig?.projectId) || '';

        const orgs = existingConfig?.orgs || {};
        const orgsJson = JSON.stringify(orgs);
        const orgsArray = Object.entries(orgs).map(([id, data]) => ({
            id,
            name: data.orgName || id,
            projects: data.projects || []
        }));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'nonce-${nonce}';">
    <title>ACE Configuration</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 30px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            max-width: 600px;
            margin: 0 auto;
        }
        .header {
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            margin: 0 0 10px 0;
            font-size: 24px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
        }
        .input-group {
            display: flex;
            gap: 10px;
        }
        input, select {
            flex: 1;
            padding: 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-size: 14px;
            font-family: var(--vscode-font-family);
        }
        input:focus, select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .quick-select {
            flex: 0 0 auto;
            padding: 10px 15px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .quick-select:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .help-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 30px;
        }
        button {
            flex: 1;
            padding: 12px 20px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground);
        }
        .btn-primary:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .btn-connected {
            background: var(--vscode-testing-iconPassed) !important;
            color: white !important;
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .status-message {
            margin-top: 15px;
            padding: 12px;
            border-radius: 4px;
            display: none;
        }
        .status-success {
            background: var(--vscode-testing-iconPassed);
            color: white;
        }
        .status-error {
            background: var(--vscode-testing-iconFailed);
            color: white;
        }
        .status-info {
            background: var(--vscode-notifications-background);
            color: var(--vscode-notifications-foreground);
        }
        .info-box {
            margin-top: 30px;
            padding: 15px;
            background: var(--vscode-notifications-background);
            border-radius: 6px;
            border-left: 4px solid var(--vscode-textLink-foreground);
        }
        .info-box h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
        }
        .info-box p {
            margin: 5px 0;
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>ACE Configuration</h1>
        ${this._targetFolder ? `<p style="color: var(--vscode-textLink-foreground); margin: 0 0 8px 0; font-weight: 500;">📁 Project: ${escapeHtml(this._targetFolder.name)}</p>` : ''}
        <p style="color: var(--vscode-descriptionForeground); margin: 0;">
            Configure your ACE server connection for automatic pattern learning
        </p>
    </div>

    <form id="configForm">
        <div class="form-group">
            <label for="serverUrl">Server URL</label>
            <div class="input-group">
                <input type="url" id="serverUrl" name="serverUrl"
                    value="${serverUrl}"
                    placeholder="https://ace-api.code-engine.app" required>
                <button type="button" class="quick-select" id="setProductionUrl">
                    Production
                </button>
            </div>
        </div>

        <div class="form-group">
            <label>Authentication</label>
            <div class="input-group" style="margin-bottom: 10px;">
                <button type="button" class="btn-primary" id="loginBtn" style="flex: 2;">
                    Login with Browser
                </button>
                <button type="button" class="btn-secondary" id="logoutBtn" style="flex: 1; display: none;">
                    Logout
                </button>
            </div>
            <div id="authStatus" style="padding: 8px; background: var(--vscode-notifications-background); border-radius: 4px; display: none;"></div>
        </div>

        <div class="form-group" id="orgGroup" style="display: none;">
            <label for="orgId">Organization</label>
            <select id="orgId" name="orgId" required>
                <option value="">-- Select Organization --</option>
                ${orgsArray.map(org => `
                    <option value="${escapeHtml(org.id)}"
                        ${org.id === orgId ? 'selected' : ''}
                        data-projects='${JSON.stringify(org.projects)}'>
                        ${escapeHtml(org.name)} (${escapeHtml(org.id)})
                    </option>
                `).join('')}
            </select>
            <input type="text" id="orgIdManual" name="orgIdManual"
                value="${orgId}"
                placeholder="org_xxxxx"
                style="margin-top: 10px; display: none;">
        </div>

        <div class="form-group" id="projectGroup" style="display: none;">
            <label for="projectId">Project</label>
            <select id="projectId" name="projectId" required>
                <option value="">-- Select Project --</option>
                ${projectId ? `<option value="${projectId}" selected>${projectId}</option>` : ''}
            </select>
            <input type="text" id="projectIdManual" name="projectIdManual"
                value="${projectId}"
                placeholder="prj_xxxxx"
                style="margin-top: 10px; display: none;">
        </div>

        <div class="button-group">
            <button type="submit" class="btn-primary" id="saveBtn" disabled title="Login first to save configuration">
                Save Configuration
            </button>
        </div>

        <div id="statusMessage" class="status-message"></div>
    </form>

    <div class="info-box">
        <h3>How ACE Works with GitHub Copilot</h3>
        <p>After saving, use <code>@ace</code> in Copilot Chat to search patterns.</p>
        <p>The AI calls <code>ace_search</code> before tasks and <code>ace_learn</code> after.</p>
    </div>

    <div class="info-box" style="margin-top: 20px; border-left-color: var(--vscode-charts-green);">
        <h3>First-Time Setup</h3>
        <p>If you use Claude Code, update the agent files to enable ACE integration:</p>
        <button type="button" class="btn-secondary" id="updateAgentsBtn" style="margin-top: 10px;">
            Update Agent Files
        </button>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const orgsData = ${orgsJson};

        // Initialize auth state from existing config
        let isUserLoggedIn = ${isLoggedIn ? 'true' : 'false'};
        const existingEmail = '${escapeHtml(userEmail)}';
        const accessExpiry = '${accessExpiry}';
        const hardCapExpiry = '${hardCapExpiry}';
        const isExpired = ${isExpired ? 'true' : 'false'};

        // Existing workspace config values
        const existingOrgId = '${escapeHtml(orgId)}';
        const existingProjectId = '${escapeHtml(projectId)}';

        (function init() {
            document.getElementById('setProductionUrl').addEventListener('click', () => {
                document.getElementById('serverUrl').value = 'https://ace-api.code-engine.app';
            });

            const orgSelect = document.getElementById('orgId');
            orgSelect.addEventListener('change', onOrgChange);

            document.getElementById('configForm').addEventListener('submit', handleSubmit);

            document.getElementById('updateAgentsBtn').addEventListener('click', () => {
                vscode.postMessage({ command: 'updateAgents' });
                showStatus('Updating agent files...', 'info');
            });

            // Login with browser button
            document.getElementById('loginBtn').addEventListener('click', () => {
                document.getElementById('loginBtn').disabled = true;
                document.getElementById('loginBtn').textContent = 'Opening browser...';
                vscode.postMessage({ command: 'login' });
            });

            // Logout button
            document.getElementById('logoutBtn').addEventListener('click', () => {
                document.getElementById('logoutBtn').disabled = true;
                document.getElementById('logoutBtn').textContent = 'Logging out...';
                vscode.postMessage({ command: 'logout' });
            });

            // Initialize UI based on auth state
            updateAuthUI();

            // Trigger org change if one is selected
            if (orgSelect.value && isUserLoggedIn && !isExpired) {
                onOrgChange();
            }
        })();

        function updateAuthUI() {
            const loginBtn = document.getElementById('loginBtn');
            const logoutBtn = document.getElementById('logoutBtn');
            const authStatus = document.getElementById('authStatus');
            const saveBtn = document.getElementById('saveBtn');
            const orgGroup = document.getElementById('orgGroup');
            const projectGroup = document.getElementById('projectGroup');

            if (isExpired && existingEmail) {
                // Token expired - show re-login prompt
                loginBtn.textContent = 'Re-login Required';
                loginBtn.classList.remove('btn-connected');
                loginBtn.style.background = 'var(--vscode-testing-iconFailed)';
                loginBtn.style.color = 'white';
                logoutBtn.style.display = 'block';

                let expiredHtml = '⚠️ Session expired for ' + existingEmail;
                if (existingOrgId || existingProjectId) {
                    expiredHtml += '<br><small style="opacity: 0.8;">Current config: ' + (existingOrgId || 'no org') + ' / ' + (existingProjectId || 'no project') + '</small>';
                }
                expiredHtml += '<br><small style="opacity: 0.8;">Please re-login to continue using ACE.</small>';
                authStatus.innerHTML = expiredHtml;
                authStatus.style.display = 'block';
                authStatus.style.background = 'var(--vscode-inputValidation-warningBackground)';

                saveBtn.disabled = true;
                saveBtn.title = 'Re-login required - session expired';
                orgGroup.style.display = 'none';
                projectGroup.style.display = 'none';

                showStatus('Session expired. Please re-login to continue.', 'error');
            } else if (isUserLoggedIn && existingEmail) {
                // Logged in with valid token
                loginBtn.textContent = '✓ Logged In';
                loginBtn.classList.add('btn-connected');
                logoutBtn.style.display = 'block';

                // Build auth status with expiration info
                let statusHtml = '✅ Logged in as ' + existingEmail;
                if (accessExpiry || hardCapExpiry) {
                    statusHtml += '<br><small style="opacity: 0.8;">';
                    if (accessExpiry) statusHtml += '⏱️ Session: ' + accessExpiry + ' (auto-extends on use)';
                    if (hardCapExpiry) statusHtml += ' · 🔒 Hard cap: ' + hardCapExpiry;
                    statusHtml += '</small>';
                }
                authStatus.innerHTML = statusHtml;
                authStatus.style.display = 'block';
                authStatus.style.background = '';

                saveBtn.disabled = false;
                saveBtn.title = '';
                orgGroup.style.display = 'block';
                projectGroup.style.display = 'block';

                showStatus('Already logged in. Select organization and project, then save.', 'success');
            } else {
                // Not logged in
                authStatus.innerHTML = '🔒 Please login to configure ACE';
                authStatus.style.display = 'block';
                saveBtn.disabled = true;
                saveBtn.title = 'Login first to save configuration';
                orgGroup.style.display = 'none';
                projectGroup.style.display = 'none';

                showStatus('Login required to configure ACE.', 'info');
            }
        }

        function onOrgChange() {
            const orgSelect = document.getElementById('orgId');
            const projectSelect = document.getElementById('projectId');
            const projectManual = document.getElementById('projectIdManual');
            const orgIdManual = document.getElementById('orgIdManual');

            const selectedOption = orgSelect.options[orgSelect.selectedIndex];
            const orgId = orgSelect.value;

            if (orgId) {
                orgIdManual.value = orgId;
                orgIdManual.style.display = 'none';
            } else {
                orgIdManual.style.display = 'block';
            }

            // Clear and reset projects
            while (projectSelect.firstChild) {
                projectSelect.removeChild(projectSelect.firstChild);
            }
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '-- Select Project --';
            projectSelect.appendChild(defaultOption);

            // For logged-in users, fetch projects from server
            if (isUserLoggedIn && orgId) {
                showStatus('Loading projects...', 'info');
                vscode.postMessage({
                    command: 'fetchProjects',
                    orgId: orgId
                });
                projectSelect.style.display = 'block';
                projectManual.style.display = 'none';
                return;
            }

            // Fall back to cached projects
            if (selectedOption && selectedOption.dataset.projects) {
                try {
                    const projects = JSON.parse(selectedOption.dataset.projects);
                    populateProjects(projects, existingProjectId);
                } catch (e) {
                    projectSelect.style.display = 'none';
                    projectManual.style.display = 'block';
                }
            } else {
                projectSelect.style.display = 'none';
                projectManual.style.display = 'block';
            }
        }

        function populateProjects(projects, preSelectProjectId) {
            const projectSelect = document.getElementById('projectId');
            const projectManual = document.getElementById('projectIdManual');
            const targetProjectId = preSelectProjectId || existingProjectId;

            while (projectSelect.firstChild) {
                projectSelect.removeChild(projectSelect.firstChild);
            }
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '-- Select Project --';
            projectSelect.appendChild(defaultOption);

            let targetFound = false;

            if (projects && projects.length > 0) {
                projects.forEach(project => {
                    const projectId = typeof project === 'string' ? project : (project.project_id || project.id);
                    const projectName = typeof project === 'string' ? project : (project.project_name || project.name || projectId);
                    const option = document.createElement('option');
                    option.value = projectId;
                    option.textContent = projectName + (projectId !== projectName ? ' (' + projectId + ')' : '');
                    if (projectId === targetProjectId) {
                        option.selected = true;
                        targetFound = true;
                    }
                    projectSelect.appendChild(option);
                });
            }

            // Add existing project if not in list
            if (targetProjectId && !targetFound) {
                const existingOption = document.createElement('option');
                existingOption.value = targetProjectId;
                existingOption.textContent = targetProjectId + ' (current)';
                existingOption.selected = true;
                projectSelect.appendChild(existingOption);
            }

            if ((projects && projects.length > 0) || targetProjectId) {
                projectSelect.style.display = 'block';
                projectManual.style.display = 'none';
            } else {
                projectSelect.style.display = 'none';
                projectManual.style.display = 'block';
            }
        }

        function handleSubmit(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const orgId = formData.get('orgId') || formData.get('orgIdManual');
            const projectId = formData.get('projectId') || formData.get('projectIdManual');

            const data = {
                serverUrl: formData.get('serverUrl'),
                orgId: orgId,
                projectId: projectId
            };

            if (!data.serverUrl || !data.orgId || !data.projectId) {
                showStatus('Please fill in all required fields', 'error');
                return;
            }

            if (!isUserLoggedIn) {
                showStatus('Please login first before saving', 'error');
                return;
            }

            showStatus('Saving configuration...', 'info');
            vscode.postMessage({ command: 'save', data: data });
        }

        function showStatus(message, type) {
            const statusEl = document.getElementById('statusMessage');
            statusEl.textContent = message;
            statusEl.className = 'status-message status-' + type;
            statusEl.style.display = 'block';
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'saveResult':
                    showStatus(message.message, message.success ? 'success' : 'error');
                    if (message.success) {
                        setTimeout(() => {
                            vscode.postMessage({ command: 'close' });
                        }, 2000);
                    }
                    break;
                case 'loginStarted':
                    document.getElementById('authStatus').style.display = 'block';
                    document.getElementById('authStatus').innerHTML = '⏳ Opening browser for login...';
                    break;
                case 'loginResult':
                    const loginBtn = document.getElementById('loginBtn');
                    const authStatus = document.getElementById('authStatus');
                    const orgGroup = document.getElementById('orgGroup');
                    const projectGroup = document.getElementById('projectGroup');
                    loginBtn.disabled = false;
                    loginBtn.style.background = '';
                    loginBtn.style.color = '';

                    if (message.success && message.user) {
                        isUserLoggedIn = true;
                        loginBtn.textContent = '✓ Logged In';
                        loginBtn.classList.add('btn-connected');
                        document.getElementById('logoutBtn').style.display = 'block';
                        authStatus.innerHTML = '✅ Logged in as ' + message.user.email;
                        authStatus.style.display = 'block';
                        authStatus.style.background = '';

                        // Enable Save button
                        document.getElementById('saveBtn').disabled = false;
                        document.getElementById('saveBtn').title = '';

                        // Show org and project groups
                        orgGroup.style.display = 'block';
                        projectGroup.style.display = 'block';

                        // Populate organizations from login
                        if (message.user.organizations && message.user.organizations.length > 0) {
                            const orgSelect = document.getElementById('orgId');
                            while (orgSelect.options.length > 1) {
                                orgSelect.remove(1);
                            }
                            message.user.organizations.forEach(org => {
                                const option = document.createElement('option');
                                option.value = org.org_id;
                                option.textContent = (org.name || org.org_name || 'Unknown') + ' (' + org.org_id + ')';
                                option.dataset.projects = '[]';
                                orgSelect.appendChild(option);
                            });

                            // Pre-select existing org or first org
                            const matchingOrg = message.user.organizations.find(org => org.org_id === existingOrgId);
                            if (matchingOrg) {
                                orgSelect.value = existingOrgId;
                            } else if (message.user.organizations.length > 0) {
                                orgSelect.value = message.user.organizations[0].org_id;
                            }
                            orgSelect.dispatchEvent(new Event('change'));
                            orgSelect.style.display = 'block';
                            document.getElementById('orgIdManual').style.display = 'none';
                        }

                        showStatus('Login successful!', 'success');
                    } else {
                        loginBtn.textContent = 'Login with Browser';
                        authStatus.innerHTML = '❌ ' + (message.message || 'Login failed');
                        authStatus.style.display = 'block';
                        showStatus(message.message || 'Login failed', 'error');
                    }
                    break;
                case 'projectsResult':
                    if (message.success && message.projects) {
                        populateProjects(message.projects, existingProjectId);
                        showStatus('Projects loaded.', 'success');
                    } else {
                        showStatus(message.message || 'Failed to load projects', 'error');
                        document.getElementById('projectId').style.display = 'none';
                        document.getElementById('projectIdManual').style.display = 'block';
                    }
                    break;
                case 'logoutStarted':
                    document.getElementById('authStatus').style.display = 'block';
                    document.getElementById('authStatus').innerHTML = '⏳ Logging out...';
                    break;
                case 'logoutResult':
                    const logoutBtn = document.getElementById('logoutBtn');
                    const loginBtnLogout = document.getElementById('loginBtn');
                    const authStatusLogout = document.getElementById('authStatus');
                    const orgGroupLogout = document.getElementById('orgGroup');
                    const projectGroupLogout = document.getElementById('projectGroup');
                    logoutBtn.disabled = false;
                    logoutBtn.textContent = 'Logout';

                    if (message.success) {
                        isUserLoggedIn = false;
                        loginBtnLogout.textContent = 'Login with Browser';
                        loginBtnLogout.classList.remove('btn-connected');
                        loginBtnLogout.style.background = '';
                        loginBtnLogout.style.color = '';
                        logoutBtn.style.display = 'none';

                        authStatusLogout.innerHTML = '🔒 Please login to configure ACE';
                        authStatusLogout.style.display = 'block';
                        authStatusLogout.style.background = '';

                        document.getElementById('saveBtn').disabled = true;
                        document.getElementById('saveBtn').title = 'Login first to save configuration';

                        orgGroupLogout.style.display = 'none';
                        projectGroupLogout.style.display = 'none';

                        showStatus('Logged out successfully.', 'info');
                    } else {
                        authStatusLogout.innerHTML = '❌ ' + (message.message || 'Logout failed');
                        authStatusLogout.style.display = 'block';
                        showStatus(message.message || 'Logout failed', 'error');
                    }
                    break;
                case 'updateAgentsResult':
                    if (message.success) {
                        showStatus('Agent files created in .github/agents/ folder!', 'success');
                    } else {
                        showStatus('Failed to create agent files', 'error');
                    }
                    break;
            }
        });
    </script>
</body>
</html>`;
    }

    public dispose() {
        ConfigPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
