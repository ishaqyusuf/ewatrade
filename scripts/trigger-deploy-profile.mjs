import { applyDatabaseProfile } from "./database-profile.mjs"
import { EWATRADE_TRIGGER_TARGETS } from "./release-trigger-target.mjs"

/**
 * Prefixed so one Vercel shared variable can serve every EwaTrade project
 * without colliding with other products; the SDK's default name is a fallback.
 */
export const TRIGGER_SECRET_KEY_ENV = "EWATRADE_TRIGGER_SECRET_KEY"

export function triggerSecretKeyFrom(env) {
  return (
    env[TRIGGER_SECRET_KEY_ENV]?.trim() || env.TRIGGER_SECRET_KEY?.trim() || ""
  )
}

// Trigger.dev issues tr_prod_sk_ keys today; older projects keep valid
// tr_prod_ keys. Public (pk_) keys and empty suffixes are refused.
const HOSTED_PROD_SECRET_KEY =
  /^tr_prod_(?:sk_[A-Za-z0-9_-]{1,512}|(?!sk_|pk_)[A-Za-z0-9_-]{1,512})$/

export const TRIGGER_JOB_ENV_KEYS = [
  "APP_ENV",
  "ASSISTANT_VOICE_ENABLED",
  "ASSISTANT_VOICE_GATEWAY_SECRET",
  "ASSISTANT_LOCAL_TENANT_IDS",
  "ASSISTANT_TRANSCRIBE_MODEL",
  "ASSISTANT_XAI_API_KEY",
  "ASSISTANT_OPENAI_API_KEY",
  "XAI_API_KEY",
  "ASSISTANT_OPENAI_STT_MICROS_PER_MINUTE",
  "ASSISTANT_XAI_STT_MICROS_PER_MINUTE",
  "ASSISTANT_VOICE_PRICING_VERSION",
  "NEXT_PUBLIC_LOGLY_DASHBOARD_ENABLED",
  "LOGLY_COLLECTOR_URL",
  "LOGLY_DASHBOARD_PROJECT_KEY",
  "BLOB_STORE_ID",
  "BLOB_READ_WRITE_TOKEN",
  "CATALOG_PHOTO_CLEANUP_ENABLED",
  "CATALOG_PHOTO_REVIEW_ENABLED",
  "CATALOG_PHOTO_REVIEW_OPENAI_API_KEY",
  "OPENAI_API_KEY",
  "EWATRADE_DATABASE_URL",
  "PERFORMANCE_TRACE",
  "EMAIL_DELIVERY_MODE",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "EMAIL_QA_DOMAIN_ROUTES",
  "MARKETING_INBOX_EMAILS",
  "PLAY_REFUND_REVIEW_ALERTS_ENABLED",
  "PLAY_REFUND_REVIEW_ALERT_EMAILS",
  "ACCOUNT_PRIVACY_NOTICE_ALERTS_ENABLED",
  "ACCOUNT_PRIVACY_NOTICE_ALERT_EMAILS",
  "COMMUNICATIONS_CREDENTIAL_ENCRYPTION_KEY",
  "META_APP_SECRET",
  "PAYSTACK_SECRET_KEY",
  "PRESCRIPTION_DATA_ENCRYPTION_KEY",
  "QA_MESSAGING_TEST_ADAPTER_ENABLED",
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
  TRIGGER_SECRET_KEY_ENV,
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
]

const isolatedPreviewKeys = new Set([
  "ASSISTANT_OPENAI_API_KEY",
  "XAI_API_KEY",
  "ASSISTANT_VOICE_GATEWAY_SECRET",
  "ASSISTANT_XAI_API_KEY",
  "BLOB_STORE_ID",
  "BLOB_READ_WRITE_TOKEN",
  "CATALOG_PHOTO_REVIEW_OPENAI_API_KEY",
  "OPENAI_API_KEY",
  "COMMUNICATIONS_CREDENTIAL_ENCRYPTION_KEY",
  "META_APP_SECRET",
  "PAYSTACK_SECRET_KEY",
  "PRESCRIPTION_DATA_ENCRYPTION_KEY",
  "REDIS_URL",
  "RESEND_API_KEY",
  "SERVICE_SMS_WEBHOOK_TOKEN",
  "SERVICE_SMS_WEBHOOK_URL",
  "SERVICE_WHATSAPP_WEBHOOK_TOKEN",
  "SERVICE_WHATSAPP_WEBHOOK_URL",
  TRIGGER_SECRET_KEY_ENV,
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
])

// Hosted task loading does not receive user-defined TRIGGER_* variables.
// Resolve the config from the application's fixed mapping, while the deploy
// wrapper continues to require and validate the selected file's project ID.
export function triggerProjectForConfigEnv(env) {
  const target = EWATRADE_TRIGGER_TARGETS[env.APP_ENV]
  if (target) return target.projectRef
  return triggerProjectForEnv(env)
}

