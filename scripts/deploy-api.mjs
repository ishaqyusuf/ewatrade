#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import {
  assertApiDeployTarget,
  assertProductionApiDeployMode,
  assertProductionApiProjectEnvironment,
} from "./api-deploy-target.mjs"
import {
  probeProductionApi,
  validateProductionApiHostConfiguration,
} from "./production-api-readiness.mjs"
import { prepareCommittedApiArtifact } from "./release-api-build.mjs"
import {
  parseApiDeployArguments,
  resolveApiSourceRevision,
} from "./release-api-source-stage.mjs"
import {
  EWATRADE_VERCEL_API_TARGET,
  RELEASE_VERCEL_CLI,
  assertOwnedVercelDeployment,
  parseVercelDeploymentOutput,
} from "./release-vercel-deployment-output.mjs"

const rootDir = new URL("../", import.meta.url).pathname
const apiDir = new URL("../apps/api/", import.meta.url).pathname
const envFile = ".env.production"

process.chdir(rootDir)

function usage() {
  console.log(`Usage: bun run api:deploy [--revision FULL_HEAD_SHA]

Deploys @ewatrade/api to Vercel using project-scoped Production variables.
The local ${envFile} selects the Production deploy safeguards.
Builds clean committed HEAD using Bun 1.3.9 in a private macOS sandbox.
Run database push separately through local-infra-kit, or use bun release.

Required in ${envFile}:
  EWATRADE_DATABASE_URL
  BETTER_AUTH_SECRET or AUTH_SECRET
  API_URL, NEXT_PUBLIC_API_URL and VERCEL_API_HEALTH_URL (one API host)

Optional deployment config in ${envFile}:
  VERCEL_SCOPE=<account-or-team-slug>
  VERCEL_API_PROJECT=ewatrade-api
  VERCEL_API_TARGET=production (this helper is production-only)
  VERCEL_API_SKIP_TEST=false
  VERCEL_API_FORCE=false
`)
}

function parseEnvFile(path) {
  const values = {}
  const raw = readFileSync(path, "utf8")

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue

    const [, key, value] = match
    values[key] = unquote(value.trim())
  }

  return values
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function bool(value, fallback = false) {
  if (value == null || value === "") return fallback
  return ["1", "true", "yes", "on"].includes(value.toLowerCase())
}

// Staged commands must throw so the caller's finally block removes pulled
// Production environment files even when Vercel or Bun fails.
function runStage(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (result.error || result.status !== 0)
    throw new Error(
      `API_DEPLOY_STAGE_FAILED:${command}:${args[0] ?? ""}:${result.status ?? "unknown"}`,
    )
  return result
}

function requireValue(values, key, message) {
  if (!values[key]?.trim()) {
    console.error(message ?? `${key} is required in ${envFile}.`)
    process.exit(1)
  }
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage()
  process.exit(0)
}

const sourceOptions = parseApiDeployArguments(
  process.argv.slice(2),
  "production",
)
const revision = resolveApiSourceRevision(rootDir, sourceOptions.revision)

if (!existsSync(envFile)) {
  console.error(
    `${envFile} is missing. Add it once, then run bun run api:deploy.`,
  )
  process.exit(1)
}

const fileEnv = parseEnvFile(envFile)
const env = { ...process.env, ...fileEnv }
env.DATABASE_URL = undefined
const project = env.VERCEL_API_PROJECT?.trim() || "ewatrade-api"
const scope = env.VERCEL_SCOPE?.trim() || ""
const target = env.VERCEL_API_TARGET?.trim() || "production"
const isProduction = target === "production"
const skipTest = bool(env.VERCEL_API_SKIP_TEST, false)
const force = bool(env.VERCEL_API_FORCE, false)
const hostCheck = validateProductionApiHostConfiguration(fileEnv)

// The checkout may be linked to Marketing. Refuse to deploy
// until the exact API project is linked; `vercel deploy` uses that local link.
try {
  // This helper reads .env.production. A preview
  // target must use an isolated profile and cannot be selected here.
  assertProductionApiDeployMode(target)
  assertApiDeployTarget(
    apiDir,
    project,
    env.VERCEL_API_PROJECT_ID?.trim(),
    env.VERCEL_API_ORG_ID?.trim(),
  )
  if (
    env.VERCEL_API_PROJECT_ID?.trim() !==
      EWATRADE_VERCEL_API_TARGET.projectId ||
    env.VERCEL_API_ORG_ID?.trim() !== EWATRADE_VERCEL_API_TARGET.teamId
  )
    throw new Error("API_DEPLOY_TARGET_MISMATCH")
  if (!skipTest && hostCheck.failures.length)
    throw new Error(hostCheck.failures.join(" "))
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "API_DEPLOY_TARGET_MISMATCH",
  )
  process.exit(1)
}

requireValue(env, "EWATRADE_DATABASE_URL")

