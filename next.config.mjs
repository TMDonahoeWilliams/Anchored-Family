/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  // Set turbopack root to silence workspace warning
  turbopack: {
    root: process.cwd()
  }
};
export default nextConfig;
