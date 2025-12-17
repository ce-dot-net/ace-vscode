import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AGENT_FILES_VERSION } from '../constants';
import { getActiveWorkspaceFolder, getWorkspaceRootPath } from '../utils/workspaceUtils';

interface AceVersionFile {
    version: string;
    updatedAt: string;
}

/**
 * Gets the workspace root path.
 * For multi-root workspaces, tries to detect from active editor, falls back to first folder.
 * @param folder - Optional specific folder to use
 */
function getWorkspaceRoot(folder?: vscode.WorkspaceFolder): string | null {
    if (folder) {
        return folder.uri.fsPath;
    }

    // Try to get from active editor context
    const activeFolder = getActiveWorkspaceFolder();
    if (activeFolder) {
        return activeFolder.uri.fsPath;
    }

    // Fall back to first folder for backwards compatibility
    return getWorkspaceRootPath() ?? null;
}

/**
 * Gets the path to the .ace-version.json file
 */
function getVersionFilePath(workspaceRoot: string): string {
    return path.join(workspaceRoot, '.github', '.ace-version.json');
}

/**
 * Reads the current installed agent files version
 */
function getInstalledVersion(workspaceRoot: string): string | null {
    const versionFilePath = getVersionFilePath(workspaceRoot);
    try {
        if (fs.existsSync(versionFilePath)) {
            const content = fs.readFileSync(versionFilePath, 'utf-8');
            const data: AceVersionFile = JSON.parse(content);
            return data.version;
        }
    } catch {
        // Version file doesn't exist or is invalid
    }
    return null;
}

/**
 * Writes the version file after update
 */
function writeVersionFile(workspaceRoot: string, version: string): void {
    const versionFilePath = getVersionFilePath(workspaceRoot);
    const data: AceVersionFile = {
        version,
        updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(versionFilePath, JSON.stringify(data, null, 2));
}

/**
 * Checks if agent files exist
 */
function agentFilesExist(workspaceRoot: string): boolean {
    const instructionsPath = path.join(workspaceRoot, '.github', 'copilot-instructions.md');
    return fs.existsSync(instructionsPath);
}

/**
 * Compares versions (semver-like)
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;
        if (numA < numB) return -1;
        if (numA > numB) return 1;
    }
    return 0;
}

/**
 * Checks if an update is needed and prompts user
 * Called on extension activation
 */
export async function checkAgentFilesUpdate(): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        return;
    }

    const installedVersion = getInstalledVersion(workspaceRoot);
    const filesExist = agentFilesExist(workspaceRoot);

    // Case 1: Files don't exist at all - prompt to create
    if (!filesExist) {
        const result = await vscode.window.showInformationMessage(
            'ACE: Create GitHub Copilot agent files for pattern learning?',
            'Create Files',
            'Not Now',
            "Don't Ask Again"
        );

        if (result === 'Create Files') {
            await handleUpdateAgents(false);
        } else if (result === "Don't Ask Again") {
            // Write version 0.0.0 to suppress future prompts
            const githubDir = path.join(workspaceRoot, '.github');
            if (!fs.existsSync(githubDir)) {
                fs.mkdirSync(githubDir, { recursive: true });
            }
            writeVersionFile(workspaceRoot, '0.0.0');
        }
        return;
    }

    // Case 2: Files exist but no version file - legacy installation
    if (!installedVersion) {
        console.log('ACE: Legacy agent files detected, writing version file');
        writeVersionFile(workspaceRoot, AGENT_FILES_VERSION);
        return;
    }

    // Case 3: Version file exists with 0.0.0 - user opted out
    if (installedVersion === '0.0.0') {
        console.log('ACE: User opted out of agent file updates');
        return;
    }

    // Case 4: Check if update is needed
    if (compareVersions(installedVersion, AGENT_FILES_VERSION) < 0) {
        const result = await vscode.window.showInformationMessage(
            `ACE: Agent files update available (${installedVersion} → ${AGENT_FILES_VERSION})`,
            'Update Now',
            'Later',
            'Skip This Version'
        );

        if (result === 'Update Now') {
            await handleUpdateAgents(false);
        } else if (result === 'Skip This Version') {
            // Write current version to skip this update
            writeVersionFile(workspaceRoot, AGENT_FILES_VERSION);
        }
    }
}

/**
 * Direct command to update ACE files - creates copilot-instructions.md (PRIMARY) + optional agents
 * @param silent If true, runs without UI notifications (for automatic updates on activation)
 * @param folder Optional specific folder to update (for multi-root workspaces)
 */
