import * as vscode from 'vscode';
import { PARTICIPANT_ID, CHAT_COMMANDS } from '../constants';
import { handleSearch, handlePatterns, handleStatus, handleLearn, handleTop, handleBootstrap, handleClear } from './commands';
import { formatMarkdown, formatSectionHeader } from './utils/formatters';

/**
 * Registers the @ace chat participant
 */
export function registerChatParticipant(context: vscode.ExtensionContext): vscode.Disposable {
    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> => {
        // Route to appropriate command handler
        switch (request.command) {
            case CHAT_COMMANDS.SEARCH:
                return handleSearch(request, context, stream, token);

            case CHAT_COMMANDS.PATTERNS:
                return handlePatterns(request, context, stream, token);

            case CHAT_COMMANDS.STATUS:
                return handleStatus(request, context, stream, token);

            case CHAT_COMMANDS.LEARN:
                return handleLearn(request, context, stream, token);

            case CHAT_COMMANDS.TOP:
                return handleTop(request, context, stream, token);

            case CHAT_COMMANDS.BOOTSTRAP:
                return handleBootstrap(request, context, stream, token);

            case CHAT_COMMANDS.CLEAR:
                return handleClear(request, context, stream, token);

            default:
                return handleDefaultRequest(request, context, stream, token);
        }
    };

    const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);

    participant.iconPath = vscode.Uri.joinPath(
        context.extensionUri,
        'resources',
        'ace-icon.png'
    );

    context.subscriptions.push(participant);
    return participant;
}

/**
 * Handles requests without a specific command - provides intelligent routing
 * If the user asks a question, automatically search for patterns
 */
async function handleDefaultRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    const prompt = request.prompt.trim();

    // If there's actual content, treat it as a search query (intelligent behavior)
    if (prompt.length > 0) {
        // Auto-search for the user's question
        formatMarkdown(stream, `🔍 Searching ACE patterns for: *"${prompt}"*\n\n`);

        // Delegate to search handler with the prompt as the query
        const searchResult = await handleSearch(request, context, stream, token);

        // Add continuation prompt to help user continue the task
        formatMarkdown(stream, `\n---\n\n**How can I help with: "${prompt}"?**\n\n`);
        formatMarkdown(stream, '*Ask a follow-up question or switch to an ACE-enhanced agent for implementation.*\n');

        return searchResult;
    }

    // Only show menu if no prompt provided (user just typed @ace with nothing else)
    formatSectionHeader(stream, 'ACE Pattern Learning');
    formatMarkdown(stream, 'Ask me anything or use a command:\n\n');
    formatMarkdown(stream, '**Commands:**\n');
    formatMarkdown(stream, '- `/search <query>` - Semantic search for patterns\n');
    formatMarkdown(stream, '- `/patterns [section]` - View playbook by section\n');
    formatMarkdown(stream, '- `/status` - Show statistics\n');
    formatMarkdown(stream, '- `/learn <description>` - Capture patterns from work\n');
    formatMarkdown(stream, '- `/top [count]` - Show highest-rated patterns\n');
    formatMarkdown(stream, '- `/bootstrap [mode]` - Initialize from codebase\n');
    formatMarkdown(stream, '- `/clear --confirm` - Clear all patterns\n\n');

    formatMarkdown(stream, '**Or just ask a question** - I\'ll search for relevant patterns automatically!\n');

    return { metadata: { command: 'default' } };
}
