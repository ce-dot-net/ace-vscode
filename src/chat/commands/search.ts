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
    const promptText = request.prompt.trim();

    // Parse domain filters from prompt
    const allowedDomainsMatch = promptText.match(/--allowed-domains\s+([^\s]+)/);
    const blockedDomainsMatch = promptText.match(/--blocked-domains\s+([^\s]+)/);

    const allowedDomains = allowedDomainsMatch ? allowedDomainsMatch[1].split(',').map(d => d.trim()) : undefined;
    const blockedDomains = blockedDomainsMatch ? blockedDomainsMatch[1].split(',').map(d => d.trim()) : undefined;

    // Remove flags from query
    const query = promptText
        .replace(/--allowed-domains\s+[^\s]+/, '')
        .replace(/--blocked-domains\s+[^\s]+/, '')
        .trim();

    if (!query) {
        formatError(stream, 'Please provide a search query. Example: `@ace /search authentication patterns`');
        formatMarkdown(stream, '\n**Domain filtering:**\n');
        formatMarkdown(stream, '- `@ace /search <query> --allowed-domains <domain1,domain2>`\n');
        formatMarkdown(stream, '- `@ace /search <query> --blocked-domains <domain1,domain2>`\n');
        formatMarkdown(stream, '\nUse `/domains` to list available domains.\n');
        return { metadata: { command: 'search' } };
    }

    formatSectionHeader(stream, 'Pattern Search');
    formatProjectContext(stream, folder);

    const domainInfo = allowedDomains
        ? ` in **${allowedDomains.join(', ')}**`
        : blockedDomains
            ? ` (excluding ${blockedDomains.join(', ')})`
            : '';
    formatMarkdown(stream, `🔍 Searching for: **${query}**${domainInfo}\n\n`);

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

        if (allowedDomains) {
            searchOptions.allowed_domains = allowedDomains;
        }
        if (blockedDomains) {
            searchOptions.blocked_domains = blockedDomains;
        }

        const result = await client.searchPatterns(searchOptions);

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
