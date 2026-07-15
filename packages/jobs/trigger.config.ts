import { syncEnvVars } from "@trigger.dev/build/extensions/core"
import { defineConfig } from "@trigger.dev/sdk/v3"

const syncedProductionEnvVars = [
  "DATABASE_URL",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "MARKETING_INBOX_EMAILS",
  "RESEND_API_KEY",
  "TEST_EMAILS",
  "TEST_EMAIL",
  "TRIGGER_SECRET_KEY",
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
