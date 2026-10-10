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
  "ASSISTANT_SETUP_MEDIA_ENABLED", // setup voice/photos/files stay off until OpenAI credit
]
const tooling = [
  "APP_UPDATE_BACKEND", // local app-update publisher tooling only
  "APP_UPDATE_PUBLISH_TOKEN", // local app-update publisher credential only
  "QA_ACCELERATOR_ENABLED", // QA only; must stay off in production
  "EMAIL_QA_DOMAIN_ROUTES",
  "SENTRY_AUTH_TOKEN", // build-time source map upload
  "DEV_PROFILE", // local env-profile selector
  "DEBUG_PERF", // local performance debugging
  "ASSISTANT_LIVE_SMOKE", // opt-in live model tests, never set on a deployment
  "ASSISTANT_LIVE_MEASURE", // opt-in live setup measurement, tests only
  // Opt-in assistant integration checks, tests only; never set on a deployment.
  "RUN_GENERAL_FULFILLMENT",
  "RUN_GENERAL_ORDER_AMENDMENT",
  "RUN_GENERAL_ORDER_AMENDMENT_REPLACEMENT_ONLY",
  "RUN_GENERAL_ORDER_CANCELLATION",
  "RUN_GENERAL_ORDER_METADATA",
  "RUN_GENERAL_ORDER_REPLACEMENT",
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
  "STORE_CONVERSATION_TEXT_SAFETY_OPENAI_API_KEY", // falls back to OPENAI_API_KEY
]
const notNeeded = [...featuresOff, ...tooling, ...optional]
// Hosted Preview runs without these test-feature flags, real email sending and
// the full URL set from .env.preview (owner decision, 6 Oct 2026). Production
// still checks every name here.
const previewOnly = [
  "ACCOUNT_PRIVACY_REQUESTS_ENABLED",
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_COMPLETION_ENABLED",
  "ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED",
  "PLAY_REFUND_REVIEW_INTAKE_ENABLED",
  "PLAY_REFUND_REVIEW_ALERTS_ENABLED",
  "PLAY_REFUND_REVIEW_ACK_ENABLED",
  "STORE_BILLING_ENABLED",
  "QA_ACCELERATOR_SECRET",
  "QA_MESSAGING_TEST_ADAPTER_ENABLED",
  "INTERNAL_API_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "EMAIL_DELIVERY_MODE",
  "MARKETING_INBOX_EMAILS",
  "STOREFRONT_URL",
  "NEXT_PUBLIC_STOREFRONT_URL",
  "NEXT_PUBLIC_DASHBOARD_URL",
  "NEXT_PUBLIC_MARKETING_URL",
  "NEXT_PUBLIC_API_URL",
  "API_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_PRODUCTION_URL",
  "NEXT_PUBLIC_SIGNUP_ENABLED",
]

export default {
  project: "ewatrade",
  // Vercel team shared variables are EWATRADE_-prefixed; apps map them back to
  // plain names at start-up (packages/utils/src/shared-env.ts).
  sharedEnvPrefix: "EWATRADE_",
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
        ignoreIn: { preview: previewOnly },
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
        ignoreIn: { preview: previewOnly },
      },
    },
    {
      // Vercel builds the API from the Git push too (scripts/build-api-vercel.mjs);
      // the release waits until Ready. Preview serves preview-api.ewatrade.com.
      name: "api",
      app: "apps/api",
      paths: [
        "scripts/build-api-vercel.mjs",
        "scripts/api-bundle-externals.mjs",
      ],
      vercel: { team, projects: ["ewatrade-api"] },
      env: {
        ignore: [
          ...notNeeded,
          "MARKETING_INBOX_EMAILS", // team notifications fall back to EMAIL_REPLY_TO
        ],
        ignoreIn: { preview: previewOnly },
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
        // The global EAS CLI is shared with other apps' accounts (GND); switch
        // it to ewatrade's before the release reads EAS.
        login: "bun run eas:auth",
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
