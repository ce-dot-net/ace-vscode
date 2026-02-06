# Changelog

All notable changes to ACE for VSCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.26] - 2026-02-06

### Added
- **Community & Support section in README**: Prominent link to Slack community
  - Added `[💬 Join our Community](https://www.ace-ai.app/community)` next to signup
  - New "Support & Community" section with Slack, docs, and issue links
  - Updated Links section with community link

### Changed
- **VS Code requirement in README**: Updated from v1.102.0+ to v1.105.0+ to match package.json

## [0.4.25] - 2026-02-05

### Added
- **Chat participant disambiguation**: Auto-routes to `@ace` without explicit mention
  - Categories: `pattern_search`, `pattern_learning`, `troubleshooting`
  - Examples help Copilot identify ACE-related queries
  - Requires VS Code ^1.105.0 (October 2025)
- **Quota/usage callbacks from @ace-sdk/core**:
  - `onUsageUpdate`: Tracks usage for status bar tooltip
  - `onQuotaWarning`: Shows notification when >80% quota used
  - `onReadOnlyMode`: Warns when quota exceeded with upgrade link
  - `onAccountBlocked`: Shows error with account management link
- **New configuration options**:
  - `ace.features.showQuotaWarnings`: Enable/disable quota warning notifications (default: true)
  - `ace.features.showUsageInStatusBar`: Show usage % in status bar tooltip (default: false)

### Changed
- **Minimum VS Code version**: Bumped from ^1.102.0 to ^1.105.0 for disambiguation support
- **Tool descriptions optimized for auto-invocation**:
  - `ace_search`: Now says "MANDATORY" and "ALWAYS call this first"
  - `ace_learn`: Now says "MANDATORY" and "ALWAYS call this AFTER"
- **Agent frontmatter updated** (VS Code 1.109):
  - Added `user-invokable: true` to ace-expert agent

### Research
- Investigated VS Code 1.109 features (see PLAN-DomainMonitor-chatContextProvider-Research.md)
- `chatContextProvider` API still PROPOSED - not yet available
- Agent Skills (SKILL.md) is GA and working well
- Org-level skills "coming soon" from GitHub

## [0.4.24] - 2026-02-05

### Fixed
- **Organizations not showing after login**: Call `refreshOrganizations()` after device login to sync orgs from server
  - Login response may return empty organizations array for new users before Clerk sync
  - Now explicitly refreshes via `/api/v1/auth/me` endpoint after successful login
  - Matches ace-cursor fix (commit 42c257d)

### Changed
- Updated `@ace-sdk/core` to `^2.9.3`

## [0.4.23] - 2026-02-03

### Added
- **SSE Streaming for Learn and Bootstrap**: Real-time progress updates via Server-Sent Events
  - `/learn` now uses `/traces/stream` endpoint with live progress messages
  - `/bootstrap` now uses `/bootstrap/stream` endpoint with live progress messages
  - Automatic fallback to non-streaming endpoints if SSE fails
- **Config fallback to global config**: `getProjectConfig()` now reads from `~/.config/ace/config.json` as fallback
  - Supports `projectId` from global config
  - Supports `orgId` from multiple locations: `default_org_id`, `auth.default_org_id`, `auth.organizations[0].org_id`

### Changed
- **Device login only**: Removed legacy org token (`apiToken`) support entirely
  - Authentication now requires device login via browser
  - `aceClient.ts` uses `loadUserAuth()` from SDK exclusively
  - `config.ts` `isGloballyConfigured()` uses `isAuthenticated()` from SDK
- **Auto-open browser on login**: Browser opens automatically when device code is received
- **Quick actions**: Shows "Login to ACE" instead of "Configure" when not authenticated
- Updated `@ace-sdk/core` to support streaming APIs

### Fixed
- **Status bar badge showing "?"**: Was using legacy token path, now properly uses device login token
- **Config not found**: Now falls back to global config file for projectId/orgId

### Breaking Changes
- Legacy `apiToken` configuration no longer works - must use device login

## [0.4.18] - 2025-12-23

### Added
- **Domain listing command**: `/domains` shows available domains with pattern counts
  - Lists all domains grouped by size (Major/Medium/Small)
  - Sorted by pattern count descending
  - Shows domain names for use with filtering
- **Domain-filtered search**: Filter search results by domain
  - `/search <query> --allowed-domains <domain1,domain2>` (whitelist)
  - `/search <query> --blocked-domains <domain1,domain2>` (blacklist)
  - `ace_search` tool supports `allowed_domains` and `blocked_domains` parameters
- **Domain stats in status**: `/status` now shows top 5 domains with pattern counts
- **New PlaybookStats fields**: `by_domain`, `helpful_total`, `harmful_total`
- **Domain-aware workflow instructions**: Updated instructions and SKILL.md with domain filtering examples

### Changed
- Updated `@ace-sdk/core` from ^2.2.0 to ^2.3.1
- Agent files version bumped to 0.4.18 (will prompt for update)
- Instructions now include domain discovery and filtering workflow

