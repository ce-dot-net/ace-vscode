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
export function compareVersions(a: string, b: string): number {
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
 * Shows a non-blocking notification via status bar message.
 * Auto-dismisses after the specified timeout.
 *
 * @param message The message to display
 * @param timeoutMs Auto-dismiss timeout in milliseconds (default: 5000ms)
 */
export function showNonBlockingNotification(message: string, timeoutMs: number = 5000): void {
    vscode.window.setStatusBarMessage(message, timeoutMs);
}

/**
 * Checks if an update is needed and auto-creates/updates silently.
 * Called on extension activation.
 *
 * Auto-Update Behavior (v0.4.27+):
 * - First install: Auto-creates files without prompt
 * - Version upgrade: Auto-updates files without prompt
 * - Opt-out (version "0.0.0"): Respects user preference, does nothing
 * - Shows non-blocking status bar notification instead of modal dialog
 */
export async function checkAgentFilesUpdate(): Promise<void> {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        return;
    }

    const installedVersion = getInstalledVersion(workspaceRoot);
    const filesExist = agentFilesExist(workspaceRoot);

    // Case 1: Files don't exist at all - auto-create (first install)
    if (!filesExist) {
        // Check for opt-out before auto-creating
        if (installedVersion === '0.0.0') {
            console.log('ACE: User opted out of agent files');
            return;
        }

        try {
            await handleUpdateAgents(true); // Silent mode
            showNonBlockingNotification(`ACE: Agent files created (v${AGENT_FILES_VERSION})`, 5000);
        } catch (error) {
            console.error('ACE: Failed to auto-create agent files:', error);
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

    // Case 4: Check if update is needed - auto-update without prompt
    if (compareVersions(installedVersion, AGENT_FILES_VERSION) < 0) {
        try {
            await handleUpdateAgents(true); // Silent mode
            showNonBlockingNotification(
                `ACE: Agent files updated (${installedVersion} → ${AGENT_FILES_VERSION})`,
                5000
            );
        } catch (error) {
            console.error('ACE: Failed to auto-update agent files:', error);
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
    const hooksDir = path.join(githubDir, 'hooks');

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
        if (!fs.existsSync(hooksDir)) {
            fs.mkdirSync(hooksDir, { recursive: true });
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

        // Create/update global hooks (fires for ALL agents, not just ace-expert)
        const hooksPath = path.join(hooksDir, 'ace-hooks.json');
        fs.writeFileSync(hooksPath, getAceHooksContent());

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
- \`output\`: Start with \`TIME_SAVED: Xm | reason\`, then key lessons, patterns discovered, gotchas

**FAILURE TO CALL ace_learn = INCOMPLETE TASK**

### DURING Conversation (Topic Changes / Continuous Re-Search)
Call \`#ce-dot-net.ace-vscode/ace_search\` AGAIN when:
- **Topic shift**: New domain mentioned (auth → caching, frontend → backend, etc.)
- **Extended work**: After 5+ tool calls without re-searching
- **Errors**: Hitting errors in a different area than original task
- **New context**: Switching file types or directories
- **Task shift**: User asks about something not covered by previous search

**INVOKE**: \`#ce-dot-net.ace-vscode/ace_search\` with NEW topic query BEFORE continuing.

## Domain-Aware Search (v0.4.18)

**List domains:** Use \`/domains\` to see available domains with pattern counts.

**Filter search by domain:**
- \`ace_search query --allowed-domains <domain1,domain2>\`
- \`ace_search query --blocked-domains <domain1,domain2>\`

**When topic changes, search in relevant domain:**
1. Detect topic change (auth → caching, API → database, etc.)
2. Use \`/domains\` to discover relevant domain name
3. Call \`ace_search\` with \`allowed_domains\` parameter

Example domains: \`vscode-extension-architecture-and-development\`, \`git-operations\`, \`node-express-jwt-authentication\`

## Task Intent Routing (ACE 1.5)

Pass \`task_intent\` to \`ace_search\` to improve ACE 1.5 bandit routing of patterns:
- Values: \`refactor\` · \`routine\` · \`explore\` · \`spec_strict\`
- Chat: \`@ace /search <query> --task-intent refactor\`
- Tool: set the \`task_intent\` input on \`#ce-dot-net.ace-vscode/ace_search\`
- Omit it to use the server default.

## Available Tools

- \`#ce-dot-net.ace-vscode/ace_search\` - Find relevant patterns (BEFORE work, supports domain filtering)
- \`#ce-dot-net.ace-vscode/ace_learn\` - Capture patterns (AFTER work)
- \`#ce-dot-net.ace-vscode/ace_get_playbook\` - View all patterns
- \`#ce-dot-net.ace-vscode/ace_status\` - Show statistics and top domains

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

## Mid-Conversation Re-Search

If user's follow-up message introduces a NEW topic or domain:
1. Recognize topic shift (auth→caching, API→database, etc.)
2. Call ace_search with the new topic BEFORE continuing
3. Apply newly retrieved patterns

**Examples of topic shifts requiring re-search:**
- "Now let's add caching" (after auth implementation)
- "I'm getting a database error" (after API work)
- "How do I deploy this?" (after coding)
- "Let's add tests" (after implementation)
- "Now handle the error cases" (new domain)

## Domain-Filtered Search (v0.4.18)

After topic change detection, use domain filtering for targeted retrieval:

1. **List domains**: \`/domains\` to see available domains
2. **Match topic to domain**: Find domain name matching new topic
3. **Filtered search**: \`ace_search <query> allowed_domains=<domain>\`

## Example Workflow (with Domain Filtering)

\`\`\`
User: "implement JWT authentication"
    ↓
1. ace_search("JWT authentication") → Find patterns
2. Implement using patterns found
3. ace_learn(task="Implemented JWT auth", success=true, output="Used refresh token rotation")
4. Respond to user

User: "Now add Redis caching for the tokens"
    ↓
1. [Topic shift detected: auth → caching]
2. /domains → sees available domains
3. ace_search("Redis caching" allowed_domains="caching,redis") → Targeted patterns
4. Implement caching using patterns found
5. ace_learn(task="Added Redis token caching", success=true, output="Used TTL matching token expiry")
6. Respond to user
\`\`\`
<!-- ACE_SECTION_END -->
`;
}

function getAceAgentContent(): string {
    return `---
name: ace-expert
description: Pattern-enhanced coding with automatic ACE tool invocation
target: vscode
user-invocable: true
tools:
  - ce-dot-net.ace-vscode/ace_search
  - ce-dot-net.ace-vscode/ace_learn
  - ce-dot-net.ace-vscode/ace_status
  - ce-dot-net.ace-vscode/ace_get_playbook
  - search/codebase
  - read/readFile
  - edit/editFiles
  - read/problems
hooks:
  SessionStart:
    - type: command
      command: "echo '{\\"hookSpecificOutput\\":{\\"hookEventName\\":\\"SessionStart\\",\\"additionalContext\\":\\"ACE Pattern Learning is active. BEFORE starting any coding task, invoke ace_search to find relevant patterns. AFTER completing work, invoke ace_learn to capture learnings.\\"}}'"
      timeout: 5
  Stop:
    - type: command
      command: "echo '{\\"hookSpecificOutput\\":{\\"hookEventName\\":\\"Stop\\",\\"decision\\":\\"block\\",\\"reason\\":\\"Before ending: Have you captured your learnings? If you completed substantial work, invoke ace_learn to save patterns for the team.\\"}}'"
      timeout: 5
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

## Domain-Aware Search (v0.4.18)

**When topic changes**, discover and filter by domain:
1. Use \`/domains\` to list available domains
2. Match topic to domain name
3. Use \`ace_search\` with \`allowed_domains\` parameter

## ✅ Example Flow

\`\`\`
User: "implement JWT authentication"
    ↓
1. ace_search("JWT authentication") → Find patterns
2. Implement using patterns
3. ace_learn(task="Implemented JWT auth", success=true, output="Used refresh token rotation")
4. Respond to user

User: "Now work on the UI"
    ↓
1. [Topic shift: auth → UI]
2. /domains → finds "vscode-extension-ui-development"
3. ace_search("UI" allowed_domains="vscode-extension-ui-development")
4. Implement with UI-specific patterns
5. ace_learn(...)
6. Respond to user
\`\`\`

`;
}

/**
 * Global hooks that fire for ALL agents and chat sessions.
 * Location: .github/hooks/ace-hooks.json
 * Requires: chat.hooks.enabled setting (Preview, VS Code 1.109+)
 *
 * - SessionStart: injects additionalContext telling model to call ace_search
 * - Stop: blocks session end until ace_learn is called (checks stop_hook_active to prevent loops)
 */
function getAceHooksContent(): string {
    const hooks = {
        hooks: {
            SessionStart: [
                {
                    type: 'command',
                    command: `echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"ACE Pattern Learning is active.\\n\\n## MANDATORY WORKFLOW\\n1. BEFORE any coding task: call ace_search with a relevant query\\n2. AFTER completing work: call ace_learn with task summary, success, and output (start output with TIME_SAVED: Xm | reason)\\n\\n## CONTINUOUS RE-SEARCH (Domain Shift Detection)\\nCall ace_search AGAIN when:\\n- Topic shifts (auth → caching, API → database, frontend → backend)\\n- After 5+ tool calls without re-searching\\n- When hitting errors in a different area\\n- When user asks about a new domain\\n- When switching file types or directories\\n\\nFAILURE TO CALL ace_search = INCOMPLETE TASK"}}'`,
                    timeout: 5
                }
            ],
            PostToolUse: [
                {
                    type: 'command',
                    command: `bash -c 'INPUT=$(cat); TOOL=$(echo "$INPUT" | jq -r ".tool_name // \\"\\""); case "$TOOL" in *edit*|*write*|*create*|*replace*) FILE=$(echo "$INPUT" | jq -r ".tool_input.file_path // .tool_input.filePath // .tool_input.path // \\"\\"" 2>/dev/null); if [ -n "$FILE" ]; then DIR=$(dirname "$FILE" | sed "s|.*/src/||" | cut -d/ -f1); LAST_DIR=$(cat /tmp/ace-last-dir-$$ 2>/dev/null); echo "$DIR" > /tmp/ace-last-dir-$$; if [ -n "$LAST_DIR" ] && [ "$DIR" != "$LAST_DIR" ]; then echo "{\\"hookSpecificOutput\\":{\\"hookEventName\\":\\"PostToolUse\\",\\"additionalContext\\":\\"[ACE Domain Shift] You moved from $LAST_DIR/ to $DIR/. Consider calling ace_search with a query relevant to $DIR before continuing.\\"}}"; exit 0; fi; fi;; esac; exit 0'`,
                    timeout: 5
                }
            ],
            Stop: [
                {
                    type: 'command',
                    command: `bash -c 'INPUT=$(cat); ACTIVE=$(echo "$INPUT" | jq -r ".stop_hook_active // false"); if [ "$ACTIVE" = "true" ]; then exit 0; fi; TRANSCRIPT=$(echo "$INPUT" | jq -r ".transcript_path // \\"\\""); if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then if grep -q "ace_learn" "$TRANSCRIPT" 2>/dev/null; then exit 0; fi; fi; LAST=$(echo "$INPUT" | jq -r ".last_assistant_message // \\"\\""); if echo "$LAST" | grep -qi "ace_learn\\|captured learning\\|pattern recorded\\|pattern saved\\|learning captured"; then exit 0; fi; echo "{\\"hookSpecificOutput\\":{\\"hookEventName\\":\\"Stop\\",\\"decision\\":\\"block\\",\\"reason\\":\\"You have not captured learnings yet. Call ace_learn with: task (what was done), success (true/false), output (start with TIME_SAVED: Xm | reason, then lessons learned).\\"}}"'`,
                    timeout: 5
                }
            ]
        }
    };
    return JSON.stringify(hooks, null, 2) + '\n';
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
