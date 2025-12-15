import * as vscode from 'vscode';
import { aceStatusBar } from './statusBar';

export { AceStatusBar, aceStatusBar, StatusBarState } from './statusBar';
export { ConfigPanel } from './configPanel';
export { StatusPanel } from './statusPanel';

/**
 * Activates all UI components
 */
export function activateUI(context: vscode.ExtensionContext): void {
    aceStatusBar.activate(context);
    console.log('ACE: UI components activated');
}
