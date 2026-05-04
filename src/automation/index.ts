import * as vscode from 'vscode';
import { activityMonitor } from './activityMonitor';
import { taskDetector } from './taskDetector';
import { gitMonitor } from './gitMonitor';
import { workspaceMonitor } from './workspaceMonitor';
import { activateTerminalWatcher } from './terminalWatcher';

export { ActivityMonitor, activityMonitor } from './activityMonitor';
export { TaskDetector, taskDetector } from './taskDetector';
export { GitMonitor, gitMonitor } from './gitMonitor';
export { WorkspaceMonitor, workspaceMonitor } from './workspaceMonitor';
export { activateTerminalWatcher } from './terminalWatcher';

/**
 * Activates all automation modules
 */
export function activateAutomation(context: vscode.ExtensionContext): void {
    activityMonitor.activate(context);
    taskDetector.activate(context);
    gitMonitor.activate(context);
    workspaceMonitor.activate(context);
    activateTerminalWatcher(context);
    console.log('ACE: Automation modules activated');
}
