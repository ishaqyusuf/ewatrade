import { shouldUploadSourceMaps } from "@ewatrade/observability"
import { withSentryConfig } from "@sentry/nextjs"
import type { NextConfig } from "next"
import { resolveStorefrontApiOrigin } from "./src/lib/api-origin"
import { resolveStorefrontAllowedDevOrigins } from "./src/lib/dev-origins"

function getApiOrigin() {
  return resolveStorefrontApiOrigin({
    apiUrl: process.env.API_URL,
    publicApiUrl: process.env.NEXT_PUBLIC_API_URL,
  })
}

const nextConfig: NextConfig = {
  allowedDevOrigins:
    process.env.NODE_ENV === "production"
      ? undefined
      : resolveStorefrontAllowedDevOrigins(
          process.env.STOREFRONT_ALLOWED_DEV_ORIGINS,
        ),
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
    "@ewatrade/events",
    "@ewatrade/api",
    "@ewatrade/db",
    "@ewatrade/email",
    "@ewatrade/errors",
    "@ewatrade/jobs",
    "@ewatrade/notifications",
    "@ewatrade/observability",
    "@ewatrade/ui",
    "@ewatrade/utils",
  ],
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
