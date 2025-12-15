import * as vscode from 'vscode';
import { getAceClient } from '../services/aceClient';
import type { PlaybookBullet } from '@ace-sdk/core';

interface AceSearchInput {
    query: string;
}

/**
 * ACE Search Tool - Searches playbook for relevant patterns
 * Returns verbose formatted output for display in Copilot chat
 */
export class AceSearchTool implements vscode.LanguageModelTool<AceSearchInput> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<AceSearchInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { query } = options.input;
        const client = getAceClient();

        if (!client) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('❌ **[ACE] Not configured.** Run "ACE: Configure" first.')
            ]);
        }

        try {
            const result = await client.searchPatterns({
                query,
                threshold: 0.75,
                top_k: 10,
                include_metadata: true
            });

            const patterns: PlaybookBullet[] = result.similar_patterns || [];
            const count = patterns.length;

            // Format verbose output matching CLI plugin style
            let output = `✅ **[ACE] Found ${count} relevant patterns**\n\n`;

            if (count === 0) {
                output += `_No patterns found matching "${query}"_\n`;
            } else {
                // Show top 5 patterns with domain and preview
                patterns.slice(0, 5).forEach((p: PlaybookBullet) => {
                    const domain = p.domain || 'general';
                    const preview = p.content.length > 80
                        ? p.content.slice(0, 80) + '...'
                        : p.content;
                    output += `• **[${domain}]** ${preview}\n`;
                });

                if (count > 5) {
                    output += `\n_... and ${count - 5} more patterns_\n`;
                }
            }

            // Show efficiency gain from metadata if available
            if (result.metadata?.efficiency_gain) {
                output += `\n💡 ${result.metadata.efficiency_gain} token efficiency\n`;
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(output)
            ]);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`❌ **[ACE] Search failed:** ${message}`)
            ]);
        }
    }
}
