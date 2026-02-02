import * as vscode from 'vscode';
import { login, type LoginOptions } from '@ace-sdk/core';
import { invalidateClient } from '../services/aceClient';
import { COMMANDS, DEVICE_MANAGEMENT_URL, DEVICE_LIMITS_DOCS_URL } from '../constants';
import { isDeviceLimitError, isValidVerificationUri } from '../utils/loginHelpers';
import { resetAuthNotifications } from '../services/authMonitor';

/**
 * ACE Login Command - Device Code Authentication Flow
 *
 * Implements browser-based login instead of manual token entry.
 * Uses SDK Core's device code flow (RFC 8628).
 */
export async function handleLogin(): Promise<void> {
    const abortController = new AbortController();

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'ACE Login',
                cancellable: true,
            },
            async (progress, token) => {
                token.onCancellationRequested(() => {
                    abortController.abort();
                });

                const loginOptions: LoginOptions = {
                    clientType: 'vscode',
                    signal: abortController.signal,

                    onUserCode: async (userCode, verificationUri) => {
                        progress.report({ message: 'Waiting for authorization...' });

                        if (!isValidVerificationUri(verificationUri)) {
                            throw new Error('Invalid verification URI received from server');
                        }

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
                            await vscode.window.showInformationMessage('Code copied to clipboard!');
                        } else {
                            // User dismissed modal — show code in progress so they can still proceed
                            progress.report({ message: `Code: ${userCode} — Open browser to complete login` });
                        }
                    },

                    onProgress: (message) => {
                        progress.report({ message });
                    },

                    onSuccess: () => {
                        // Note: success notification shown after invalidateClient() below
                    },
                };

                try {
                    const user = await login(loginOptions);
                    invalidateClient();
                    resetAuthNotifications();
                    vscode.window.showInformationMessage(`Logged in as ${user.email}`);
                } catch (error: unknown) {
                    if (isDeviceLimitError(error)) {
                        const action = await vscode.window.showErrorMessage(
                            'Device limit reached. Revoke another device to continue.',
                            'Manage Devices',
                            'Learn More'
                        );

                        if (action === 'Manage Devices') {
                            await vscode.env.openExternal(
                                vscode.Uri.parse(DEVICE_MANAGEMENT_URL)
                            );
                        } else if (action === 'Learn More') {
                            await vscode.env.openExternal(
                                vscode.Uri.parse(DEVICE_LIMITS_DOCS_URL)
                            );
                        }
                        return;
                    }

                    if (error instanceof Error && error.name === 'AbortError') {
                        vscode.window.showInformationMessage('Login cancelled');
                        return;
                    }

                    throw error;
                }
            }
        );
    } catch (error: unknown) {
        console.error('ACE Login failed:', error);
        vscode.window.showErrorMessage('ACE Login failed. Check the output panel for details.');
    }
}
