import type { NextConfig } from "next"

function getApiOrigin() {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.EWATRADE_API_URL ??
    "http://localhost:3095"
  ).replace(/\/$/, "")
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@ewatrade/api",
    "@ewatrade/db",
    "@ewatrade/email",
    "@ewatrade/jobs",
    "@ewatrade/notifications",
    "@ewatrade/notifications-react",
    "@ewatrade/ui",
    "@ewatrade/utils",
  ],
  async rewrites() {
    return [
      {
        source: "/api/trpc/:path*",
        destination: `${getApiOrigin()}/api/trpc/:path*`,
      },
    ]
  },
}

export default nextConfig
