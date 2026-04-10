import * as vscode from 'vscode';
import { login, logout, isAuthenticated, getTokenStatus, getCurrentUser, ensureValidToken, refreshOrganizations, type CurrentUser } from '@ace-sdk/core';
import { invalidateClient } from '../services/aceClient';
import { notifyAuthChanged } from '../extension';

// Re-export SDK auth functions for use in other modules
export { isAuthenticated, getCurrentUser };

/**
 * Device code login command
 * Implements RFC 8628 device authorization grant via @ace-sdk/core
 */
export async function handleLogin(): Promise<CurrentUser | null> {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'ACE Login',
        cancellable: true
    }, async (progress, token) => {
        const abortController = new AbortController();
        token.onCancellationRequested(() => abortController.abort());

        try {
            const currentUser = await login({
                clientType: 'vscode',
                noBrowser: false,
                timeout: 300000, // 5 minutes
                signal: abortController.signal,

                onUserCode: (userCode: string, verificationUrl: string) => {
                    // Show notification with user code and action buttons
                    vscode.window.showInformationMessage(
                        `ACE Login Code: ${userCode}`,
                        'Open Browser',
                        'Copy Code'
                    ).then(selection => {
                        if (selection === 'Open Browser') {
                            vscode.env.openExternal(vscode.Uri.parse(verificationUrl));
                        } else if (selection === 'Copy Code') {
                            vscode.env.clipboard.writeText(userCode);
                            vscode.window.showInformationMessage('Code copied to clipboard');
                        }
                    });

                    // Auto-open browser (SDK may also try, but VS Code APIs work better)
                    vscode.env.openExternal(vscode.Uri.parse(verificationUrl));
                },

                onProgress: (message: string) => {
                    progress.report({ message });
                },

                onSuccess: (user: CurrentUser) => {
                    vscode.window.showInformationMessage(
                        `Successfully logged in as ${user.email}`
                    );
                }
            });

            // Refresh organizations from server after login
            // (login response may return empty orgs for new users before Clerk sync)
            if (currentUser) {
                try {
                    const refreshedOrgs = await refreshOrganizations();
                    if (refreshedOrgs && refreshedOrgs.length > 0) {
                        currentUser.organizations = refreshedOrgs;
                    }
                } catch (err) {
                    console.warn('[ACE] Failed to refresh organizations, using login response:', err);
                }
            }

            // Invalidate client cache and notify UI to pick up new auth
            invalidateClient();
            notifyAuthChanged();

            return currentUser;
        } catch (error) {
            if (abortController.signal.aborted) {
                vscode.window.showWarningMessage('ACE login cancelled');
                return null;
            }

            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`ACE login failed: ${message}`);
            return null;
        }
    });
}

/**
 * Logout command - clear auth credentials
 */
export async function handleLogout(): Promise<void> {
    const user = getCurrentUser();
    if (!user) {
        vscode.window.showInformationMessage('Not logged in to ACE');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Logout from ACE as ${user.email}?`,
        { modal: true },
        'Logout'
    );

    if (confirm === 'Logout') {
        logout();
        invalidateClient();
        notifyAuthChanged();
        vscode.window.showInformationMessage('Logged out from ACE');
    }
}

/**
 * Get hard cap info for session expiration warnings
 */
export function getHardCapInfo(): {
    daysRemaining: number;
    hoursRemaining: number;
    isApproaching: boolean;
    isExpired: boolean;
} | null {
    const status = getTokenStatus();
    if (!status.absoluteExpiresAt) {
        return null;
    }

    const msRemaining = status.absoluteExpiresAt.getTime() - Date.now();
    const hoursRemaining = msRemaining / (1000 * 60 * 60);

    return {
        daysRemaining: Math.floor(hoursRemaining / 24),
        hoursRemaining: Math.round(hoursRemaining),
        isApproaching: hoursRemaining < 48, // Warn if < 2 days
        isExpired: hoursRemaining <= 0
    };
}

/**
 * Get valid token with auto-refresh (sliding window TTL)
 * Uses ensureValidToken from SDK which handles refresh automatically
 */
export async function getValidToken(serverUrl: string): Promise<{ token: string; wasRefreshed: boolean } | null> {
    try {
        const result = await ensureValidToken(serverUrl);
        if (result.wasRefreshed) {
            console.log('[ACE] Token refreshed (sliding window extended)');
        }
        return result;
    } catch (error) {
        console.error('[ACE] Token refresh failed:', error instanceof Error ? error.message : String(error));
        return null;
    }
}

/**
 * Check auth on activation and show appropriate prompts
 * - Gentle login prompt if not authenticated
 * - Hard cap warning if approaching (< 48 hours)
 * - Error if session expired
 */
export async function checkAuthOnActivation(): Promise<void> {
    if (!isAuthenticated()) {
        // Gentle prompt (non-blocking)
        vscode.window.showInformationMessage(
            'ACE not configured. Login to enable pattern learning.',
            'Login'
        ).then(selection => {
            if (selection === 'Login') {
                vscode.commands.executeCommand('ace-vscode.login');
            }
        });
        return;
    }

    // Check hard cap only (not access token - it auto-extends!)
    const hardCap = getHardCapInfo();
    if (hardCap?.isExpired) {
        vscode.window.showErrorMessage(
            'ACE session expired (7-day limit). Please login again.',
            'Login'
        ).then(selection => {
            if (selection === 'Login') {
                vscode.commands.executeCommand('ace-vscode.login');
            }
        });
    } else if (hardCap?.isApproaching) {
        vscode.window.showWarningMessage(
            `ACE session expires in ${hardCap.hoursRemaining} hours (7-day limit). Re-login to extend.`,
            'Login Now'
        ).then(selection => {
            if (selection === 'Login Now') {
                vscode.commands.executeCommand('ace-vscode.login');
            }
        });
    }
}

/**
 * Handle auth errors from API responses
 * @returns true if error was handled (caller should abort)
 */
export async function handleAuthError(statusCode: number, responseData?: { code?: string; current?: number; max?: number }): Promise<boolean> {
    if (statusCode === 401) {
        vscode.window.showErrorMessage(
            'ACE session invalid. Please login again.',
            'Login'
        ).then(selection => {
            if (selection === 'Login') {
                vscode.commands.executeCommand('ace-vscode.login');
            }
        });
        return true;
    }

    if (statusCode === 403 && responseData?.code === 'DEVICE_LIMIT_EXCEEDED') {
        vscode.window.showErrorMessage(
            `Device limit reached (${responseData.current}/${responseData.max}). Remove unused devices to continue.`,
            'Manage Devices'
        ).then(selection => {
            if (selection === 'Manage Devices') {
                vscode.env.openExternal(
                    vscode.Uri.parse('https://ace-ai.app/dashboard/devices')
                );
            }
        });
        return true;
    }

    return false;
}