export function triggerProjectForEnv(env) {
  const project = env.TRIGGER_PROJECT_ID?.trim()
  if (!project)
    throw new Error("TRIGGER_PROJECT_ID is required to configure jobs.")
  const target = EWATRADE_TRIGGER_TARGETS[env.APP_ENV]
  if (target && project !== target.projectRef) {
    throw new Error(
      "TRIGGER_PROJECT_ID does not match the selected application environment.",
    )
  }
  return project
}

export function assertTriggerDeployProfile(env) {
  if (env.APP_ENV !== "preview" && env.APP_ENV !== "production") {
    throw new Error(
      "Jobs deployment requires an explicit Preview or Production profile.",
    )
  }
  const databaseMode = env.APP_ENV === "production" ? "prod" : "preview"
  if (
    env.DEV_PROFILE !== env.APP_ENV ||
    env.EWATRADE_ENV_MODE !== databaseMode ||
    env.DATABASE_PROFILE_VERIFIED !== "1" ||
    !env.EWATRADE_DATABASE_URL?.trim()
  ) {
    throw new Error(
      "Jobs deployment requires the matching verified workspace database profile.",
    )
  }
  triggerProjectForEnv(env)
  if (!HOSTED_PROD_SECRET_KEY.test(triggerSecretKeyFrom(env))) {
    throw new Error(
      `The selected jobs profile requires its own hosted prod ${TRIGGER_SECRET_KEY_ENV} (tr_prod_sk_… or tr_prod_…).`,
    )
  }
  if (
    env.TRIGGER_API_URL &&
    env.TRIGGER_API_URL !== "https://api.trigger.dev"
  ) {
    throw new Error("Jobs deployment refuses an alternate Trigger API URL.")
  }
  if (env.TRIGGER_PREVIEW_BRANCH || env.TRIGGER_EXISTING_DEPLOYMENT_ID) {
    throw new Error(
      "Jobs deployment refuses branch or existing-deployment overrides.",
    )
  }
  if (
    env.TRIGGER_PROJECT_REF &&
    env.TRIGGER_PROJECT_REF !== env.TRIGGER_PROJECT_ID
  ) {
    throw new Error(
      "Jobs deployment refuses a conflicting Trigger project reference.",
    )
  }
}

// Runtime values come from the selected file. The root loader also includes the
// base file and parent process; those must never supply a missing jobs secret.
export function selectedTriggerDeployEnvironment(env, selected, production) {
  if (
    selected.EWATRADE_DATABASE_URL?.trim() !== env.EWATRADE_DATABASE_URL?.trim()
  ) {
    throw new Error(
      "Jobs deployment requires the selected file's verified database URL.",
    )
  }
  const result = { ...env }
  for (const key of [
    ...TRIGGER_JOB_ENV_KEYS,
    "TRIGGER_SECRET_KEY",
    "TRIGGER_PROJECT_ID",
    "TRIGGER_PROFILE",
    "TRIGGER_ACCESS_TOKEN",
  ]) {
    if (key === "APP_ENV") continue
    delete result[key]
    const value = selected[key]?.trim()
    if (value) result[key] = value
  }
  // Both names resolve to the selected file's key, never a base-file one.
  const secretKey = triggerSecretKeyFrom(selected)
  if (secretKey) {
    result[TRIGGER_SECRET_KEY_ENV] = secretKey
    result.TRIGGER_SECRET_KEY = secretKey
  }
  if (env.APP_ENV === "preview") {
    for (const key of isolatedPreviewKeys) {
      const productionValue =
        key === TRIGGER_SECRET_KEY_ENV
          ? triggerSecretKeyFrom(production)
          : production[key]?.trim()
      if (result[key] && result[key] === productionValue) {
        throw new Error(`Preview jobs refuses the Production value for ${key}.`)
      }
    }
  }
  applyDatabaseProfile(result, production.EWATRADE_DATABASE_URL)
  assertTriggerDeployProfile(result)
  return result
}

export function triggerDeployCommand(command, env) {
  assertTriggerDeployProfile(env)
  const safeFlags = new Set([
    "--dry-run",
    "--skip-update-check",
    "--skip-telemetry",
    "--skip-promotion",
    "--plain",
    "--no-cache",
  ])
  if (
    command[0] !== "trigger" ||
    command[1] !== "deploy" ||
    command.slice(2).some((arg) => !safeFlags.has(arg))
  ) {
    throw new Error(
      "Jobs deployment refuses CLI overrides; use the selected workspace profile.",
    )
  }
  const target = EWATRADE_TRIGGER_TARGETS[env.APP_ENV]
  return [
    "trigger",
    "deploy",
    ...command.slice(2),
    "--env",
    target.providerEnvironment,
    "--project-ref",
    target.projectRef,
    "--config",
    "trigger.config.ts",
    "--env-file",
    "/dev/null",
    "--skip-update-check",
    ...(env.TRIGGER_PROFILE?.trim()
      ? ["--profile", env.TRIGGER_PROFILE.trim()]
      : []),
  ]
}

export function syncedTriggerJobEnvironment(env) {
  assertTriggerDeployProfile(env)
  return Object.fromEntries(
    TRIGGER_JOB_ENV_KEYS.flatMap((key) => {
      const value = env[key]?.trim()
      return value ? [[key, value]] : []
    }),
  )
}
