import * as vscode from 'vscode';
import type { LearningStreamEvent } from '@ace-sdk/core';
import { formatMarkdown, formatSectionHeader, formatSuccess, formatError } from '../utils/formatters';
import { getClientForChat, formatProjectContext } from '../utils/chatContext';
import {
    getSession,
    clearSession,
    getSessionKey
} from '../../services/sessionStorage';

/**
 * Handles the /learn command - capture patterns from the current session
 * Uses streaming endpoint (/traces/stream) for real-time progress
 */
export async function handleLearn(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    // Get client with folder context
    const clientInfo = getClientForChat(request, stream);
    if (!clientInfo) {
        return { metadata: { command: 'learn' } };
    }

    const { client, folder } = clientInfo;

    formatSectionHeader(stream, 'Capture Learning');
    formatProjectContext(stream, folder);

    const description = request.prompt.trim();

    if (!description) {
        formatMarkdown(stream, 'To capture learning from your current work, provide a brief description:\n\n');
        formatMarkdown(stream, '```\n@ace /learn Implemented JWT auth with refresh token rotation\n```\n\n');
        formatMarkdown(stream, 'Or use the **ACE: Capture Learning** command from the command palette for a guided experience.\n');

        return { metadata: { command: 'learn' } };
    }

    formatMarkdown(stream, `📝 Capturing: **${description}**\n\n`);

    try {
        // Retrieve playbook_used from session (populated by /search)
        const sessionKey = getSessionKey(folder);
        const session = getSession(sessionKey);
        const playbookUsed = session?.pattern_ids ?? [];

        // Build a real trajectory from the chat conversation history (VS Code
        // ChatContext.history) instead of an empty/placeholder one — gives the
        // F-080 trace the actual turn-by-turn context that led to this learning.
        const trace = {
            task: description,
            trajectory: [...historyToTrajectory(context.history ?? []), `Task: ${description}`],
            result: { success: true, output: description },
            playbook_used: playbookUsed,
            timestamp: new Date().toISOString(),
            ...(session?.retrieval_id ? { retrieval_id: session.retrieval_id } : {}),           // F-080 #16
            ...(session?.applied_log_ids?.length ? { applied_log_ids: session.applied_log_ids } : {}), // F-080 #17
            ...(session?.session_id ? { session_id: session.session_id } : {})                  // F-080 #16
        };

        // Use streaming endpoint for real-time progress
        const result = await client.storeExecutionTraceStream(trace, {
            onEvent: (event: LearningStreamEvent) => {
                // Show progress to user
                if (event.message) {
                    formatMarkdown(stream, `⏳ ${event.message}\n`);
                }
            },
            fallbackOnError: true, // Falls back to /traces if SSE fails
            verbosity: 'compact'
        });

        formatSuccess(stream, 'Learning captured!\n\n');

        // Show learning statistics if available
        const stats = result.learning_statistics;
        if (stats) {
            const parts: string[] = [];
            if (stats.patterns_created !== undefined && stats.patterns_created > 0) {
                parts.push(`✨ ${stats.patterns_created} created`);
            }
            if (stats.patterns_updated !== undefined && stats.patterns_updated > 0) {
                parts.push(`🔄 ${stats.patterns_updated} updated`);
            }
            if (stats.patterns_pruned !== undefined && stats.patterns_pruned > 0) {
                parts.push(`🧹 ${stats.patterns_pruned} pruned`);
            }
            if (stats.average_confidence !== undefined) {
                const quality = Math.round(stats.average_confidence * 100);
                parts.push(`⭐ ${quality}% quality`);
            }
            if (parts.length > 0) {
                formatMarkdown(stream, `**Statistics:** ${parts.join('  ')}\n\n`);
            }
        }

        // Show reward signal from F-080 (#23)
        if (result.reward_tier || result.cumulative_v15_reward_delta !== undefined) {
            let rewardLine = `🏅 **Reward:** `;
            if (result.reward_tier) {
                rewardLine += `${result.reward_tier} tier`;
            }
            if (result.cumulative_v15_reward_delta !== undefined) {
                const sign = result.cumulative_v15_reward_delta >= 0 ? '+' : '';
                rewardLine += ` (${sign}${result.cumulative_v15_reward_delta.toFixed(2)} delta)`;
            }
            if (result.patterns_rewarded) {
                rewardLine += ` · ${result.patterns_rewarded} patterns rewarded`;
            }
            formatMarkdown(stream, rewardLine + '\n\n');
        }

        // Show pattern attribution info and clear session
        if (playbookUsed.length > 0) {
            formatMarkdown(stream, `📎 Linked to ${playbookUsed.length} patterns from previous search\n`);
            clearSession(sessionKey);
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        formatError(stream, `Learning capture failed: ${message}\n`);
    }

    return {
        metadata: {
            command: 'learn',
            description
        }
    };
}

/**
 * Build an F-080 trajectory from the chat participant's conversation history.
 * Duck-typed (no `instanceof`) so it works under both the Extension Host and
 * plain test stubs: a request turn has a string `prompt`; a response turn has a
 * `response` array whose markdown parts carry `.value.value`.
 */
export function historyToTrajectory(
    history: ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>
): string[] {
    const lines: string[] = [];
    for (const turn of history) {
        const prompt = (turn as vscode.ChatRequestTurn).prompt;
        if (typeof prompt === 'string') {
            const trimmed = prompt.trim();
            if (trimmed) {
                lines.push(`User: ${trimmed}`);
            }
            continue;
        }
        const response = (turn as vscode.ChatResponseTurn).response;
        if (Array.isArray(response)) {
            const text = response
                .map(part => {
                    const value = (part as vscode.ChatResponseMarkdownPart).value;
                    return value && typeof (value as vscode.MarkdownString).value === 'string'
                        ? (value as vscode.MarkdownString).value
                        : '';
                })
                .join('')
                .trim();
            if (text) {
                lines.push(`Assistant: ${text}`);
            }
        }
    }
    return lines;
}
