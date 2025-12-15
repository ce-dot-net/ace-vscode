import * as vscode from 'vscode';
import { isProjectConfigured } from '../services/config';

/**
 * Clear playbook with confirmation
 */
export async function handleClear(): Promise<void> {
    // Check if project is configured
    if (!isProjectConfigured()) {
        vscode.window.showWarningMessage(
            'ACE is not configured for this project. Run "ACE: Configure" first.'
        );
        return;
    }

    // Confirm with user
    const confirm = await vscode.window.showWarningMessage(
        'Are you sure you want to clear the ACE playbook? This will remove all learned patterns.',
        { modal: true },
        'Clear Playbook',
        'Cancel'
    );

    if (confirm !== 'Clear Playbook') {
        return;
    }

    // Double confirmation for safety
    const doubleConfirm = await vscode.window.showInputBox({
        prompt: 'Type "CLEAR" to confirm playbook deletion',
        placeHolder: 'CLEAR',
        validateInput: (value) => {
            if (value !== 'CLEAR') {
                return 'Please type "CLEAR" to confirm';
            }
            return undefined;
        }
    });

    if (doubleConfirm !== 'CLEAR') {
        vscode.window.showInformationMessage('Playbook clear cancelled.');
        return;
    }

    // Guide user to use chat command for actual clearing
    const result = await vscode.window.showInformationMessage(
        'To clear the playbook, use @ace /clear --confirm in Copilot Chat.',
        'Open Chat',
        'Dismiss'
    );

    if (result === 'Open Chat') {
        await vscode.commands.executeCommand('workbench.action.chat.open');
    }
}
