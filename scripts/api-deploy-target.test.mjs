import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  REQUIRED_PRODUCTION_API_ENV_KEYS,
  assertApiDeployTarget,
  assertProductionApiDeployMode,
  assertProductionApiProjectEnvironment,
  assertProductionMigrationGate,
} from "./api-deploy-target.mjs"

const tempDirs = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

test("requires an explicit API project link before deployment", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ewatrade-api-link-"))
  tempDirs.push(root)
  expect(() =>
    assertApiDeployTarget(root, "ewatrade-api", "api", "team"),
  ).toThrow("API_DEPLOY_PROJECT_LINK_MISSING")

  await mkdir(path.join(root, ".vercel"))
  await writeFile(
    path.join(root, ".vercel", "project.json"),
    JSON.stringify({
      projectName: "ewatrade-marketing",
      projectId: "marketing",
      orgId: "team",
    }),
  )
  expect(() =>
    assertApiDeployTarget(root, "ewatrade-api", "api", "team"),
  ).toThrow("API_DEPLOY_TARGET_MISMATCH")

  await writeFile(
    path.join(root, ".vercel", "project.json"),
    JSON.stringify({
      projectName: "ewatrade-api",
      projectId: "api",
      orgId: "team",
    }),
  )
  expect(() =>
    assertApiDeployTarget(root, "ewatrade-api", "other", "team"),
  ).toThrow("API_DEPLOY_TARGET_MISMATCH")
  expect(assertApiDeployTarget(root, "ewatrade-api", "api", "team")).toEqual({
    projectId: "api",
    orgId: "team",
  })
})

test("production migration requires readonly or verified-empty inventory, backup and explicit review", () => {
  expect(() =>
    assertProductionMigrationGate({
      isProduction: true,
      skipMigrations: false,
    }),
  ).toThrow("API_DEPLOY_PRODUCTION_MIGRATION_REVIEW_REQUIRED")
  expect(() =>
    assertProductionMigrationGate({
      isProduction: true,
      skipMigrations: false,
      readonlyDatabaseUrl: "readonly-dsn",
      backupReference: "backup-id",
      migrationApproved: "true",
    }),
  ).not.toThrow()
  expect(() =>
    assertProductionMigrationGate({
      isProduction: true,
      skipMigrations: false,
      freshDatabaseVerified: true,
      backupReference: "backup-id",
      migrationApproved: "true",
    }),
  ).not.toThrow()
  expect(() =>
    assertProductionMigrationGate({
      isProduction: true,
      skipMigrations: false,
      freshDatabaseVerified: true,
      backupReference: "backup-id",
    }),
  ).toThrow("API_DEPLOY_PRODUCTION_MIGRATION_REVIEW_REQUIRED")
})

test("production helper refuses a preview target before any migration", () => {
  expect(() => assertProductionApiDeployMode("preview")).toThrow(
    "API_DEPLOY_PREVIEW_REQUIRES_ISOLATED_PROFILE",
  )
  expect(() => assertProductionApiDeployMode("production")).not.toThrow()
})

test("requires every API variable to be scoped to Production before migration", () => {
  const envs = REQUIRED_PRODUCTION_API_ENV_KEYS.map((key) => ({
    key,
    target: ["production"],
    type: "sensitive",
  }))
  expect(() => assertProductionApiProjectEnvironment({ envs })).not.toThrow()
  expect(() =>
    assertProductionApiProjectEnvironment({
      envs: envs.map((entry) =>
        entry.key === "EWATRADE_DATABASE_URL"
          ? { ...entry, target: ["preview"] }
          : entry,
      ),
    }),
  ).toThrow("API_DEPLOY_PRODUCTION_ENV_MISSING:EWATRADE_DATABASE_URL")
  expect(() =>
    assertProductionApiProjectEnvironment({
      envs: envs.map((entry) =>
        entry.key === "BETTER_AUTH_SECRET"
          ? { ...entry, gitBranch: "feature" }
          : entry,
      ),
    }),
  ).toThrow("API_DEPLOY_PRODUCTION_ENV_MISSING:BETTER_AUTH_SECRET")
  expect(() => assertProductionApiProjectEnvironment({ envs: null })).toThrow(
    "API_DEPLOY_PRODUCTION_ENV_INVENTORY_UNAVAILABLE",
  )
  expect(() =>
    assertProductionApiProjectEnvironment({
      envs: envs.map((entry) =>
        entry.key === "RESEND_API_KEY"
          ? { ...entry, type: "encrypted" }
          : entry,
      ),
    }),
  ).toThrow("API_DEPLOY_PRODUCTION_ENV_NOT_SENSITIVE:RESEND_API_KEY")
  expect(() =>
    assertProductionApiProjectEnvironment({
      envs: [
        ...envs,
        {
          key: "PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON",
          target: ["production"],
          type: "encrypted",
        },
      ],
    }),
  ).toThrow(
    "API_DEPLOY_PRODUCTION_ENV_NOT_SENSITIVE:PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON",
  )
  expect(() =>
    assertProductionApiProjectEnvironment({
      envs: [
        ...envs,
        {
          key: "PLAY_PUBLISHER_SERVICE_ACCOUNT_JSON",
          target: ["production"],
          type: "sensitive",
        },
      ],
    }),
  ).not.toThrow()
})
