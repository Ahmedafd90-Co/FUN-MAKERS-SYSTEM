/**
 * ESLint config for Next.js apps. Adds the Next.js Core Web Vitals + TypeScript
 * rule sets on top of the shared base.
 */
module.exports = {
  root: false,
  extends: [
    './base.cjs',
    'next/core-web-vitals',
    'next/typescript',
  ],
};
