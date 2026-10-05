/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: { '/**': ['./data/kr-bench.json', './data/us-bench.json', './data/kr-corps.json'] },
};
export default nextConfig;
