import { readFileSync } from "node:fs"
import path from "node:path"

export function assertProductionApiDeployMode(target) {
  if (target !== "production") {
    throw new Error("API_DEPLOY_PREVIEW_REQUIRES_ISOLATED_PROFILE")
  }
}

export function assertApiDeployTarget(
  rootDir,
  expectedProject,
  expectedProjectId,
  expectedOrgId,
) {
  if (!expectedProjectId || !expectedOrgId) {
    throw new Error("API_DEPLOY_EXPECTED_ID_MISSING")
  }
  let link
  try {
    link = JSON.parse(
      readFileSync(path.join(rootDir, ".vercel", "project.json"), "utf8"),
    )
  } catch {
    throw new Error("API_DEPLOY_PROJECT_LINK_MISSING")
  }

  if (
    link?.projectName !== expectedProject ||
    link?.projectId !== expectedProjectId ||
    link?.orgId !== expectedOrgId
  ) {
    throw new Error("API_DEPLOY_TARGET_MISMATCH")
  }

  return { projectId: link.projectId, orgId: link.orgId }
}

export function assertProductionMigrationGate({
  isProduction,
  skipMigrations,
  readonlyDatabaseUrl,
  freshDatabaseVerified,
  backupReference,
  migrationApproved,
}) {
  if (!isProduction || skipMigrations) return
  if (
    (!readonlyDatabaseUrl && !freshDatabaseVerified) ||
    !backupReference ||
    migrationApproved !== "true"
  ) {
    throw new Error("API_DEPLOY_PRODUCTION_MIGRATION_REVIEW_REQUIRED")
  }
}

export const REQUIRED_PRODUCTION_API_ENV_KEYS = Object.freeze([
  "EWATRADE_DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "APP_ENV",
  "DEV_PROFILE",
  "API_URL",
  "NEXT_PUBLIC_API_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_PRODUCTION_URL",
  "ALLOWED_API_ORIGINS",
  "BETTER_AUTH_TRUSTED_ORIGINS",
  "PLATFORM_DOMAIN",
  "NEXT_PUBLIC_PLATFORM_DOMAIN",
  "NEXT_PUBLIC_SIGNUP_ENABLED",
  "STORE_BILLING_ENABLED",
  "PRESCRIPTION_COMMERCE_LAUNCH_APPROVED",
  "ACCOUNT_PRIVACY_REQUESTS_ENABLED",
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_COMPLETION_ENABLED",
  "SENTRY_DISABLE_AUTO_UPLOAD",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_DELIVERY_MODE",
])

const productionSecrets = new Set([
  "EWATRADE_DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "RESEND_API_KEY",
  "PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON",
  "PLAY_REFUND_REVIEW_ENCRYPTION_KEY",
  "PLAY_REFUND_REVIEW_DECRYPTION_KEYS",
])

export function assertProductionApiProjectEnvironment(response) {
  if (!response || !Array.isArray(response.envs))
    throw new Error("API_DEPLOY_PRODUCTION_ENV_INVENTORY_UNAVAILABLE")

  const productionEntries = response.envs.filter(
    (entry) =>
      entry &&
      Array.isArray(entry.target) &&
      entry.target.includes("production") &&
      !entry.gitBranch &&
      typeof entry.key === "string",
  )
  const available = new Set(productionEntries.map((entry) => entry.key))
  const missing = REQUIRED_PRODUCTION_API_ENV_KEYS.filter(
    (key) => !available.has(key),
  )
  if (missing.length > 0)
    throw new Error(`API_DEPLOY_PRODUCTION_ENV_MISSING:${missing.join(",")}`)

  const unprotected = productionEntries
    .filter(
      (entry) => productionSecrets.has(entry.key) && entry.type !== "sensitive",
    )
    .map((entry) => entry.key)
  if (unprotected.length > 0)
    throw new Error(
      `API_DEPLOY_PRODUCTION_ENV_NOT_SENSITIVE:${unprotected.join(",")}`,
    )
}
