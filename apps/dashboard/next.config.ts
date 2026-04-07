import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ewatrade/db", "@ewatrade/ui", "@ewatrade/utils"],
}

export default nextConfig
