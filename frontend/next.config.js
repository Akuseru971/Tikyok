/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backendBaseUrl = process.env.BACKEND_URL
      || process.env.NEXT_PUBLIC_API_BASE_URL
      || (process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : '');

    if (!backendBaseUrl) {
      return [];
    }

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
