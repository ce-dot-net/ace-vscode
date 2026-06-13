# Changelog

All notable changes to ACE for VSCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.7.0 — ACE 1.5 Migration

### Added
- **F-080 feedback loop**: `retrieval_id` and `applied_log_ids` are now captured in execution traces, closing the reinforcement learning loop between retrieval and learning.
- **`session_id` and `task_intent` in search**: `searchPatterns()` now receives `session_id` and `task_intent` for bandit routing in ACE 1.5.
- **`isAtRisk` badge in search output**: Patterns with degraded reward signal now surface an at-risk badge; expanded neighbor patterns are shown alongside.
- **`reward_tier` and `cumulative_v15_reward_delta` in learn output**: Learn response now surfaces the pattern's reward tier and the delta from the latest trace.
- **`X-ACE-Project` header on config verify**: `/api/v1/config/verify` fetch now includes the `X-ACE-Project` header for server-side project scoping.

### Changed
- **`@ace-sdk/core` bumped to `^3.2.3`** — ACE 1.5 reward model and F-080 API surface.
- **`@ace-sdk/mcp` pinned to `^3.1.2`** in MCP spawn args — prevents unintended protocol drift across patch releases.
- **Reward vocabulary**: Trust Score percentage replaced with `cumulative_reward_total` and a tier bar (`reward_tier`) throughout status and learn output.
- **Pattern sorting**: `min_helpful: 1` filter removed; patterns are now sorted client-side by `cumulative_v15_reward` descending, surfacing highest-signal patterns first regardless of raw helpful count.
- **`AGENT_FILES_VERSION` bumped to `0.5.0`** — triggers the update prompt for users who already have the extension installed, delivering updated tool descriptions and `task_intent` schema.

## [0.6.4] - 2026-04-30

### Changed
- **`@ace-sdk/core` bumped to ^2.18.1** (from ^2.14.0). API surface for `getTopPatterns` is unchanged; bump pulls in upstream improvements to retry, error typing (`QuotaExceededError`, `TokenExpiredError`, etc.), and local cache utilities.
- **Status panel polling — proper SDK integration + cadence cut** —
  Replaced the raw `fetch` for top patterns with `client.getTopPatterns({ limit: 5, min_helpful: 1 })` from `@ace-sdk/core`. The SDK call brings retry, the `X-ACE-Client: copilot` header, full org/project resolution, and subscription-error handling — none of which the raw fetch had. The 0.6.3 path fix is preserved (`/patterns/top` via the SDK).
- **Poll interval 60s → 5 min**, and **only when the panel is visible** (the `setInterval` callback now skips if `panel.visible === false`). `/patterns/top` is not cheap server-side; visibility-gated polling keeps load proportional to user attention. Existing `onDidChangeViewState` already triggers an immediate refresh when the panel becomes visible, so users see fresh data instantly when they reopen the tab.

## [0.6.3] - 2026-04-30

### Fixed
- **Status panel polled wrong endpoint** — `src/ui/statusPanel.ts` issued `GET /top?limit=5&min_helpful=1` once per minute against the ACE API server, returning HTTP 404 every time (correct path is `/patterns/top`). Visible in server access logs as `node` user-agent, exact `:55` second alignment per minute (anchored to whenever the panel was first opened). Fixed by correcting the path. The SDK already exposes this via `client.getTopPatterns()`; statusPanel still uses a raw fetch for header parity with the adjacent `/analytics` call but now hits the correct route.

## [0.6.2] - 2026-04-30

### Fixed
- **README lockup invisible on Marketplace dark theme** — Shipped the *light* lockup variant (`05_logo_lockup_1200.png` — dark wordmark on transparent background) instead of the *dark* variant. On the Marketplace's dark page background the wordmark disappeared and only mint highlights remained as broken fragments. Swapped `resources/ace-lockup.png` to `06_logo_lockup_dark.png` (1200×330, solid `#0F0F12` background, theme-agnostic).

## [0.6.1] - 2026-04-30

