import * as vscode from 'vscode';
import { COMMANDS } from '../constants';
import { handleConfigure } from './configure';
import { handleLogin } from './login';
import { handleBootstrap } from './bootstrap';
import { handleClear } from './clear';
import { handleCaptureLearn } from './captureLearn';
import { handleQuickActions } from './quickActions';
import { handleUpdateAgents, checkAgentFilesUpdate } from './updateAgents';

export { checkAgentFilesUpdate } from './updateAgents';

/**
 * Registers all extension commands
 */
export function registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMANDS.CONFIGURE, () => handleConfigure(context)),
        vscode.commands.registerCommand(COMMANDS.LOGIN, handleLogin),
        vscode.commands.registerCommand(COMMANDS.BOOTSTRAP, handleBootstrap),
        vscode.commands.registerCommand(COMMANDS.CLEAR, handleClear),
        vscode.commands.registerCommand(COMMANDS.CAPTURE_LEARN, handleCaptureLearn),
        vscode.commands.registerCommand(COMMANDS.QUICK_ACTIONS, handleQuickActions),
        vscode.commands.registerCommand(COMMANDS.UPDATE_AGENTS, handleUpdateAgents)
    );
}
