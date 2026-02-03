import * as os from 'os';
import * as path from 'path';

// Extension identifiers
export const EXTENSION_ID = 'ace-vscode';
export const PARTICIPANT_ID = `${EXTENSION_ID}.ace`;

// Commands
export const COMMANDS = {
    CONFIGURE: `${EXTENSION_ID}.configure`,
    BOOTSTRAP: `${EXTENSION_ID}.bootstrap`,
    CLEAR: `${EXTENSION_ID}.clear`,
    CAPTURE_LEARN: `${EXTENSION_ID}.captureLearn`,
    QUICK_ACTIONS: `${EXTENSION_ID}.showQuickActions`,
    UPDATE_AGENTS: `${EXTENSION_ID}.updateAgents`,
    LOGIN: `${EXTENSION_ID}.login`,
    LOGOUT: `${EXTENSION_ID}.logout`,
} as const;

// Chat participant commands
export const CHAT_COMMANDS = {
    SEARCH: 'search',
    PATTERNS: 'patterns',
    STATUS: 'status',
    LEARN: 'learn',
    TOP: 'top',
    BOOTSTRAP: 'bootstrap',
    CLEAR: 'clear',
    DOMAINS: 'domains',
} as const;

// ACE Server configuration
export const DEFAULT_SERVER_URL = 'https://ace-api.code-engine.app';

// Agent files version - bump this ONLY when agent file CONTENT changes
// This is separate from extension version - only triggers update popup when agent files have new content
// Current: 0.4.23 (fixed config fallback to global config for projectId/orgId)
export const AGENT_FILES_VERSION = '0.4.23';

// Global config path (XDG standard, same as @ace-sdk/core)
export const getGlobalConfigPath = (): string => {
    const xdgConfig = process.env.XDG_CONFIG_HOME;
    const configBase = xdgConfig || path.join(os.homedir(), '.config');
    return path.join(configBase, 'ace', 'config.json');
};

// Playbook sections (from ACE framework)
export const PLAYBOOK_SECTIONS = [
    'strategies_and_hard_rules',
    'useful_code_snippets',
    'troubleshooting_and_pitfalls',
    'apis_to_use',
] as const;

export type PlaybookSection = typeof PLAYBOOK_SECTIONS[number];
