import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { saveProjectConfig, saveGlobalConfig } from '../services/config';
import { DEFAULT_SERVER_URL } from '../constants';
import { AceClient, type AceConfig, isAuthenticated, getCurrentUser, type CurrentUser } from '@ace-sdk/core';
import { handleLogin, getHardCapInfo } from '../commands/login';

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
 * Configuration Panel - Simple single-page form (Cursor-style)
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
                    case 'validate':
                        await this._validateConnection(message.data);
                        break;
                    case 'save':
                        await this._saveConfiguration(message.data);
                        break;
                    case 'close':
                        this._panel.dispose();
                        break;
                    case 'updateAgents':
                        await vscode.commands.executeCommand('ace-vscode.updateAgents');
                        // Send success feedback to webview
                        this._panel.webview.postMessage({
                            command: 'updateAgentsResult',
                            success: true
                        });
                        break;
                    case 'fetchProjects':
                        await this._fetchProjectsFromServer(message.data);
                        break;
                    case 'login':
                        await this._handleDeviceLogin();
                        break;
                    case 'getAuthStatus':
                        this._sendAuthStatus();
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    /**
     * Load existing configuration from global config file
     * Config structure: { serverUrl, apiToken, orgs: { [orgId]: { orgName, apiToken, projects } } }
     */
    private _loadExistingConfig(): {
        serverUrl?: string;
        apiToken?: string;
        orgId?: string;
        projectId?: string;
        orgs?: Record<string, { orgName: string; apiToken: string; projects: Array<string | { project_id: string; project_name?: string }> }>;
    } | null {
        const globalConfigPath = path.join(process.env.HOME || '', '.config', 'ace', 'config.json');

        if (!fs.existsSync(globalConfigPath)) {
            return null;
        }

        try {
            const config = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));

            // Load workspace context from VSCode settings (folder-aware)
            const workspaceConfig = vscode.workspace.getConfiguration('ace', this._targetFolder?.uri);
            let projectId = workspaceConfig.get<string>('projectId') || '';
            let orgId = workspaceConfig.get<string>('orgId') || '';

            // Get first org if no workspace context
            if (!orgId && config.orgs) {
                orgId = Object.keys(config.orgs)[0] || '';
            }

            return {
                serverUrl: config.serverUrl,
                apiToken: config.apiToken,
                orgId: orgId,
                projectId: projectId || config.projectId,
                orgs: config.orgs // This is Record<string, { orgName, apiToken, projects }>
            };
        } catch {
            return null;
        }
    }

    /**
     * Validate connection using SDK
     */
    private async _validateConnection(data: { serverUrl: string; apiToken: string }) {
        try {
            const tempConfig: AceConfig = {
                serverUrl: data.serverUrl,
                apiToken: data.apiToken,
                projectId: 'temp',
                cacheTtlMinutes: 5
            };
            const client = new AceClient(tempConfig);
            const verification = await client.verifyToken();

            this._panel.webview.postMessage({
                command: 'validationResult',
                success: true,
                message: `Connection validated! Organization: ${verification.org_name || verification.org_id}`,
                data: {
                    orgId: verification.org_id,
                    orgName: verification.org_name,
                    projects: verification.projects
                }
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'validationResult',
                success: false,
                message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    /**
     * Fetch projects from server with names (not just IDs from saved config)
     */
    private async _fetchProjectsFromServer(data: { serverUrl: string; apiToken: string }) {
        try {
            const tempConfig: AceConfig = {
                serverUrl: data.serverUrl,
                apiToken: data.apiToken,
                projectId: 'temp',
                cacheTtlMinutes: 5
            };
            const client = new AceClient(tempConfig);
            const verification = await client.verifyToken();

            this._panel.webview.postMessage({
                command: 'projectsResult',
                success: true,
                data: {
                    orgId: verification.org_id,
                    orgName: verification.org_name,
                    projects: verification.projects
                }
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'projectsResult',
                success: false,
                message: `Failed to fetch projects: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    /**
     * Handle device code login flow
     */
    private async _handleDeviceLogin() {
        try {
            this._panel.webview.postMessage({
                command: 'loginStatus',
                status: 'in_progress',
                message: 'Opening browser for login...'
            });

            const user = await handleLogin();

            if (user) {
                this._panel.webview.postMessage({
                    command: 'loginResult',
                    success: true,
                    user: {
                        email: user.email,
                        organizations: user.organizations,
                        default_org_id: user.default_org_id
                    }
                });
                // Refresh the panel to show logged-in state
                this._update();
            } else {
                this._panel.webview.postMessage({
                    command: 'loginResult',
                    success: false,
                    message: 'Login cancelled or failed'
                });
            }
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'loginResult',
                success: false,
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Send current auth status to webview
     */
    private _sendAuthStatus() {
        const authenticated = isAuthenticated();
        const user = getCurrentUser();
        const hardCap = getHardCapInfo();

        this._panel.webview.postMessage({
            command: 'authStatus',
            authenticated,
            user: user ? {
                email: user.email,
                organizations: user.organizations,
                default_org_id: user.default_org_id
            } : null,
            hardCap: hardCap ? {
                daysRemaining: hardCap.daysRemaining,
                hoursRemaining: hardCap.hoursRemaining,
                isApproaching: hardCap.isApproaching,
                isExpired: hardCap.isExpired
            } : null
        });
    }

    /**
     * Save configuration to global config file and workspace settings
     */
    private async _saveConfiguration(data: {
        serverUrl: string;
        apiToken: string;
        orgId: string;
        orgName?: string;
        projectId: string;
    }) {
        try {
            const configDir = path.join(process.env.HOME || '', '.config', 'ace');
            const configPath = path.join(configDir, 'config.json');

            // Ensure directory exists
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            // Load existing config or create new
            let existingConfig: Record<string, any> = {};
            if (fs.existsSync(configPath)) {
                try {
                    existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                } catch {
                    // Start fresh if invalid
                }
            }

            // Merge new values
            const config: Record<string, any> = {
                ...existingConfig,
                serverUrl: data.serverUrl,
                apiToken: data.apiToken,
                projectId: data.projectId,
                cacheTtlMinutes: existingConfig.cacheTtlMinutes || 120
            };

            // Update orgs section (Record<string, { orgName, apiToken, projects }>)
            if (!config.orgs) {
                config.orgs = {};
            }

            const existingProjects = config.orgs[data.orgId]?.projects || [];
            const projectExists = existingProjects.some((p: any) => {
                const existingId = typeof p === 'string' ? p : (p.project_id || p.id);
                return existingId === data.projectId;
            });

            if (!projectExists) {
                existingProjects.push({ project_id: data.projectId });
            }

            config.orgs[data.orgId] = {
                orgName: data.orgName || config.orgs[data.orgId]?.orgName || data.orgId,
                apiToken: data.apiToken,
                projects: existingProjects
            };

            // Write config with secure permissions
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });

            // Save project context to workspace (folder-aware)
            await saveProjectConfig(data.projectId, data.orgId, this._targetFolder);

            this._panel.webview.postMessage({
                command: 'saveResult',
                success: true,
                message: 'Configuration saved successfully!'
            });

            const folderMsg = this._targetFolder ? ` for "${this._targetFolder.name}"` : '';
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
        apiToken?: string;
        orgId?: string;
        projectId?: string;
        orgs?: Record<string, { orgName: string; apiToken: string; projects: Array<string | { project_id: string; project_name?: string }> }>;
    } | null) {
        const nonce = this._getNonce();
        const cspSource = this._panel.webview.cspSource;

        const serverUrl = escapeHtml(existingConfig?.serverUrl) || DEFAULT_SERVER_URL;
        let apiToken = escapeHtml(existingConfig?.apiToken) || '';
        const orgId = escapeHtml(existingConfig?.orgId) || '';
        const projectId = escapeHtml(existingConfig?.projectId) || '';

        // orgs is Record<string, { orgName, apiToken, projects }>
        const orgs = existingConfig?.orgs || {};
        const orgsJson = JSON.stringify(orgs);

        // Convert to array for dropdown
        const orgsArray = Object.entries(orgs).map(([id, data]) => ({
            id,
            name: data.orgName || id,
            apiToken: data.apiToken || '',
            projects: data.projects || []
        }));

        // If org is selected and has token, use that token
        if (orgId && orgs[orgId] && !apiToken && orgs[orgId].apiToken) {
            apiToken = escapeHtml(orgs[orgId].apiToken);
        }

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
        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
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

    <!-- Device Login Section -->
    <div class="info-box" style="margin-bottom: 25px; border-left-color: var(--vscode-testing-iconPassed);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h3 style="margin: 0;">🔐 Authentication</h3>
                <p id="authStatusText" style="margin: 5px 0 0 0;">Checking authentication status...</p>
            </div>
            <button type="button" class="btn-primary" id="loginBtn" style="flex: 0 0 auto;">
                Login with Browser
            </button>
        </div>
        <div id="hardCapWarning" style="display: none; margin-top: 10px; padding: 8px; background: var(--vscode-inputValidation-warningBackground); border-radius: 4px; font-size: 12px;">
            ⏳ Session expires soon. Re-login to extend.
        </div>
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
            <label for="orgId">Organization</label>
            <select id="orgId" name="orgId" required>
                <option value="">-- Select Organization --</option>
                ${orgsArray.map(org => `
                    <option value="${escapeHtml(org.id)}"
                        ${org.id === orgId ? 'selected' : ''}
                        data-token="${escapeHtml(org.apiToken || '')}"
                        data-projects='${JSON.stringify(org.projects)}'>
                        ${escapeHtml(org.name)}${org.name !== org.id ? '' : ''}
                    </option>
                `).join('')}
            </select>
            <input type="text" id="orgIdManual" name="orgIdManual"
                value="${orgsArray.length === 0 ? orgId : ''}"
                placeholder="org_xxxxx (or select from dropdown above)"
                style="margin-top: 10px; display: ${orgsArray.length > 0 ? 'none' : 'block'};">
        </div>

        <div class="form-group">
            <label for="apiToken">API Token</label>
            <div class="input-group">
                <input type="password" id="apiToken" name="apiToken"
                    value="${apiToken}"
                    placeholder="ace_xxxxx" required style="flex: 1;">
                <button type="button" class="btn-primary" id="connectBtn" style="flex: 0 0 auto; padding: 10px 20px;">
                    Connect
                </button>
            </div>
            <div class="help-text">
                Get your token from <a href="https://ace.code-engine.app/settings/tokens" target="_blank">ACE Settings</a> • Click "Connect" to verify and load your organizations/projects
            </div>
        </div>

        <div class="form-group">
            <label for="projectId">Project</label>
            <select id="projectId" name="projectId" required>
                <option value="">-- Connect first to load projects --</option>
            </select>
            <input type="text" id="projectIdManual" name="projectIdManual"
                value="${projectId}"
                placeholder="prj_xxxxx (or select from dropdown above)"
                style="margin-top: 10px; display: none;">
        </div>

        <div class="button-group">
            <button type="submit" class="btn-primary">
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

    <div class="info-box" style="margin-top: 20px;">
        <h3>First-Time Setup</h3>
        <p>If you use Claude Code, update the agent files to enable ACE integration:</p>
        <button type="button" class="btn-secondary" id="updateAgentsBtn" style="margin-top: 10px;">
            Update Agent Files
        </button>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const orgsData = ${orgsJson};
        const savedProjectId = '${escapeHtml(projectId)}';
        let connectedOrgName = ''; // Store org name from server response

        (function init() {
            document.getElementById('setProductionUrl').addEventListener('click', () => {
                document.getElementById('serverUrl').value = 'https://ace-api.code-engine.app';
            });

            const orgSelect = document.getElementById('orgId');
            orgSelect.addEventListener('change', onOrgChange);

            // Trigger change to populate projects if org is already selected
            if (orgSelect.value) {
                onOrgChange();
            }

            // Connect button - validates AND fetches orgs/projects
            document.getElementById('connectBtn').addEventListener('click', connect);
            document.getElementById('configForm').addEventListener('submit', handleSubmit);

            // Update Agent Files button for first-time users
            document.getElementById('updateAgentsBtn').addEventListener('click', () => {
                vscode.postMessage({ command: 'updateAgents' });
                showStatus('Updating agent files...', 'info');
            });

            // Login with Browser button
            document.getElementById('loginBtn').addEventListener('click', () => {
                const loginBtn = document.getElementById('loginBtn');
                loginBtn.textContent = 'Opening browser...';
                loginBtn.disabled = true;
                vscode.postMessage({ command: 'login' });
            });

            // Request auth status on load
            vscode.postMessage({ command: 'getAuthStatus' });

            // Auto-connect if we have server URL and token
            const serverUrl = document.getElementById('serverUrl').value;
            const apiToken = document.getElementById('apiToken').value;
            if (serverUrl && apiToken) {
                connect();
            }
        })();

        function onOrgChange() {
            const orgSelect = document.getElementById('orgId');
            const apiTokenInput = document.getElementById('apiToken');
            const projectSelect = document.getElementById('projectId');
            const projectManual = document.getElementById('projectIdManual');
            const orgIdManual = document.getElementById('orgIdManual');

            const selectedOption = orgSelect.options[orgSelect.selectedIndex];
            const orgIdValue = orgSelect.value;

            if (orgIdValue) {
                orgIdManual.value = orgIdValue;
                orgIdManual.style.display = 'none';
            } else {
                orgIdManual.style.display = 'block';
            }

            // Auto-fill API token from selected org
            if (selectedOption && selectedOption.dataset.token) {
                apiTokenInput.value = selectedOption.dataset.token;
            }

            // Clear and populate projects
            while (projectSelect.firstChild) {
                projectSelect.removeChild(projectSelect.firstChild);
            }
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '-- Select Project --';
            projectSelect.appendChild(defaultOption);

            if (selectedOption && selectedOption.dataset.projects) {
                try {
                    const projects = JSON.parse(selectedOption.dataset.projects);
                    populateProjects(projects);
                } catch (e) {
                    console.error('Failed to parse projects:', e);
                    projectSelect.style.display = 'none';
                    projectManual.style.display = 'block';
                }
            } else {
                projectSelect.style.display = 'none';
                projectManual.style.display = 'block';
            }
        }

        function populateProjects(projects) {
            const projectSelect = document.getElementById('projectId');
            const projectManual = document.getElementById('projectIdManual');

            while (projectSelect.firstChild) {
                projectSelect.removeChild(projectSelect.firstChild);
            }
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '-- Select Project --';
            projectSelect.appendChild(defaultOption);

            if (projects && projects.length > 0) {
                projects.forEach(project => {
                    const projId = typeof project === 'string' ? project : (project.project_id || project.id);
                    const projName = typeof project === 'string' ? project : (project.project_name || project.name || projId);
                    const option = document.createElement('option');
                    option.value = projId;
                    option.textContent = projName + (projId !== projName ? ' (' + projId + ')' : '');
                    // Select if matches saved project ID
                    if (projId === savedProjectId) {
                        option.selected = true;
                    }
                    projectSelect.appendChild(option);
                });
                projectSelect.style.display = 'block';
                projectManual.style.display = 'none';
            } else {
                projectSelect.style.display = 'none';
                projectManual.style.display = 'block';
            }
        }

        function connect() {
            const serverUrl = document.getElementById('serverUrl').value;
            const apiToken = document.getElementById('apiToken').value;

            if (!serverUrl || !apiToken) {
                showStatus('Please fill in server URL and API token', 'error');
                return;
            }

            // Disable button while connecting
            const connectBtn = document.getElementById('connectBtn');
            connectBtn.textContent = 'Connecting...';
            connectBtn.disabled = true;

            showStatus('Connecting to ACE server...', 'info');
            vscode.postMessage({
                command: 'fetchProjects',
                data: { serverUrl: serverUrl, apiToken: apiToken }
            });
        }

        function handleSubmit(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const finalOrgId = formData.get('orgId') || formData.get('orgIdManual');
            const finalProjectId = formData.get('projectId') || formData.get('projectIdManual');

            const data = {
                serverUrl: formData.get('serverUrl'),
                apiToken: formData.get('apiToken'),
                orgId: finalOrgId,
                orgName: connectedOrgName || finalOrgId, // Use org name from Connect response
                projectId: finalProjectId
            };

            if (!data.serverUrl || !data.apiToken || !data.orgId || !data.projectId) {
                showStatus('Please fill in all required fields', 'error');
                return;
            }

            showStatus('Saving configuration...', 'info');
            vscode.postMessage({ command: 'save', data: data });
        }

        function resetConnectButton() {
            const connectBtn = document.getElementById('connectBtn');
            connectBtn.textContent = 'Connect';
            connectBtn.disabled = false;
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
                case 'projectsResult':
                    resetConnectButton();
                    if (message.success && message.data) {
                        const orgName = message.data.orgName || message.data.orgId;
                        connectedOrgName = orgName; // Store for save operation
                        showStatus('Connected! Organization: ' + orgName, 'success');
                        const orgSelect = document.getElementById('orgId');
                        const orgIdManual = document.getElementById('orgIdManual');

                        // Update org selection and name from server response
                        if (message.data.orgId) {
                            let found = false;
                            for (let i = 0; i < orgSelect.options.length; i++) {
                                if (orgSelect.options[i].value === message.data.orgId) {
                                    // Update the option text with server's org name
                                    orgSelect.options[i].textContent = orgName;
                                    orgSelect.selectedIndex = i;
                                    found = true;
                                    break;
                                }
                            }
                            if (!found) {
                                // Add the org to dropdown
                                const newOption = document.createElement('option');
                                newOption.value = message.data.orgId;
                                newOption.textContent = orgName;
                                newOption.selected = true;
                                orgSelect.appendChild(newOption);
                            }
                            orgIdManual.value = message.data.orgId;
                            orgIdManual.style.display = 'none';
                        }

                        // Populate projects with names from server
                        if (message.data.projects && message.data.projects.length > 0) {
                            populateProjects(message.data.projects);
                        }
                    } else {
                        showStatus(message.message || 'Connection failed', 'error');
                    }
                    break;
                case 'updateAgentsResult':
                    if (message.success) {
                        showStatus('Agent files created in .github/agents/ folder!', 'success');
                    } else {
                        showStatus('Failed to create agent files', 'error');
                    }
                    break;
                case 'authStatus':
                    updateAuthDisplay(message);
                    break;
                case 'loginResult':
                    const loginBtn = document.getElementById('loginBtn');
                    loginBtn.disabled = false;
                    if (message.success) {
                        loginBtn.textContent = '✓ Logged In';
                        loginBtn.style.background = 'var(--vscode-testing-iconPassed)';
                        document.getElementById('authStatusText').textContent = 'Logged in as ' + message.user.email;
                        showStatus('Successfully logged in!', 'success');
                        // Request fresh auth status to update UI
                        vscode.postMessage({ command: 'getAuthStatus' });
                    } else {
                        loginBtn.textContent = 'Login with Browser';
                        showStatus(message.message || 'Login failed', 'error');
                    }
                    break;
                case 'loginStatus':
                    if (message.status === 'in_progress') {
                        document.getElementById('authStatusText').textContent = message.message;
                    }
                    break;
            }
        });

        function updateAuthDisplay(auth) {
            const authStatusText = document.getElementById('authStatusText');
            const loginBtn = document.getElementById('loginBtn');
            const hardCapWarning = document.getElementById('hardCapWarning');

            if (auth.authenticated && auth.user) {
                authStatusText.textContent = '✓ Logged in as ' + auth.user.email;
                loginBtn.textContent = 'Re-login';
                loginBtn.style.background = 'var(--vscode-button-secondaryBackground)';
                loginBtn.style.color = 'var(--vscode-button-secondaryForeground)';

                // Show hard cap warning if approaching
                if (auth.hardCap) {
                    if (auth.hardCap.isExpired) {
                        hardCapWarning.textContent = '⚠️ Session expired (7-day limit). Please re-login.';
                        hardCapWarning.style.background = 'var(--vscode-inputValidation-errorBackground)';
                        hardCapWarning.style.display = 'block';
                    } else if (auth.hardCap.isApproaching) {
                        hardCapWarning.textContent = '⏳ Session expires in ' + auth.hardCap.hoursRemaining + ' hours. Re-login to extend.';
                        hardCapWarning.style.display = 'block';
                    } else {
                        hardCapWarning.style.display = 'none';
                    }
                }
            } else {
                authStatusText.textContent = 'Not logged in. Click "Login with Browser" to authenticate.';
                loginBtn.textContent = 'Login with Browser';
                loginBtn.style.background = '';
                loginBtn.style.color = '';
                hardCapWarning.style.display = 'none';
            }
        }
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
