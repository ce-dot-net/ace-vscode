/**
 * Pure helper functions for login command.
 * No vscode or SDK dependencies — safe to import in tests.
 */

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
    if (error instanceof Error) {
        if (error.message.toLowerCase().includes('device limit exceeded')) {
            return true;
        }
    }
    if (typeof error === 'object' && error !== null) {
        if ('response' in error && typeof (error as { response: unknown }).response === 'object') {
            const response = (error as { response: { data?: unknown } }).response;
            if (response && 'data' in response && typeof response.data === 'object' && response.data !== null) {
                const data = response.data as { error_code?: string };
                return data.error_code === 'device_limit_exceeded';
            }
        }
    }
    return false;
}
