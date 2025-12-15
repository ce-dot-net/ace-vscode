import * as vscode from 'vscode';

/**
 * Formats a markdown response for the chat stream
 */
export function formatMarkdown(stream: vscode.ChatResponseStream, content: string): void {
    stream.markdown(content);
}

/**
 * Formats an error message for the chat stream
 */
export function formatError(stream: vscode.ChatResponseStream, error: string): void {
    stream.markdown(`⚠️ **Error:** ${error}`);
}

/**
 * Formats a success message for the chat stream
 */
export function formatSuccess(stream: vscode.ChatResponseStream, message: string): void {
    stream.markdown(`✅ ${message}`);
}

/**
 * Formats a warning message for the chat stream
 */
export function formatWarning(stream: vscode.ChatResponseStream, message: string): void {
    stream.markdown(`⚠️ ${message}`);
}

/**
 * Formats a section header
 */
export function formatSectionHeader(stream: vscode.ChatResponseStream, title: string): void {
    stream.markdown(`\n## ${title}\n\n`);
}

/**
 * Formats a list of patterns
 */
export function formatPatternList(
    stream: vscode.ChatResponseStream,
    patterns: Array<{ content: string; helpful?: number; harmful?: number }>
): void {
    if (patterns.length === 0) {
        stream.markdown('*No patterns found.*\n');
        return;
    }

    for (const pattern of patterns) {
        const score = pattern.helpful !== undefined && pattern.harmful !== undefined
            ? ` (👍 ${pattern.helpful} / 👎 ${pattern.harmful})`
            : '';
        stream.markdown(`- ${pattern.content}${score}\n`);
    }
}

/**
 * Formats playbook statistics
 */
export function formatStats(
    stream: vscode.ChatResponseStream,
    stats: {
        total_patterns?: number;
        sections?: Record<string, number>;
        last_updated?: string;
    }
): void {
    stream.markdown('### Playbook Statistics\n\n');

    if (stats.total_patterns !== undefined) {
        stream.markdown(`**Total Patterns:** ${stats.total_patterns}\n\n`);
    }

    if (stats.sections) {
        stream.markdown('**By Section:**\n');
        for (const [section, count] of Object.entries(stats.sections)) {
            const displayName = section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            stream.markdown(`- ${displayName}: ${count}\n`);
        }
        stream.markdown('\n');
    }

    if (stats.last_updated) {
        stream.markdown(`**Last Updated:** ${stats.last_updated}\n`);
    }
}