if (!env.BETTER_AUTH_SECRET?.trim() && !env.AUTH_SECRET?.trim()) {
  console.error(`Set BETTER_AUTH_SECRET or AUTH_SECRET in ${envFile}.`)
  process.exit(1)
}

if (/localhost|127\.0\.0\.1/.test(env.EWATRADE_DATABASE_URL)) {
  console.error(
    `EWATRADE_DATABASE_URL in ${envFile} must be a hosted production database.`,
  )
  process.exit(1)
}

const vercelScopeArgs = scope ? ["--scope", scope] : []

// Verify the exact linked project's Production inventory before mutating its
// application. Sensitive values are unreadable after creation and never enter
// deployment command arguments or this process's output.
try {
  const inventory = runStage("bunx", [
    RELEASE_VERCEL_CLI,
    "api",
    `/v9/projects/${env.VERCEL_API_PROJECT_ID}/env`,
    "--cwd",
    apiDir,
    "--raw",
    ...vercelScopeArgs,
  ])
  const sharedInventory = runStage("bunx", [
    RELEASE_VERCEL_CLI,
    "api",
    "/v1/env?limit=100",
    "--cwd",
    apiDir,
    "--raw",
    ...vercelScopeArgs,
  ])
  assertProductionApiProjectEnvironment(
    JSON.parse(inventory.stdout),
    JSON.parse(sharedInventory.stdout),
    env.VERCEL_API_PROJECT_ID,
  )
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "API_DEPLOY_PRODUCTION_ENV_INVENTORY_UNAVAILABLE",
  )
  process.exit(1)
}

console.log("Deploying @ewatrade/api to Vercel")
console.log(`Project: ${project}`)
if (scope) console.log(`Scope:   ${scope}`)
console.log(`Target:  ${target}`)
console.log(`Env:     ${envFile}`)

console.log(`Building committed Production artifact ${revision}...`)
const artifact = await prepareCommittedApiArtifact({
  repository: rootDir,
  revision,
})
const { stage } = artifact
let deployment
try {
  resolveApiSourceRevision(rootDir, revision)
  const bundle = readFileSync(
    path.join(stage, "apps/api/src/bundle.js"),
    "utf8",
  )
  for (const profile of [".env.production", ".env.preview", ".env.local"]) {
    if (!existsSync(profile)) continue
    for (const [key, value] of Object.entries(parseEnvFile(profile))) {
      if (
        /(?:DATABASE_URL|SECRET|TOKEN|PRIVATE_KEY|INTERNAL_API_KEY)/.test(
          key,
        ) &&
        value?.length >= 16 &&
        bundle.includes(value)
      )
        throw new Error(
          `API_DEPLOY_BUNDLE_CONTAINS_CREDENTIAL:${profile}:${key}`,
        )
    }
  }
  mkdirSync(path.join(stage, ".vercel"), { recursive: true })
  writeFileSync(
    path.join(stage, ".vercel/project.json"),
    `${JSON.stringify({
      orgId: EWATRADE_VERCEL_API_TARGET.teamId,
      projectId: EWATRADE_VERCEL_API_TARGET.projectId,
      projectName: "ewatrade-api",
    })}\n`,
    { mode: 0o600, flag: "wx" },
  )
  runStage("bunx", [
    RELEASE_VERCEL_CLI,
    "pull",
    "--yes",
    "--environment=production",
    "--cwd",
    stage,
    ...vercelScopeArgs,
  ])
  console.log("Starting deployment...")
  const deploy = runStage("bunx", [
    RELEASE_VERCEL_CLI,
    "deploy",
    stage,
    "--project",
    env.VERCEL_API_PROJECT_ID,
    "--yes",
    "--format",
    "json",
    "--prod",
    ...(force ? ["--force"] : []),
    ...vercelScopeArgs,
  ])
  const cliDeployment = parseVercelDeploymentOutput(deploy.stdout)
  const readback = runStage("bunx", [
    RELEASE_VERCEL_CLI,
    "api",
    `/v13/deployments/${cliDeployment.id}?teamId=${EWATRADE_VERCEL_API_TARGET.teamId}`,
    "--method",
    "GET",
    "--raw",
    ...vercelScopeArgs,
  ])
  let rawDeployment
  try {
    rawDeployment = JSON.parse(readback.stdout)
  } catch {
    throw new Error("VERCEL_DEPLOYMENT_INVALID_RECORD")
  }
  deployment = assertOwnedVercelDeployment(rawDeployment, {
    ...cliDeployment,
    ...EWATRADE_VERCEL_API_TARGET,
    environment: "production",
  })
} finally {
  artifact.cleanup()
}

console.log(`Deployment ID: ${deployment.id}`)
console.log(`Deployment URL: ${deployment.url}`)

if (!skipTest) {
  console.log(`Testing Production API routes at ${hostCheck.origin}...`)
  const failures = await probeProductionApi(hostCheck.origin)
  if (failures.length) {
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
  console.log("Health, auth and legal-publication API probes passed.")
}

console.log("Done.")
