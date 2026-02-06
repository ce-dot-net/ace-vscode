# ACE for VS Code

> 🔐 **Account Required** - This extension requires an ACE account to work.
>
> **[→ Sign up for ACE](https://ace-ai.app)** | **[💬 Join our Community](https://www.ace-ai.app/community)**
>
> Without an account, the extension cannot connect to the ACE server.

**Automatic Context Engine** - Pattern learning for GitHub Copilot that captures what works and retrieves it when needed.

By [Code Engine GmbH](https://ace-ai.app)

## Features

- 🤖 **@ace Chat Participant** - Ask Copilot to search patterns, capture learning, and more
- 🔧 **Language Model Tools** - `ace_search`, `ace_learn`, `ace_status`, `ace_get_playbook`
- 🔐 **Browser-based login** - Secure device code authentication (no API tokens to copy)
- 📁 **Multi-Root Workspace Support** - Each folder gets its own ACE configuration
- 📊 **Status Panel** - Real-time playbook statistics with session expiry info
- ⚙️ **Configure Panel** - Easy server and project setup with login support
- 🤖 **Agent Files** - Generate `.github/agents/` for CI/CD AI assistants

## Quick Start

> **Step 1 is required** - The extension won't work without an ACE account!

1. **[Sign up for ACE](https://ace-ai.app)** - Create your account (required!)
2. **Install** from VS Code Extensions marketplace
3. **Open Command Palette** (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux)
4. **Run** `ACE: Configure` - opens setup panel
5. **Click "Login with Browser"** - authenticates via your browser
6. **Select your organization and project**
7. **Run** `ACE: Update Agent Files` - generates `.github/agents/` for CI/CD AI assistants
8. **Start using @ace** in GitHub Copilot Chat!

## Commands

| Command | Description |
|---------|-------------|
| **ACE: Login** | Login via browser-based device code authentication |
| **ACE: Logout** | Logout and clear authentication tokens |
| **ACE: Configure** | Opens webview panel to login, select organization/project |
| **ACE: Show Playbook Status** | Opens webview panel showing playbook statistics |
| **ACE: Bootstrap Playbook** | Initialize patterns from existing codebase (git history, docs) |
| **ACE: Capture Learning** | Manually trigger learning capture |
| **ACE: Clear Playbook** | Clear all learned patterns |
| **ACE: Update Agent Files** | Generate/update `.github/agents/` files |
| **ACE: Quick Actions** | Quick access to common ACE actions |

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

| Command | Description |
|---------|-------------|
| `@ace /search <query>` | Search for relevant patterns in the playbook |
| `@ace /patterns [section]` | View playbook patterns by section |
| `@ace /status` | Show playbook statistics |
| `@ace /learn` | Capture patterns from the current session |
| `@ace /top` | Show highest-rated patterns |
| `@ace /domains` | List available pattern domains |
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

### SSE Streaming (v0.4.23+)

Learn and Bootstrap operations now use Server-Sent Events (SSE) for real-time progress:
- **`/learn`** → Uses `/traces/stream` endpoint with live progress messages
- **`/bootstrap`** → Uses `/bootstrap/stream` endpoint with live progress messages
- Automatic fallback to non-streaming endpoints if SSE is not supported

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

## Agent Files (v0.4.16+)

ACE generates GitHub Copilot agent files for automatic pattern learning. Run `ACE: Update Agent Files` to create:

```
.github/
├── instructions/ace.instructions.md  # Path-specific (won't overwrite your copilot-instructions.md)
├── skills/ace-pattern-learning/SKILL.md  # Agent Skill for auto-trigger
├── agents/ace.agent.md  # ace-expert agent (PRIMARY)
├── agents/ace-learn.agent.md  # Learning capture agent
└── .ace-version.json  # Version tracking
```

### Agent Skills

**Agent Skills** are auto-triggered by Copilot based on your prompt. When you type keywords like "implement", "build", "fix", or "debug", Copilot automatically loads ACE patterns before starting work.

### ace-expert Agent (Recommended)

For **guaranteed** pattern retrieval, select **ace-expert** as your agent in Copilot Chat. This ensures ACE tools are always available.

## Configuration

### Workspace Settings

Configure in VS Code Settings (`Cmd+,`) or `.vscode/settings.json`:

| Setting | Description | Default |
|---------|-------------|---------|
| `ace.projectId` | ACE Project ID (format: prj_xxxxx) | `""` |
| `ace.orgId` | ACE Organization ID (format: org_xxxxx) | `""` |
| `ace.serverUrl` | ACE API Server URL | `https://ace-api.code-engine.app` |
| `ace.automation.level` | Automation level: manual, smart, aggressive | `smart` |
| `ace.automation.showStatusBar` | Show ACE status in status bar | `true` |

## Requirements

- VS Code (v1.105.0+)
- GitHub Copilot Chat extension
- ACE account at [ace-ai.app](https://ace-ai.app)

## Support & Community

Need help? Have questions? Join our community!

- **[💬 Slack Community](https://www.ace-ai.app/community)** - Chat with the team and other users
- **[📖 Documentation](https://ace-ai.app/docs)** - Guides and API reference
- **[🐛 Report Issues](https://github.com/ce-dot-net/ace-vscode/issues)** - Bug reports and feature requests

## Links

- [ACE Website](https://ace-ai.app)
- [Community & Support](https://www.ace-ai.app/community)
- [Documentation](https://ace-ai.app/docs)
- [GitHub](https://github.com/ce-dot-net/ace-vscode)
- [Report Issues](https://github.com/ce-dot-net/ace-vscode/issues)

## License

MIT - Code Engine GmbH
