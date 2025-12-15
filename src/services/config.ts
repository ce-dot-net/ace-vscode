import * as vscode from 'vscode';
import * as fs from 'fs';
import { getGlobalConfigPath, DEFAULT_SERVER_URL } from '../constants';

// Re-export for use in other modules
export { getGlobalConfigPath, DEFAULT_SERVER_URL };

export interface AceGlobalConfig {
    apiToken?: string;
    serverUrl?: string;
    orgs?: Array<{
        id: string;
        name: string;
    }>;
}

export interface AceProjectConfig {
    projectId: string;
    orgId: string;
    serverUrl: string;
}

/**
 * Reads the global ACE configuration from ~/.config/ace/config.json
 * This is the same location used by @ace-sdk/cli
 */
export function readGlobalConfig(): AceGlobalConfig | null {
    const configPath = getGlobalConfigPath();

    try {
        if (!fs.existsSync(configPath)) {
            return null;
        }

        const content = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(content) as AceGlobalConfig;
    } catch (error) {
        console.error('Failed to read ACE global config:', error);
        return null;
    }
}

/**
 * Checks if ACE is configured globally (has API token)
 */
export function isGloballyConfigured(): boolean {
    const config = readGlobalConfig();
    return config !== null && !!config.apiToken;
}

/**
 * Gets the project-specific ACE configuration from workspace settings.
 * For multi-root workspaces, pass the folder to get folder-specific config.
 * @param folder - Optional workspace folder. If not provided, uses workspace-level config.
 */
export function getProjectConfig(folder?: vscode.WorkspaceFolder): AceProjectConfig | null {
    // Pass folder URI to get folder-specific settings in multi-root workspaces
    const config = vscode.workspace.getConfiguration('ace', folder?.uri);
    const projectId = config.get<string>('projectId');
    const orgId = config.get<string>('orgId');
    const serverUrl = config.get<string>('serverUrl') || DEFAULT_SERVER_URL;

    if (!projectId || !orgId) {
        return null;
    }

    return { projectId, orgId, serverUrl };
}

/**
 * Saves project configuration to workspace settings.
 * For multi-root workspaces, pass the folder to save to folder-specific config.
 * @param projectId - The ACE project ID
 * @param orgId - The ACE organization ID
 * @param folder - Optional workspace folder. If provided, saves to folder's .vscode/settings.json
 */
export async function saveProjectConfig(
    projectId: string,
    orgId: string,
    folder?: vscode.WorkspaceFolder
): Promise<void> {
    const config = vscode.workspace.getConfiguration('ace', folder?.uri);

    // Use WorkspaceFolder target if folder is provided, otherwise Workspace
    const target = folder
        ? vscode.ConfigurationTarget.WorkspaceFolder
        : vscode.ConfigurationTarget.Workspace;

    await config.update('projectId', projectId, target);
    await config.update('orgId', orgId, target);
}

/**
 * Checks if the workspace/folder has ACE project configuration.
 * @param folder - Optional workspace folder to check. If not provided, checks workspace-level.
 */
export function isProjectConfigured(folder?: vscode.WorkspaceFolder): boolean {
    return getProjectConfig(folder) !== null;
}

/**
 * Gets the server URL from workspace settings or default.
 * @param folder - Optional workspace folder to get folder-specific server URL.
 */
export function getServerUrl(folder?: vscode.WorkspaceFolder): string {
    const config = vscode.workspace.getConfiguration('ace', folder?.uri);
    return config.get<string>('serverUrl') || DEFAULT_SERVER_URL;
}

/**
 * Get all workspace folders that have ACE configured.
 * Useful for multi-root workspaces to find which folders have ACE project IDs.
 */
export function getConfiguredFolders(): vscode.WorkspaceFolder[] {
    const folders = vscode.workspace.workspaceFolders ?? [];
    return folders.filter(folder => isProjectConfigured(folder));
}

/**
 * Saves the global ACE configuration to ~/.config/ace/config.json
 */
export async function saveGlobalConfig(config: { serverUrl: string; apiToken: string; projectId: string }): Promise<void> {
    const configPath = getGlobalConfigPath();
    const configDir = configPath.substring(0, configPath.lastIndexOf('/'));

    // Create directory if it doesn't exist
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    // Read existing config to preserve other settings
    let existingConfig: AceGlobalConfig = {};
    try {
        if (fs.existsSync(configPath)) {
            existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
    } catch {
        // Ignore parse errors, start fresh
    }

    // Merge with new config
    const newConfig = {
        ...existingConfig,
        serverUrl: config.serverUrl,
        apiToken: config.apiToken,
        projectId: config.projectId
    };

    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
}
