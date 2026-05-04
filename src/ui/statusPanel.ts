/**
 * ACE Status Panel - Displays playbook statistics
 * Uses @ace-sdk/core for config and auth
 * Matches ace-cursor design with quality metrics, top patterns, and domain breakdown
 */

import * as vscode from 'vscode';
import { isProjectConfigured, getProjectConfig } from '../services/config';
import { isAuthenticated, getCurrentUser, getHardCapInfo, getValidToken } from '../commands/login';
import { loadUserAuth, getDefaultOrgId } from '@ace-sdk/core';
import { getAceClient } from '../services/aceClient';

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
 * Status Panel - Shows playbook statistics with quality metrics, top patterns, and domain breakdown
 */
export class StatusPanel {
    public static currentPanel: StatusPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
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

        StatusPanel.currentPanel = new StatusPanel(panel);
    }

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;

        // Set initial HTML (loading state)
        this._panel.webview.html = this._getLoadingHtml();

        // Handle disposal
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle visibility changes
        this._panel.onDidChangeViewState(
            () => {
                if (this._panel.visible) {
                    this._refresh();
                }
            },
            null,
            this._disposables
        );

        // Handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'refresh':
                        await this._refresh();
                        break;
                    case 'login':
                        vscode.commands.executeCommand('ace-vscode.login').then(() => {
                            this._refresh();
                        });
                        break;
                    case 'executeCommand':
                        if (message.commandId) {
                            vscode.commands.executeCommand(message.commandId, ...(message.args || []));
                        }
                        break;
                }
            },
            null,
            this._disposables
        );

        // Initial data load
        this._refresh();

        // Auto-refresh every 5 minutes, but only when the panel is visible.
        // /patterns/top is not cheap server-side; visibility-gated polling
        // keeps load proportional to actual user attention.
        this._refreshInterval = setInterval(() => {
            if (this._panel.visible) {
                this._refresh();
            }
        }, 300_000);
    }

    private async _refresh() {
        if (!isProjectConfigured()) {
            this._panel.webview.html = this._getNotConfiguredHtml();
            return;
        }

        try {
            const stats = await this._fetchStatus();
            this._panel.webview.html = this._getStatusHtml(stats);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this._panel.webview.html = this._getErrorHtml(`Failed to load status: ${message}`);
        }
    }

    /**
     * Fetch status using direct HTTP requests (like ace-cursor)
     * Uses getValidToken for auto-refresh (sliding window TTL)
     */
    private async _fetchStatus(): Promise<StatusData> {
        const projectConfig = getProjectConfig();
        const userAuth = loadUserAuth();

        if (!projectConfig?.serverUrl) {
            throw new Error('ACE not fully configured');
        }

        const serverUrl = projectConfig.serverUrl;

        // Get valid token with auto-refresh (device login only)
        const tokenResult = await getValidToken(serverUrl);
        const token = tokenResult?.token || userAuth?.token;

        if (!token) {
            throw new Error('No valid authentication token. Please login.');
        }

        // Get org ID
        const orgId = projectConfig.orgId || getDefaultOrgId();
        if (!orgId) {
            throw new Error('Organization ID required. Please configure ACE.');
        }

        const projectId = projectConfig.projectId;

        // Fetch analytics
        const analyticsResponse = await fetch(`${serverUrl}/analytics`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-ACE-Org': orgId,
                'X-ACE-Project': projectId,
                'X-ACE-Client': 'copilot'
            }
        });

        if (!analyticsResponse.ok) {
            if (analyticsResponse.status === 401) {
                throw new Error('Authentication expired. Please login again.');
            }
            throw new Error(`HTTP ${analyticsResponse.status}`);
        }

        const analytics = await analyticsResponse.json() as Record<string, unknown>;

        // Try to get org/project names from verify endpoint
        let orgName = '';
        let projectName = '';
        try {
            const verifyResponse = await fetch(`${serverUrl}/api/v1/config/verify`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-ACE-Org': orgId
                }
            });
            if (verifyResponse.ok) {
                const verifyData = await verifyResponse.json() as Record<string, unknown>;
                orgName = (verifyData.org_name as string) || '';
                const projects = (verifyData.projects as Array<{ project_id?: string; id?: string; project_name?: string; name?: string }>) || [];
                const project = projects.find(p => (p.project_id || p.id) === projectId);
                projectName = project?.project_name || project?.name || '';
            }
        } catch {
            // Ignore verify errors - names are optional
        }

        // Fetch top patterns via SDK (correct path, retry, X-ACE-Client header,
        // org/project resolution, subscription-error handling — none of which
        // the previous raw fetch did).
        let topPatterns: TopPattern[] = [];
        try {
            const client = getAceClient();
            if (client) {
                const bullets = await client.getTopPatterns({ limit: 5, min_helpful: 1 });
                topPatterns = bullets as unknown as TopPattern[];
            }
        } catch {
            // Top patterns are an optional display — never block the panel on this.
        }

        return {
            total_patterns: (analytics.total_patterns as number) || (analytics.total_bullets as number) || 0,
            avg_confidence: (analytics.avg_confidence as number) || 0,
            by_section: (analytics.by_section as Record<string, number>) || {},
            by_domain: (analytics.by_domain as Record<string, number>) || {},
            helpful_total: (analytics.helpful_total as number) || 0,
            harmful_total: (analytics.harmful_total as number) || 0,
            org_id: orgId,
            org_name: orgName,
            project_id: projectId,
            project_name: projectName,
            top_patterns: topPatterns
        };
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Generate HTML for hard cap display
     */
    private _getHardCapHtml(): string {
        const hardCap = getHardCapInfo();
        if (!hardCap) return '';

        if (hardCap.isExpired) {
            return `
                <div class="hard-cap-warning expired">
                    <div class="hard-cap-icon">⚠️</div>
                    <div class="hard-cap-content">
                        <div class="hard-cap-title">Session Expired</div>
                        <div class="hard-cap-desc">Your 7-day session has expired. Please login again.</div>
                    </div>
                    <button class="hard-cap-btn" id="loginBtn">Login</button>
                </div>`;
        }

        if (hardCap.isApproaching) {
            return `
                <div class="hard-cap-warning approaching">
                    <div class="hard-cap-icon">⏳</div>
                    <div class="hard-cap-content">
                        <div class="hard-cap-title">Session Expiring Soon</div>
                        <div class="hard-cap-desc">Hard cap in ${hardCap.daysRemaining > 0 ? hardCap.daysRemaining + ' day(s)' : hardCap.hoursRemaining + ' hour(s)'}. Re-login before it expires.</div>
                    </div>
                    <button class="hard-cap-btn" id="loginBtn">Login Now</button>
                </div>`;
        }

        // Normal status - show remaining time
        return `
            <div class="hard-cap-info">
                <span class="hard-cap-label">Session Hard Cap (7d):</span>
                <span class="hard-cap-value">${hardCap.daysRemaining} days remaining</span>
            </div>`;
    }

    /**
     * Generate auth status HTML
     */
    private _getAuthStatusHtml(): string {
        const authenticated = isAuthenticated();
        const user = authenticated ? getCurrentUser() : null;

        if (!authenticated) {
            return `
                <div class="auth-warning">
                    <span class="auth-icon">⚠️</span>
                    <span class="auth-text">Not logged in. Login to enable ACE features.</span>
                    <button class="auth-btn" id="authLoginBtn">Login</button>
                </div>`;
        }

        if (user?.email) {
            return `
                <div class="auth-info">
                    <span class="auth-icon">✅</span>
                    <span class="auth-text">Logged in as ${escapeHtml(user.email)}</span>
                </div>`;
        }

        return '';
    }

    private _getLoadingHtml(): string {
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
            padding: 40px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            text-align: center;
        }
        .spinner {
            display: inline-block;
            width: 32px;
            height: 32px;
            border: 3px solid var(--vscode-panel-border);
            border-radius: 50%;
            border-top-color: var(--vscode-textLink-foreground);
            animation: spin 1s linear infinite;
            margin-bottom: 15px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="spinner"></div>
    <div>Loading playbook statistics...</div>
</body>
</html>`;
    }

    private _getNotConfiguredHtml(): string {
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
            padding: 40px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            text-align: center;
        }
        .icon { font-size: 48px; margin-bottom: 15px; }
        .configure-btn {
            margin-top: 20px;
            padding: 10px 20px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .configure-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="icon">⚙️</div>
    <h2>ACE Not Configured</h2>
    <p style="color: var(--vscode-descriptionForeground);">Configure ACE to start tracking patterns and view statistics.</p>
    <button class="configure-btn" id="configureBtn">Configure ACE</button>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        document.getElementById('configureBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'executeCommand', commandId: 'ace-vscode.configure' });
        });
    </script>
</body>
</html>`;
    }

    private _getErrorHtml(message: string): string {
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
            padding: 40px;
            color: var(--vscode-errorForeground);
            background: var(--vscode-editor-background);
            text-align: center;
        }
        .icon { font-size: 48px; margin-bottom: 15px; }
        .btn {
            margin-top: 20px;
            padding: 10px 20px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-right: 10px;
        }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
    </style>
