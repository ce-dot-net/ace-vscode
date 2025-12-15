import * as vscode from 'vscode';
import { formatMarkdown, formatWarning, formatSectionHeader, formatError } from '../utils/formatters';
import { getProjectConfig, isGloballyConfigured } from '../../services/config';
import { getClientForChat, formatProjectContext } from '../utils/chatContext';

/**
 * Handles the /status command - show playbook statistics
 */
export async function handleStatus(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    // Check global configuration first
    const globalConfigured = isGloballyConfigured();
    if (!globalConfigured) {
        formatSectionHeader(stream, 'ACE Status');
        formatMarkdown(stream, `**Global Configuration:** ❌ Not configured\n\n`);
        formatWarning(stream, 'Complete the configuration to access playbook statistics.\n');
        formatMarkdown(stream, '*Run **ACE: Configure** from the command palette.*\n');
        return { metadata: { command: 'status' } };
    }

    // Get client with folder context
    const clientInfo = getClientForChat(request, stream);
    if (!clientInfo) {
        return { metadata: { command: 'status' } };
    }

    const { client, folder } = clientInfo;
    const projectConfig = getProjectConfig(folder);

    formatSectionHeader(stream, 'ACE Playbook Status');
    formatProjectContext(stream, folder);
    formatMarkdown(stream, '*Fetching statistics from ACE server...*\n\n');

    try {
        const status = await client.getStatus();

        // Total patterns
        const total = status.total_patterns ?? status.total_bullets ?? 0;
        formatMarkdown(stream, `## 🎯 Total Patterns: **${total}**\n\n`);

        // Section breakdown
        if (status.by_section && Object.keys(status.by_section).length > 0) {
            formatMarkdown(stream, '### Patterns by Section\n\n');
            for (const [section, count] of Object.entries(status.by_section)) {
                const sectionName = section
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase());
                formatMarkdown(stream, `- **${sectionName}**: ${count}\n`);
            }
            formatMarkdown(stream, '\n');
        }

        // Quality metric
        if (status.avg_confidence !== undefined) {
            const quality = Math.round(status.avg_confidence * 100);
            formatMarkdown(stream, `### Quality\n`);
            formatMarkdown(stream, `- Average Confidence: ${quality}%\n\n`);
        }

        // Show project info
        if (projectConfig) {
            formatMarkdown(stream, '### Project\n');
            formatMarkdown(stream, `- Organization: \`${projectConfig.orgId}\`\n`);
            formatMarkdown(stream, `- Project: \`${projectConfig.projectId}\`\n`);
            formatMarkdown(stream, `- Server: \`${projectConfig.serverUrl}\`\n`);
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Show config info on error
        if (projectConfig) {
            formatMarkdown(stream, '**Configuration:**\n');
            formatMarkdown(stream, `  - Organization: \`${projectConfig.orgId}\`\n`);
            formatMarkdown(stream, `  - Project: \`${projectConfig.projectId}\`\n`);
            formatMarkdown(stream, `  - Server: \`${projectConfig.serverUrl}\`\n\n`);
        }

        formatError(stream, `Failed to get status: ${message}\n`);
    }

    return { metadata: { command: 'status' } };
}
