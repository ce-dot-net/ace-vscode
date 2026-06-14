import * as vscode from 'vscode';
import { getAceClient } from '../services/aceClient';
import {
    getSession,
    clearSession,
    getSessionKey
} from '../services/sessionStorage';
import type { LearningStreamEvent } from '@ace-sdk/core';

interface AceLearnInput {
    task: string;
    success?: boolean;
    output?: string;
}

type ClientProvider = () => ReturnType<typeof getAceClient>;

function skipResult(reason: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(`⏭️ **[ACE] Learn skipped:** ${reason}`)
    ]);
}

/**
 * ACE Learn Tool - Captures patterns from completed work
 * Uses streaming endpoint (/traces/stream) for real-time progress
 * Returns verbose formatted output with learning statistics
 */
export class AceLearnTool implements vscode.LanguageModelTool<AceLearnInput> {
    constructor(private readonly clientProvider: ClientProvider = getAceClient) {}

    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<AceLearnInput>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        if (token.isCancellationRequested) {
            return skipResult('cancelled before invocation');
        }

        const { task, success = true, output: taskOutput } = options.input;
        const client = this.clientProvider();

        if (!client) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('❌ **[ACE] Not configured.** Run "ACE: Configure" first.')
            ]);
        }

        let cancelled = false;
        const cancelSub = token.onCancellationRequested(() => { cancelled = true; });

        try {
            // Retrieve playbook_used from session (populated by ace_search)
            const sessionKey = getSessionKey(); // 'default' for tool handler
            const session = getSession(sessionKey);
            const playbookUsed = session?.pattern_ids ?? [];

            const trace = {
                task,
                // LM tools get no ChatContext.history, so the trajectory is built from
                // the search steps accumulated in the session (see sessionStorage).
                trajectory: session?.trajectory?.length
                    ? [...session.trajectory, `Task: ${task}`]
                    : [`Task: ${task}`],
                result: { success, output: taskOutput || '' },
                playbook_used: playbookUsed,
                timestamp: new Date().toISOString(),
                ...(session?.retrieval_id ? { retrieval_id: session.retrieval_id } : {}),          // F-080 #16
                ...(session?.applied_log_ids?.length ? { applied_log_ids: session.applied_log_ids } : {}), // F-080 #17
                ...(session?.session_id ? { session_id: session.session_id } : {})                 // F-080 #16
            };

            // Use streaming endpoint for real-time progress
            const result = await client.storeExecutionTraceStream(trace, {
                onEvent: (event: LearningStreamEvent) => {
                    if (cancelled) return;
                    console.log(`[ACE Learn] ${event.stage}: ${event.message || ''}`);
                },
                fallbackOnError: true,
                verbosity: 'compact'
            });

            // Format verbose output matching CLI plugin style
            let output = `✅ **[ACE] Learning captured!**\n\n`;

            // Show learning statistics block
            output += `📚 **ACE Learning:**\n`;

            const stats = result.learning_statistics;
            if (stats) {
                const statParts: string[] = [];

                if (stats.patterns_created !== undefined && stats.patterns_created > 0) {
                    statParts.push(`✨ ${stats.patterns_created} created`);
                }
                if (stats.patterns_updated !== undefined && stats.patterns_updated > 0) {
                    statParts.push(`🔄 ${stats.patterns_updated} updated`);
                }
                if (stats.patterns_pruned !== undefined && stats.patterns_pruned > 0) {
                    statParts.push(`🧹 ${stats.patterns_pruned} pruned`);
                }
                if (stats.average_confidence !== undefined) {
                    const quality = Math.round(stats.average_confidence * 100);
                    statParts.push(`⭐ ${quality}% quality`);
                }

                if (statParts.length > 0) {
                    output += `   ${statParts.join('  ')}\n`;
                }

                // Show section breakdown
                if (stats.by_section) {
                    const sections = Object.entries(stats.by_section)
                        .filter(([, count]) => count > 0)
                        .map(([section]) => section.replace(/_/g, ' '));
                    if (sections.length > 0) {
                        output += `   📂 ${sections.join(', ')}\n`;
                    }
                }

                if (stats.analysis_time_seconds !== undefined) {
                    output += `   ⏱️ ${stats.analysis_time_seconds.toFixed(1)}s analysis\n`;
                }
            } else {
                output += `   Analysis pending\n`;
            }

            // Show reward signal from F-080 (#23)
            if (result.reward_tier || result.cumulative_v15_reward_delta !== undefined) {
                output += `\n🏅 **Reward:** `;
                if (result.reward_tier) {
                    output += `${result.reward_tier} tier`;
                }
                if (result.cumulative_v15_reward_delta !== undefined) {
                    const sign = result.cumulative_v15_reward_delta >= 0 ? '+' : '';
                    output += ` (${sign}${result.cumulative_v15_reward_delta.toFixed(2)} delta)`;
                }
                if (result.patterns_rewarded) {
                    output += ` · ${result.patterns_rewarded} patterns rewarded`;
                }
                output += `\n`;
            }

            // Show pattern attribution info
            if (playbookUsed.length > 0) {
                output += `\n📎 Linked to ${playbookUsed.length} patterns from previous search\n`;
            }
            // Consume-on-read: clear the session so a search is attributed at most once,
            // bounding cross-session mis-attribution under concurrent agent sessions.
            if (session) {
                clearSession(sessionKey);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(output)
            ]);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`❌ **[ACE] Learn failed:** ${message}`)
            ]);
        } finally {
            cancelSub.dispose();
        }
    }
}
