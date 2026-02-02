import * as vscode from 'vscode';
import { login, type CurrentUser, type LoginOptions } from '@ace-sdk/core';
import { invalidateClient } from '../services/aceClient';

/**
 * ACE Login Command - Device Code Authentication Flow
 *
 * Implements browser-based login instead of manual token entry.
 * Uses SDK Core's device code flow (RFC 8628).
 */
export async function handleLogin(): Promise<void> {
    // Create AbortController for SDK login cancellation
    const abortController = new AbortController();

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'ACE Login',
                cancellable: true,
            },
            async (progress, token) => {
                // Map VS Code cancellation to AbortController
                token.onCancellationRequested(() => {
                    abortController.abort();
                });

                // Configure login options
                const loginOptions: LoginOptions = {
                    clientType: 'vscode',
                    signal: abortController.signal,

                    // Show user code with action buttons
                    onUserCode: async (userCode, verificationUri) => {
                        progress.report({ message: 'Waiting for authorization...' });

                        const action = await vscode.window.showInformationMessage(
                            `Your code: ${userCode}`,
                            { modal: true },
                            'Open Browser',
                            'Copy Code'
                        );

                        if (action === 'Open Browser') {
                            await vscode.env.openExternal(vscode.Uri.parse(verificationUri));
                        } else if (action === 'Copy Code') {
                            await vscode.env.clipboard.writeText(userCode);
                            vscode.window.showInformationMessage('Code copied to clipboard!');
                        }
                    },

                    // Show progress updates
                    onProgress: (message) => {
                        progress.report({ message });
                    },

                    // Handle successful login
                    onSuccess: (user: CurrentUser) => {
                        vscode.window.showInformationMessage(
                            `✅ Logged in as ${user.email}`
                        );
                    },
                };

                try {
                    // Execute login flow (SDK handles device code request, polling, and saving)
                    await login(loginOptions);

                    // Invalidate cached clients so they pick up new auth
                    invalidateClient();

                } catch (error: any) {
                    // Handle device limit exceeded error
                    if (error.message?.includes('device limit exceeded') ||
                        error.response?.data?.error_code === 'device_limit_exceeded') {

                        const action = await vscode.window.showErrorMessage(
                            'Device limit reached. Revoke another device to continue.',
                            'Manage Devices',
                            'Learn More'
                        );

                        if (action === 'Manage Devices') {
                            await vscode.env.openExternal(
                                vscode.Uri.parse('https://ace.code-engine.app/dashboard/devices')
                            );
                        } else if (action === 'Learn More') {
                            await vscode.env.openExternal(
                                vscode.Uri.parse('https://docs.code-engine.app/ace/device-limits')
                            );
                        }
                        return;
                    }

                    // User cancelled
                    if (error.name === 'AbortError') {
                        vscode.window.showInformationMessage('Login cancelled');
                        return;
                    }

                    // Other errors
                    throw error;
                }
            }
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(
            `ACE Login failed: ${error.message || 'Unknown error'}`
        );
    }
}
