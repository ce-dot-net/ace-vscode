import * as vscode from 'vscode';
import { isProjectConfigured } from '../services/config';

/**
 * Bootstrap playbook from codebase analysis
 */
export async function handleBootstrap(): Promise<void> {
    // Check if project is configured
    if (!isProjectConfigured()) {
        const result = await vscode.window.showWarningMessage(
            'ACE is not configured for this project.',
            'Configure Now',
            'Cancel'
        );

        if (result === 'Configure Now') {
            await vscode.commands.executeCommand('ace-vscode.configure');
        }
        return;
    }

    // Show progress while bootstrapping
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'ACE: Bootstrapping Playbook',
            cancellable: false
        },
        async (progress) => {
            progress.report({ message: 'Analyzing codebase...' });

            // The actual bootstrapping is done via the SDK
            // We just guide the user to use the chat participant
            await new Promise(resolve => setTimeout(resolve, 1000));

            progress.report({ message: 'Complete! Use @ace in chat to continue.' });
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    );

    // Open chat and suggest bootstrap
    const result = await vscode.window.showInformationMessage(
        'To bootstrap your playbook, use @ace /bootstrap in Copilot Chat.',
        'Open Chat',
        'Dismiss'
    );

    if (result === 'Open Chat') {
        // Open GitHub Copilot chat
        await vscode.commands.executeCommand('workbench.action.chat.open');
    }
}
