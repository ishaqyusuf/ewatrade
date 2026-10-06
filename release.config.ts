// `bun release` (local-infra-kit). On main it releases Production; on any other
// branch, or with --preview, it releases Preview. Each part is released only when
// its files changed since that part's last release (tags release/<env>/<part>).
const team = "team_BV5rgKHJH4fMyFL1YfscZIZK"

// Env names the release's env check skips. The code reads them, but the deployed
// app doesn't need them today. Move a name out of these lists when that changes.
const featuresOff = [
  "PLAY_PACKAGE_NAME", // Google Play billing: add before enabling STORE_BILLING_ENABLED
  "ACCOUNT_PRIVACY_OTP_SECRET", // add both before enabling account-privacy requests
  "ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY",
  "CATALOG_PHOTO_REVIEW_OPENAI_API_KEY", // photo review is off
  "APPLE_CLIENT_IDS", // Sign in with Apple, iOS only
]
const tooling = [
  "QA_ACCELERATOR_ENABLED", // QA only; must stay off in production
  "EMAIL_QA_DOMAIN_ROUTES",
  "SENTRY_AUTH_TOKEN", // build-time source map upload
  "DEV_PROFILE", // local env-profile selector
  "DEBUG_PERF", // local performance debugging
]
const optional = [
  "LOGLY_COLLECTOR_URL", // Logly logging stays off without these
  "LOGLY_PROJECT_KEY",
  "LOGLY_MOBILE_PROJECT_KEY",
  "NEXT_PUBLIC_LOGLY_ENABLED",
  "NEXT_PUBLIC_LOGLY_PROJECT",
  "EARLY_ACCESS_LINK_TTL_DAYS", // has a default
  "PLATFORM_DOMAIN", // defaults to ewatrade.com
  "NEXT_PUBLIC_CHAT_URL", // falls back to CHAT_URL
]
const notNeeded = [...featuresOff, ...tooling, ...optional]

export default {
  project: "ewatrade",
  components: [
    {
      // Runs first, before any new code goes live. Production asks for confirmation.
      name: "database",
      paths: ["packages/db/prisma/**", "packages/db/prisma.config.ts"],
      sharedPaths: false,
      beforePush: true,
      deploy: {
        preview: "bun run db:push --preview",
        production: "bun run db:push --prod",
      },
    },
    {
      // Vercel builds these from the Git push; the release waits until Ready.
      name: "dashboard",
      app: "apps/dashboard",
      vercel: { team, projects: ["ewatrade-dashboard"] },
      env: {
        ignore: [
          ...notNeeded,
          "VERCEL_STOREFRONT_PROJECT_ID", // used by a Trigger job, not the dashboard
          "VERCEL_API_TOKEN", // opt-in: lets signup create tenant domains on Vercel
        ],
      },
    },
    {
      name: "marketing",
      app: "apps/marketing",
      vercel: { team, projects: ["ewatrade-marketing"] },
      env: {
        ignore: [
          ...notNeeded,
          "ALLOWED_API_ORIGINS", // extra API/auth origins; same-origin pages don't need them
          "BETTER_AUTH_TRUSTED_ORIGINS",
          "NEXT_PUBLIC_PLATFORM_DOMAIN",
          "NEXT_PUBLIC_STOREFRONT_URL", // service pages fall back to STOREFRONT_URL
        ],
      },
    },
    {
      // Vercel builds the API from the Git push too (scripts/build-api-vercel.mjs);
      // the release waits until Ready. Preview serves preview-api.ewatrade.com.
      name: "api",
      app: "apps/api",
      paths: ["scripts/build-api-vercel.mjs", "scripts/api-bundle-externals.mjs"],
      vercel: { team, projects: ["ewatrade-api"] },
      env: {
        ignore: [
          ...notNeeded,
          "MARKETING_INBOX_EMAILS", // team notifications fall back to EMAIL_REPLY_TO
        ],
      },
    },
    {
      // Trigger syncs env vars from the env files on every deploy.
      name: "jobs",
      app: "packages/jobs",
      paths: [
        "scripts/trigger-deploy-profile.mjs",
        "scripts/with-trigger-profile.mjs",
        "scripts/release-trigger-target.mjs",
      ],
      deploy: {
        preview: "bun run jobs:preview:deploy",
        production: "bun run jobs:deploy",
      },
    },
    {
      // OTA update when a build with the same native fingerprint exists on the
      // channel; otherwise a new build.
      name: "mobile",
      // Cloud builds set APP_VARIANT/EAS_BUILD_PROFILE; APP_ENV is a local fallback.
      env: { ignore: ["APP_ENV"] },
      expo: {
        appDir: "apps/mobile",
        platforms: ["android"],
        update: {
          preview:
            "bun run eas:update --preview --platform {platforms} --expected-commit {sha}",
          production:
            "bun run eas:update --prod --platform {platforms} --expected-commit {sha}",
        },
        build: {
          // Preview builds wait so the in-app APK download can be published.
          preview:
            "bun run eas:build --preview --platform {platform} --expected-commit {sha} --non-interactive",
          production:
            "bun run eas:build --prod --platform {platform} --expected-commit {sha} --non-interactive --no-wait",
        },
      },
    },
  ],
}
