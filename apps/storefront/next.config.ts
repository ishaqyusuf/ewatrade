import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@ewatrade/db",
    "@ewatrade/email",
    "@ewatrade/jobs",
    "@ewatrade/notifications",
    "@ewatrade/ui",
    "@ewatrade/utils"
  ]
}

export default nextConfig
