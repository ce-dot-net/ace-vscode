import * as vscode from 'vscode';
import { getAceClient } from '../services/aceClient';
import type { PlaybookBullet, BulletSection } from '@ace-sdk/core';

interface AcePlaybookInput {
    section?: string;
    min_helpful?: number;
}

/**
 * ACE Get Playbook Tool - Retrieves patterns from playbook
 * Returns formatted patterns organized by section
 */
export class AcePlaybookTool implements vscode.LanguageModelTool<AcePlaybookInput> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<AcePlaybookInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { section, min_helpful = 0 } = options.input;
        const client = getAceClient();

        if (!client) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('❌ **[ACE] Not configured.** Run "ACE: Configure" first.')
            ]);
        }

        try {
            const result = await client.getPlaybook({
                include_metadata: true
            });

            const playbook = result.playbook;
            const totalCount = result.total_bullets;

            // Collect patterns from all sections or specific section
            let patterns: PlaybookBullet[] = [];

            const validSections: BulletSection[] = [
                'strategies_and_hard_rules',
                'useful_code_snippets',
                'troubleshooting_and_pitfalls',
                'apis_to_use'
            ];

            if (section && validSections.includes(section as BulletSection)) {
                const sectionKey = section as BulletSection;
                patterns = playbook[sectionKey] || [];
            } else {
                // Get all patterns from all sections
                for (const sec of validSections) {
                    patterns.push(...(playbook[sec] || []));
                }
            }

            // Filter by min_helpful
            if (min_helpful > 0) {
                patterns = patterns.filter(p => p.helpful >= min_helpful);
            }

            // Format verbose output
            let output = `✅ **[ACE] Playbook Patterns**\n\n`;

            if (patterns.length === 0) {
                output += `_No patterns found${section ? ` in section "${section}"` : ''}_\n`;
            } else {
                output += `📚 **${patterns.length} patterns**${section ? ` in ${section}` : ` (total: ${totalCount})`}\n\n`;

                // Group by section for display
                const bySection: Record<string, PlaybookBullet[]> = {};
                for (const p of patterns) {
                    const sec = p.section || 'uncategorized';
                    if (!bySection[sec]) {
                        bySection[sec] = [];
                    }
                    bySection[sec].push(p);
                }

                const sectionLabels: Record<string, string> = {
                    strategies_and_hard_rules: '📋 Strategies & Rules',
                    useful_code_snippets: '💻 Code Snippets',
                    troubleshooting_and_pitfalls: '⚠️ Troubleshooting',
                    apis_to_use: '🔧 APIs to Use',
                    uncategorized: '📁 Other'
                };

                for (const [sec, secPatterns] of Object.entries(bySection)) {
                    if (secPatterns.length === 0) continue;

                    const label = sectionLabels[sec] || sec;
                    output += `**${label}** (${secPatterns.length})\n`;

                    // Show top 3 from each section
                    secPatterns.slice(0, 3).forEach((p: PlaybookBullet) => {
                        const preview = p.content.length > 60
                            ? p.content.slice(0, 60) + '...'
                            : p.content;
                        const score = ` (+${p.helpful})`;
                        output += `   • ${preview}${score}\n`;
                    });

                    if (secPatterns.length > 3) {
                        output += `   _... and ${secPatterns.length - 3} more_\n`;
                    }
                    output += '\n';
                }
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(output)
            ]);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`❌ **[ACE] Playbook failed:** ${message}`)
            ]);
        }
    }
}