</head>
<body>
    <div class="icon">⚠️</div>
    <h2>${escapeHtml(message)}</h2>
    <p style="color: var(--vscode-descriptionForeground);">Check your settings or try logging in again.</p>
    <button class="btn" id="loginBtn">Login</button>
    <button class="btn" id="configureBtn">Configure</button>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        document.getElementById('loginBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'login' });
        });
        document.getElementById('configureBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'executeCommand', commandId: 'ace-vscode.configure' });
        });
    </script>
</body>
</html>`;
    }

    private _getStatusHtml(stats: StatusData): string {
        const nonce = this._getNonce();
        const cspSource = this._panel.webview.cspSource;

        const total = stats.total_patterns;
        const avgConf = stats.avg_confidence ? Math.round(stats.avg_confidence * 100) : 0;
        const bySection = stats.by_section;
        const byDomain = stats.by_domain;
        const topPatterns = stats.top_patterns;
        const helpfulTotal = stats.helpful_total;
        const harmfulTotal = stats.harmful_total;
        const trustScore = helpfulTotal + harmfulTotal > 0
            ? Math.round((helpfulTotal / (helpfulTotal + harmfulTotal)) * 100)
            : 100;

        const hardCapHtml = this._getHardCapHtml();
        const authStatusHtml = this._getAuthStatusHtml();

        // Domain breakdown
        const domainCount = Object.keys(byDomain).length;
        const domainTotal = Object.values(byDomain).reduce((a, b) => a + b, 0);
        const sortedDomains = Object.entries(byDomain).sort((a, b) => b[1] - a[1]);

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
            padding: 20px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            max-width: 900px;
            margin: 0 auto;
        }
        .header {
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .header h1 {
            margin: 0 0 10px 0;
            font-size: 24px;
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
        .meta-id {
            color: var(--vscode-descriptionForeground);
            opacity: 0.7;
            font-size: 0.9em;
            margin-left: 4px;
        }
        .auth-warning, .auth-info {
            padding: 10px 15px;
            border-radius: 6px;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .auth-warning {
            background: var(--vscode-inputValidation-warningBackground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
        }
        .auth-info {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
        }
        .auth-btn {
            margin-left: auto;
            padding: 6px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }
        .auth-btn:hover { background: var(--vscode-button-hoverBackground); }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .stat-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 15px;
            transition: transform 0.2s;
        }
        .stat-card:hover {
            transform: translateY(-2px);
            border-color: var(--vscode-focusBorder);
        }
        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .confidence-bar {
            width: 100%;
            height: 8px;
            background: var(--vscode-progressBar-background);
            border-radius: 4px;
            margin-top: 10px;
            overflow: hidden;
        }
        .confidence-fill {
            height: 100%;
            background: linear-gradient(90deg, #4CAF50 0%, #8BC34A 100%);
            transition: width 0.3s;
        }
        .hard-cap-info {
            margin-top: 15px;
            padding: 10px 15px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .hard-cap-label {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }
        .hard-cap-value {
            color: var(--vscode-textLink-foreground);
            font-weight: 500;
        }
        .hard-cap-warning {
            margin-top: 15px;
            padding: 15px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .hard-cap-warning.approaching {
            background: var(--vscode-inputValidation-warningBackground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
        }
        .hard-cap-warning.expired {
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
        }
        .hard-cap-icon { font-size: 24px; }
        .hard-cap-content { flex: 1; }
        .hard-cap-title { font-weight: 600; margin-bottom: 4px; }
        .hard-cap-desc { font-size: 13px; color: var(--vscode-descriptionForeground); }
        .hard-cap-btn {
            padding: 6px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
        }
        .hard-cap-btn:hover { background: var(--vscode-button-hoverBackground); }
        .section-breakdown { margin-top: 25px; }
        .section-breakdown h2 { font-size: 16px; margin-bottom: 12px; }
        .section-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            margin: 8px 0;
            background: var(--vscode-list-inactiveSelectionBackground);
            border-radius: 4px;
        }
        .section-name { font-weight: 500; }
        .section-count {
            font-size: 18px;
            color: var(--vscode-textLink-foreground);
        }
        .quality-metrics {
            display: flex;
            gap: 15px;
            margin: 15px 0;
        }
        .quality-item {
            flex: 1;
            padding: 12px;
            background: var(--vscode-list-inactiveSelectionBackground);
            border-radius: 6px;
            text-align: center;
        }
        .quality-value {
            font-size: 24px;
            font-weight: bold;
        }
        .quality-value.positive { color: var(--vscode-testing-iconPassed); }
        .quality-value.negative { color: var(--vscode-testing-iconFailed); }
        .quality-value.neutral { color: var(--vscode-textLink-foreground); }
        .quality-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            margin-top: 4px;
        }
        .top-patterns { margin-top: 25px; }
        .top-patterns h2 {
            font-size: 16px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .pattern-item {
            padding: 12px 15px;
            margin: 8px 0;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-left: 3px solid var(--vscode-textLink-foreground);
            border-radius: 4px;
            font-size: 13px;
            line-height: 1.5;
        }
        .pattern-meta {
            display: flex;
            gap: 12px;
            margin-top: 8px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .pattern-badge {
            padding: 2px 6px;
            border-radius: 10px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .domain-breakdown { margin-top: 25px; }
        .domain-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 0;
        }
        .domain-header h2 { margin: 0; font-size: 16px; }
        .domain-toggle {
            padding: 4px 12px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .domain-toggle:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .domain-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 10px;
            margin-top: 10px;
        }
        .domain-grid.collapsed .domain-item:nth-child(n+13) { display: none; }
        .domain-item {
            padding: 12px 10px;
            background: var(--vscode-list-inactiveSelectionBackground);
            border-radius: 8px;
            text-align: center;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .domain-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        .domain-name {
            font-size: 11px;
            font-weight: 500;
            margin-bottom: 6px;
            color: var(--vscode-descriptionForeground);
            word-break: break-word;
        }
        .domain-count {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }
        .domain-summary {
            margin-top: 8px;
            padding: 8px 12px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .info-box {
            margin-top: 25px;
            padding: 15px;
            background: var(--vscode-notifications-background);
            border-radius: 6px;
            border-left: 4px solid var(--vscode-textLink-foreground);
        }
        .info-box h3 { margin: 0 0 10px 0; font-size: 14px; }
        .info-box p {
            margin: 5px 0;
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
        }
        .buttons {
            margin-top: 20px;
            display: flex;
            gap: 10px;
        }
        .btn {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        .btn.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    </style>
</head>
<body>
    <div class="header">
        <h1>ACE Playbook Status</h1>
        <div class="meta">
            <div class="meta-item">
                <span class="meta-label">Organization:</span>
                <span class="meta-value">${stats.org_name ? `${escapeHtml(stats.org_name)} <span class="meta-id">(${escapeHtml(stats.org_id)})</span>` : escapeHtml(stats.org_id) || 'n/a'}</span>
            </div>
            <div class="meta-item">
                <span class="meta-label">Project:</span>
                <span class="meta-value">${stats.project_name ? `${escapeHtml(stats.project_name)} <span class="meta-id">(${escapeHtml(stats.project_id)})</span>` : escapeHtml(stats.project_id) || 'n/a'}</span>
            </div>
        </div>
    </div>

    ${authStatusHtml}

    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-label">Total Patterns</div>
            <div class="stat-value">${total}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Average Confidence</div>
            <div class="stat-value">${avgConf}%</div>
            <div class="confidence-bar">
                <div class="confidence-fill" style="width: ${avgConf}%"></div>
            </div>
        </div>
    </div>

    ${hardCapHtml}

    <div class="section-breakdown">
        <h2>📚 Patterns by Section</h2>
        <div class="section-item">
            <span class="section-name">Strategies & Hard Rules</span>
            <span class="section-count">${bySection.strategies_and_hard_rules || 0}</span>
        </div>
        <div class="section-item">
            <span class="section-name">Useful Code Snippets</span>
            <span class="section-count">${bySection.useful_code_snippets || 0}</span>
        </div>
        <div class="section-item">
            <span class="section-name">Troubleshooting & Pitfalls</span>
            <span class="section-count">${bySection.troubleshooting_and_pitfalls || 0}</span>
        </div>
        <div class="section-item">
            <span class="section-name">APIs to Use</span>
            <span class="section-count">${bySection.apis_to_use || 0}</span>
        </div>
    </div>

    <div class="quality-metrics">
        <div class="quality-item">
            <div class="quality-value positive">${Math.round(helpfulTotal)}</div>
            <div class="quality-label">👍 Helpful</div>
        </div>
        <div class="quality-item">
            <div class="quality-value negative">${Math.round(harmfulTotal)}</div>
            <div class="quality-label">👎 Harmful</div>
        </div>
        <div class="quality-item">
            <div class="quality-value neutral">${trustScore}%</div>
            <div class="quality-label">🎯 Trust Score</div>
        </div>
    </div>

    ${topPatterns.length > 0 ? `
    <div class="top-patterns">
        <h2>🏆 Top Performing Patterns</h2>
        ${topPatterns.slice(0, 5).map(p => `
            <div class="pattern-item">
                ${escapeHtml(p.content?.substring(0, 200))}${(p.content?.length || 0) > 200 ? '...' : ''}
                <div class="pattern-meta">
                    <span class="pattern-badge">${escapeHtml(p.section?.replace(/_/g, ' ') || 'general')}</span>
                    <span>👍 ${Math.round(p.helpful || 0)}</span>
                    <span>📊 ${Math.round((p.confidence || 0) * 100)}% confidence</span>
                    ${p.domain ? `<span>🏷️ ${escapeHtml(p.domain)}</span>` : ''}
                </div>
            </div>
        `).join('')}
    </div>
    ` : ''}

    ${domainCount > 0 ? `
    <div class="domain-breakdown">
        <div class="domain-header">
            <h2>🗂️ Patterns by Domain (${domainCount} domains)</h2>
            ${domainCount > 12 ? `<button class="domain-toggle" id="domainToggle">Show All</button>` : ''}
        </div>
        <div class="domain-grid ${domainCount > 12 ? 'collapsed' : ''}" id="domainGrid">
            ${sortedDomains.map(([domain, count]) => `
                <div class="domain-item">
                    <div class="domain-name">${escapeHtml(domain.replace(/-/g, ' '))}</div>
                    <div class="domain-count">${count}</div>
                </div>
            `).join('')}
        </div>
        <div class="domain-summary" id="domainSummary">
            ${domainCount > 12 ? `Showing top 12 of ${domainCount} domains · ` : ''}Total: ${domainTotal} patterns
        </div>
    </div>
    ` : ''}

    <div class="info-box">
        <h3>How ACE Works with GitHub Copilot</h3>
        <p>The AI automatically retrieves patterns before tasks and captures learning after.</p>
        <p>Tools: <code>ace_search</code> (before) | <code>ace_learn</code> (after)</p>
    </div>

    <div class="buttons">
        <button class="btn" id="refreshBtn">🔄 Refresh</button>
        <button class="btn secondary" id="configureBtn">⚙️ Configure</button>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function executeCommand(commandId) {
            vscode.postMessage({ command: 'executeCommand', commandId: commandId });
        }

        function login() {
            vscode.postMessage({ command: 'login' });
        }

        // Attach event listeners
        (function init() {
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) refreshBtn.addEventListener('click', refresh);

            const configureBtn = document.getElementById('configureBtn');
            if (configureBtn) configureBtn.addEventListener('click', () => executeCommand('ace-vscode.configure'));

            const loginBtn = document.getElementById('loginBtn');
            if (loginBtn) loginBtn.addEventListener('click', login);

            const authLoginBtn = document.getElementById('authLoginBtn');
            if (authLoginBtn) authLoginBtn.addEventListener('click', login);

            // Domain breakdown expand/collapse toggle
            const domainToggle = document.getElementById('domainToggle');
            const domainGrid = document.getElementById('domainGrid');
            const domainSummary = document.getElementById('domainSummary');
            if (domainToggle && domainGrid) {
                domainToggle.addEventListener('click', () => {
                    const isCollapsed = domainGrid.classList.contains('collapsed');
                    if (isCollapsed) {
                        domainGrid.classList.remove('collapsed');
                        domainToggle.textContent = 'Show Less';
                        if (domainSummary) domainSummary.textContent = 'Showing all domains';
                    } else {
                        domainGrid.classList.add('collapsed');
                        domainToggle.textContent = 'Show All';
                        if (domainSummary) {
                            const totalDomains = domainGrid.children.length;
                            domainSummary.textContent = 'Showing top 12 of ' + totalDomains + ' domains';
                        }
                    }
                });
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

// Type definitions
interface TopPattern {
    content?: string;
    section?: string;
    helpful?: number;
    confidence?: number;
    domain?: string;
}

interface StatusData {
    total_patterns: number;
    avg_confidence: number;
    by_section: Record<string, number>;
    by_domain: Record<string, number>;
    helpful_total: number;
    harmful_total: number;
    org_id: string;
    org_name: string;
    project_id: string;
    project_name: string;
    top_patterns: TopPattern[];
}
