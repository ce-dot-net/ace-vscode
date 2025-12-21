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
 * Checks if ACE files exist (new structure: instructions/ace.instructions.md)
 */
function agentFilesExist(workspaceRoot: string): boolean {
    // Check for new structure first
    const newInstructionsPath = path.join(workspaceRoot, '.github', 'instructions', 'ace.instructions.md');
    if (fs.existsSync(newInstructionsPath)) {
        return true;
    }

    // Check for legacy structure (copilot-instructions.md with ACE content)
    const legacyPath = path.join(workspaceRoot, '.github', 'copilot-instructions.md');
    if (fs.existsSync(legacyPath)) {
        try {
            const content = fs.readFileSync(legacyPath, 'utf-8');
            // Check if it has ACE content (our marker or ACE-specific content)
            return content.includes('ACE Pattern Learning') || content.includes('ace_search') || content.includes('ace_learn');
        } catch {
            return false;
        }
    }

    return false;
}

/**
 * Migrates legacy copilot-instructions.md by removing ACE content
 * Returns true if migration was performed
 */
function migrateLegacyCopilotInstructions(workspaceRoot: string): boolean {
    const legacyPath = path.join(workspaceRoot, '.github', 'copilot-instructions.md');

    if (!fs.existsSync(legacyPath)) {
        return false;
    }

    try {
        const content = fs.readFileSync(legacyPath, 'utf-8');

        // Check if the file is entirely ACE content (we created it)
        const isEntirelyAceContent = content.includes('# ACE Pattern Learning Integration') &&
            content.includes('ace_search') &&
            content.includes('ace_learn') &&
            !content.includes('<!-- USER_CONTENT -->'); // No user marker

        if (isEntirelyAceContent) {
            // The entire file is ACE content - we can safely delete it
            // (User's instructions should be separate)
            fs.unlinkSync(legacyPath);
            console.log('ACE: Removed legacy copilot-instructions.md (was entirely ACE content)');
            return true;
        }

        // If there's mixed content, leave it alone and warn
        if (content.includes('ACE Pattern Learning') || content.includes('ace_search')) {
            console.log('ACE: Legacy copilot-instructions.md has mixed content - leaving untouched');
            // Don't delete, but note that migration happened (we'll create new file anyway)
            return true;
        }

        return false;
    } catch {
        return false;
    }
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
 * Direct command to update ACE files
 * New v0.4.16 structure:
 * - .github/instructions/ace.instructions.md (path-specific, doesn't overwrite user's copilot-instructions.md)
 * - .github/skills/ace-pattern-learning/SKILL.md (Agent Skill for auto-trigger)
 * - .github/agents/ace.agent.md (ace-expert agent - PRIMARY)
 * - .github/agents/ace-learn.agent.md (learning agent)
 *
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
    const instructionsDir = path.join(githubDir, 'instructions');
    const skillsDir = path.join(githubDir, 'skills', 'ace-pattern-learning');
    const agentsDir = path.join(githubDir, 'agents');

    try {
        // Migrate legacy copilot-instructions.md if needed
        const migrated = migrateLegacyCopilotInstructions(workspaceRoot);
        if (migrated) {
            console.log('ACE: Migrated from legacy copilot-instructions.md');
        }

        // Create directories
        if (!fs.existsSync(githubDir)) {
            fs.mkdirSync(githubDir, { recursive: true });
        }
        if (!fs.existsSync(instructionsDir)) {
            fs.mkdirSync(instructionsDir, { recursive: true });
        }
        if (!fs.existsSync(skillsDir)) {
            fs.mkdirSync(skillsDir, { recursive: true });
        }
        if (!fs.existsSync(agentsDir)) {
            fs.mkdirSync(agentsDir, { recursive: true });
        }

        // NEW: Create .github/instructions/ace.instructions.md (path-specific, won't overwrite user content)
        const aceInstructionsPath = path.join(instructionsDir, 'ace.instructions.md');
        fs.writeFileSync(aceInstructionsPath, getAceInstructionsContent());

        // NEW: Create .github/skills/ace-pattern-learning/SKILL.md (Agent Skill)
        const skillPath = path.join(skillsDir, 'SKILL.md');
        fs.writeFileSync(skillPath, getAceSkillContent());

        // Create/update ACE agent (ace-expert - PRIMARY for reliable workflow)
        const aceAgentPath = path.join(agentsDir, 'ace.agent.md');
        fs.writeFileSync(aceAgentPath, getAceAgentContent());

        // Create/update ACE Learn agent
        const learnAgentPath = path.join(agentsDir, 'ace-learn.agent.md');
        fs.writeFileSync(learnAgentPath, getAceLearnAgentContent());

        // Write version file
        writeVersionFile(workspaceRoot, AGENT_FILES_VERSION);

        if (!silent) {
            const folderInfo = targetFolder ? ` for "${targetFolder}"` : '';
            const migrationNote = migrated ? ' Legacy copilot-instructions.md migrated.' : '';
            vscode.window.showInformationMessage(
                `ACE files updated to v${AGENT_FILES_VERSION}${folderInfo}!${migrationNote} New structure: instructions/, skills/, agents/`
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

// NEW: .github/instructions/ace.instructions.md
// Path-specific instructions that apply to all files (applyTo: "**/*")
// This does NOT overwrite user's copilot-instructions.md
function getAceInstructionsContent(): string {
    return `---
applyTo: "**/*"
---
<!-- ACE_SECTION v${AGENT_FILES_VERSION} -->
# ACE Pattern Learning Integration

This project uses **ACE (Automatic Context Engine)** for pattern-based learning.

## ⚠️ MANDATORY ACE Tool Usage

### BEFORE Starting Work
When request contains: **implement, build, create, fix, debug, refactor, integrate, add, update, write, modify, change**

**INVOKE**: \`#ce-dot-net.ace-vscode/ace_search\` FIRST before writing any code.

### AFTER Completing Work
**INVOKE**: \`#ce-dot-net.ace-vscode/ace_learn\` IMMEDIATELY after completing substantial work.

Provide:
- \`task\`: Brief description of what was accomplished
- \`success\`: true/false
- \`output\`: Key lessons, patterns discovered, gotchas

## Available Tools

- \`#ce-dot-net.ace-vscode/ace_search\` - Find relevant patterns (BEFORE work)
- \`#ce-dot-net.ace-vscode/ace_learn\` - Capture patterns (AFTER work)
- \`#ce-dot-net.ace-vscode/ace_get_playbook\` - View all patterns
- \`#ce-dot-net.ace-vscode/ace_status\` - Show statistics

**Remember: ace_search BEFORE, ace_learn AFTER - BOTH are MANDATORY!**
<!-- ACE_SECTION_END -->
`;
}

/**
 * NEW: .github/skills/ace-pattern-learning/SKILL.md
 * Agent Skill that auto-triggers based on user prompt
 * Copilot decides when to use this skill based on the description
 */
function getAceSkillContent(): string {
    return `---
name: ace-pattern-learning
description: "Search ACE playbook before implementing, building, fixing, debugging, or refactoring code. Capture patterns after completing substantial coding work."
---
<!-- ACE_SECTION v${AGENT_FILES_VERSION} -->
# ACE Pattern Learning Skill

This skill provides pattern-based learning for coding tasks.

## When This Skill Activates

Copilot will automatically load this skill when your request contains:
- **Implementation**: implement, build, create, add, develop, write
- **Modification**: update, modify, change, edit, enhance, extend
- **Debugging**: debug, fix, troubleshoot, resolve, diagnose
- **Refactoring**: refactor, optimize, improve, restructure
- **Integration**: integrate, connect, setup, configure

## BEFORE Starting Work (MANDATORY)

**INVOKE**: \`#ce-dot-net.ace-vscode/ace_search\` with relevant query

Search for patterns from previous work before implementing:
- Proven solutions and best practices
- Known gotchas and pitfalls to avoid
- Recommended APIs and libraries

## AFTER Completing Work (MANDATORY)

**INVOKE**: \`#ce-dot-net.ace-vscode/ace_learn\` with:
- \`task\`: Brief description of what was accomplished
- \`success\`: true/false
- \`output\`: Key lessons, patterns discovered, gotchas

**DO NOT skip this step. DO NOT respond to user without calling ace_learn first.**

## Example Workflow

\`\`\`
User: "implement JWT authentication"
    ↓
1. ace_search("JWT authentication") → Find patterns
2. Implement using patterns found
3. ace_learn(task="Implemented JWT auth", success=true, output="Used refresh token rotation")
4. Respond to user
\`\`\`
<!-- ACE_SECTION_END -->
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
