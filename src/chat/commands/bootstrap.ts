import * as vscode from 'vscode';
import { bootstrapWithStreaming, loadUserAuth, type BootstrapSSEEvent } from '@ace-sdk/core';
import { formatMarkdown, formatError, formatSectionHeader } from '../utils/formatters';
import { getClientForChat, formatProjectContext } from '../utils/chatContext';
import { getProjectConfig } from '../../services/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Handles the /bootstrap command - initialize playbook from codebase
 * Uses streaming endpoint (/bootstrap/stream) for real-time progress
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

    const { folder } = clientInfo;

    // Get config for streaming API
    const projectConfig = getProjectConfig(folder);
    const userAuth = loadUserAuth();

    if (!projectConfig || !userAuth?.token) {
        formatError(stream, 'ACE not configured. Please login first.\n');
        return { metadata: { command: 'bootstrap' } };
    }

    // Parse optional mode from prompt (valid: hybrid, both, local-files, git-history, docs-only)
    const modeInput = request.prompt.trim() || 'hybrid';
    const mode = modeInput as 'hybrid' | 'both' | 'local-files' | 'git-history' | 'docs-only';

    formatSectionHeader(stream, 'Bootstrap Playbook');
    formatProjectContext(stream, folder);
    formatMarkdown(stream, `🚀 Initializing playbook from codebase analysis...\n\n`);
    formatMarkdown(stream, `*Mode: **${mode}***\n\n`);

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

        // Use streaming endpoint for real-time progress
        const result = await bootstrapWithStreaming({
            serverUrl: projectConfig.serverUrl,
            orgId: projectConfig.orgId,
            projectId: projectConfig.projectId,
            apiToken: userAuth.token,
            mode,
            codeBlocks,
            metadata: {
                files_scanned: filesScanned,
                blocks_extracted: codeBlocks.length,
                thoroughness: 'medium'
            },
            onEvent: (event: BootstrapSSEEvent) => {
                // Show progress to user
                if (event.message) {
                    formatMarkdown(stream, `⏳ ${event.message}\n`);
                }
            },
            verbosity: 'compact',
            timeout: 120000 // 2 minutes
        });

        if (result.success && result.statistics) {
            const patternsAdded = result.statistics.patterns_extracted ?? 0;

            formatMarkdown(stream, `## ✅ Bootstrap Complete\n\n`);
            formatMarkdown(stream, `**Patterns Added**: ${patternsAdded}\n\n`);

            if (result.statistics.by_section) {
                formatMarkdown(stream, `### By Section\n`);
                for (const [section, count] of Object.entries(result.statistics.by_section)) {
                    formatMarkdown(stream, `- **${section.replace(/_/g, ' ')}**: ${count}\n`);
                }
                formatMarkdown(stream, '\n');
            }

            if (result.statistics.compression_percentage) {
                formatMarkdown(stream, `*Compression: ${result.statistics.compression_percentage}%*\n`);
            }

            if (result.processingTime) {
                formatMarkdown(stream, `*Processing time: ${result.processingTime.toFixed(1)}s*\n`);
            }
        } else if (result.error) {
            formatError(stream, `Bootstrap failed: ${result.error.message}\n`);
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
