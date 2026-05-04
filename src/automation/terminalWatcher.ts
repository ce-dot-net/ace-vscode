import * as vscode from 'vscode';

const BUILD_TEST_COMMAND_RE = /^\s*(npm\s+(?:run|test|build)\b|make\b|jest\b|pytest\b|go\s+(?:build|test)\b)/i;

const NUDGE_MESSAGE = 'ACE: subtask complete — consider running ace_search if topic shifted.';

const COOLDOWN_MS = 60_000;

export function activateTerminalWatcher(context: vscode.ExtensionContext): void {
    if (typeof vscode.window.onDidEndTerminalShellExecution !== 'function') {
        return;
    }

    let lastFiredAt = 0;

    const subscription = vscode.window.onDidEndTerminalShellExecution(event => {
        const level = vscode.workspace.getConfiguration('ace').get<string>('automation.level');
        if (level === 'manual') return;

        if (event.exitCode !== 0) return;

        const commandLine = event.execution?.commandLine?.value;
        if (!commandLine || !BUILD_TEST_COMMAND_RE.test(commandLine)) return;

        const now = Date.now();
        if (now - lastFiredAt < COOLDOWN_MS) return;
        lastFiredAt = now;

        void vscode.window.showInformationMessage(NUDGE_MESSAGE);
    });

    context.subscriptions.push(subscription);
}
