import type { NextConfig } from "next"

function getApiOrigin() {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:3095"
  ).replace(/\/$/, "")
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/trpc/:path*",
        destination: `${getApiOrigin()}/api/trpc/:path*`,
      },
    ]
  },
  transpilePackages: [
    "@ewatrade/api",
    "@ewatrade/db",
    "@ewatrade/email",
    "@ewatrade/jobs",
    "@ewatrade/notifications",
    "@ewatrade/ui",
    "@ewatrade/utils",
  ],
}

export default nextConfig
