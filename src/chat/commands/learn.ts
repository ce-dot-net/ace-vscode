import * as vscode from 'vscode';
import { formatMarkdown, formatSectionHeader, formatSuccess, formatError } from '../utils/formatters';
import { getClientForChat, formatProjectContext } from '../utils/chatContext';

/**
 * Handles the /learn command - capture patterns from the current session
 */
export async function handleLearn(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    // Get client with folder context
    const clientInfo = getClientForChat(request, stream);
    if (!clientInfo) {
        return { metadata: { command: 'learn' } };
    }

    const { client, folder } = clientInfo;

    formatSectionHeader(stream, 'Capture Learning');
    formatProjectContext(stream, folder);

    const description = request.prompt.trim();

    if (!description) {
        formatMarkdown(stream, 'To capture learning from your current work, provide a brief description:\n\n');
        formatMarkdown(stream, '```\n@ace /learn Implemented JWT auth with refresh token rotation\n```\n\n');
        formatMarkdown(stream, 'Or use the **ACE: Capture Learning** command from the command palette for a guided experience.\n');

        return { metadata: { command: 'learn' } };
    }

    formatMarkdown(stream, `📝 Capturing: **${description}**\n\n`);

    try {
        const trace = {
            task: description,
            trajectory: [`Task: ${description}`],
            result: { success: true, output: description },
            playbook_used: [] as string[],
            timestamp: new Date().toISOString()
        };

        const result = await client.storeExecutionTrace(trace);

        formatSuccess(stream, 'Learning captured!\n\n');

        // Show learning statistics if available
        const stats = result.learning_statistics;
        if (stats) {
            const parts: string[] = [];
            if (stats.patterns_created !== undefined && stats.patterns_created > 0) {
                parts.push(`✨ ${stats.patterns_created} created`);
            }
            if (stats.patterns_updated !== undefined && stats.patterns_updated > 0) {
                parts.push(`🔄 ${stats.patterns_updated} updated`);
            }
            if (stats.patterns_pruned !== undefined && stats.patterns_pruned > 0) {
                parts.push(`🧹 ${stats.patterns_pruned} pruned`);
            }
            if (stats.average_confidence !== undefined) {
                const quality = Math.round(stats.average_confidence * 100);
                parts.push(`⭐ ${quality}% quality`);
            }
            if (parts.length > 0) {
                formatMarkdown(stream, `**Statistics:** ${parts.join('  ')}\n\n`);
            }
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        formatError(stream, `Learning capture failed: ${message}\n`);
    }

    return {
        metadata: {
            command: 'learn',
            description
        }
    };
}
