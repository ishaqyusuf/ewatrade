import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ewatrade/ui", "@ewatrade/utils"]
}

export default nextConfig
