import { afterEach, expect, test } from "bun:test"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { inspectApiPreviewReadiness } from "./check-api-preview-readiness.mjs"

const roots = []
const development =
  "postgresql://user:local@ep-development.us-east-2.aws.neon.tech/neondb"
const production =
  "postgresql://user:prod@ep-production.us-east-2.aws.neon.tech/neondb"
const preview =
  "postgresql://user:preview@ep-preview.us-east-2.aws.neon.tech/neondb"

function fixture(previewDatabase = preview) {
  const root = mkdtempSync(path.join(tmpdir(), "ewatrade-api-preview-"))
  roots.push(root)
  mkdirSync(path.join(root, "apps/api/.vercel"), { recursive: true })
  writeFileSync(
    path.join(root, ".env.local"),
    `EWATRADE_DATABASE_URL=${development}\n`,
  )
  writeFileSync(
    path.join(root, ".env.production"),
    `EWATRADE_DATABASE_URL=${production}\n`,
  )
  writeFileSync(
    path.join(root, ".env.preview"),
    [
      `EWATRADE_DATABASE_URL=${previewDatabase}`,
      "APP_ENV=preview",
      "BETTER_AUTH_SECRET=preview-only-secret",
      "BETTER_AUTH_URL=https://preview-api.example.test",
      "ALLOWED_API_ORIGINS=https://preview.example.test",
      "QA_ACCELERATOR_ENABLED=false",
      "ACCOUNT_PRIVACY_REQUESTS_ENABLED=false",
      "ACCOUNT_PRIVACY_PROCESSING_ENABLED=false",
      "ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED=false",
      "ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED=false",
      "ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED=false",
      "ACCOUNT_PRIVACY_COMPLETION_ENABLED=false",
      "QA_MESSAGING_TEST_ADAPTER_ENABLED=false",
      "STORE_BILLING_ENABLED=false",
      "PLAY_REFUND_REVIEW_INTAKE_ENABLED=false",
      "PLAY_REFUND_REVIEW_SUBMISSION_ENABLED=false",
      "PLAY_REFUND_REVIEW_ALERTS_ENABLED=false",
      "PLAY_REFUND_REVIEW_ACK_ENABLED=false",
      "PRESCRIPTION_COMMERCE_LAUNCH_APPROVED=false",
    ].join("\n"),
  )
  writeFileSync(
    path.join(root, "apps/api/.vercel/project.json"),
    JSON.stringify({
      projectName: "ewatrade-api",
      projectId: "prj_ykC8ltJlPgEuFN90CQhFpC5uC3Vh",
      orgId: "team_BV5rgKHJH4fMyFL1YfscZIZK",
    }),
  )
  return root
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

test("accepts an isolated Neon Preview profile and exact API project link", () => {
  expect(inspectApiPreviewReadiness(fixture())).toEqual([])
})

test("rejects enabled conversation outcome processing in Preview", () => {
  const root = fixture()
  const previewPath = path.join(root, ".env.preview")
  const profile = readFileSync(previewPath, "utf8")
  writeFileSync(
    previewPath,
    profile.replace(
      "ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED=false",
      "ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED=true",
    ),
  )
  expect(inspectApiPreviewReadiness(root)).toContain(
    "ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED_NOT_DISABLED",
  )
})

test("rejects a Preview profile pointed at development through a pooled hostname", () => {
  const root = fixture(
    development.replace("ep-development.", "ep-development-pooler."),
  )
  expect(inspectApiPreviewReadiness(root)).toContain(
    "PREVIEW_DATABASE_MATCHES_DEVELOPMENT",
  )
})

test("rejects a Preview profile pointed at production", () => {
  expect(inspectApiPreviewReadiness(fixture(production))).toContain(
    "PREVIEW_DATABASE_MATCHES_PRODUCTION",
  )
})

test("rejects a reused production auth secret", () => {
  const root = fixture()
  writeFileSync(
    path.join(root, ".env.production"),
    `EWATRADE_DATABASE_URL=${production}\nBETTER_AUTH_SECRET=preview-only-secret\n`,
  )
  expect(inspectApiPreviewReadiness(root)).toContain(
    "PREVIEW_AUTH_SECRET_MATCHES_PRODUCTION",
  )
})

test("fails closed when the profile is missing", () => {
  const root = fixture()
  rmSync(path.join(root, ".env.preview"))
  expect(inspectApiPreviewReadiness(root)).toContain("PREVIEW_PROFILE_MISSING")
})

test("rejects enabled account-deletion intake and a wrong project link", () => {
  const root = fixture()
  writeFileSync(
    path.join(root, ".env.preview"),
    [
      `EWATRADE_DATABASE_URL=${preview}`,
      "APP_ENV=preview",
      "BETTER_AUTH_SECRET=preview-only-secret",
      "BETTER_AUTH_URL=https://preview-api.example.test",
      "ALLOWED_API_ORIGINS=https://preview.example.test",
      "QA_ACCELERATOR_ENABLED=false",
      "ACCOUNT_PRIVACY_REQUESTS_ENABLED=true",
      "ACCOUNT_PRIVACY_PROCESSING_ENABLED=false",
      "ACCOUNT_PRIVACY_MEMBERSHIP_PROCESSING_ENABLED=false",
      "ACCOUNT_PRIVACY_CONVERSATION_ACCESS_PROCESSING_ENABLED=false",
      "ACCOUNT_PRIVACY_CONVERSATION_OUTCOME_PROCESSING_ENABLED=false",
      "ACCOUNT_PRIVACY_COMPLETION_ENABLED=false",
      "QA_MESSAGING_TEST_ADAPTER_ENABLED=false",
      "STORE_BILLING_ENABLED=false",
      "PLAY_REFUND_REVIEW_INTAKE_ENABLED=false",
      "PLAY_REFUND_REVIEW_SUBMISSION_ENABLED=false",
      "PLAY_REFUND_REVIEW_ALERTS_ENABLED=false",
      "PLAY_REFUND_REVIEW_ACK_ENABLED=false",
      "PRESCRIPTION_COMMERCE_LAUNCH_APPROVED=false",
    ].join("\n"),
  )
  writeFileSync(
    path.join(root, "apps/api/.vercel/project.json"),
    JSON.stringify({
      projectName: "ewatrade-marketing",
      projectId: "wrong",
      orgId: "team-test",
    }),
  )
  expect(inspectApiPreviewReadiness(root)).toEqual([
    "ACCOUNT_PRIVACY_REQUESTS_ENABLED_NOT_DISABLED",
    "API_PROJECT_LINK_MISMATCH",
  ])
})

test("rejects enabled billing, review intake, pharmacy and deletion completion", () => {
  const root = fixture()
  const previewPath = path.join(root, ".env.preview")
  const original = readFileSync(previewPath, "utf8")
  const gated = [
    "STORE_BILLING_ENABLED",
    "PLAY_REFUND_REVIEW_INTAKE_ENABLED",
    "PLAY_REFUND_REVIEW_SUBMISSION_ENABLED",
    "PLAY_REFUND_REVIEW_ALERTS_ENABLED",
    "PLAY_REFUND_REVIEW_ACK_ENABLED",
    "PRESCRIPTION_COMMERCE_LAUNCH_APPROVED",
    "ACCOUNT_PRIVACY_COMPLETION_ENABLED",
  ]
  writeFileSync(
    previewPath,
    gated.reduce(
      (text, key) => text.replace(`${key}=false`, `${key}=true`),
      original,
    ),
  )
  expect(inspectApiPreviewReadiness(root)).toEqual(
    [
      "ACCOUNT_PRIVACY_COMPLETION_ENABLED",
      "STORE_BILLING_ENABLED",
      "PLAY_REFUND_REVIEW_INTAKE_ENABLED",
      "PLAY_REFUND_REVIEW_SUBMISSION_ENABLED",
      "PLAY_REFUND_REVIEW_ALERTS_ENABLED",
      "PLAY_REFUND_REVIEW_ACK_ENABLED",
      "PRESCRIPTION_COMMERCE_LAUNCH_APPROVED",
    ].map((key) => `${key}_NOT_DISABLED`),
  )
})

test("requires exact HTTPS auth and CORS origins", () => {
  const root = fixture()
  const previewPath = path.join(root, ".env.preview")
  const original = readFileSync(previewPath, "utf8")
  writeFileSync(
    previewPath,
    original
      .replace(
        "BETTER_AUTH_URL=https://preview-api.example.test",
        "BETTER_AUTH_URL=http://preview-api.example.test/auth",
      )
      .replace(
        "ALLOWED_API_ORIGINS=https://preview.example.test",
        "ALLOWED_API_ORIGINS=https://preview.example.test,https://*.example.test",
      ),
  )
  expect(inspectApiPreviewReadiness(root)).toEqual([
    "PREVIEW_AUTH_URL_INVALID",
    "PREVIEW_ALLOWED_ORIGINS_INVALID",
  ])
})

test("rejects reuse of the production auth origin", () => {
  const root = fixture()
  writeFileSync(
    path.join(root, ".env.production"),
    `EWATRADE_DATABASE_URL=${production}\nBETTER_AUTH_URL=https://preview-api.example.test\n`,
  )
  expect(inspectApiPreviewReadiness(root)).toContain(
    "PREVIEW_AUTH_URL_MATCHES_PRODUCTION",
  )
})
