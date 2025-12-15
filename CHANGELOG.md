# Changelog

All notable changes to ACE for VSCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
