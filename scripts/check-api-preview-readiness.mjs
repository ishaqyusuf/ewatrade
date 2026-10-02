import { existsSync, readFileSync } from "node:fs"
import { isIP } from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { databaseTargetsEqual } from "./database-profile.mjs"
import { readEnvironmentFile } from "./environment-profile.mjs"

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)
const expectedProjectId = "prj_ykC8ltJlPgEuFN90CQhFpC5uC3Vh"
const expectedOrgId = "team_BV5rgKHJH4fMyFL1YfscZIZK"

function databaseUrl(value) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    if (!["postgres:", "postgresql:"].includes(url.protocol)) return null
    return url
  } catch {
    return null
  }
}

function exactHttpsOrigin(value) {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== "https:" ||
      isIP(url.hostname) !== 0 ||
      url.hostname.split(".").length < 2 ||
      url.hostname
        .split(".")
        .some(
          (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
        ) ||
      url.hostname.endsWith(".localhost") ||
      url.hostname === "localhost" ||
      url.port ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      value.trim() !== url.origin
    )
      return null
    return url.origin
  } catch {
    return null
  }
}

export function inspectApiPreviewReadiness(root = repoRoot) {
  const issues = []
  const previewPath = path.join(root, ".env.preview")
  const preview = readEnvironmentFile(previewPath)
  const local = readEnvironmentFile(path.join(root, ".env.local"))
  const production = readEnvironmentFile(path.join(root, ".env.production"))
  const previewUrl = databaseUrl(preview.EWATRADE_DATABASE_URL)
  const localUrl = databaseUrl(local.EWATRADE_DATABASE_URL)
  const productionUrl = databaseUrl(production.EWATRADE_DATABASE_URL)

  if (!existsSync(previewPath)) issues.push("PREVIEW_PROFILE_MISSING")
  if (!previewUrl) issues.push("PREVIEW_DATABASE_MISSING_OR_INVALID")
  if (!localUrl) issues.push("LOCAL_DATABASE_IDENTITY_UNAVAILABLE")
  if (!productionUrl) issues.push("PRODUCTION_DATABASE_IDENTITY_UNAVAILABLE")

  if (previewUrl) {
    if (!previewUrl.hostname.toLowerCase().endsWith(".neon.tech")) {
      issues.push("PREVIEW_DATABASE_NOT_NEON")
    }
    if (localUrl && databaseTargetsEqual(previewUrl.href, localUrl.href)) {
      issues.push("PREVIEW_DATABASE_MATCHES_DEVELOPMENT")
    }
    if (
      productionUrl &&
      databaseTargetsEqual(previewUrl.href, productionUrl.href)
    ) {
      issues.push("PREVIEW_DATABASE_MATCHES_PRODUCTION")
    }
  }

  if (preview.APP_ENV !== "preview") issues.push("PREVIEW_APP_ENV_MISMATCH")
  if (!preview.BETTER_AUTH_SECRET?.trim() && !preview.AUTH_SECRET?.trim()) {
    issues.push("PREVIEW_AUTH_SECRET_MISSING")
  }
  const previewAuthSecret =
    preview.BETTER_AUTH_SECRET?.trim() || preview.AUTH_SECRET?.trim()
  for (const [name, profile] of [
    ["DEVELOPMENT", local],
    ["PRODUCTION", production],
  ]) {
    const otherSecret =
      profile.BETTER_AUTH_SECRET?.trim() || profile.AUTH_SECRET?.trim()
    if (previewAuthSecret && otherSecret && previewAuthSecret === otherSecret) {
      issues.push(`PREVIEW_AUTH_SECRET_MATCHES_${name}`)
    }
  }
  const authOrigin = exactHttpsOrigin(preview.BETTER_AUTH_URL)
  if (!authOrigin) issues.push("PREVIEW_AUTH_URL_INVALID")
  for (const [name, profile] of [
    ["DEVELOPMENT", local],
    ["PRODUCTION", production],
  ]) {
    if (authOrigin && authOrigin === exactHttpsOrigin(profile.BETTER_AUTH_URL))
      issues.push(`PREVIEW_AUTH_URL_MATCHES_${name}`)
  }
  const allowedOrigins = preview.ALLOWED_API_ORIGINS?.split(",").map((item) =>
    item.trim(),
  )
  if (
    !allowedOrigins?.length ||
    allowedOrigins.some((item) => !exactHttpsOrigin(item)) ||
    new Set(allowedOrigins).size !== allowedOrigins.length
  )
    issues.push("PREVIEW_ALLOWED_ORIGINS_INVALID")

  for (const key of [
    "ACCOUNT_PRIVACY_REQUESTS_ENABLED",
    "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
    "ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED",
    "ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED",
    "ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED",
    "ACCOUNT_PRIVACY_COMPLETION_ENABLED",
    "QA_MESSAGING_TEST_ADAPTER_ENABLED",
    "STORE_BILLING_ENABLED",
    "PLAY_REFUND_REVIEW_INTAKE_ENABLED",
    "PLAY_REFUND_REVIEW_SUBMISSION_ENABLED",
    "PLAY_REFUND_REVIEW_ALERTS_ENABLED",
    "PLAY_REFUND_REVIEW_ACK_ENABLED",
    "PRESCRIPTION_COMMERCE_LAUNCH_APPROVED",
  ]) {
    if (preview[key] !== "false") issues.push(`${key}_NOT_DISABLED`)
  }

  if (preview.QA_ACCELERATOR_ENABLED !== "true")
    issues.push("QA_ACCELERATOR_NOT_ENABLED")
  if (preview.QA_TOOLS_ENABLED !== "true") issues.push("QA_TOOLS_NOT_ENABLED")
  if ((preview.QA_ACCELERATOR_SECRET?.trim().length ?? 0) < 32)
    issues.push("QA_ACCELERATOR_SECRET_MISSING_OR_SHORT")
  const qaOrigins = preview.QA_ACCELERATOR_ALLOWED_ORIGINS?.split(",").map(
    (origin) => origin.trim(),
  )
  if (
    !qaOrigins?.length ||
    qaOrigins.some((origin) => !exactHttpsOrigin(origin))
  )
    issues.push("QA_ACCELERATOR_ORIGINS_INVALID")
  try {
    const routes = JSON.parse(preview.EMAIL_QA_DOMAIN_ROUTES ?? "{}")
    if (
      !routes ||
      Array.isArray(routes) ||
      typeof routes !== "object" ||
      Object.keys(routes).length === 0 ||
      Object.entries(routes).some(
        ([domain, inbox]) =>
          !domain.endsWith(".test") ||
          typeof inbox !== "string" ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inbox) ||
          inbox.endsWith(".test"),
      )
    )
      issues.push("QA_EMAIL_ROUTES_INVALID")
  } catch {
    issues.push("QA_EMAIL_ROUTES_INVALID")
  }

  try {
    const link = JSON.parse(
      readFileSync(path.join(root, "apps/api/.vercel/project.json"), "utf8"),
    )
    if (
      link.projectName !== "ewatrade-api" ||
      link.projectId !== expectedProjectId ||
      link.orgId !== expectedOrgId
    ) {
      issues.push("API_PROJECT_LINK_MISMATCH")
    }
  } catch {
    issues.push("API_PROJECT_LINK_MISSING")
  }

  return issues
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const issues = inspectApiPreviewReadiness()
  if (issues.length) {
    console.error(`API Preview preflight failed: ${issues.join(", ")}`)
    process.exitCode = 1
  } else {
    console.log("API Preview local profile and project-link preflight passed.")
  }
}
