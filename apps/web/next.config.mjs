/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@fmksa/ui', '@fmksa/core', '@fmksa/db', '@fmksa/contracts'],
};

export default nextConfig;
