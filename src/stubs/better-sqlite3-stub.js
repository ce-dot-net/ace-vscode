/**
 * Stub for better-sqlite3 native module
 * The @ace-sdk/core SDK gracefully falls back to RAM-only cache when SQLite unavailable
 * This stub ensures the extension can load without the native module
 */
class Database {
    constructor() {
        throw new Error('SQLite not available in VSCode extension environment');
    }
}

module.exports = Database;
