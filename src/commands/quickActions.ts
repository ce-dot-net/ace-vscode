import * as vscode from 'vscode';
import { isProjectConfigured, isGloballyConfigured, getProjectConfig } from '../services/config';
import { handleUpdateAgents } from './updateAgents';

interface QuickActionItem extends vscode.QuickPickItem {
    action: string;
}

/**
 * Shows a quick pick menu with ACE actions
 */
export async function handleQuickActions(): Promise<void> {
    const isGlobal = isGloballyConfigured();
    const isProject = isProjectConfigured();

    const items: QuickActionItem[] = [];

    // Always show status check
    items.push({
        label: '$(graph) Show Status',
        description: 'View playbook statistics',
        action: 'status',
    });

    if (isProject) {
        // Configured project actions
        items.push(
            {
                label: '$(search) Search Patterns',
                description: 'Search for relevant patterns',
                action: 'search',
            },
            {
                label: '$(book) View Playbook',
                description: 'Browse playbook sections',
                action: 'patterns',
            },
            {
                label: '$(mortar-board) Capture Learning',
                description: 'Save patterns from current work',
                action: 'learn',
            },
            {
                label: '$(refresh) Bootstrap Playbook',
                description: 'Initialize from codebase',
                action: 'bootstrap',
            }
        );
    }

    // Separator before config section
    items.push({
        label: '',
        kind: vscode.QuickPickItemKind.Separator,
        action: '',
    } as QuickActionItem);

    // Configuration sub-menu when already configured
    if (isGlobal && isProject) {
        items.push(
            {
                label: '$(file-code) Update Agent Files',
                description: 'Refresh .github/agents/*.agent.md',
                action: 'updateAgents',
            },
            {
                label: '$(folder) Change Project',
                description: 'Switch to different project (keeps token)',
                action: 'changeProject',
            },
            {
                label: '$(info) View Current Config',
                description: 'Show current configuration',
                action: 'viewConfig',
            },
            {
                label: '$(key) Full Configuration',
                description: 'Open full config panel (change token)',
                action: 'configure',
            }
        );
    } else {
        // Not configured - show main configure option
        items.push({
            label: '$(gear) Configure ACE',
            description: 'Set up API token and project',
            action: 'configure',
        });
    }

    // Settings
    items.push({
        label: '$(settings-gear) Automation Settings',
        description: 'Configure automation level',
        action: 'settings',
    });

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an ACE action',
        title: 'ACE: Quick Actions',
    });

    if (!selected) {
        return;
    }

    switch (selected.action) {
        case 'status':
            vscode.commands.executeCommand('workbench.action.chat.open', {
                query: '@ace /status',
            });
            break;
        case 'search':
            // Show search input
            const query = await vscode.window.showInputBox({
                prompt: 'What are you looking for?',
                placeHolder: 'e.g., authentication patterns, error handling',
            });
            if (query) {
                vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: `@ace /search ${query}`,
                });
            }
            break;
        case 'updateAgents':
            await handleUpdateAgents(false);  // false = show UI feedback
            break;
        case 'changeProject':
            vscode.commands.executeCommand('ace-vscode.configure');
            break;
        case 'viewConfig':
            const config = getProjectConfig();
            if (config) {
                vscode.window.showInformationMessage(
                    `ACE Config: Project ${config.projectId} | Org ${config.orgId} | Server ${config.serverUrl}`
                );
            } else {
                vscode.window.showWarningMessage('ACE is not configured for this project.');
            }
            break;
        case 'patterns':
            // Show section picker
            const sections = [
                { label: 'All Sections', value: '' },
                { label: 'Strategies & Rules', value: 'strategies' },
                { label: 'Code Snippets', value: 'snippets' },
                { label: 'Troubleshooting', value: 'troubleshooting' },
                { label: 'APIs to Use', value: 'apis' },
            ];
            const section = await vscode.window.showQuickPick(sections, {
                placeHolder: 'Select playbook section',
            });
            if (section) {
                const sectionArg = section.value ? ` ${section.value}` : '';
                vscode.commands.executeCommand('workbench.action.chat.open', {
                    query: `@ace /patterns${sectionArg}`,
                });
            }
            break;
        case 'learn':
            vscode.commands.executeCommand('ace-vscode.captureLearn');
            break;
        case 'bootstrap':
            vscode.commands.executeCommand('ace-vscode.bootstrap');
            break;
        case 'configure':
            vscode.commands.executeCommand('ace-vscode.configure');
            break;
        case 'settings':
            vscode.commands.executeCommand('workbench.action.openSettings', 'ace.automation');
            break;
    }
}
