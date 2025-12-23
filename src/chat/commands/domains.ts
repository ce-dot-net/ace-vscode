import * as vscode from 'vscode';
import { formatMarkdown, formatWarning, formatSectionHeader, formatError } from '../utils/formatters';
import { isGloballyConfigured } from '../../services/config';
import { getClientForChat, formatProjectContext } from '../utils/chatContext';

/**
 * Handles the /domains command - list available domains with pattern counts
 */
export async function handleDomains(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    // Check global configuration first
    const globalConfigured = isGloballyConfigured();
    if (!globalConfigured) {
        formatSectionHeader(stream, 'ACE Domains');
        formatMarkdown(stream, `**Global Configuration:** ❌ Not configured\n\n`);
        formatWarning(stream, 'Complete the configuration to list domains.\n');
        formatMarkdown(stream, '*Run **ACE: Configure** from the command palette.*\n');
        return { metadata: { command: 'domains' } };
    }

    // Get client with folder context
    const clientInfo = getClientForChat(request, stream);
    if (!clientInfo) {
        return { metadata: { command: 'domains' } };
    }

    const { client, folder } = clientInfo;

    formatSectionHeader(stream, 'ACE Domains');
    formatProjectContext(stream, folder);
    formatMarkdown(stream, '*Fetching domain distribution...*\n\n');

    try {
        const status = await client.getStatus();

        // Check for by_domain in status
        const byDomain = status.by_domain as Record<string, number> | undefined;

        if (!byDomain || Object.keys(byDomain).length === 0) {
            formatMarkdown(stream, '*No domains found in playbook.*\n\n');
            formatMarkdown(stream, 'Patterns will be assigned to domains as you use ACE.\n');
            formatMarkdown(stream, 'Use `/bootstrap` to initialize from your codebase.\n');
            return { metadata: { command: 'domains' } };
        }

        // Sort domains by count (descending)
        const sortedDomains = Object.entries(byDomain)
            .sort((a, b) => b[1] - a[1]);

        const totalPatterns = sortedDomains.reduce((sum, [, count]) => sum + count, 0);
        const domainCount = sortedDomains.length;

        formatMarkdown(stream, `## 🗂️ ${domainCount} Domains (${totalPatterns} patterns)\n\n`);

        // Show domains grouped by size
        const largeDomains = sortedDomains.filter(([, count]) => count >= 20);
        const mediumDomains = sortedDomains.filter(([, count]) => count >= 5 && count < 20);
        const smallDomains = sortedDomains.filter(([, count]) => count < 5);

        if (largeDomains.length > 0) {
            formatMarkdown(stream, '### Major Domains (20+ patterns)\n');
            for (const [domain, count] of largeDomains) {
                formatMarkdown(stream, `- \`${domain}\` (${count})\n`);
            }
            formatMarkdown(stream, '\n');
        }

        if (mediumDomains.length > 0) {
            formatMarkdown(stream, '### Medium Domains (5-19 patterns)\n');
            for (const [domain, count] of mediumDomains) {
                formatMarkdown(stream, `- \`${domain}\` (${count})\n`);
            }
            formatMarkdown(stream, '\n');
        }

        if (smallDomains.length > 0) {
            formatMarkdown(stream, '### Small Domains (<5 patterns)\n');
            for (const [domain, count] of smallDomains) {
                formatMarkdown(stream, `- \`${domain}\` (${count})\n`);
            }
            formatMarkdown(stream, '\n');
        }

        // Usage hint
        formatMarkdown(stream, '---\n\n');
        formatMarkdown(stream, '**Filter search by domain:**\n');
        formatMarkdown(stream, '```\n');
        formatMarkdown(stream, '@ace /search <query> --allowed-domains <domain>\n');
        formatMarkdown(stream, '```\n');
        formatMarkdown(stream, 'Or use the `ace_search` tool with `allowed_domains` parameter.\n');

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        formatError(stream, `Failed to list domains: ${message}\n`);
    }

    return { metadata: { command: 'domains' } };
}
