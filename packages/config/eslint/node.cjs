/**
 * ESLint config for pure Node.js / server packages. Currently a thin alias over
 * the shared base so we have a dedicated extension point later (e.g., worker
 * packages may need to relax `no-console`).
 */
module.exports = {
  root: false,
  extends: ['./base.cjs'],
};
