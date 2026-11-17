/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      '/**': ['./data/**/*', './backups/snapshots/**/*'],
    },
  },
};

export default nextConfig;
