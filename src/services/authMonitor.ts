import * as vscode from 'vscode';
import { loadUserAuth } from '@ace-sdk/core';
import { COMMANDS, TOKEN_CHECK_INTERVAL_MS } from '../constants';
import { evaluateTokenExpiration } from '../utils/loginHelpers';

let hasNotifiedExpiration = false;
let hasNotifiedHardCap = false;

/**
 * Start periodic token expiration monitoring.
 *
 * Only warns about:
 * 1. 7-day hard cap approaching (absolute_expires_at < HARD_CAP_WARNING_HOURS)
 * 2. Refresh token expired (refresh_expires_at in past)
 *
 * Does NOT warn about access token expiration — sliding window extends it on every use.
 * SDK's ensureValidToken() handles automatic refresh.
 */
export function startAuthMonitor(context: vscode.ExtensionContext): void {
    // Defer initial check off the activation critical path
    const initialTimeout = setTimeout(checkTokenExpiration, 0);
    const interval = setInterval(checkTokenExpiration, TOKEN_CHECK_INTERVAL_MS);
    context.subscriptions.push({
        dispose: () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        },
    });
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
            hasNotifiedExpiration = false;
            hasNotifiedHardCap = false;
            return;
        }

        const result = evaluateTokenExpiration({
            now: Date.now(),
            refreshExpiresAt: auth.refresh_expires_at,
            absoluteExpiresAt: auth.absolute_expires_at,
            hasNotifiedExpiration,
            hasNotifiedHardCap,
        });

        // Update flags from pure function result
        hasNotifiedExpiration = result.flags.hasNotifiedExpiration;
        hasNotifiedHardCap = result.flags.hasNotifiedHardCap;

        // Execute side effects based on action
        if (result.action === 'expired') {
            vscode.window.showErrorMessage(
                'ACE session expired. Please login again.',
                'Login'
            ).then(action => {
                if (action === 'Login') {
                    vscode.commands.executeCommand(COMMANDS.LOGIN);
                }
            });
        } else if (result.action === 'warn_hard_cap') {
            vscode.window.showWarningMessage(
                `ACE 7-day session limit approaching (${result.hoursRemaining}h). Must re-login soon.`,
                'Login Now'
            ).then(action => {
                if (action === 'Login Now') {
                    vscode.commands.executeCommand(COMMANDS.LOGIN);
                }
            });
        }
    } catch (error) {
        console.error('ACE: Failed to check token expiration:', error);
    }
}
