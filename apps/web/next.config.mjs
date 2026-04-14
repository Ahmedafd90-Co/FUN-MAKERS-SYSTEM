/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@fmksa/ui', '@fmksa/core', '@fmksa/db', '@fmksa/contracts'],
  // Prevent Next.js from bundling Prisma — the engine binary must be
  // resolved at runtime from node_modules (pnpm monorepo).
  serverExternalPackages: ['@prisma/client', 'prisma'],
};

export default nextConfig;
