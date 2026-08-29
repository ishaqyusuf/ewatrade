import { shouldUploadSourceMaps } from "@ewatrade/observability"
import { withSentryConfig } from "@sentry/nextjs"
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
  transpilePackages: [
    "@ewatrade/api",
    "@ewatrade/db",
    "@ewatrade/errors",
    "@ewatrade/observability",
    "@ewatrade/ui",
    "@ewatrade/utils",
  ],
  async rewrites() {
    return [
      {
        source: "/api/trpc/:path*",
        destination: `${getApiOrigin()}/api/trpc/:path*`,
      },
      {
        source: "/api/prescriptions/media/:path*",
        destination: `${getApiOrigin()}/api/prescriptions/media/:path*`,
      },
    ]
  },
}

const uploadSourceMaps = shouldUploadSourceMaps({
  authToken: process.env.SENTRY_AUTH_TOKEN,
  deploymentEnvironment: process.env.APP_ENV,
  dsn: process.env.SENTRY_DSN,
  nodeEnvironment: process.env.NODE_ENV,
  organization: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  release: process.env.SENTRY_RELEASE,
})

export default uploadSourceMaps
  ? withSentryConfig(nextConfig, {
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      release: { name: process.env.SENTRY_RELEASE },
      silent: true,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      widenClientFileUpload: true,
    })
  : nextConfig
