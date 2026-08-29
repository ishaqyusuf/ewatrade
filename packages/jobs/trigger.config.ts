import { syncEnvVars } from "@trigger.dev/build/extensions/core"
import { defineConfig } from "@trigger.dev/sdk/v3"
import { captureTerminalJobError } from "./src/observability/sentry"

const syncedProductionEnvVars = [
  "APP_ENV",
  "DATABASE_URL",
  "EMAIL_DELIVERY_MODE",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "EMAIL_QA_DOMAIN_ROUTES",
  "MARKETING_INBOX_EMAILS",
  "COMMUNICATIONS_CREDENTIAL_ENCRYPTION_KEY",
  "META_APP_SECRET",
  "PAYSTACK_SECRET_KEY",
  "PRESCRIPTION_DATA_ENCRYPTION_KEY",
  "REDIS_URL",
  "RESEND_API_KEY",
  "SENTRY_DSN",
  "SENTRY_RELEASE",
  "SERVICE_SMS_WEBHOOK_TOKEN",
  "SERVICE_SMS_WEBHOOK_URL",
  "SERVICE_WHATSAPP_WEBHOOK_TOKEN",
  "SERVICE_WHATSAPP_WEBHOOK_URL",
  "TEST_EMAILS",
  "TEST_EMAIL",
  "TRIGGER_SECRET_KEY",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
] as const

function getTriggerProjectId() {
  return process.env.TRIGGER_PROJECT_ID?.trim() || "ewatrade-jobs"
}

function getSyncedProductionEnv() {
  return Object.fromEntries(
    syncedProductionEnvVars.flatMap((key) => {
      const value = process.env[key]?.trim()
      return value ? [[key, value]] : []
    }),
  )
}

export default defineConfig({
  project: getTriggerProjectId(),
  runtime: "node-22",
  logLevel: "log",
  maxDuration: 60,
  onFailure: async ({ error, task }) => {
    await captureTerminalJobError(error, task)
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    extensions: [
      syncEnvVars(() => getSyncedProductionEnv(), { override: true }),
    ],
  },
  dirs: ["./src/tasks"],
})