### Fixed
- **Stop hook portability** — The Linux+macOS shell hook used BSD `stat -f` first then GNU `stat -c` as fallback. On Linux, `stat -f` exists but means *filesystem stats* (different semantics) and silently produced garbage instead of empty output, so the GNU fallback never ran and the most-recent-debug-log lookup failed. Replaced the dual-stat dance with portable `find -print0 | xargs -0 ls -t | head -n1`, which sorts by mtime correctly on both macOS and Linux. This unbreaks `Scenario A` of `stopHook.test.ts` in CI.

## [0.6.0] - 2026-04-30

### Added
- **VS Code 1.118 cycle integration** — extension now exploits four 1.116–1.118 surfaces to make the search/learn cycle stronger:
  - `context: fork` in `SKILL.md` frontmatter — skill runs in dedicated subagent context (1.118), pattern injection no longer pollutes main chat.
  - `vscode.window.onDidEndTerminalShellExecution` subscription (`src/automation/terminalWatcher.ts`) — nudges `ace_search` after successful build/test commands. Anchored regex + 60s cooldown to prevent spam.
  - `McpStdioServerDefinition.sandboxFilePermissions` (1.118) — ACE MCP can read `~/.config/ace/config.json` + `~/.ace/` under the new MCP sandbox defaults. Runtime-gated for back-compat.
  - `CancellationToken` wired into `AceLearnTool` — pre-invoke guard skips silently; late cancellation reports truthfully if the trace already committed.
- **Stop-hook upgraded** — `.github/hooks/ace-hooks.json` now parses the Copilot Agent Debug Log (1.116, `github.copilot.chat.agentDebugLog.fileLogging.enabled`) with session-id anchor as the primary `ace_learn` signal; falls back to transcript grep + last-assistant grep if log absent.
- **Tool confirmation polish (1.116 carousel)** — `confirmationMessages` added to `ace_search` and `ace_learn` so each carousel card has a clear title + one-sentence body.
- **Brand refresh** — new icon (256×256 Retina PNG) + README lockup banner; `galleryBanner` set to brand-black `#0F0F12` with `dark` theme. Logo files in `resources/`.
- **Marketplace metadata** — added `homepage` and `bugs.url` so the Resources rail on the listing populates properly.
- **New test suites** — `aceLearn.test.ts` (cancellation), `terminalWatcher.test.ts`, `stopHook.test.ts` (debug-log + fallback scenarios), `tools.manifest.test.ts` + golden fixture (cache-stability snapshot).

### Changed
- **Engine bumped to ^1.118.0** (from ^1.115.0). **Drops support for VS Code < 1.118** — users on older builds will not see the extension on the Marketplace.
- **`@types/vscode` ^1.118.0**.
- `ace_search` displayName: `"ACE Pattern Search"` → `"Search Patterns"` (carousel-friendly).
- `ace_learn` displayName: `"ACE Learn"` → `"Capture Learning"` (action-oriented).
- `aceLearn`: removed the post-await skip-result. If `storeExecutionTraceStream` resolved, the trace landed — late cancellation now reports the captured learning truthfully instead of lying with a "skipped" marker.
- `MCP_PROVIDER_LABEL` JSDoc trimmed to a single-line note about workspace `.mcp.json` collision risk.

### Fixed
- `terminalWatcher` regex was unanchored — would match commands like `npm runs-fine.sh` or `cmake`. Now anchored at start-of-line with word boundaries; added 60s cooldown so two `npm test` invocations within a minute don't double-fire the nudge.

## [0.5.3] - 2026-04-10

### Changed
- **@ace-sdk/core bumped to ^2.14.0** — CJS build + build-time version
- **Webpack config cleaned up** — Removed ESM workarounds (extensionAlias, javascript/auto rule, version.js stub)
  - Removed `ace-version-stub.js` (SDK no longer uses runtime readFileSync for version)
  - Removed ESM processing rule for @ace-sdk (CJS resolves natively)
  - Removed `extensionAlias` config (not needed with CJS)
  - Kept native module stubs (better-sqlite3, linguist-js, skott) until SDK makes them optional