### Closes
- Issue #7: feat: Support domain listing via PlaybookStats.by_domain (core v2.3.1)

## [0.4.17] - 2025-12-22

### Added
- **Mid-conversation re-search guidance**: Instructions now tell Copilot to call `ace_search` again when topics change
  - Detects topic shifts (auth → caching, API → database, etc.)
  - Examples: "Now let's add caching", "I'm getting a database error", "How do I deploy this?"
- Enhanced SKILL.md with multi-turn conversation workflow example

### Changed
- Agent files version bumped to 0.4.17 (will prompt for update)

## [0.4.16] - 2025-12-21

### Added
- **Agent Skills support**: New `.github/skills/ace-pattern-learning/SKILL.md`
  - Copilot auto-triggers skill based on user prompt (implement, build, fix, etc.)
  - Compatible with Claude Code `.claude/skills/` directory
  - Model-invoked: Copilot decides when to use the skill
- **Path-specific instructions**: New `.github/instructions/ace.instructions.md`
  - Uses `applyTo: "**/*"` frontmatter for all files
  - Does NOT overwrite user's `copilot-instructions.md`
- **Migration logic**: Safely migrates legacy `copilot-instructions.md`
  - Detects ACE content in existing file
  - Removes only ACE-created content, preserves user content

### Changed
- **New folder structure** for v0.4.16:
  ```
  .github/
  ├── instructions/ace.instructions.md  # NEW: path-specific
  ├── skills/ace-pattern-learning/SKILL.md  # NEW: Agent Skill
  ├── agents/ace.agent.md  # ace-expert (PRIMARY)
  └── agents/ace-learn.agent.md
  ```
- Agent files version bumped to 0.4.16 (will prompt for update)
- No longer overwrites user's `copilot-instructions.md`

### Fixed
- Issue: ACE was overwriting user's custom instructions in `copilot-instructions.md`

## [0.4.15] - 2025-12-16

### Fixed
- Issue #5 root cause fix: Removed `execute/runInTerminal` from ace-expert agent
  - **Root cause**: Having terminal tool made model prefer heredocs for multiline content
  - **Fix**: Remove terminal tool entirely - model now uses `edit/editFiles` for all file content
  - Removed `web/fetch` tool (not essential for pattern learning workflow)
  - Simplified agent instructions (no terminal style guidance needed)

### Changed
- Agent files version bumped to 0.4.15 (will prompt for update)
- ace-expert now has 8 tools instead of 10 (focused on coding + ACE patterns)

## [0.4.14] - 2025-12-16

### Added
- Issue #2: Git integration now captures changed file names (not just count)
- Updated @ace-sdk/core to v2.2.0

### Fixed
- Issue #3: Configuration settings now support folder-level scope for multi-root workspaces
- Issue #5: Agent files now instruct Copilot to avoid heredoc syntax in terminal commands

### Changed
- Agent files version bumped to 0.4.14 (will prompt for update)

## [0.4.13] - 2025-12-16

### Fixed
- Multi-root workspace: Now detects folder switches and updates context
- Shows configuration popup when switching to unconfigured folder
- Status bar updates per-folder configuration state

### Added
- `src/automation/workspaceMonitor.ts` - Real-time workspace folder monitoring

## [0.4.12] - 2025-12-15

### Changed
- Renamed extension to "ACE for GitHub Copilot"

## [0.4.11] - 2025-12-15

### Changed
- Renamed extension to "ACE for VS Code" (name was taken)

## [0.4.10] - 2025-12-15

### Added
- README.md for VS Code Marketplace
- GitHub Actions workflow for auto-publishing
- Comprehensive .gitignore and .vscodeignore
- Documentation for ace-expert agent mode

## [0.4.9] - 2025-12-15

### Added
- **Multi-Root Workspace Support**: Each folder in multi-root workspaces now gets its own ACE configuration
  - Config panel shows folder name in title and header
  - Per-folder settings saved to `.vscode/settings.json`
  - Folder picker in multi-root workspaces
- `src/utils/workspaceUtils.ts` - Folder detection utilities
- `src/chat/utils/chatContext.ts` - Chat context with folder awareness

### Changed
- All chat commands now folder-aware (patterns, search, status, learn, top, clear, bootstrap)
- `getAceClient()` now returns per-folder cached clients
- Config panel accepts optional folder parameter

## [0.4.8] - 2025-12-15

### Added
- Agent files version tracking in `.github/.ace-version.json`
- Smart update prompts only when version changes

## [0.4.7] - 2025-12-15

### Fixed
- Status panel button styling

## [0.4.6] - 2025-12-15

### Fixed
- Config panel persistence bug

## [0.4.5] - 2025-12-11

### Added
- Initial public release
- @ace chat participant for GitHub Copilot
- ACE tools: ace_search, ace_learn, ace_status, ace_get_playbook
- Configuration panel with server connection
- Agent files generation (.github/agents/)
