import * as vscode from 'vscode';
import { formatMarkdown, formatError, formatSectionHeader } from '../utils/formatters';
import { getClientForChat, formatProjectContext } from '../utils/chatContext';
import type { PlaybookBullet } from '@ace-sdk/core';

/**
 * Handles the /search command - semantic search for patterns in the playbook
 */
export async function handleSearch(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    // Get client with folder context
    const clientInfo = getClientForChat(request, stream);
    if (!clientInfo) {
        return { metadata: { command: 'search' } };
    }

    const { client, folder } = clientInfo;
    const query = request.prompt.trim();

    if (!query) {
        formatError(stream, 'Please provide a search query. Example: `@ace /search authentication patterns`');
        return { metadata: { command: 'search' } };
    }

    formatSectionHeader(stream, 'Pattern Search');
    formatProjectContext(stream, folder);
    formatMarkdown(stream, `🔍 Searching for: **${query}**\n\n`);

    try {
        const result = await client.searchPatterns({
            query,
            threshold: 0.75,
            top_k: 10,
            include_metadata: true
        });

        const patterns: PlaybookBullet[] = result.similar_patterns || [];

        if (patterns.length === 0) {
            formatMarkdown(stream, '*No matching patterns found.*\n\n');
            formatMarkdown(stream, 'Try a different query or check your playbook with `/patterns`.\n');
        } else {
            // Show concise summary (top 3 patterns max)
            const topPatterns = patterns.slice(0, 3);
            formatMarkdown(stream, `📚 Found **${patterns.length}** patterns for "${query}":\n\n`);

            for (const pattern of topPatterns) {
                const confidence = ` (${Math.round(pattern.confidence * 100)}% match)`;
                // Extract first line/sentence as summary
                const summary = pattern.content.split('\n')[0].substring(0, 80);
                const domain = pattern.domain ? `**[${pattern.domain}]** ` : '';
                formatMarkdown(stream, `• ${domain}${summary}${confidence}\n`);
            }

            if (patterns.length > 3) {
                formatMarkdown(stream, `\n*...and ${patterns.length - 3} more. Use \`/patterns\` for full details.*\n`);
            }

            formatMarkdown(stream, '\n💡 **Use these patterns in your task.** For full details: `@ace /patterns`\n');
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        formatError(stream, `Search failed: ${message}\n`);
    }

    return {
        metadata: {
            command: 'search',
            query
        }
    };
}
