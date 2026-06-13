/**
 * Stub for better-sqlite3 native module (@ace-sdk/core 3.x graph cache).
 *
 * In-process SDK path (AceSearchTool, AceLearnTool): RAM-only cache.
 *   - SearchResponseWithMetadata.expanded will always be empty.
 *   - No ~/.ace-cache/<org>__<project>.db is written.
 *
 * MCP subprocess path (npx @ace-sdk/mcp): full SQLite graph cache active.
 *   - better-sqlite3 is available in the npx-installed node_modules.
 *   - Graph cache is populated on searchPatterns() calls through the MCP path.
 *
 * This stub is intentional. Do not remove it.
 */
class Database {
    constructor() {
        throw new Error('SQLite not available in VSCode extension environment');
    }
}

module.exports = Database;