export async function handleUpdateAgents(silent: boolean = false, folder?: vscode.WorkspaceFolder): Promise<void> {
    const workspaceRoot = getWorkspaceRoot(folder);
    if (!workspaceRoot) {
        if (!silent) {
            vscode.window.showWarningMessage('No workspace folder open. Please open a folder first.');
        }
        return;
    }

    // Show which folder we're updating in multi-root
    const targetFolder = folder?.name ?? getActiveWorkspaceFolder()?.name;

    const githubDir = path.join(workspaceRoot, '.github');
    const agentsDir = path.join(githubDir, 'agents');

    try {
        // Create .github directory if needed
        if (!fs.existsSync(githubDir)) {
            fs.mkdirSync(githubDir, { recursive: true });
        }

        // PRIMARY: Create copilot-instructions.md (AUTOMATIC injection on every request)
        const instructionsPath = path.join(githubDir, 'copilot-instructions.md');
        fs.writeFileSync(instructionsPath, getCopilotInstructionsContent());

        // OPTIONAL: Create agents directory and agent files
        if (!fs.existsSync(agentsDir)) {
            fs.mkdirSync(agentsDir, { recursive: true });
        }

        // Create/update ACE agent (minimal - just tools + handoffs)
        const aceAgentPath = path.join(agentsDir, 'ace.agent.md');
        fs.writeFileSync(aceAgentPath, getAceAgentContent());

        // Create/update ACE Learn agent
        const learnAgentPath = path.join(agentsDir, 'ace-learn.agent.md');
        fs.writeFileSync(learnAgentPath, getAceLearnAgentContent());

        // Write version file
        writeVersionFile(workspaceRoot, AGENT_FILES_VERSION);

        if (!silent) {
            const folderInfo = targetFolder ? ` for "${targetFolder}"` : '';
            vscode.window.showInformationMessage(
                `ACE files updated to v${AGENT_FILES_VERSION}${folderInfo}! copilot-instructions.md enables automatic pattern injection.`
            );

            // Open the .github folder in explorer
            const githubDirUri = vscode.Uri.file(githubDir);
            vscode.commands.executeCommand('revealInExplorer', githubDirUri);
        } else {
            const folderInfo = targetFolder ? ` for "${targetFolder}"` : '';
            console.log(`ACE: Agent files updated to v${AGENT_FILES_VERSION}${folderInfo}`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!silent) {
            vscode.window.showErrorMessage(`Failed to create ACE files: ${message}`);
        } else {
            console.error('ACE: Failed to update agent files:', message);
        }
    }
}

/**
 * PRIMARY: copilot-instructions.md - Automatically applied to ALL Copilot requests
 */
function getCopilotInstructionsContent(): string {
    return `# ACE Pattern Learning Integration

This project uses **ACE (Automatic Context Engine)** for pattern-based learning.

## ⚠️ CRITICAL: MANDATORY ACE Tool Usage

**YOU MUST follow this workflow for EVERY implementation task:**

### STEP 1: BEFORE Starting Work (MANDATORY)
When the request contains: **implement, build, create, fix, debug, refactor, integrate, add, update, write, modify, change**

**YOU MUST invoke \`#ce-dot-net.ace-vscode/ace_search\` FIRST** before writing any code.
- Search for relevant patterns from the playbook
- Apply learned strategies and avoid known pitfalls

### STEP 2: AFTER Completing Work (MANDATORY)
**YOU MUST invoke \`#ce-dot-net.ace-vscode/ace_learn\` IMMEDIATELY after completing substantial work.**

This is **NOT OPTIONAL**. Call ace_learn with:
- \`task\`: Brief description of what was accomplished
- \`success\`: true/false
- \`output\`: Key lessons, patterns discovered, gotchas

**DO NOT skip this step. DO NOT respond to user without calling ace_learn first.**

## Available Tools

- \`#ce-dot-net.ace-vscode/ace_search\` - Find relevant patterns (BEFORE work)
- \`#ce-dot-net.ace-vscode/ace_learn\` - Capture patterns (AFTER work)
- \`#ce-dot-net.ace-vscode/ace_get_playbook\` - View all patterns
- \`#ce-dot-net.ace-vscode/ace_status\` - Show statistics

## Workflow Example

\`\`\`
User: "implement JWT authentication"
    ↓
1. INVOKE: #ce-dot-net.ace-vscode/ace_search with query "JWT authentication"
2. IMPLEMENT: Using patterns found
3. INVOKE: #ce-dot-net.ace-vscode/ace_learn with task summary
4. RESPOND: To user with implementation details
\`\`\`

**Remember: ace_search BEFORE, ace_learn AFTER - BOTH are MANDATORY!**
`;
}

function getAceAgentContent(): string {
    return `---
name: ace-expert
description: Pattern-enhanced coding with automatic ACE tool invocation
target: vscode
tools:
  - ce-dot-net.ace-vscode/ace_search
  - ce-dot-net.ace-vscode/ace_learn
  - ce-dot-net.ace-vscode/ace_status
  - ce-dot-net.ace-vscode/ace_get_playbook
  - search/codebase
  - read/readFile
  - edit/editFiles
  - read/problems
---

# ACE Expert Agent

**Pattern-enhanced coding with MANDATORY ACE tool invocation.**

## ⚠️ CRITICAL: MANDATORY Workflow

**YOU MUST follow this exact workflow for EVERY task:**

### STEP 1: BEFORE Work (MANDATORY)
\`\`\`
INVOKE: #ce-dot-net.ace-vscode/ace_search
\`\`\`
Search for relevant patterns BEFORE writing any code.

### STEP 2: IMPLEMENT
Apply learned patterns from the search results.

### STEP 3: AFTER Work (MANDATORY)
\`\`\`
INVOKE: #ce-dot-net.ace-vscode/ace_learn
\`\`\`
**YOU MUST call ace_learn BEFORE responding to the user.**

Provide:
- task: What was accomplished
- success: true/false
- output: Lessons learned, patterns discovered

## ✅ Example Flow

\`\`\`
User: "implement JWT authentication"
    ↓
1. ace_search("JWT authentication") → Find patterns
2. Implement using patterns
3. ace_learn(task="Implemented JWT auth", success=true, output="Used refresh token rotation")
4. Respond to user
\`\`\`

`;
}

function getAceLearnAgentContent(): string {
    return `---
name: ace-learn
description: Capture patterns from completed work
target: vscode
tools:
  - ce-dot-net.ace-vscode/ace_learn
  - ce-dot-net.ace-vscode/ace_search
  - ce-dot-net.ace-vscode/ace_status
---

# Capture Learning

Ask what was done and capture with \`#ce-dot-net.ace-vscode/ace_learn\`.
`;
}
