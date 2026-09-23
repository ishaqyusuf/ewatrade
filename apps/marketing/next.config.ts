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

const nextConfig: NextConfig = {
  pageExtensions: isInternalQaBuild()
    ? ["qa.ts", "tsx", "ts", "jsx", "js"]
    : ["tsx", "ts", "jsx", "js"],
  reactStrictMode: true,
  // Vercel's basic build machine repeatedly exhausts memory in Next's
  // duplicate type-check worker. CI/package type checks remain authoritative.
  typescript: { ignoreBuildErrors: process.env.VERCEL === "1" },
  transpilePackages: [
    "@ewatrade/events",
    "@ewatrade/api",
    "@ewatrade/db",
    "@ewatrade/email",
    "@ewatrade/errors",
    "@ewatrade/jobs",
    "@ewatrade/notifications",
    "@ewatrade/notifications-react",
    "@ewatrade/observability",
    "@ewatrade/ui",
    "@ewatrade/utils",
  ],
  webpack(config, { webpack }) {
    if (!isInternalQaBuild()) {
      const replacements: Array<[RegExp, string]> = [
        [
          /[\\/]components[\\/]qa[\\/]qa-quick-fill-button(?:\.[cm]?[jt]sx?)?$/,
          resolve(
            appRoot,
            "src/components/qa/qa-quick-fill-button.production.tsx",
          ),
        ],
        [
          /[\\/]components[\\/]qa[\\/]qa-web-accelerator(?:\.[cm]?[jt]sx?)?$/,
          resolve(
            appRoot,
            "src/components/qa/qa-web-accelerator.production.tsx",
          ),
        ],
        [
          /[\\/]hooks[\\/]use-qa-form-fill(?:\.[cm]?[jt]sx?)?$/,
          resolve(appRoot, "src/hooks/use-qa-form-fill.production.ts"),
        ],
        [
          /[\\/]lib[\\/]qa-fill-definitions(?:\.[cm]?[jt]sx?)?$/,
          resolve(appRoot, "src/lib/qa-fill-definitions.production.ts"),
        ],
        [
          /[\\/]lib[\\/]qa-lead-fill(?:\.[cm]?[jt]sx?)?$/,
          resolve(appRoot, "src/lib/qa-lead-fill.production.ts"),
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
