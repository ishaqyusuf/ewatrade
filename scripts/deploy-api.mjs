#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  assertApiDeployTarget,
  assertProductionApiDeployMode,
  assertProductionApiProjectEnvironment,
  assertProductionMigrationGate,
} from "./api-deploy-target.mjs"
import {
  probeProductionApi,
  validateProductionApiHostConfiguration,
} from "./production-api-readiness.mjs"
import { inspectFreshProductionDatabase } from "./production-empty-database.mjs"

const rootDir = new URL("../", import.meta.url).pathname
const apiDir = new URL("../apps/api/", import.meta.url).pathname
const envFile = ".env.production"

process.chdir(rootDir)

function usage() {
  console.log(`Usage: bun run api:deploy

Deploys @ewatrade/api to Vercel using project-scoped Production variables.
The local ${envFile} selects the migration target and deploy safeguards.

Required in ${envFile}:
  EWATRADE_DATABASE_URL
  BETTER_AUTH_SECRET or AUTH_SECRET
  API_URL, NEXT_PUBLIC_API_URL and VERCEL_API_HEALTH_URL (one API host)

Optional deployment config in ${envFile}:
  VERCEL_SCOPE=<account-or-team-slug>
  VERCEL_API_PROJECT=ewatrade-api
  VERCEL_API_TARGET=production (this helper is production-only)
  VERCEL_API_SKIP_TEST=false
  VERCEL_API_SKIP_MIGRATIONS=false
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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  })

  if (result.status !== 0) {
    if (options.capture) {
      if (result.stdout) process.stdout.write(result.stdout)
      if (result.stderr) process.stderr.write(result.stderr)
    }
    process.exit(result.status ?? 1)
  }

  return result
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

function getDeploymentUrl(output) {
  try {
    const parsed = JSON.parse(output)
    return parsed.url || parsed.deployment?.url || parsed.inspectorUrl || ""
  } catch {
    const jsonStart = output.lastIndexOf("{")
    if (jsonStart === -1) return ""

    try {
      const parsed = JSON.parse(output.slice(jsonStart))
      return parsed.url || parsed.deployment?.url || parsed.inspectorUrl || ""
    } catch {
      return ""
    }
  }
}

function stageProductionApi() {
  const stage = mkdtempSync(path.join(tmpdir(), "ewatrade-api-production-"))
  try {
    for (const directory of ["apps/api", "packages", "scripts", "patches"]) {
      mkdirSync(path.join(stage, directory), { recursive: true })
      runStage("rsync", [
        "-a",
        "--exclude=node_modules",
        "--exclude=.vercel",
        "--exclude=.env*",
        "--exclude=.git",
        `${directory}/`,
        `${path.join(stage, directory)}/`,
      ])
    }
    for (const file of ["package.json", "bun.lock", "tsconfig.json"]) {
      copyFileSync(path.join(rootDir, file), path.join(stage, file))
    }
    const stageApi = path.join(stage, "apps/api")
    const configPath = path.join(stageApi, "tsconfig.json")
    const config = JSON.parse(readFileSync(configPath, "utf8"))
    config.compilerOptions = { ...config.compilerOptions, noCheck: true }
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
    const outputPath = path.join(stageApi, "src/bundle.js")
    runStage("bun", [
      "build",
      "--target=bun",
      "--packages=bundle",
      "--env=disable",
      `--outfile=${outputPath}`,
      "apps/api/src/index.ts",
    ])
    const bundle = readFileSync(outputPath, "utf8")
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
    writeFileSync(
      path.join(stageApi, "src/index.ts"),
      'import { Hono } from "hono"\nimport bundledApp from "./bundle.js"\nconst app = new Hono()\napp.all("*", (context) => bundledApp.fetch(context.req.raw))\nexport default app\n',
    )
    mkdirSync(path.join(stage, ".vercel"), { recursive: true })
    copyFileSync(
      path.join(apiDir, ".vercel/project.json"),
      path.join(stage, ".vercel/project.json"),
    )
    return stage
  } catch (error) {
    rmSync(stage, { recursive: true, force: true })
    throw error
  }
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
const skipMigrations = bool(env.VERCEL_API_SKIP_MIGRATIONS, false)
const force = bool(env.VERCEL_API_FORCE, false)
const hostCheck = validateProductionApiHostConfiguration(fileEnv)

// The checkout may be linked to Marketing. Refuse to run migrations or deploy
// until the exact API project is linked; `vercel deploy` uses that local link.
try {
  // This helper reads .env.production and runs --prod migrations. A preview
  // target must use an isolated profile and cannot be selected here.
  assertProductionApiDeployMode(target)
  assertApiDeployTarget(
    apiDir,
    project,
    env.VERCEL_API_PROJECT_ID?.trim(),
    env.VERCEL_API_ORG_ID?.trim(),
  )
  const readonlyDatabaseUrl = env.PRODUCTION_READONLY_DATABASE_URL?.trim()
  const backupReference = env.VERCEL_API_BACKUP_REFERENCE?.trim()
  const migrationApproved = env.VERCEL_API_PROD_MIGRATION_APPROVED?.trim()
  const freshDatabaseVerified =
    !skipMigrations &&
    !readonlyDatabaseUrl &&
    backupReference &&
    migrationApproved === "true"
      ? inspectFreshProductionDatabase({
          productionUrl: env.EWATRADE_DATABASE_URL,
          localUrl: parseEnvFile(".env.local").EWATRADE_DATABASE_URL,
          previewUrl: parseEnvFile(".env.preview").EWATRADE_DATABASE_URL,
          backupReference,
          rootDir,
        })
      : false
  assertProductionMigrationGate({
    isProduction,
    skipMigrations,
    readonlyDatabaseUrl,
    freshDatabaseVerified,
    backupReference,
    migrationApproved,
  })
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
// database. Sensitive values are unreadable after creation and never enter
// deployment command arguments or this process's output.
try {
  const inventory = run(
    "bunx",
    [
      "vercel",
      "api",
      `/v9/projects/${env.VERCEL_API_PROJECT_ID}/env`,
      "--cwd",
      apiDir,
      "--raw",
      ...vercelScopeArgs,
    ],
    { capture: true },
  )
  assertProductionApiProjectEnvironment(JSON.parse(inventory.stdout))
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
console.log(`Migrate: ${skipMigrations ? "skip" : "deploy"}`)

if (!skipMigrations) {
  console.log("Running database migrations...")
  run("bun", ["run", "db:migrate", "--prod"], { env })
}

console.log("Building isolated Production artifact...")
run("bun", ["run", "--cwd", "apps/api", "typecheck"], { env })
let deploymentUrl
const stage = stageProductionApi()
try {
  runStage("bunx", [
    "vercel",
    "pull",
    "--yes",
    "--environment=production",
    "--cwd",
    stage,
    ...vercelScopeArgs,
  ])
  console.log("Starting deployment...")
  const deploy = runStage("bunx", [
    "vercel",
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
  deploymentUrl = getDeploymentUrl(deploy.stdout)
} finally {
  rmSync(stage, { recursive: true, force: true })
}

if (!deploymentUrl) {
  console.log(deploy.stdout)
  console.error("Could not read deployment URL from Vercel output.")
  process.exit(1)
}

const url = deploymentUrl.startsWith("http")
  ? deploymentUrl
  : `https://${deploymentUrl}`

console.log(`Deployment URL: ${url}`)

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
