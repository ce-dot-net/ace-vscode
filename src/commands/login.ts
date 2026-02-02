import * as vscode from 'vscode';
import { login, type CurrentUser, type LoginOptions } from '@ace-sdk/core';
import { invalidateClient } from '../services/aceClient';
import { DEVICE_MANAGEMENT_URL, DEVICE_LIMITS_DOCS_URL } from '../constants';

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

                    onProgress: (message) => {
                        progress.report({ message });
                    },

                    onSuccess: (user: CurrentUser) => {
                        vscode.window.showInformationMessage(
                            `Logged in as ${user.email}`
                        );
                    },
                };

                try {
                    await login(loginOptions);
                    invalidateClient();
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`ACE Login failed: ${message}`);
    }
}

function isDeviceLimitError(error: unknown): boolean {
    if (error instanceof Error && error.message.includes('device limit exceeded')) {
        return true;
    }
    if (typeof error === 'object' && error !== null) {
        const err = error as Record<string, unknown>;
        const response = err.response as Record<string, unknown> | undefined;
        const data = response?.data as Record<string, unknown> | undefined;
        return data?.error_code === 'device_limit_exceeded';
    }
    return false;
}
