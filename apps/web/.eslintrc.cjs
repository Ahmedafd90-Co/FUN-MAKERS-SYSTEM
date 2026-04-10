/**
 * ESLint (legacy) normalizes scoped `extends` names like `@scope/pkg/sub/path`
 * into `@scope/eslint-config-pkg/sub/path`, which doesn't match our workspace
 * package `@fmksa/config`. Resolve the exports-map path via Node first so
 * ESLint receives an absolute file path and skips its naming normalization.
 */
const nextjsConfigPath = require.resolve('@fmksa/config/eslint/nextjs');

module.exports = {
  root: true,
  extends: [nextjsConfigPath],
};
