/**
 * Stub for skott (optional SDK dependency)
 * Used for dependency analysis - not needed for core ACE functionality
 */
module.exports = async function skott() {
    return { getStructure: () => ({ graph: {}, files: [] }) };
};
