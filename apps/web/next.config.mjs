/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@fmksa/ui'],
  // TODO(phase 1.3): add experimental.typedRoutes when tRPC routers land
};

export default nextConfig;
