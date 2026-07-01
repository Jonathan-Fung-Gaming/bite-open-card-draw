/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": ["./data/source/charts.csv"],
  },
};

export default nextConfig;
