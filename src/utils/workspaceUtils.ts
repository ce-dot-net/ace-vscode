import * as vscode from 'vscode';

/**
 * Multi-root workspace utilities for ACE VSCode extension.
 * Handles folder detection and configuration per workspace folder.
 */

/**
 * Get workspace folder from active editor context.
 * For single-folder workspaces, returns that folder.
 * For multi-root, tries to detect from active editor.
 */
export function getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return undefined;

    // Single folder workspace - easy case
    if (folders.length === 1) return folders[0];

    // Multi-root: try to detect from active editor
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri) {
        return vscode.workspace.getWorkspaceFolder(activeUri);
    }

    return undefined; // Can't determine context
}

/**
 * Get workspace folder path, with fallback to first folder for backwards compatibility.
 * Use getActiveWorkspaceFolder() for context-aware folder detection.
 */
export function getWorkspaceRootPath(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return undefined;
    return folders[0].uri.fsPath;
}

/**
 * Check if we're in a multi-root workspace
 */
export function isMultiRootWorkspace(): boolean {
    const folders = vscode.workspace.workspaceFolders;
    return (folders?.length ?? 0) > 1;
}

/**
 * Get all workspace folders
 */
export function getAllWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
    return vscode.workspace.workspaceFolders ?? [];
}

/**
 * Get folder from chat request references (user-attached #file or #folder)
 */
export function getFolderFromReferences(references: readonly vscode.ChatPromptReference[]): vscode.WorkspaceFolder | undefined {
    for (const ref of references) {
        if (ref.value instanceof vscode.Uri) {
            const folder = vscode.workspace.getWorkspaceFolder(ref.value);
            if (folder) return folder;
        }
    }
    return undefined;
}

/**
 * Prompt user to select a workspace folder.
 * Shows a quick pick with all available folders.
 */
export async function promptForWorkspaceFolder(
    placeHolder: string = 'Select project folder for ACE'
): Promise<vscode.WorkspaceFolder | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) return undefined;
    if (folders.length === 1) return folders[0];

    const items = folders.map(folder => ({
        label: folder.name,
        description: folder.uri.fsPath,
        folder
    }));

    const picked = await vscode.window.showQuickPick(items, { placeHolder });
    return picked?.folder;
}

/**
 * Show warning that ACE is not configured for a folder, with option to configure.
 * Returns true if user wants to configure, false otherwise.
 */
export async function promptUnconfiguredFolder(
    folder: vscode.WorkspaceFolder
): Promise<'configure' | 'later' | undefined> {
    const result = await vscode.window.showWarningMessage(
        `ACE not configured for "${folder.name}"`,
        'Configure Now',
        'Later'
    );

    if (result === 'Configure Now') return 'configure';
    if (result === 'Later') return 'later';
    return undefined;
}

/**
 * Get folder from URI
 */
export function getWorkspaceFolderFromUri(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.getWorkspaceFolder(uri);
}
