/**
 * Pure helper functions for login and auth monitoring.
 * No vscode or SDK dependencies — safe to import in tests.
 */

import { HARD_CAP_WARNING_HOURS } from '../constants';

/**
 * Validates that a verification URI is safe to open in the user's browser.
 * RFC 8628 Section 5.1: "The client SHOULD verify that the URI is well-formed."
 */
export function isValidVerificationUri(uri: string): boolean {
    try {
        const parsed = new URL(uri);
        return parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Checks if an error represents a device limit exceeded response.
 * Handles both Error objects with message strings and Axios-style response objects.
 */
export function isDeviceLimitError(error: unknown): boolean {
    // Error objects: match by message text
    if (error instanceof Error &&
        error.message.toLowerCase().includes('device limit exceeded')) {
        return true;
    }

    // Axios-style: drill through error.response.data.error_code
    if (typeof error !== 'object' || error === null || !('response' in error)) {
        return false;
    }
    const response = (error as { response: unknown }).response;
    if (typeof response !== 'object' || response === null || !('data' in response)) {
        return false;
    }
    const data = (response as { data: unknown }).data;
    if (typeof data !== 'object' || data === null) {
        return false;
    }
    return (data as { error_code?: string }).error_code === 'device_limit_exceeded';
}

/** Result of evaluating token expiration state. */
export interface TokenExpirationResult {
    action: 'none' | 'expired' | 'warn_hard_cap';
    hoursRemaining?: number;
    flags: { hasNotifiedExpiration: boolean; hasNotifiedHardCap: boolean };
}

/**
 * Pure function that evaluates token expiration state and returns
 * what action (if any) to take, plus updated notification flags.
 *
 * Does NOT produce side effects — the caller decides what to do.
 */
export function evaluateTokenExpiration(input: {
    now: number;
    refreshExpiresAt?: string | null;
    absoluteExpiresAt?: string | null;
    hasNotifiedExpiration: boolean;
    hasNotifiedHardCap: boolean;
}): TokenExpirationResult {
    const { now, refreshExpiresAt, absoluteExpiresAt } = input;
    let { hasNotifiedExpiration, hasNotifiedHardCap } = input;

    // Check if refresh token is expired
    if (refreshExpiresAt) {
        const expiresMs = new Date(refreshExpiresAt).getTime();
        if (expiresMs < now) {
            if (!hasNotifiedExpiration) {
                hasNotifiedExpiration = true;
                return { action: 'expired', flags: { hasNotifiedExpiration, hasNotifiedHardCap } };
            }
            return { action: 'none', flags: { hasNotifiedExpiration, hasNotifiedHardCap } };
        }
    }

    // Check if absolute cap is approaching
    if (absoluteExpiresAt) {
        const expiresMs = new Date(absoluteExpiresAt).getTime();
        const hoursRemaining = (expiresMs - now) / (1000 * 60 * 60);

        if (hoursRemaining <= 0) {
            // Hard cap already passed — treat as expired
            if (!hasNotifiedExpiration) {
                hasNotifiedExpiration = true;
                return { action: 'expired', flags: { hasNotifiedExpiration, hasNotifiedHardCap } };
            }
            return { action: 'none', flags: { hasNotifiedExpiration, hasNotifiedHardCap } };
        } else if (hoursRemaining < HARD_CAP_WARNING_HOURS) {
            if (!hasNotifiedHardCap) {
                hasNotifiedHardCap = true;
                return {
                    action: 'warn_hard_cap',
                    hoursRemaining: Math.max(1, Math.ceil(hoursRemaining)),
                    flags: { hasNotifiedExpiration, hasNotifiedHardCap },
                };
            }
            return { action: 'none', flags: { hasNotifiedExpiration, hasNotifiedHardCap } };
        } else {
            hasNotifiedHardCap = false;
        }
    }

    // Everything healthy — reset expiration flag
    hasNotifiedExpiration = false;
    return { action: 'none', flags: { hasNotifiedExpiration, hasNotifiedHardCap } };
}
