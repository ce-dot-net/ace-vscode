import * as vscode from 'vscode';
import { formatMarkdown, formatError, formatSectionHeader } from '../utils/formatters';
import { getClientForChat, formatProjectContext } from '../utils/chatContext';
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
        // Use getTopPatterns method which is designed for this purpose
        const topPatterns = await client.getTopPatterns({
            limit: count,
            min_helpful: 1
        });

        if (topPatterns.length === 0) {
            formatMarkdown(stream, '*No patterns found. Use `/bootstrap` or `/learn` to add patterns.*\n');
        } else {
            formatMarkdown(stream, `Found **${topPatterns.length}** top-rated patterns:\n\n`);

            for (let i = 0; i < topPatterns.length; i++) {
                const p: PlaybookBullet = topPatterns[i];
                const score = `👍 ${p.helpful}`;
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
