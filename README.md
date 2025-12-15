# ACE for VS Code

> 🔐 **CLOSED BETA** - This extension requires an ACE account to work.
>
> **[→ Join the Waitlist](https://ace.code-engine.app/waitlist)** to get your API token and start using ACE.
>
> Without an account, the extension cannot connect to the ACE server.

**Automatic Context Engine** - Pattern learning for GitHub Copilot that captures what works and retrieves it when needed.

By [Code Engine GmbH](https://ace.code-engine.app)

## Features

- 🤖 **@ace Chat Participant** - Ask Copilot to search patterns, capture learning, and more
- 🔧 **Language Model Tools** - `ace_search`, `ace_learn`, `ace_status`, `ace_get_playbook`
- 📁 **Multi-Root Workspace Support** - Each folder gets its own ACE configuration
- 📊 **Status Panel** - Real-time playbook statistics
- ⚙️ **Configure Panel** - Easy server and project setup
- 🤖 **Agent Files** - Generate `.github/agents/` for CI/CD AI assistants

## Quick Start

> **Step 1 is required** - The extension won't work without an ACE account!

1. **[Sign up for ACE](https://ace.code-engine.app/waitlist)** - Get your API token (required!)
2. **Install** from VS Code Extensions marketplace
3. **Open Command Palette** (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux)
4. **Run** `ACE: Configure` - opens setup panel
5. **Enter your credentials** and select your project
6. **Run** `ACE: Update Agent Files` - generates `.github/agents/` for CI/CD AI assistants
7. **Start using @ace** in GitHub Copilot Chat!

## Using ACE with Copilot

### Agent Mode (Recommended)

For **automatic pattern retrieval** before tasks, select the **ace-expert** agent in Copilot Chat:

1. Open GitHub Copilot Chat (`Cmd+I` or `Ctrl+I`)
2. Click the **agent selector** dropdown (top of chat panel)
3. Select **ace-expert** from the list
4. Start coding - ACE tools are now available to Copilot automatically!

When `ace-expert` is selected, Copilot can automatically call `ace_search` before implementing and `ace_learn` after completing work.

### Chat Commands

Alternatively, use `@ace` commands directly in any Copilot chat:

## @ace Chat Participant

Use the `@ace` chat participant in GitHub Copilot Chat:

| Command | Description |
|---------|-------------|
| `@ace /search <query>` | Search for relevant patterns in the playbook |
| `@ace /patterns [section]` | View playbook patterns by section |
| `@ace /status` | Show playbook statistics |
| `@ace /learn` | Capture patterns from the current session |
| `@ace /top` | Show highest-rated patterns |
| `@ace /bootstrap` | Initialize playbook from codebase |
| `@ace /clear --confirm` | Clear all patterns |

## Language Model Tools

ACE provides 4 tools that GitHub Copilot can use automatically:

| Tool | Description |
|------|-------------|
| `ace_search` | Search playbook for relevant patterns before implementing |
| `ace_learn` | Capture patterns and lessons learned from work |
| `ace_status` | Show playbook statistics |
| `ace_get_playbook` | Retrieve patterns filtered by section or quality |

## Commands

| Command | Description |
|---------|-------------|
| **ACE: Configure** | Opens webview panel to configure server URL, API token, and select project |
| **ACE: Show Playbook Status** | Opens webview panel showing playbook statistics |
| **ACE: Bootstrap Playbook** | Initialize patterns from existing codebase (git history, docs) |
| **ACE: Capture Learning** | Manually trigger learning capture |
| **ACE: Clear Playbook** | Clear all learned patterns |
| **ACE: Update Agent Files** | Generate/update `.github/agents/` files |
| **ACE: Quick Actions** | Quick access to common ACE actions |

## How It Works

ACE creates a self-improving learning cycle where each session benefits from previous work:

| Step | Action | Description |
|:----:|--------|-------------|
| 🚀 | **Start Task** | You begin work in VS Code |
| ⬇️ | | |
| 📖 | **Retrieve Patterns** | Copilot calls `ace_search` → Fetches learned strategies |
| ⬇️ | | |
| ⚡ | **Execute** | Copilot completes task using patterns |
| ⬇️ | | |
| 💡 | **Capture Learning** | Copilot calls `ace_learn` → Playbook grows smarter |
| ⬇️ | | |
| 🔄 | **Next Session** | Enhanced patterns available → Back to Start! |

## Playbook Sections

1. **strategies_and_hard_rules** - Architectural patterns, coding principles
2. **useful_code_snippets** - Reusable code patterns with context
3. **troubleshooting_and_pitfalls** - Known issues, gotchas, solutions
4. **apis_to_use** - Recommended libraries, frameworks, integration patterns

## Multi-Root Workspace Support

In multi-root workspaces, each folder can have its own ACE configuration:

- Config panel shows folder name in title and header
- Per-folder settings saved to `.vscode/settings.json`
- Folder picker appears when multiple folders are open
- All chat commands are folder-aware

## Configuration

### Workspace Settings

Configure in VS Code Settings (`Cmd+,`) or `.vscode/settings.json`:

| Setting | Description | Default |
|---------|-------------|---------|
| `ace.projectId` | ACE Project ID (format: prj_xxxxx) | `""` |
| `ace.orgId` | ACE Organization ID (format: org_xxxxx) | `""` |
| `ace.serverUrl` | ACE API Server URL | `https://ace-api.code-engine.app` |
| `ace.automation.level` | Automation level: manual, smart, aggressive | `smart` |
| `ace.automation.minEditsBeforeSuggest` | Minimum edits before suggesting learning | `10` |
| `ace.automation.idleMinutesBeforeSuggest` | Idle minutes before suggesting learning | `3` |
| `ace.automation.showStatusBar` | Show ACE status in status bar | `true` |
| `ace.automation.gitAutoCapture` | Auto-suggest learning on commits | `false` |

## Agent Files

ACE can generate `.github/agents/` files for CI/CD AI assistants. Run `ACE: Update Agent Files` to create:

- `.github/agents/ace-playbook.md` - Playbook patterns for AI agents
- `.github/.ace-version.json` - Version tracking for smart updates

## Requirements

- VS Code (v1.102.0+)
- GitHub Copilot Chat extension
- ACE account at [ace.code-engine.app](https://ace.code-engine.app)
- API token from the ACE dashboard

## Links

- [ACE Website](https://ace.code-engine.app)
- [Documentation](https://ace.code-engine.app/docs)
- [GitHub](https://github.com/ce-dot-net/ace-vscode)
- [Report Issues](https://github.com/ce-dot-net/ace-vscode/issues)

## License

MIT - Code Engine GmbH
