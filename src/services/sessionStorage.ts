/**
 * Session storage for pattern attribution (per-task, not per-chat)
 * Links ace_search results to ace_learn submissions
 *
 * Key insight: Session = "current task" scope
 * - ace_search generates new session with pattern IDs
 * - ace_learn consumes session, populates playbook_used, clears session
 * - Uses same cache key pattern as aceClient.ts (folder?.uri?.toString() ?? 'default')
 */
import * as vscode from 'vscode';

/**
 * Session data structure for pattern attribution
 */
export interface SessionData {
    session_id: string;
    pattern_ids: string[];
    query: string;
    timestamp: number;
    expires_at: number;
}

// In-memory store (keyed by folder URI or 'default')
const sessions = new Map<string, SessionData>();

// Session TTL: 4 hours (typical coding session)
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Generate unique session ID for pattern attribution
 * Format: sess_{timestamp}_{random}
 */
export function generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get cache key from folder (matches aceClient.ts pattern)
 * @param folder - Optional workspace folder. If not provided, returns 'default'
 */
export function getSessionKey(folder?: vscode.WorkspaceFolder): string {
    return folder?.uri?.toString() ?? 'default';
}

/**
 * Save session data after search
 * @param key - Session key (folder URI or 'default')
 * @param data - Session data with pattern IDs
 */
export function saveSession(key: string, data: SessionData): void {
    sessions.set(key, data);
}

/**
 * Retrieve session data for learn (auto-expires)
 * Returns undefined if session doesn't exist or is expired
 * Also cleans up expired sessions
 * @param key - Session key (folder URI or 'default')
 */
export function getSession(key: string): SessionData | undefined {
    const session = sessions.get(key);
    if (session && Date.now() < session.expires_at) {
        return session;
    }
    // Expired or not found - cleanup
    sessions.delete(key);
    return undefined;
}

/**
 * Clear session after learning (explicit cleanup)
 * @param key - Session key (folder URI or 'default')
 */
export function clearSession(key: string): void {
    sessions.delete(key);
}

/**
 * Check if session exists and is valid (not expired)
 * @param key - Session key (folder URI or 'default')
 */
export function hasValidSession(key: string): boolean {
    return getSession(key) !== undefined;
}

// Export TTL for testing and consistency
export const SESSION_TTL = SESSION_TTL_MS;
