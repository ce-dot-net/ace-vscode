import * as vscode from 'vscode';
import { ConfigPanel } from '../ui/configPanel';
import { getActiveWorkspaceFolder, isMultiRootWorkspace } from '../utils/workspaceUtils';

/**
 * Configuration wizard for ACE - Opens a webview panel that persists when switching windows
 * In multi-root workspaces, configures the folder from the active editor
 */
export async function handleConfigure(context: vscode.ExtensionContext): Promise<void> {
    // Get active folder for multi-root workspace context
    const folder = getActiveWorkspaceFolder();

    // In multi-root workspace without context, prompt user
    if (isMultiRootWorkspace() && !folder) {
        const folders = vscode.workspace.workspaceFolders ?? [];
        const picked = await vscode.window.showQuickPick(
            folders.map(f => ({ label: f.name, folder: f })),
            {
                placeHolder: 'Select a project to configure'
            }
        );
        if (picked) {
            ConfigPanel.createOrShow(context.extensionUri, picked.folder);
            return;
        }
        // User cancelled - open without folder context
    }

    ConfigPanel.createOrShow(context.extensionUri, folder);
}
