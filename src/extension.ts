import * as vscode from 'vscode';
import { registerChatParticipant } from './chat/participant';
import { registerCommands } from './commands';
import { isGloballyConfigured, isProjectConfigured } from './services/config';
import { activateAutomation } from './automation';
import { activateUI, StatusPanel } from './ui';
import { AceSearchTool, AceLearnTool, AceStatusTool, AcePlaybookTool } from './tools';
import { invalidateClient } from './services/aceClient';
import { checkAgentFilesUpdate } from './commands/updateAgents';
import { loadUserAuth } from '@ace-sdk/core';

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
        }).catch(err => {
            console.error('ACE: Agent files check failed:', err);
        });
    } catch (error) {
        console.error('ACE: Failed to check agent files:', error);
    }

    // Show welcome/status message
    showActivationStatus();

    // Check token expiration (hard cap and refresh token only)
    checkTokenExpiration();

    console.log('ACE extension activated successfully');
}

/**
 * Shows activation status to user
 */
function showActivationStatus(): void {
    const globalConfigured = isGloballyConfigured();
    const projectConfigured = isProjectConfigured();

    if (!globalConfigured) {
        vscode.window.showInformationMessage(
            'ACE: Global configuration not found. Run "ACE: Configure" to set up.',
            'Configure'
        ).then(result => {
            if (result === 'Configure') {
                vscode.commands.executeCommand('ace-vscode.configure');
            }
        });
    } else if (!projectConfigured) {
        vscode.window.showInformationMessage(
            'ACE: Ready! Configure this project to start using pattern learning.',
            'Configure Project'
        ).then(result => {
            if (result === 'Configure Project') {
                vscode.commands.executeCommand('ace-vscode.configure');
            }
        });
    }
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
 * Check token expiration and warn user proactively
 *
 * IMPORTANT: Only warns about:
 * 1. 7-day hard cap approaching (absolute_expires_at < 24h)
 * 2. Refresh token expired (refresh_expires_at in past)
 *
 * Does NOT warn about access token expiration - sliding window extends it on every use.
 */
function checkTokenExpiration(): void {
    try {
        const auth = loadUserAuth();
        if (!auth) {
            return; // No auth = user hasn't logged in yet
        }

        const now = Date.now();

        // Check if refresh token is expired (can't auto-recover from this)
        if (auth.refresh_expires_at) {
            const refreshExpiresAt = new Date(auth.refresh_expires_at).getTime();
            if (refreshExpiresAt < now) {
                vscode.window.showErrorMessage(
                    'ACE session expired. Please login again.',
                    'Login'
                ).then(action => {
                    if (action === 'Login') {
                        vscode.commands.executeCommand('ace-vscode.login');
                    }
                });
                return;
            }
        }

        // Check if absolute cap (7-day hard limit) is approaching
        if (auth.absolute_expires_at) {
            const absoluteExpiresAt = new Date(auth.absolute_expires_at).getTime();
            const hoursRemaining = (absoluteExpiresAt - now) / (1000 * 60 * 60);

            if (hoursRemaining < 24 && hoursRemaining > 0) {
                vscode.window.showWarningMessage(
                    `ACE 7-day session limit approaching (${Math.round(hoursRemaining)}h). Must re-login soon.`,
                    'Login Now'
                ).then(action => {
                    if (action === 'Login Now') {
                        vscode.commands.executeCommand('ace-vscode.login');
                    }
                });
            }
        }

        // DO NOT warn about access token expiration!
        // Sliding window extends it on every API call.
        // SDK's ensureValidToken() handles automatic refresh.

    } catch (error) {
        console.error('ACE: Failed to check token expiration:', error);
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
