import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { shouldUploadSourceMaps } from "@ewatrade/observability"
import {
  onboardingRequestLogIgnore,
  onboardingSignupResponseHeaders,
} from "@ewatrade/onboarding/lib/onboarding-request-logging"
import { applyEwatradeSharedEnv } from "@ewatrade/utils/shared-env"
import { withSentryConfig } from "@sentry/nextjs"
import type { NextConfig } from "next"

const appRoot = dirname(fileURLToPath(import.meta.url))

// Builds read env before instrumentation runs, so map shared names here too.
applyEwatradeSharedEnv()

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
      source: "/api/finance/expense-receipts/:path*",
      destination: `${apiOrigin}/api/finance/expense-receipts/:path*`,
    },
    {
      source: "/api/assistant/:path*",
      destination: `${apiOrigin}/api/assistant/:path*`,
    },
    {
      source: "/api/catalog/photos/:path*",
      destination: `${apiOrigin}/api/catalog/photos/:path*`,
    },
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

export const nextConfig: NextConfig = {
  // GENERAL allows 45s after admission; preserve the stream through setup and finalization.
  experimental: { proxyTimeout: 90_000 },
  logging: { incomingRequests: { ignore: onboardingRequestLogIgnore } },
  async headers() {
    return [{ source: "/signup", headers: onboardingSignupResponseHeaders }]
  },
  pageExtensions: isInternalQaBuild()
    ? ["qa.ts", "tsx", "ts", "jsx", "js"]
    : ["tsx", "ts", "jsx", "js"],
  turbopack: {
    resolveAlias: isInternalQaBuild()
      ? {}
      : {
          "@ewatrade/onboarding/components/qa/qa-web-accelerator":
            "../../packages/onboarding/src/components/qa/qa-web-accelerator.production.tsx",
          "@ewatrade/onboarding/components/qa/qa-quick-fill-button":
            "../../packages/onboarding/src/components/qa/qa-quick-fill-button.production.tsx",
          "@ewatrade/onboarding/hooks/use-qa-form-fill":
            "../../packages/onboarding/src/hooks/use-qa-form-fill.production.ts",
          "@ewatrade/onboarding/lib/qa-fill-definitions":
            "../../packages/onboarding/src/lib/qa-fill-definitions.production.ts",
          "@/components/qa/qa-login-entry":
            "./src/components/qa/qa-login-entry.production.tsx",
        },
  },
  reactStrictMode: true,
  // Vercel's basic build machine repeatedly exhausts memory in Next's
  // duplicate type-check worker. CI/package type checks remain authoritative.
  typescript: { ignoreBuildErrors: process.env.VERCEL === "1" },
  transpilePackages: [
    "@ewatrade/order-receipts",
    "@ewatrade/onboarding",
    "@ewatrade/events",
    "@ewatrade/catalog",
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
          /@ewatrade\/onboarding\/components\/qa\/qa-web-accelerator$/,
          resolve(
            appRoot,
            "../../packages/onboarding/src/components/qa/qa-web-accelerator.production.tsx",
          ),
        ],
        [
          /@ewatrade\/onboarding\/components\/qa\/qa-quick-fill-button$/,
          resolve(
            appRoot,
            "../../packages/onboarding/src/components/qa/qa-quick-fill-button.production.tsx",
          ),
        ],
        [
          /@ewatrade\/onboarding\/hooks\/use-qa-form-fill$/,
          resolve(
            appRoot,
            "../../packages/onboarding/src/hooks/use-qa-form-fill.production.ts",
          ),
        ],
        [
          /@ewatrade\/onboarding\/lib\/qa-fill-definitions$/,
          resolve(
            appRoot,
            "../../packages/onboarding/src/lib/qa-fill-definitions.production.ts",
          ),
        ],
        [
          /[\\/]components[\\/]qa[\\/]qa-login-entry(?:\.[cm]?[jt]sx?)?$/,
          resolve(appRoot, "src/components/qa/qa-login-entry.production.tsx"),
        ],
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
