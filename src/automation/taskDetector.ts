import * as vscode from 'vscode';

/**
 * Detects task completion events like test runs and build completions.
 * Provides contextual suggestions based on task outcomes.
 */
export class TaskDetector implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private recentTaskContext: string | undefined;

    /**
     * Activates the task detector
     */
    activate(context: vscode.ExtensionContext): void {
        // Check if automation is enabled
        const config = vscode.workspace.getConfiguration('ace');
        const automationLevel = config.get<string>('automation.level', 'smart');

        if (automationLevel === 'manual') {
            console.log('ACE: Task detector disabled (manual mode)');
            return;
        }

        // Detect task completion
        vscode.tasks.onDidEndTaskProcess(e => this.onTaskComplete(e), null, this.disposables);

        // Track task start for context
        vscode.tasks.onDidStartTask(e => {
            this.recentTaskContext = e.execution.task.name;
        }, null, this.disposables);

        context.subscriptions.push(this);
        console.log('ACE: Task detector activated');
    }

    /**
     * Handles task completion events
     */
    private onTaskComplete(event: vscode.TaskProcessEndEvent): void {
        const taskName = event.execution.task.name.toLowerCase();
        const exitCode = event.exitCode;

        // Detect test completion
        if (this.isTestTask(taskName)) {
            if (exitCode === 0) {
                this.onTestsPass(taskName);
            } else {
                this.onTestsFail(taskName);
            }
            return;
        }

        // Detect build completion
        if (this.isBuildTask(taskName)) {
            if (exitCode === 0) {
                this.onBuildSuccess(taskName);
            } else {
                this.onBuildFail(taskName);
            }
            return;
        }

        // For other tasks that succeed, optionally suggest learning
        if (exitCode === 0 && this.isSignificantTask(taskName)) {
            this.onSignificantTaskComplete(taskName);
        }
    }

    private isTestTask(name: string): boolean {
        return /test|spec|jest|mocha|vitest|pytest/.test(name);
    }

    private isBuildTask(name: string): boolean {
        return /build|compile|webpack|tsc|esbuild/.test(name);
    }

    private isSignificantTask(name: string): boolean {
        return /deploy|publish|release|migrate|upgrade/.test(name);
    }

    /**
     * Called when tests pass
     */
    private async onTestsPass(taskName: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('ace');
        const automationLevel = config.get<string>('automation.level', 'smart');

        // Only show in smart mode
        if (automationLevel !== 'smart' && automationLevel !== 'aggressive') {
            return;
        }

        const result = await vscode.window.showInformationMessage(
            `ACE: Tests passed! Capture patterns from this work?`,
            'Capture Learning',
            'No'
        );

        if (result === 'Capture Learning') {
            vscode.commands.executeCommand('ace-vscode.captureLearn', {
                context: `Tests passed: ${taskName}`,
                success: true,
            });
        }
    }

    /**
     * Called when tests fail
     */
    private async onTestsFail(taskName: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('ace');
        const automationLevel = config.get<string>('automation.level', 'smart');

        // Only show in smart or aggressive mode
        if (automationLevel !== 'smart' && automationLevel !== 'aggressive') {
            return;
        }

        const result = await vscode.window.showInformationMessage(
            `ACE: Tests failed. Search for troubleshooting patterns?`,
            'Search Patterns',
            'No'
        );

        if (result === 'Search Patterns') {
            // Open Copilot chat with a search query
            vscode.commands.executeCommand('workbench.action.chat.open', {
                query: `@ace /search test failure ${taskName}`,
            });
        }
    }

    /**
     * Called when build succeeds
     */
    private async onBuildSuccess(taskName: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('ace');
        const automationLevel = config.get<string>('automation.level', 'smart');

        // Only suggest after successful builds in aggressive mode
        if (automationLevel !== 'aggressive') {
            return;
        }

        const result = await vscode.window.showInformationMessage(
            `ACE: Build succeeded. Capture patterns?`,
            'Capture Learning',
            'No'
        );

        if (result === 'Capture Learning') {
            vscode.commands.executeCommand('ace-vscode.captureLearn', {
                context: `Build succeeded: ${taskName}`,
                success: true,
            });
        }
    }

    /**
     * Called when build fails
     */
    private async onBuildFail(taskName: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('ace');
        const automationLevel = config.get<string>('automation.level', 'smart');

        if (automationLevel === 'manual') {
            return;
        }

        const result = await vscode.window.showInformationMessage(
            `ACE: Build failed. Search for troubleshooting patterns?`,
            'Search Patterns',
            'No'
        );

        if (result === 'Search Patterns') {
            vscode.commands.executeCommand('workbench.action.chat.open', {
                query: `@ace /search build error ${taskName}`,
            });
        }
    }

    /**
     * Called when a significant task completes
     */
    private async onSignificantTaskComplete(taskName: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('ace');
        const automationLevel = config.get<string>('automation.level', 'smart');

        if (automationLevel !== 'aggressive') {
            return;
        }

        const result = await vscode.window.showInformationMessage(
            `ACE: ${taskName} completed. Capture patterns?`,
            'Capture Learning',
            'No'
        );

        if (result === 'Capture Learning') {
            vscode.commands.executeCommand('ace-vscode.captureLearn', {
                context: `Task completed: ${taskName}`,
                success: true,
            });
        }
    }

    /**
     * Gets the recent task context
     */
    getRecentTaskContext(): string | undefined {
        return this.recentTaskContext;
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}

// Singleton instance
export const taskDetector = new TaskDetector();
