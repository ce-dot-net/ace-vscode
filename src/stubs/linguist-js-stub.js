/**
 * Stub for linguist-js (optional SDK dependency)
 * Used for language detection - not needed for core ACE functionality
 */
module.exports = async function linguist() {
    return { languages: {}, files: {} };
};
