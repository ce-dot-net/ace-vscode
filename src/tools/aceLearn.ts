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

/**
 * ACE Learn Tool - Captures patterns from completed work
 * Uses streaming endpoint (/traces/stream) for real-time progress
 * Returns verbose formatted output with learning statistics
 */
export class AceLearnTool implements vscode.LanguageModelTool<AceLearnInput> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<AceLearnInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { task, success = true, output: taskOutput } = options.input;
        const client = getAceClient();

        if (!client) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('❌ **[ACE] Not configured.** Run "ACE: Configure" first.')
            ]);
        }

        try {
            // Retrieve playbook_used from session (populated by ace_search)
            const sessionKey = getSessionKey(); // 'default' for tool handler
            const session = getSession(sessionKey);
            const playbookUsed = session?.pattern_ids ?? [];

            const trace = {
                task,
                trajectory: [] as string[],
                result: { success, output: taskOutput || '' },
                playbook_used: playbookUsed,
                timestamp: new Date().toISOString()
            };

            // Use streaming endpoint for real-time progress
            const result = await client.storeExecutionTraceStream(trace, {
                onEvent: (event: LearningStreamEvent) => {
                    console.log(`[ACE Learn] ${event.stage}: ${event.message || ''}`);
                },
                fallbackOnError: true, // Falls back to /traces if SSE fails
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

            // Show pattern attribution info and clear session
            if (playbookUsed.length > 0) {
                output += `\n📎 Linked to ${playbookUsed.length} patterns from previous search\n`;
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
        }
    }
}
