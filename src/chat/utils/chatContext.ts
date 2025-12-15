import * as vscode from 'vscode';
import { getActiveWorkspaceFolder, getFolderFromReferences, isMultiRootWorkspace } from '../../utils/workspaceUtils';
import { isProjectConfigured, getConfiguredFolders } from '../../services/config';
import { getAceClient } from '../../services/aceClient';
import { formatWarning, formatMarkdown } from './formatters';
import type { AceClient } from '@ace-sdk/core';

/**
 * Get target folder from chat request context.
 * Priority: 1) User-attached references 2) Active editor 3) Single configured folder
 */
export function getTargetFolder(request: vscode.ChatRequest): vscode.WorkspaceFolder | undefined {
    // 1. Check if user attached a file/folder reference
    const refFolder = getFolderFromReferences(request.references);
    if (refFolder) return refFolder;

    // 2. Try active editor
    const activeFolder = getActiveWorkspaceFolder();
    if (activeFolder) return activeFolder;

    // 3. If only one folder is configured, use that
    const configuredFolders = getConfiguredFolders();
    if (configuredFolders.length === 1) {
        return configuredFolders[0];
    }

    return undefined;
}

/**
 * Check if folder is configured and show appropriate warning if not.
 * Returns the folder if configured, undefined otherwise.
 */
export function checkFolderConfigured(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream
): vscode.WorkspaceFolder | undefined {
    const targetFolder = getTargetFolder(request);

    if (!isProjectConfigured(targetFolder)) {
        const folderName = targetFolder?.name;
        if (folderName && isMultiRootWorkspace()) {
            formatWarning(stream, `ACE is not configured for "${folderName}". Run **ACE: Configure** while having a file from this project open.`);
        } else {
            formatWarning(stream, 'ACE is not configured. Run **ACE: Configure**.');
        }
        return undefined;
    }

    return targetFolder;
}

/**
 * Get ACE client for the target folder from chat context.
 * Shows warning if not configured.
 * Returns client (never null) and folder context when successful.
 */
export function getClientForChat(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream
): { client: AceClient; folder: vscode.WorkspaceFolder | undefined } | undefined {
    const folder = checkFolderConfigured(request, stream);
    if (folder === undefined && isProjectConfigured()) {
        // Workspace-level config exists, folder check returned undefined
        // This means we couldn't determine folder but have workspace config
        // Use workspace-level client
        const client = getAceClient();
        if (!client) {
            formatWarning(stream, 'ACE SDK not configured.\n');
            formatMarkdown(stream, 'Run **ACE: Configure** from the command palette.\n');
            return undefined;
        }
        return { client, folder: undefined };
    }

    if (folder === undefined) {
        // Not configured at all
        return undefined;
    }

    const client = getAceClient(folder);
    if (!client) {
        formatWarning(stream, 'ACE SDK not configured.\n');
        formatMarkdown(stream, 'Run **ACE: Configure** from the command palette.\n');
        return undefined;
    }

    return { client, folder };
}

/**
 * Format project context info for multi-root workspaces
 */
export function formatProjectContext(
    stream: vscode.ChatResponseStream,
    folder: vscode.WorkspaceFolder | undefined
): void {
    if (folder && isMultiRootWorkspace()) {
        formatMarkdown(stream, `*Project: **${folder.name}***\n\n`);
    }
}
