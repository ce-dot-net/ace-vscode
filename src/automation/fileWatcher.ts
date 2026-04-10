import * as vscode from 'vscode';

const ACE_MANAGED_FILES = [
    '.github/hooks/ace-hooks.json',
    '.github/agents/ace.agent.md',
    '.github/agents/ace-learn.agent.md',
    '.github/instructions/ace.instructions.md',
    '.github/skills/ace-pattern-learning/SKILL.md'
];

export function activateFileWatcher(context: vscode.ExtensionContext): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceFolder, '.github/**/*')
    );

    watcher.onDidDelete(uri => {
        const relative = vscode.workspace.asRelativePath(uri);
        if (ACE_MANAGED_FILES.includes(relative)) {
            vscode.window.showWarningMessage(
                `ACE: "${relative}" was deleted. Recreate it?`,
                'Recreate'
            ).then(selection => {
                if (selection === 'Recreate') {
                    vscode.commands.executeCommand('ace-vscode.updateAgents');
                }
            });
        }
    });

    context.subscriptions.push(watcher);
}
