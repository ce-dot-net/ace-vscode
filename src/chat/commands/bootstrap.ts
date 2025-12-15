import * as vscode from 'vscode';
import { formatMarkdown, formatError, formatSectionHeader } from '../utils/formatters';
import { getClientForChat, formatProjectContext } from '../utils/chatContext';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Handles the /bootstrap command - initialize playbook from codebase
 */
export async function handleBootstrap(
    request: vscode.ChatRequest,
    _context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    _token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    // Get client with folder context
    const clientInfo = getClientForChat(request, stream);
    if (!clientInfo) {
        return { metadata: { command: 'bootstrap' } };
    }

    const { client, folder } = clientInfo;

    // Parse optional mode from prompt
    const mode = request.prompt.trim() || 'hybrid';

    formatSectionHeader(stream, 'Bootstrap Playbook');
    formatProjectContext(stream, folder);
    formatMarkdown(stream, `🚀 Initializing playbook from codebase analysis...\n\n`);
    formatMarkdown(stream, `*Mode: **${mode}***\n\n`);
    formatMarkdown(stream, `*This may take 10-30 seconds...*\n\n`);

    try {
        // Get workspace path from folder context
        const projectPath = folder?.uri.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

        // Extract code blocks from markdown files in the workspace
        const codeBlocks: string[] = [];
        const mdFiles = await findMarkdownFiles(projectPath);
        let filesScanned = 0;

        for (const mdFile of mdFiles.slice(0, 100)) { // Limit to 100 files
            try {
                const content = fs.readFileSync(mdFile, 'utf-8');
                // Extract code blocks using simple regex (```...``` blocks)
                const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
                let match;
                while ((match = codeBlockRegex.exec(content)) !== null) {
                    const code = match[1].trim();
                    if (code.length > 20) { // Only include meaningful code blocks
                        codeBlocks.push(code);
                    }
                }
                filesScanned++;
            } catch {
                // Skip files that can't be read
            }
        }

        const result = await client.bootstrap({
            mode,
            code_blocks: codeBlocks,
            metadata: {
                files_scanned: filesScanned,
                blocks_extracted: codeBlocks.length,
                thoroughness: 'medium'
            }
        });

        const patternsAdded = result.patterns_extracted ?? 0;

        formatMarkdown(stream, `## ✅ Bootstrap Complete\n\n`);
        formatMarkdown(stream, `**Patterns Added**: ${patternsAdded}\n\n`);

        if (result.by_section) {
            formatMarkdown(stream, `### By Section\n`);
            for (const [section, count] of Object.entries(result.by_section)) {
                formatMarkdown(stream, `- **${section.replace(/_/g, ' ')}**: ${count}\n`);
            }
            formatMarkdown(stream, '\n');
        }

        if (result.compression_percentage) {
            formatMarkdown(stream, `*Compression: ${result.compression_percentage}%*\n`);
        }

        formatMarkdown(stream, `\nUse \`/patterns\` to view your playbook, or \`/top\` for best patterns.\n`);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        formatError(stream, `Bootstrap failed: ${message}\n`);
        formatMarkdown(stream, '\nCheck your configuration and try again.\n');
    }

    return { metadata: { command: 'bootstrap', mode } };
}

/**
 * Find markdown files in a directory recursively
 */
async function findMarkdownFiles(dir: string, depth = 0): Promise<string[]> {
    if (depth > 3) return []; // Limit depth

    const files: string[] = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                files.push(...await findMarkdownFiles(fullPath, depth + 1));
            } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
                files.push(fullPath);
            }
        }
    } catch {
        // Skip directories that can't be read
    }
    return files;
}
