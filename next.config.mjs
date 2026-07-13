/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": ["./data/source/charts.csv"],
  },
};

export default nextConfig;
