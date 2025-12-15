import * as vscode from 'vscode';
import { getAceClient } from '../services/aceClient';
import { isProjectConfigured, getProjectConfig } from '../services/config';

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
 * Status Panel - Shows playbook statistics with responsive grid layout
 */
export class StatusPanel {
    public static currentPanel: StatusPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _refreshInterval: NodeJS.Timeout | undefined;

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel exists, show it
        if (StatusPanel.currentPanel) {
            StatusPanel.currentPanel._panel.reveal(column);
            StatusPanel.currentPanel._refresh();
            return;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'aceStatus',
            'ACE Playbook Status',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        StatusPanel.currentPanel = new StatusPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set initial HTML
        this._update();

        // Handle disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'refresh':
                        await this._refresh();
                        break;
                    case 'executeCommand':
                        if (message.commandId) {
                            vscode.commands.executeCommand(message.commandId, ...(message.args || []))
                                .then(
                                    () => console.log(`ACE: Executed command: ${message.commandId}`),
                                    err => console.error(`ACE: Command execution failed: ${message.commandId}`, err)
                                );
                        }
                        break;
                }
            },
            null,
            this._disposables
        );

        // Initial data load
        this._refresh();

        // Auto-refresh every 60 seconds
        this._refreshInterval = setInterval(() => {
            this._refresh();
        }, 60000);
    }

    private async _refresh() {
        if (!isProjectConfigured()) {
            this._panel.webview.postMessage({
                command: 'notConfigured'
            });
            return;
        }

        const client = getAceClient();
        if (!client) {
            this._panel.webview.postMessage({
                command: 'error',
                message: 'SDK not initialized'
            });
            return;
        }

        try {
            const status = await client.getStatus();
            const projectConfig = getProjectConfig();

            // Try to get org/project names from verify endpoint
            let orgName = '';
            let projectName = '';
            try {
                const verification = await client.verifyToken();
                orgName = verification.org_name || '';
                const projects = verification.projects || [];
                const project = projects.find((p: { project_id: string; project_name: string }) =>
                    p.project_id === projectConfig?.projectId
                );
                projectName = project?.project_name || '';
            } catch {
                // Ignore verify errors - names are optional
            }

            this._panel.webview.postMessage({
                command: 'statusLoaded',
                data: {
                    totalPatterns: status.total_patterns ?? status.total_bullets ?? 0,
                    avgConfidence: status.avg_confidence ?? 0,
                    bySection: status.by_section ?? {},
                    projectId: projectConfig?.projectId ?? '',
                    projectName: projectName,
                    orgId: projectConfig?.orgId ?? '',
                    orgName: orgName
                }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this._panel.webview.postMessage({
                command: 'error',
                message: `Failed to load status: ${message}`
            });
        }
    }

    private _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }

    /**
     * Generates a random nonce for CSP
     */
    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private _getHtmlForWebview(): string {
        const nonce = this._getNonce();
        const cspSource = this._panel.webview.cspSource;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'nonce-${nonce}';">
    <title>ACE Status</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 30px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            max-width: 900px;
            margin: 0 auto;
        }
        h1 {
            color: var(--vscode-editor-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 15px;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        h1 .icon {
            font-size: 28px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .stat-value {
            font-size: 36px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 5px;
        }
        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .confidence-bar {
            width: 100%;
            height: 8px;
            background: var(--vscode-input-background);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 10px;
        }
        .confidence-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--vscode-testing-iconPassed) 0%, #4CAF50 100%);
            border-radius: 4px;
            transition: width 0.5s ease-out;
        }
        .section-breakdown {
            background: var(--vscode-textBlockQuote-background);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 25px;
        }
        .section-breakdown h2 {
            margin-top: 0;
            margin-bottom: 15px;
            font-size: 16px;
            color: var(--vscode-editor-foreground);
        }
        .section-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .section-item:last-child {
            border-bottom: none;
        }
        .section-name {
            font-size: 14px;
        }
        .section-count {
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            background: var(--vscode-badge-background);
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 12px;
        }
        .buttons {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        button {
            padding: 10px 20px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: background 0.2s;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
        }
        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .loading {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }
        .spinner {
            display: inline-block;
            width: 24px;
            height: 24px;
            border: 3px solid var(--vscode-panel-border);
            border-radius: 50%;
            border-top-color: var(--vscode-textLink-foreground);
            animation: spin 1s linear infinite;
            margin-bottom: 15px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .error {
            background: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-errorForeground);
            padding: 15px 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .not-configured {
            text-align: center;
            padding: 50px 20px;
        }
        .not-configured .icon {
            font-size: 48px;
            margin-bottom: 15px;
        }
        .not-configured p {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 20px;
        }
        .header {
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .header h1 {
            margin: 0 0 10px 0;
            font-size: 24px;
            border-bottom: none;
            padding-bottom: 0;
        }
        .meta {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .meta-item {
            display: flex;
            align-items: baseline;
            gap: 8px;
        }
        .meta-label {
            font-weight: 600;
            min-width: 100px;
        }
        .meta-value {
            flex: 1;
        }
        .meta-id {
            color: var(--vscode-descriptionForeground);
            opacity: 0.7;
            font-size: 0.9em;
            margin-left: 4px;
        }
    </style>
</head>
<body>
    <div class="header" id="headerSection" style="display: none;">
        <h1>ACE Playbook Status</h1>
        <div class="meta">
            <div class="meta-item">
                <span class="meta-label">Organization:</span>
                <span class="meta-value" id="orgDisplay">n/a</span>
            </div>
            <div class="meta-item">
                <span class="meta-label">Project:</span>
                <span class="meta-value" id="projectDisplay">n/a</span>
            </div>
        </div>
    </div>

    <div id="loading" class="loading">
        <div class="spinner"></div>
        <div>Loading playbook statistics...</div>
    </div>

    <div id="notConfigured" class="not-configured" style="display: none;">
        <div class="icon">⚙️</div>
        <h2>ACE Not Configured</h2>
        <p>Configure ACE to start tracking patterns and view statistics.</p>
        <button id="notConfiguredBtn">Configure ACE</button>
    </div>

    <div id="error" class="error" style="display: none;"></div>

    <div id="content" style="display: none;">
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value" id="totalPatterns">0</div>
                <div class="stat-label">Total Patterns</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="confidence">0%</div>
                <div class="stat-label">Avg Confidence</div>
                <div class="confidence-bar">
                    <div class="confidence-fill" id="confidenceFill" style="width: 0%;"></div>
                </div>
            </div>
        </div>

        <div class="section-breakdown">
            <h2>📚 Patterns by Section</h2>
            <div id="sections"></div>
        </div>

        <div class="buttons">
            <button id="refreshBtn">🔄 Refresh</button>
            <button class="secondary" id="configureBtn">⚙️ Configure</button>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'statusLoaded':
                    showStatus(message.data);
                    break;
                case 'notConfigured':
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('notConfigured').style.display = 'block';
                    document.getElementById('content').style.display = 'none';
                    break;
                case 'error':
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('error').textContent = message.message;
                    document.getElementById('error').style.display = 'block';
                    break;
            }
        });

        function showStatus(data) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('error').style.display = 'none';
            document.getElementById('notConfigured').style.display = 'none';
            document.getElementById('content').style.display = 'block';
            document.getElementById('headerSection').style.display = 'block';

            // Update header with org/project info
            const orgDisplay = document.getElementById('orgDisplay');
            const projectDisplay = document.getElementById('projectDisplay');

            if (data.orgName && data.orgId) {
                orgDisplay.innerHTML = data.orgName + ' <span class="meta-id">(' + data.orgId + ')</span>';
            } else if (data.orgId) {
                orgDisplay.textContent = data.orgId;
            } else {
                orgDisplay.textContent = 'n/a';
            }

            if (data.projectName && data.projectId) {
                projectDisplay.innerHTML = data.projectName + ' <span class="meta-id">(' + data.projectId + ')</span>';
            } else if (data.projectId) {
                projectDisplay.textContent = data.projectId;
            } else {
                projectDisplay.textContent = 'n/a';
            }

            // Update stats
            document.getElementById('totalPatterns').textContent = data.totalPatterns;
            const confidencePercent = Math.round(data.avgConfidence * 100);
            document.getElementById('confidence').textContent = confidencePercent + '%';
            document.getElementById('confidenceFill').style.width = confidencePercent + '%';

            // Update sections
            const sectionsDiv = document.getElementById('sections');
            sectionsDiv.innerHTML = '';

            const sectionNames = {
                'strategies_and_hard_rules': '📋 Strategies & Rules',
                'useful_code_snippets': '💻 Code Snippets',
                'troubleshooting_and_pitfalls': '⚠️ Troubleshooting',
                'apis_to_use': '🔌 APIs to Use'
            };

            for (const [key, count] of Object.entries(data.bySection)) {
                const displayName = sectionNames[key] || key.replace(/_/g, ' ');
                const item = document.createElement('div');
                item.className = 'section-item';
                item.innerHTML = '<span class="section-name">' + displayName + '</span>' +
                                 '<span class="section-count">' + count + '</span>';
                sectionsDiv.appendChild(item);
            }

            if (Object.keys(data.bySection).length === 0) {
                sectionsDiv.innerHTML = '<div style="color: var(--vscode-descriptionForeground); padding: 10px 0;">No patterns yet</div>';
            }
        }

        function refresh() {
            document.getElementById('loading').style.display = 'block';
            document.getElementById('content').style.display = 'none';
            document.getElementById('headerSection').style.display = 'none';
            vscode.postMessage({ command: 'refresh' });
        }

        function configure() {
            vscode.postMessage({ command: 'executeCommand', commandId: 'ace-vscode.configure' });
        }

        // Attach event listeners
        (function init() {
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', refresh);
            }

            const configureBtn = document.getElementById('configureBtn');
            if (configureBtn) {
                configureBtn.addEventListener('click', configure);
            }

            const notConfiguredBtn = document.getElementById('notConfiguredBtn');
            if (notConfiguredBtn) {
                notConfiguredBtn.addEventListener('click', configure);
            }
        })();
    </script>
</body>
</html>`;
    }

    public dispose() {
        StatusPanel.currentPanel = undefined;

        // Clear refresh interval
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
        }

        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
