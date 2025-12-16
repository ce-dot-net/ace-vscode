import * as vscode from 'vscode';
import { getActiveWorkspaceFolder, promptUnconfiguredFolder, isMultiRootWorkspace } from '../utils/workspaceUtils';
import { isProjectConfigured } from '../services/config';
import { aceStatusBar } from '../ui/statusBar';

/**
 * Monitors workspace folder changes and active editor switches.
 * Handles detection of unconfigured folders and updates UI accordingly.
 */
export class WorkspaceMonitor implements vscode.Disposable {
    private currentFolder: vscode.WorkspaceFolder | undefined;
    private disposables: vscode.Disposable[] = [];
    private promptedFolders = new Set<string>(); // Track folders we've already prompted about

    /**
     * Activates the workspace monitor
     */
    activate(context: vscode.ExtensionContext): void {
        // Skip monitoring for single-folder workspaces
        if (!isMultiRootWorkspace()) {
            console.log('ACE: Single-folder workspace, workspace monitor not needed');
            return;
        }

        console.log('ACE: Activating workspace monitor for multi-root workspace');

        // Initialize current folder from active editor
        this.currentFolder = getActiveWorkspaceFolder();
        if (this.currentFolder) {
            console.log(`ACE: Initial folder context: ${this.currentFolder.name}`);
        }

        // Listen for active editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this.handleActiveEditorChange(editor);
            })
        );

        // Listen for workspace folder changes (add/remove folders)
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(event => {
                this.handleWorkspaceFoldersChange(event);
            })
        );

        // Add disposables to context
        context.subscriptions.push(this);

        console.log('ACE: Workspace monitor activated');
    }

    /**
     * Handles active editor changes - detects folder switches
     */
    private handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
        if (!editor) return;

        // Get folder for the active editor's document
        const newFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!newFolder) return;

        // Check if folder actually changed
        if (this.isSameFolder(newFolder, this.currentFolder)) {
            return;
        }

        console.log(`ACE: Folder switch detected: ${this.currentFolder?.name ?? 'none'} → ${newFolder.name}`);
        this.onFolderSwitch(this.currentFolder, newFolder);
        this.currentFolder = newFolder;
    }

    /**
     * Handles workspace folder changes (folders added/removed)
     */
    private handleWorkspaceFoldersChange(event: vscode.WorkspaceFoldersChangeEvent): void {
        // Check if any newly added folders need configuration
        for (const folder of event.added) {
            console.log(`ACE: Folder added to workspace: ${folder.name}`);
            if (!isProjectConfigured(folder)) {
                this.promptForConfiguration(folder);
            }
        }

        // Clear prompted state for removed folders
        for (const folder of event.removed) {
            this.promptedFolders.delete(folder.uri.toString());
        }
    }

    /**
     * Called when user switches to a different folder
     */
    private onFolderSwitch(oldFolder: vscode.WorkspaceFolder | undefined, newFolder: vscode.WorkspaceFolder): void {
        // Check if new folder is configured
        if (!isProjectConfigured(newFolder)) {
            this.promptForConfiguration(newFolder);
        }

        // Update status bar for new folder
        aceStatusBar.updateForFolder(newFolder);
    }

    /**
     * Prompts user to configure ACE for an unconfigured folder
     */
    private async promptForConfiguration(folder: vscode.WorkspaceFolder): Promise<void> {
        const folderKey = folder.uri.toString();

        // Don't prompt twice for the same folder in one session
        if (this.promptedFolders.has(folderKey)) {
            return;
        }
        this.promptedFolders.add(folderKey);

        console.log(`ACE: Prompting for configuration of unconfigured folder: ${folder.name}`);

        const result = await promptUnconfiguredFolder(folder);
        if (result === 'configure') {
            vscode.commands.executeCommand('ace-vscode.configure');
        }
    }

    /**
     * Compares two folders for equality
     */
    private isSameFolder(a: vscode.WorkspaceFolder | undefined, b: vscode.WorkspaceFolder | undefined): boolean {
        if (!a && !b) return true;
        if (!a || !b) return false;
        return a.uri.toString() === b.uri.toString();
    }

    /**
     * Gets the current active folder
     */
    getCurrentFolder(): vscode.WorkspaceFolder | undefined {
        return this.currentFolder;
    }

    /**
     * Forces a refresh of the current folder state
     */
    refresh(): void {
        this.currentFolder = getActiveWorkspaceFolder();
        if (this.currentFolder) {
            aceStatusBar.updateForFolder(this.currentFolder);
        }
    }

    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
        this.promptedFolders.clear();
    }
}

// Singleton instance
export const workspaceMonitor = new WorkspaceMonitor();
