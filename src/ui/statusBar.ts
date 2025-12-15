import * as vscode from 'vscode';
import { isProjectConfigured } from '../services/config';
import { getAceClient } from '../services/aceClient';

export type StatusBarState = 'ready' | 'searching' | 'learning' | 'error' | 'unconfigured';

/**
 * ACE status bar item that shows current state and pattern count
 */
export class AceStatusBar implements vscode.Disposable {
    private statusBarItem: vscode.StatusBarItem;
    private patternCount: number | undefined;
    private currentState: StatusBarState = 'ready';

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'ace-vscode.showStatus';
    }

    /**
     * Activates the status bar
     */
    activate(context: vscode.ExtensionContext): void {
        const config = vscode.workspace.getConfiguration('ace');
        const showStatusBar = config.get<boolean>('automation.showStatusBar', true);

        if (!showStatusBar) {
            console.log('ACE: Status bar disabled');
            return;
        }

        // Initial state
        if (!isProjectConfigured()) {
            this.updateState('unconfigured');
        } else {
            this.updateState('ready');
            // Fetch pattern count from server
            this._fetchPatternCount();
        }

        this.statusBarItem.show();
        context.subscriptions.push(this);

        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('ace.automation.showStatusBar')) {
                const show = vscode.workspace.getConfiguration('ace').get<boolean>('automation.showStatusBar', true);
                if (show) {
                    this.statusBarItem.show();
                } else {
                    this.statusBarItem.hide();
                }
            }
        }, null, context.subscriptions);

        console.log('ACE: Status bar activated');
    }

    /**
     * Updates the status bar state
     */
    updateState(state: StatusBarState, count?: number): void {
        this.currentState = state;
        if (count !== undefined) {
            this.patternCount = count;
        }

        switch (state) {
            case 'ready':
                this.statusBarItem.text = `$(book) ACE: ${this.patternCount ?? '?'} patterns`;
                this.statusBarItem.tooltip = 'Click to view ACE playbook status';
                this.statusBarItem.backgroundColor = undefined;
                this.statusBarItem.command = 'ace-vscode.showStatus';
                break;
            case 'searching':
                this.statusBarItem.text = '$(search) ACE: Searching...';
                this.statusBarItem.tooltip = 'Searching for relevant patterns';
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'learning':
                this.statusBarItem.text = '$(book) ACE: Learning...';
                this.statusBarItem.tooltip = 'Capturing patterns from your work';
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'error':
                this.statusBarItem.text = '$(error) ACE: Error';
                this.statusBarItem.tooltip = 'ACE encountered an error - click to configure';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;
            case 'unconfigured':
                this.statusBarItem.text = '$(warning) ACE: Not configured';
                this.statusBarItem.tooltip = 'Click to view status and configure ACE';
                this.statusBarItem.command = 'ace-vscode.showStatus';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
        }
    }

    /**
     * Gets the current state
     */
    getState(): StatusBarState {
        return this.currentState;
    }

    /**
     * Updates the pattern count
     */
    setPatternCount(count: number): void {
        this.patternCount = count;
        if (this.currentState === 'ready') {
            this.updateState('ready', count);
        }
    }

    /**
     * Fetches pattern count from the ACE server
     */
    private async _fetchPatternCount(): Promise<void> {
        try {
            const client = getAceClient();
            if (!client) {
                return;
            }
            const status = await client.getStatus();
            const count = status.total_patterns ?? status.total_bullets ?? 0;
            this.setPatternCount(count);
        } catch (error) {
            console.error('ACE: Failed to fetch pattern count:', error);
            // Keep showing ? if fetch fails
        }
    }

    /**
     * Refreshes the pattern count from the server
     */
    async refresh(): Promise<void> {
        if (isProjectConfigured()) {
            await this._fetchPatternCount();
        }
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}

// Singleton instance
export const aceStatusBar = new AceStatusBar();
