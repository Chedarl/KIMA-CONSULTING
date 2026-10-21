/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Every route lives under /[locale]. French is the default for Cameroon.
  async redirects() {
    return [{ source: "/", destination: "/fr", permanent: false }];
  },
};

export default nextConfig;
