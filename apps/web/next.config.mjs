/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@fmksa/ui', '@fmksa/core', '@fmksa/db', '@fmksa/contracts'],
  // Prevent Next.js from bundling Prisma — the engine binary must be
  // resolved at runtime from node_modules (pnpm monorepo).
  serverExternalPackages: ['@prisma/client', 'prisma'],
  // ESLint is already a dedicated CI job (`pnpm turbo run lint`). Running
  // it a second time inside `next build` turns every lint error into a
  // build failure, which muddies the signal — build and lint should fail
  // independently so we can tell which is broken. The Lint job remains
  // authoritative.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
