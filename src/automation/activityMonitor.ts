import * as vscode from 'vscode';

/**
 * Monitors file system activity to detect task completion patterns.
 * Suggests learning capture when substantial work is detected.
 */
export class ActivityMonitor implements vscode.Disposable {
    private editCount = 0;
    private filesModified = new Set<string>();
    private lastEditTime = Date.now();
    private watcher: vscode.FileSystemWatcher | undefined;
    private checkInterval: ReturnType<typeof setInterval> | undefined;
    private suppressUntil = 0;
    private disposables: vscode.Disposable[] = [];

    /**
     * Activates the activity monitor
     */
    activate(context: vscode.ExtensionContext): void {
        // Check if automation is enabled
        const config = vscode.workspace.getConfiguration('ace');
        const automationLevel = config.get<string>('automation.level', 'smart');

        if (automationLevel === 'manual') {
            console.log('ACE: Activity monitor disabled (manual mode)');
            return;
        }

        // Watch for file changes in workspace
        this.watcher = vscode.workspace.createFileSystemWatcher('**/*');

        this.watcher.onDidChange(uri => this.onFileChange(uri), null, this.disposables);
        this.watcher.onDidCreate(uri => this.onFileCreate(uri), null, this.disposables);
        this.watcher.onDidDelete(uri => this.onFileDelete(uri), null, this.disposables);

        // Also track document edits for more granular counting
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.scheme === 'file') {
                this.editCount += e.contentChanges.length;
                this.filesModified.add(e.document.uri.fsPath);
                this.lastEditTime = Date.now();
            }
        }, null, this.disposables);

        // Check for task completion periodically
        const checkIntervalMs = 30000; // 30 seconds
        this.checkInterval = setInterval(() => this.checkTaskCompletion(), checkIntervalMs);

        context.subscriptions.push(this);
        console.log('ACE: Activity monitor activated');
    }

    private onFileChange(uri: vscode.Uri): void {
        this.filesModified.add(uri.fsPath);
        this.lastEditTime = Date.now();
    }

    private onFileCreate(uri: vscode.Uri): void {
        this.filesModified.add(uri.fsPath);
        this.lastEditTime = Date.now();
    }

    private onFileDelete(uri: vscode.Uri): void {
        this.filesModified.add(uri.fsPath);
        this.lastEditTime = Date.now();
    }

    /**
     * Checks if a significant task has been completed
     */
    private checkTaskCompletion(): void {
        // Skip if suppressed
        if (Date.now() < this.suppressUntil) {
            return;
        }

        const config = vscode.workspace.getConfiguration('ace');
        const minEdits = config.get<number>('automation.minEditsBeforeSuggest', 10);
        const idleMinutes = config.get<number>('automation.idleMinutesBeforeSuggest', 3);

        const idleTime = Date.now() - this.lastEditTime;
        const currentIdleMinutes = idleTime / 60000;

        // Trigger if: enough edits AND idle long enough
        if (this.editCount >= minEdits && currentIdleMinutes >= idleMinutes) {
            this.suggestLearning();
        }
    }

    /**
     * Shows a non-intrusive suggestion to capture learning
     */
    private async suggestLearning(): Promise<void> {
        const fileCount = this.filesModified.size;
        const edits = this.editCount;

        const result = await vscode.window.showInformationMessage(
            `ACE: Task complete? ${edits} edits in ${fileCount} files`,
            'Capture Learning',
            'Not Yet',
            "Don't Ask Again"
        );

        if (result === 'Capture Learning') {
            // Trigger the captureLearn command
            vscode.commands.executeCommand('ace-vscode.captureLearn');
        } else if (result === "Don't Ask Again") {
            // Suppress for 30 minutes
            this.suppressUntil = Date.now() + 30 * 60 * 1000;
        }

        // Reset counters after showing prompt
        this.reset();
    }

    /**
     * Resets activity counters
     */
    reset(): void {
        this.editCount = 0;
        this.filesModified.clear();
        this.lastEditTime = Date.now();
    }

    /**
     * Gets current activity statistics
     */
    getStats(): { editCount: number; fileCount: number } {
        return {
            editCount: this.editCount,
            fileCount: this.filesModified.size,
        };
    }

    /**
     * Manually triggers a learning suggestion
     */
    triggerSuggestion(): void {
        if (this.editCount > 0 || this.filesModified.size > 0) {
            this.suggestLearning();
        }
    }

    dispose(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        this.watcher?.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

// Singleton instance
export const activityMonitor = new ActivityMonitor();
