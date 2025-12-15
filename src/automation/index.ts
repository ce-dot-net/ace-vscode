import * as vscode from 'vscode';
import { activityMonitor } from './activityMonitor';
import { taskDetector } from './taskDetector';
import { gitMonitor } from './gitMonitor';

export { ActivityMonitor, activityMonitor } from './activityMonitor';
export { TaskDetector, taskDetector } from './taskDetector';
export { GitMonitor, gitMonitor } from './gitMonitor';

/**
 * Activates all automation modules
 */
export function activateAutomation(context: vscode.ExtensionContext): void {
    activityMonitor.activate(context);
    taskDetector.activate(context);
    gitMonitor.activate(context);
    console.log('ACE: Automation modules activated');
}
