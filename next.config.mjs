const nextConfig = {
  output: 'export',
  trailingSlash: true,
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true },
  productionBrowserSourceMaps: false,
  experimental: { cpus: 2 }
};
export default nextConfig;
