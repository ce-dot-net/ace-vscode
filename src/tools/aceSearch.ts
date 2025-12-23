import * as vscode from 'vscode';
import { getAceClient } from '../services/aceClient';
import type { PlaybookBullet } from '@ace-sdk/core';

interface AceSearchInput {
    query: string;
    allowed_domains?: string;
    blocked_domains?: string;
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
        const { query, allowed_domains, blocked_domains } = options.input;
        const client = getAceClient();

        if (!client) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('❌ **[ACE] Not configured.** Run "ACE: Configure" first.')
            ]);
        }

        try {
            // Build search options with optional domain filtering
            const searchOptions: {
                query: string;
                threshold: number;
                top_k: number;
                include_metadata: boolean;
                allowed_domains?: string[];
                blocked_domains?: string[];
            } = {
                query,
                threshold: 0.75,
                top_k: 10,
                include_metadata: true
            };

            // Parse comma-separated domain lists
            if (allowed_domains) {
                searchOptions.allowed_domains = allowed_domains.split(',').map(d => d.trim());
            }
            if (blocked_domains) {
                searchOptions.blocked_domains = blocked_domains.split(',').map(d => d.trim());
            }

            const result = await client.searchPatterns(searchOptions);

            const patterns: PlaybookBullet[] = result.similar_patterns || [];
            const count = patterns.length;

            // Format verbose output matching CLI plugin style
            const domainFilter = allowed_domains
                ? ` in domain(s): ${allowed_domains}`
                : blocked_domains
                    ? ` (excluding: ${blocked_domains})`
                    : '';
            let output = `✅ **[ACE] Found ${count} relevant patterns**${domainFilter}\n\n`;

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
