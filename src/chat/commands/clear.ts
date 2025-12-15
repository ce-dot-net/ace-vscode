import * as vscode from 'vscode';
import { formatMarkdown, formatError, formatSectionHeader } from '../utils/formatters';
import { getClientForChat, formatProjectContext } from '../utils/chatContext';

/**
 * Handles the /clear command - clear playbook (requires confirmation)
 */
export async function handleClear(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    // Get client with folder context
    const clientInfo = getClientForChat(request, stream);
    if (!clientInfo) {
        return { metadata: { command: 'clear' } };
    }

    const { client, folder } = clientInfo;

    // Check for --confirm flag
    const confirmed = request.prompt.toLowerCase().includes('--confirm');

    if (!confirmed) {
        formatSectionHeader(stream, 'Clear Playbook');
        formatProjectContext(stream, folder);
        formatMarkdown(stream, `⚠️ **Warning**: This will permanently delete all patterns in your playbook.\n\n`);
        formatMarkdown(stream, `To confirm, use: \`@ace /clear --confirm\`\n\n`);
        formatMarkdown(stream, `*Tip: Use \`/patterns\` to review your playbook first.*\n`);
        return { metadata: { command: 'clear', confirmed: false } };
    }

    formatSectionHeader(stream, 'Clearing Playbook');
    formatProjectContext(stream, folder);
    formatMarkdown(stream, `🗑️ Removing all patterns...\n\n`);

    try {
        // clearPlaybook returns void
        await client.clearPlaybook();

        formatMarkdown(stream, `## ✅ Playbook Cleared\n\n`);
        formatMarkdown(stream, `Use \`/bootstrap\` to re-initialize from your codebase.\n`);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        formatError(stream, `Clear failed: ${message}\n`);
    }

    return { metadata: { command: 'clear', confirmed: true } };
}