## [0.5.2] - 2026-04-10

### Fixed
- **Login callback UI refresh** — After device code login completes, MCP provider and status bar now refresh immediately via `notifyAuthChanged()`. Previously required clicking the status bar to detect login.
- **Helpful score floating point** — Status panel now shows `Math.round()` for helpful/harmful totals instead of raw floats like `1632.649999999999`

## [0.5.1] - 2026-04-10

### Fixed
- **SDK version module stub** — Fix ENOENT crash where webpack baked CI build path (`/home/runner/work/...`) into the bundle. `@ace-sdk/core/dist/version.js` uses `readFileSync(__dirname)` which fails at runtime on user machines. Replaced with static version stub.

## [0.5.0] - 2026-04-10

### Added
- **Zero-friction hooks setup** — `configurationDefaults` sets `chat.hooks.enabled: true` automatically on install
- **Getting Started walkthrough** — 4-step onboarding: Sign In → Configure → Install Agents → First Search
  - Opens automatically on first install via `globalState` version detection
  - Steps auto-complete as user performs each action
- **Self-healing managed files** — `FileSystemWatcher` monitors `.github/` for deletions
  - If ace-hooks.json or agent files are deleted, prompts user to recreate
- **File decorations** — Green "A" badge on ACE-managed files in Explorer
  - Applies to: ace-hooks.json, ace.agent.md, ace-learn.agent.md, ace.instructions.md, SKILL.md
- **Extension version detection** — Uses `globalState` to detect first install vs update
  - First install: opens walkthrough
  - Update: shows status bar notification
- **39 new tests** — FileDecorations (13), FileWatcher (15), Package manifest (6), plus fixes

## [0.4.33] - 2026-04-10

### Added
- **Global hooks enforcement** — `ace_search` runs at session start, `ace_learn` enforced at session end for ALL agents
  - `.github/hooks/ace-hooks.json` generated by `ACE: Update Agent Files`
  - `SessionStart` hook injects mandatory ace_search context
  - `PostToolUse` hook detects domain shifts (directory changes) and suggests re-search
  - `Stop` hook checks transcript for ace_learn calls, blocks session if missing
  - Requires `chat.hooks.enabled: true` (VS Code 1.109+ Preview)
- **chatSkills contribution point** — Bundled `SKILL.md` inside extension VSIX (VS Code 1.109+ stable)
  - Copilot auto-loads skill on action keywords (implement, fix, build, debug, refactor)
  - No workspace file creation needed for skill delivery
- **MCP tool annotations** — `readOnlyHint: true` on ace_search, ace_status, ace_get_playbook
  - Read-only tools auto-approved (skip confirmation dialog)
  - ace_learn marked as `idempotentHint: true`
- **Hooks enablement prompt** — Extension prompts user to enable `chat.hooks.enabled` on activation
- **Domain shift detection** — PostToolUse hook detects when agent edits files in different directories
- **Continuous re-search guidance** — Instructions and skills tell model to re-search after 5+ tool calls, errors, or topic shifts
- **TIME_SAVED format** — ace_learn output starts with `TIME_SAVED: Xm | reason` for analytics
- **Client tracking** — `ACE_CLIENT_ID=copilot` env var + `X-ACE-Client: copilot` header (spec-05)

