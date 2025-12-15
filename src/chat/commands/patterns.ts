import * as vscode from 'vscode';
import { formatMarkdown, formatError, formatSectionHeader } from '../utils/formatters';
import { getClientForChat, formatProjectContext } from '../utils/chatContext';
import { PLAYBOOK_SECTIONS, type PlaybookSection } from '../../constants';
import type { PlaybookBullet, BulletSection } from '@ace-sdk/core';

/**
 * Handles the /patterns command - view playbook patterns by section
 */
export async function handlePatterns(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    // Get client with folder context
    const clientInfo = getClientForChat(request, stream);
    if (!clientInfo) {
        return { metadata: { command: 'patterns' } };
    }

    const { client, folder } = clientInfo;
    const sectionArg = request.prompt.trim().toLowerCase();

    // If no section specified, show available sections
    if (!sectionArg) {
        formatSectionHeader(stream, 'Available Playbook Sections');
        formatProjectContext(stream, folder);
        formatMarkdown(stream, 'Use `/patterns <section>` to view patterns from a specific section:\n\n');

        for (const section of PLAYBOOK_SECTIONS) {
            const displayName = section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            formatMarkdown(stream, `- \`/patterns ${section}\` - ${displayName}\n`);
        }

        formatMarkdown(stream, '\n');
        return { metadata: { command: 'patterns' } };
    }

    // Validate section name
    const section = PLAYBOOK_SECTIONS.find(s =>
        s === sectionArg ||
        s.replace(/_/g, '').includes(sectionArg.replace(/[_\s]/g, ''))
    ) as PlaybookSection | undefined;

    if (!section) {
        formatError(stream, `Unknown section: "${sectionArg}". Valid sections are:\n`);
        for (const s of PLAYBOOK_SECTIONS) {
            formatMarkdown(stream, `- ${s}\n`);
        }
        return { metadata: { command: 'patterns' } };
    }

    const displayName = section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    formatSectionHeader(stream, displayName);
    formatProjectContext(stream, folder);

    try {
        const result = await client.getPlaybook({
            include_metadata: true
        });

        // Get patterns from the specific section
        const patterns: PlaybookBullet[] = result.playbook[section as BulletSection] || [];

        if (patterns.length === 0) {
            formatMarkdown(stream, '*No patterns in this section.*\n\n');
            formatMarkdown(stream, 'Use `/learn` to capture patterns from your work.\n');
        } else {
            formatMarkdown(stream, `**${patterns.length} patterns**\n\n`);

            for (const pattern of patterns) {
                const score = ` [👍 ${pattern.helpful} / 👎 ${pattern.harmful}]`;
                const confidence = ` *(${Math.round(pattern.confidence * 100)}% confidence)*`;

                formatMarkdown(stream, `---\n`);
                formatMarkdown(stream, `${pattern.content}${score}${confidence}\n\n`);
            }
        }

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        formatError(stream, `Failed to get patterns: ${message}\n`);
    }

    return {
        metadata: {
            command: 'patterns',
            section
        }
    };
}
