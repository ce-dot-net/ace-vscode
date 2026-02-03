import * as vscode from 'vscode';
import { AceClient, type AceConfig, loadUserAuth, isAuthenticated } from '@ace-sdk/core';
import { getProjectConfig } from './config';

// Cache clients per folder (keyed by folder URI string)
const clientCache = new Map<string, AceClient>();

/**
 * Gets the user token from device login.
 * Returns null if not authenticated.
 */
function getUserToken(): string | null {
    const userAuth = loadUserAuth();
    return userAuth?.token ?? null;
}

/**
 * Gets or creates the ACE SDK client for a specific folder.
 * Uses token from device login plus folder/workspace settings.
 *
 * @param folder - Optional workspace folder. If not provided, uses workspace-level config.
 * @returns AceClient instance or null if not configured
 */
export function getAceClient(folder?: vscode.WorkspaceFolder): AceClient | null {
    const projectConfig = getProjectConfig(folder);
    const token = getUserToken();

    // Need both project config and a valid token from device login
    if (!token || !projectConfig) {
        return null;
    }

    // Create cache key from folder URI or use 'default' for workspace-level
    const cacheKey = folder?.uri.toString() ?? 'default';

    // Check cache first
    const cached = clientCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    // Create AceConfig for the client
    const config: AceConfig = {
        serverUrl: projectConfig.serverUrl,
        apiToken: token,
        projectId: projectConfig.projectId,
        cacheTtlMinutes: 5
    };

    const client = new AceClient(config);

    // Cache for future use
    clientCache.set(cacheKey, client);

    return client;
}

/**
 * Invalidates client cache, forcing recreation on next access.
 * Call this when configuration changes or on extension deactivation.
 * @param folder - Optional folder to invalidate. If not provided, invalidates all.
 */
export function invalidateClient(folder?: vscode.WorkspaceFolder): void {
    if (folder) {
        clientCache.delete(folder.uri.toString());
    } else {
        clientCache.clear();
    }
}

/**
 * Checks if the ACE client can be created for a folder (configuration exists).
 * @param folder - Optional folder to check. If not provided, checks workspace-level.
 */
export function isClientConfigured(folder?: vscode.WorkspaceFolder): boolean {
    const projectConfig = getProjectConfig(folder);
    return isAuthenticated() && !!projectConfig;
}
