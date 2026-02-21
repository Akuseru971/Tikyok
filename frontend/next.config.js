/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backendBaseUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

    return [
      {
        source: '/api/:path*',
        destination: `${backendBaseUrl}/api/:path*`
      },
      {
        source: '/downloads/:path*',
        destination: `${backendBaseUrl}/downloads/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
