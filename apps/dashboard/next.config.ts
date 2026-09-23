import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { shouldUploadSourceMaps } from "@ewatrade/observability"
import { withSentryConfig } from "@sentry/nextjs"
import type { NextConfig } from "next"

const appRoot = dirname(fileURLToPath(import.meta.url))

function isInternalQaBuild(env = process.env) {
  const variant = (env.APP_ENV ?? env.NODE_ENV ?? "production").toLowerCase()
  return (
    env.QA_ACCELERATOR_ENABLED === "true" &&
    new Set(["local", "dev", "development", "preview"]).has(variant)
  )
}

function getApiOrigin() {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:3095"
  ).replace(/\/$/, "")
}

export function getDashboardApiRewrites(apiOrigin = getApiOrigin()) {
  return [
    {
      source: "/api/trpc/:path*",
      destination: `${apiOrigin}/api/trpc/:path*`,
    },
    {
      source: "/api/prescriptions/media/:path*",
      destination: `${apiOrigin}/api/prescriptions/media/:path*`,
    },
    {
      source: "/api/service-commerce/media/:path*",
      destination: `${apiOrigin}/api/service-commerce/media/:path*`,
    },
  ]
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Vercel's basic build machine repeatedly exhausts memory in Next's
  // duplicate type-check worker. CI/package type checks remain authoritative.
  typescript: { ignoreBuildErrors: process.env.VERCEL === "1" },
  transpilePackages: [
    "@ewatrade/events",
    "@ewatrade/api",
    "@ewatrade/db",
    "@ewatrade/errors",
    "@ewatrade/observability",
    "@ewatrade/ui",
    "@ewatrade/utils",
  ],
  async rewrites() {
    return getDashboardApiRewrites()
  },
  webpack(config, { webpack }) {
    if (!isInternalQaBuild()) {
      const replacements: Array<[RegExp, string]> = [
        [
          /[\\/]components[\\/]qa[\\/]fixture-recipes(?:\.[cm]?[jt]sx?)?$/,
          resolve(appRoot, "src/components/qa/fixture-recipes.production.ts"),
        ],
        [
          /[\\/]components[\\/]qa[\\/]qa-quick-fill(?:\.[cm]?[jt]sx?)?$/,
          resolve(appRoot, "src/components/qa/qa-quick-fill.production.tsx"),
        ],
      ]
      for (const [pattern, replacement] of replacements) {
        config.plugins.push(
          new webpack.NormalModuleReplacementPlugin(pattern, replacement),
        )
      }
    }
    return config
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
