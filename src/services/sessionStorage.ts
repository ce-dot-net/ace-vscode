/**
 * Session storage for pattern attribution (per-task, not per-chat)
 * Links ace_search results to ace_learn submissions
 *
 * Key insight: Session = "current task" scope
 * - ace_search generates new session with pattern IDs (and accumulates a trajectory)
 * - ace_learn consumes session, populates playbook_used + trajectory, clears session
 * - Uses same cache key pattern as aceClient.ts (folder?.uri?.toString() ?? 'default')
 *
 * Server correlation invariants (required for the server-side eval/learning credit loop — this
 * exact bug previously bit the Claude Code ACE client; documented here so we don't repeat it):
 *   1. Per-task session_id (our `sess_*`), NOT the IDE/conversation id. We mint our own id at
 *      search time, so we never share one id across a whole conversation.
 *   2. Search-pin == learn-trace, byte-identical. The id passed to searchPatterns() is stored
 *      and re-attached verbatim by ace_learn; ace_learn NEVER generates a session_id.
 *   3. Persist the id EARLY + UNCONDITIONALLY. The session is saved after every successful
 *      search regardless of pattern count, so a 0-pattern / early-exit search still lets a later
 *      ace_learn anchor the (already server-stamped) retrieval. (Previously gated on patterns>0
 *      — that dropped the id on 0-pattern paths and orphaned the retrieval.)
 *   Non-solution (server ruling): tasks that abort before ace_learn fires are outcome-less and
 *   must NOT be retroactively credited / swept. We don't — the lingering session simply expires
 *   or is overwritten by the next search; abstain is correct.
 *
 * ⚠️ Concurrency limitation (VS Code ≤ 1.124): Language Model Tools receive NO
 * chat-session / request identifier — `LanguageModelToolInvocationOptions` exposes
 * only an opaque, per-invocation `toolInvocationToken` (and `ChatRequest` has no
 * `id`). The in-process tool path therefore cannot key a session per agent session
 * and falls back to the process-global 'default' key. With VS Code 1.124 background
 * /parallel agent sessions, two concurrent search→learn cycles in the SAME window
 * can cross-attribute. Mitigations applied: (1) consume-on-read — ace_learn clears
 * the session after reading it, so a search is attributed at most once; (2) the
 * TTL bounds staleness. Full per-session isolation is not achievable until VS Code
 * surfaces a session id to tools. (Separate VS Code windows are separate extension
 * hosts / processes and do NOT share this map.)
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
    retrieval_id?: string;      // F-080 #16: UUID from SearchResponseWithMetadata.retrieval_id
    applied_log_ids?: number[]; // F-080 #17: retrieval_log_id integers from match_factors
    trajectory?: string[];      // accumulated search-derived steps for the tool-path F-080 trajectory
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
