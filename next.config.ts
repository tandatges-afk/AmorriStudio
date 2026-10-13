import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Preserve every old delivery/staff link and all feature-complete legacy flows.
  // New pages are React/TypeScript; existing operations continue at /studio.
  async rewrites() {
    return [{ source: '/studio', destination: '/legacy/index.html' }];
  },
  async headers() {
    return [
      { source: '/assets/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] },
      { source: '/:path*', headers: [
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
      ] }
    ];
  }
};
export default nextConfig;
