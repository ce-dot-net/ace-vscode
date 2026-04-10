// Stub for @ace-sdk/core/dist/version.js
// The real module reads package.json via readFileSync which fails when webpack bundles
// the absolute CI build path. This stub provides the version string directly.
export const CORE_VERSION = '2.13.2';
