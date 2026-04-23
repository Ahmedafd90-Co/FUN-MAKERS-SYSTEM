/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@fmksa/ui', '@fmksa/core', '@fmksa/db', '@fmksa/contracts'],
  // Prevent Next.js from bundling Prisma — the engine binary must be
  // resolved at runtime from node_modules (pnpm monorepo).
  serverExternalPackages: ['@prisma/client', 'prisma'],
  // ESLint runs as its own CI job (pnpm turbo run lint). Running it again
  // inside `next build` turns every lint error into a build failure, which
  // muddies the signal — Build and Lint should fail independently.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
