import * as vscode from 'vscode';
import { registerChatParticipant } from './chat/participant';
import { registerCommands, checkAuthOnActivation } from './commands';
import { isGloballyConfigured, isProjectConfigured } from './services/config';
import { activateAutomation } from './automation';
import { activateUI, StatusPanel } from './ui';
import { AceSearchTool, AceLearnTool, AceStatusTool, AcePlaybookTool } from './tools';
import { invalidateClient } from './services/aceClient';
import { checkAgentFilesUpdate } from './commands/updateAgents';
import { AceMcpServerProvider } from './mcp';
import { MCP_PROVIDER_ID } from './constants';

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
    console.log('ACE extension activating...');

    try {
        // Register ACE tools directly for verbose output in Agent Mode
        console.log('ACE: Registering tools...');
        registerAceTools(context);
        console.log('ACE: Tools registered');
    } catch (error) {
        console.error('ACE: Failed to register tools:', error);
    }

    // Register MCP server provider for multi-agent support (VS Code 1.108+)
    try {
        if (typeof vscode.lm.registerMcpServerDefinitionProvider === 'function') {
            const mcpProvider = new AceMcpServerProvider();
            context.subscriptions.push(
                vscode.lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, mcpProvider)
            );
            console.log('ACE: MCP server provider registered');
        }
    } catch (error) {
        console.error('ACE: Failed to register MCP provider:', error);
    }

    try {
        // Register @ace chat participant
        console.log('ACE: Registering chat participant...');
        registerChatParticipant(context);
        console.log('ACE: Chat participant registered');
    } catch (error) {
        console.error('ACE: Failed to register chat participant:', error);
    }

    try {
        // Register commands
        console.log('ACE: Registering commands...');
        registerCommands(context);

        // Register status panel command
        context.subscriptions.push(
            vscode.commands.registerCommand('ace-vscode.showStatus', () => {
                StatusPanel.createOrShow(context.extensionUri);
            })
        );
        console.log('ACE: Commands registered');
    } catch (error) {
        console.error('ACE: Failed to register commands:', error);
    }

    try {
        // Activate automation modules (activity monitoring, task detection)
        console.log('ACE: Activating automation...');
        activateAutomation(context);
        console.log('ACE: Automation activated');
    } catch (error) {
        console.error('ACE: Failed to activate automation:', error);
    }

    try {
        // Activate UI components (status bar)
        console.log('ACE: Activating UI...');
        activateUI(context);
        console.log('ACE: UI activated');
    } catch (error) {
        console.error('ACE: Failed to activate UI:', error);
    }

    // Check if agent files need creation or update (smart prompts)
    try {
        console.log('ACE: Checking agent files...');
        checkAgentFilesUpdate().then(() => {
            console.log('ACE: Agent files check complete');
            // After agent files are updated, check if hooks are enabled
            checkHooksEnabled();
        }).catch(err => {
            console.error('ACE: Agent files check failed:', err);
        });
    } catch (error) {
        console.error('ACE: Failed to check agent files:', error);
    }

    // Check authentication status and show appropriate prompts
    try {
        console.log('ACE: Checking auth status...');
        checkAuthOnActivation().then(() => {
            console.log('ACE: Auth check complete');
        }).catch(err => {
            console.error('ACE: Auth check failed:', err);
        });
    } catch (error) {
        console.error('ACE: Failed to check auth:', error);
    }

    // Show welcome/status message
    showActivationStatus();

    console.log('ACE extension activated successfully');
}

/**
 * Shows activation status to user
 * Note: Auth check is handled by checkAuthOnActivation(), this only handles project config
 */
function showActivationStatus(): void {
    const globalConfigured = isGloballyConfigured();
    const projectConfigured = isProjectConfigured();

    // If authenticated but no project configured, prompt to configure
    if (globalConfigured && !projectConfigured) {
        vscode.window.showInformationMessage(
            'ACE: Ready! Configure this project to start using pattern learning.',
            'Configure Project'
        ).then(result => {
            if (result === 'Configure Project') {
                vscode.commands.executeCommand('ace-vscode.configure');
            }
        });
    }
    // Auth prompts are handled by checkAuthOnActivation()
}

/**
 * Registers ACE tools directly using vscode.lm.registerTool()
 * This provides verbose formatted output in Copilot chat
 */
function registerAceTools(context: vscode.ExtensionContext): void {
    console.log('Registering ACE tools for Agent Mode...');

    context.subscriptions.push(
        vscode.lm.registerTool('ace_search', new AceSearchTool()),
        vscode.lm.registerTool('ace_learn', new AceLearnTool()),
        vscode.lm.registerTool('ace_status', new AceStatusTool()),
        vscode.lm.registerTool('ace_get_playbook', new AcePlaybookTool())
    );

    console.log('ACE tools registered: ace_search, ace_learn, ace_status, ace_get_playbook');
}

/**
 * Checks if chat hooks are enabled and prompts user if not.
 * Hooks are required for ace_search/ace_learn enforcement via .github/hooks/ace-hooks.json.
 * Only prompts once per workspace (tracked via workspace state).
 */
function checkHooksEnabled(): void {
    const config = vscode.workspace.getConfiguration('chat');
    const hooksEnabled = config.get<boolean>('hooks.enabled', false);

    if (!hooksEnabled) {
        // Check if we already prompted in this workspace
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.toString();
        if (!workspaceRoot) return;

        vscode.window.showInformationMessage(
            'ACE: Enable chat hooks for automatic pattern search/learn enforcement?',
            'Enable Hooks',
            'Not Now'
        ).then(selection => {
            if (selection === 'Enable Hooks') {
                config.update('hooks.enabled', true, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage('ACE: Chat hooks enabled! ace_search will run at session start, ace_learn enforced at session end.');
            }
        });
    }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
    // Clean up SDK client
    invalidateClient();
    console.log('ACE extension deactivated');
}
