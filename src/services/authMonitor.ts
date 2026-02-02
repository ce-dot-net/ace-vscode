import * as vscode from 'vscode';
import { loadUserAuth } from '@ace-sdk/core';
import { COMMANDS, TOKEN_CHECK_INTERVAL_MS, HARD_CAP_WARNING_HOURS } from '../constants';

let hasNotifiedExpiration = false;
let hasNotifiedHardCap = false;

/**
 * Start periodic token expiration monitoring.
 *
 * Only warns about:
 * 1. 7-day hard cap approaching (absolute_expires_at < 24h)
 * 2. Refresh token expired (refresh_expires_at in past)
 *
 * Does NOT warn about access token expiration — sliding window extends it on every use.
 * SDK's ensureValidToken() handles automatic refresh.
 */
export function startAuthMonitor(context: vscode.ExtensionContext): void {
    checkTokenExpiration();
    const interval = setInterval(checkTokenExpiration, TOKEN_CHECK_INTERVAL_MS);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

/**
 * Reset notification state (e.g., after a successful login).
 */
export function resetAuthNotifications(): void {
    hasNotifiedExpiration = false;
    hasNotifiedHardCap = false;
}

function checkTokenExpiration(): void {
    try {
        const auth = loadUserAuth();
        if (!auth) {
            // No auth = user hasn't logged in yet; reset flags
            hasNotifiedExpiration = false;
            hasNotifiedHardCap = false;
            return;
        }

        const now = Date.now();

        // Check if refresh token is expired (can't auto-recover from this)
        if (auth.refresh_expires_at) {
            const refreshExpiresAt = new Date(auth.refresh_expires_at).getTime();
            if (refreshExpiresAt < now) {
                if (!hasNotifiedExpiration) {
                    hasNotifiedExpiration = true;
                    vscode.window.showErrorMessage(
                        'ACE session expired. Please login again.',
                        'Login'
                    ).then(action => {
                        if (action === 'Login') {
                            vscode.commands.executeCommand(COMMANDS.LOGIN);
                        }
                    });
                }
                return;
            }
        }

        // Check if absolute cap (7-day hard limit) is approaching
        if (auth.absolute_expires_at) {
            const absoluteExpiresAt = new Date(auth.absolute_expires_at).getTime();
            const hoursRemaining = (absoluteExpiresAt - now) / (1000 * 60 * 60);

            if (hoursRemaining < HARD_CAP_WARNING_HOURS && hoursRemaining > 0) {
                if (!hasNotifiedHardCap) {
                    hasNotifiedHardCap = true;
                    vscode.window.showWarningMessage(
                        `ACE 7-day session limit approaching (${Math.round(hoursRemaining)}h). Must re-login soon.`,
                        'Login Now'
                    ).then(action => {
                        if (action === 'Login Now') {
                            vscode.commands.executeCommand(COMMANDS.LOGIN);
                        }
                    });
                }
            } else {
                // Reset if no longer within warning window (e.g., after re-login)
                hasNotifiedHardCap = false;
            }
        }

        // Refresh token is valid and hard cap is not near — reset expiration flag
        hasNotifiedExpiration = false;
    } catch (error) {
        console.error('ACE: Failed to check token expiration:', error);
    }
}