### Changed
- **Engine bumped to ^1.115.0** (from ^1.108.0)
- **@types/vscode bumped to ^1.115.0** (from ^1.108.0)
- **AGENT_FILES_VERSION bumped to 0.4.33** — triggers auto-update of workspace files
- **Agent files now include hooks/** directory in `.github/`

### Fixed
- **`user-invocable` typo** — Fixed `user-invokable` → `user-invocable` in ace.agent.md (VS Code 1.114 removed fallback)

## [0.4.32] - 2026-02-10

### Added
- **Hybrid MCP architecture** — Multi-agent support with enforcement
  - MCP server provider for ALL AI agents (Claude, Codex, Copilot)
  - Language Model Tools for Copilot-native verbose output
  - Agent-scoped hooks on ace.agent.md

## [0.4.31] - 2026-02-09

### Added
- **Upgrade button in quota warning**: Direct link to billing page when quota >80%
  - Quota warning popup now shows "Upgrade" and "View Status" buttons
  - Read-only mode and blocked account popups link to billing page
  - URL: `https://www.ace-ai.app/dashboard/settings?tab=billing`

## [0.4.30] - 2026-02-09

### Fixed
- **Org ID bug with device login tokens** (second fix): SDK was still extracting malformed org ID
  - Root cause: SDK checks `'orgId' in config`, not `default_org_id`
  - SDK line: `const orgId = 'orgId' in config ? config.orgId : this.extractOrgId(apiToken)`
  - Fix: Use `AceContext` type (has `orgId`) instead of `AceConfig` (has `default_org_id`)
  - Fixes 403 error: "User is not a member of organization user_Q8Q"

## [0.4.29] - 2026-02-09

### Fixed
- **Org ID bug with device login tokens**: SDK was extracting malformed org ID (`user_Q8Q`) from user tokens
  - Root cause: `AceConfig` uses `default_org_id`, not `orgId`
  - SDK's `extractOrgId()` fallback only works with legacy org tokens (`ace_org_xxx`)
  - Fix: Pass `default_org_id: projectConfig.orgId` to AceClient config (INCORRECT - see v0.4.30)
  - Fixes 403 error: "User is not a member of organization user_Q8Q"

## [0.4.28] - 2026-02-08

### Added
- **Session ID tracking for pattern attribution** (Issue #4)
  - `ace_search` now generates session ID and tracks pattern IDs
  - `ace_learn` retrieves `playbook_used` from session, linking to patterns consulted
  - Session automatically clears after learning capture
  - 4-hour TTL handles typical coding sessions
- **New sessionStorage service**: `src/services/sessionStorage.ts`
  - Per-workspace session isolation (multi-root workspace support)
  - In-memory storage (no SQLite dependency)
  - Exported functions: `generateSessionId`, `saveSession`, `getSession`, `clearSession`
- **TDD tests for sessionStorage**: Comprehensive test coverage (~200 lines)

### Changed
- `ace_search` output now shows `🔗 Session: sess_xxx (N patterns tracked)`
- `ace_learn` output now shows `📎 Linked to N patterns from previous search`
- Both tool handlers (`aceSearch.ts`, `aceLearn.ts`) and chat commands (`search.ts`, `learn.ts`) updated

### Fixed
- **Issue #4**: `playbook_used` is no longer empty - now populated with pattern IDs from search

## [0.4.27] - 2026-02-06

### Added
- **Auto-initialize agent files on install/update**: No more manual "Update Agent Files" button
  - First install: Auto-creates `.github/agents/`, `instructions/`, and `skills/` without prompt
  - Version upgrade: Auto-updates files silently when extension version changes
  - Shows non-blocking status bar notification instead of modal dialog
  - Respects user opt-out (version "0.0.0" in `.ace-version.json`)
  - Keep manual "Update Agent Files" command as fallback
- **Auto-save config on dropdown change**: No more "Save" button required
  - Config saves automatically when org/project dropdown selection changes
  - 500ms debounce prevents rapid-fire saves during browsing
  - Validates: both org AND project must be selected before saving
  - Shows subtle status bar confirmation instead of modal dialog
  - Manual "Save Configuration" button remains as fallback
- **TDD test coverage**: Comprehensive tests for both features
  - `src/test/suite/commands/updateAgents.test.ts` (970 lines)
  - `src/test/suite/ui/configPanel.autoSave.test.ts` (991 lines)

### Changed
- **Agent file frontmatter** (VS Code 1.109): Added `user-invokable: true` to ace-expert agent
- **Status bar notifications**: Use `setStatusBarMessage()` for non-blocking UX

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
