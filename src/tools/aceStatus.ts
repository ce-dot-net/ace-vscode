import * as vscode from 'vscode';
import { getAceClient } from '../services/aceClient';

/**
 * ACE Status Tool - Shows playbook statistics
 * Returns verbose formatted output with section breakdown
 */
export class AceStatusTool implements vscode.LanguageModelTool<Record<string, never>> {
    async invoke(
        _options: vscode.LanguageModelToolInvocationOptions<Record<string, never>>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const client = getAceClient();

        if (!client) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('❌ **[ACE] Not configured.** Run "ACE: Configure" first.')
            ]);
        }

        try {
            const data = await client.getStatus();

            // Format verbose output
            let output = `✅ **[ACE] Playbook Status**\n\n`;

            // Total patterns
            const total = data.total_patterns ?? data.total_bullets ?? 0;
            output += `📊 **Total:** ${total} patterns\n\n`;

            // Quality metric from avg_confidence
            if (data.avg_confidence !== undefined) {
                const quality = Math.round(data.avg_confidence * 100);
                output += `⭐ **Quality:** ${quality}% confidence\n\n`;
            }

            // Section breakdown
            if (data.by_section && Object.keys(data.by_section).length > 0) {
                output += `**📂 By Section:**\n`;
                const sectionLabels: Record<string, string> = {
                    strategies_and_hard_rules: 'Strategies & Rules',
                    useful_code_snippets: 'Code Snippets',
                    troubleshooting_and_pitfalls: 'Troubleshooting',
                    apis_to_use: 'APIs to Use'
                };

                for (const [key, count] of Object.entries(data.by_section)) {
                    const label = sectionLabels[key] || key;
                    output += `   • ${label}: ${count}\n`;
                }
                output += '\n';
            }

            // Top helpful patterns summary
            if (data.top_helpful && data.top_helpful.length > 0) {
                output += `**🏆 Top Helpful Patterns:**\n`;
                data.top_helpful.slice(0, 3).forEach((p, i) => {
                    const preview = p.content.length > 50 ? p.content.slice(0, 50) + '...' : p.content;
                    output += `   ${i + 1}. ${preview} (👍 ${p.helpful})\n`;
                });
                output += '\n';
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(output)
            ]);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`❌ **[ACE] Status failed:** ${message}`)
            ]);
        }
    }
}
