import * as vscode from 'vscode';
import { formatMarkdown, formatError, formatSectionHeader } from '../utils/formatters';
import { getClientForChat, formatProjectContext } from '../utils/chatContext';
import { computeHelpful } from '@ace-sdk/core';
import type { PlaybookBullet } from '@ace-sdk/core';

/**
 * Handles the /top command - get highest-rated patterns
 */
export async function handleTop(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    // Get client with folder context
    const clientInfo = getClientForChat(request, stream);
    if (!clientInfo) {
        return { metadata: { command: 'top' } };
    }

    const { client, folder } = clientInfo;

    // Parse optional count from prompt (default: 10)
    const countStr = request.prompt.trim();
    const count = countStr ? parseInt(countStr, 10) : 10;

    formatSectionHeader(stream, 'Top Patterns');
    formatProjectContext(stream, folder);
    formatMarkdown(stream, `🏆 Fetching top **${count}** patterns...\n\n`);

    try {
        // Issue #21: fetch more than needed, sort by reward, then slice to count
        const fetchLimit = Math.max(count * 2, 20);
        const raw = await client.getTopPatterns({ limit: fetchLimit });
        const topPatterns = raw
            .sort((a, b) => {
                const ra = a.cumulative_v15_reward ?? computeHelpful(a);
                const rb = b.cumulative_v15_reward ?? computeHelpful(b);
                return rb - ra;
            })
            .slice(0, count);

        if (topPatterns.length === 0) {
            formatMarkdown(stream, '*No patterns found. Use `/bootstrap` or `/learn` to add patterns.*\n');
        } else {
            formatMarkdown(stream, `Found **${topPatterns.length}** top-rated patterns:\n\n`);

            for (let i = 0; i < topPatterns.length; i++) {
                const p: PlaybookBullet = topPatterns[i];
                const score = p.cumulative_v15_reward !== undefined
                    ? `reward: ${p.cumulative_v15_reward.toFixed(2)}`
                    : `👍 ${computeHelpful(p).toFixed(1)}`;
                const section = p.section ? `*(${p.section.replace(/_/g, ' ')})*` : '';
                const domain = p.domain ? `**[${p.domain}]** ` : '';
                formatMarkdown(stream, `---\n**#${i + 1}** ${score} ${section}\n\n${domain}${p.content}\n\n`);
            }
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        formatError(stream, `Failed: ${message}\n`);
    }

    return { metadata: { command: 'top', count } };
}
