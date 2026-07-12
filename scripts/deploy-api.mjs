#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

const rootDir = new URL("../", import.meta.url).pathname
const envFile = ".env.production"

process.chdir(rootDir)

const defaultEnvKeys = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "EWATRADE_AUTH_SECRET",
  "AUTH_SECRET",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_PRODUCTION_URL",
  "EWATRADE_API_URL",
  "NEXT_PUBLIC_API_URL",
  "ALLOWED_API_ORIGINS",
  "BETTER_AUTH_TRUSTED_ORIGINS",
  "INTERNAL_API_KEY",
  "NEXT_PUBLIC_PLATFORM_DOMAIN",
  "EWATRADE_PLATFORM_DOMAIN",
  "NEXT_PUBLIC_EWATRADE_PLATFORM_DOMAIN",
  "NEXT_PUBLIC_MARKETING_URL",
  "NEXT_PUBLIC_DASHBOARD_URL",
  "EWATRADE_MARKETING_URL",
  "EWATRADE_DASHBOARD_URL",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
  "MARKETING_INBOX_EMAILS",
  "TRIGGER_SECRET_KEY",
  "NEXT_PUBLIC_SIGNUP_ENABLED",
  "DEBUG_PERF",
]

function usage() {
  console.log(`Usage: bun run api:deploy

Deploys @ewatrade/api to Vercel using one-time config from ${envFile}.

Required in ${envFile}:
  DATABASE_URL
  BETTER_AUTH_SECRET, EWATRADE_AUTH_SECRET, or AUTH_SECRET

Optional deployment config in ${envFile}:
  VERCEL_SCOPE=<account-or-team-slug>
  VERCEL_API_PROJECT=ewatrade-api
  VERCEL_API_TARGET=production
  VERCEL_API_SKIP_TEST=false
  VERCEL_API_SKIP_MIGRATIONS=false
  VERCEL_API_HEALTH_URL=https://ewatrade.com
  VERCEL_API_FORCE=false
  VERCEL_API_ENV_KEYS=DATABASE_URL,BETTER_AUTH_SECRET,...
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
const project = env.VERCEL_API_PROJECT?.trim() || "ewatrade-api"
const scope = env.VERCEL_SCOPE?.trim() || ""
const target = env.VERCEL_API_TARGET?.trim() || "production"
const isProduction = target === "production"
const skipTest = bool(env.VERCEL_API_SKIP_TEST, false)
const skipMigrations = bool(env.VERCEL_API_SKIP_MIGRATIONS, false)
const force = bool(env.VERCEL_API_FORCE, false)
const healthUrl = env.VERCEL_API_HEALTH_URL?.trim() || ""
const envKeys = (env.VERCEL_API_ENV_KEYS?.split(",") ?? defaultEnvKeys)
  .map((key) => key.trim())
  .filter(Boolean)

requireValue(env, "DATABASE_URL")

if (
  !env.BETTER_AUTH_SECRET?.trim() &&
  !env.EWATRADE_AUTH_SECRET?.trim() &&
  !env.AUTH_SECRET?.trim()
) {
  console.error(
    `Set BETTER_AUTH_SECRET, EWATRADE_AUTH_SECRET, or AUTH_SECRET in ${envFile}.`,
  )
  process.exit(1)
}

if (/localhost|127\.0\.0\.1/.test(env.DATABASE_URL)) {
  console.error(
    `DATABASE_URL in ${envFile} must be a hosted production database.`,
  )
  process.exit(1)
}

const vercelScopeArgs = scope ? ["--scope", scope] : []

console.log("Deploying @ewatrade/api to Vercel")
console.log(`Project: ${project}`)
if (scope) console.log(`Scope:   ${scope}`)
console.log(`Target:  ${target}`)
console.log(`Env:     ${envFile}`)
console.log(`Migrate: ${skipMigrations ? "skip" : "deploy"}`)

if (!existsSync(".vercel/project.json")) {
  console.log("No local Vercel link found. Linking or creating project...")
  run("bunx", [
    "vercel",
    "link",
    "--yes",
    "--project",
    project,
    ...vercelScopeArgs,
  ])
}

if (!skipMigrations) {
  console.log("Running database migrations...")
  run("bun", ["run", "--cwd", "packages/db", "migrate:deploy"], { env })
}

const deployArgs = [
  "vercel",
  "deploy",
  "--yes",
  "--project",
  project,
  "--format",
  "json",
]

if (isProduction) deployArgs.push("--prod")
if (force) deployArgs.push("--force")

for (const key of envKeys) {
  const value = env[key]
  if (!value?.trim()) continue

  deployArgs.push("--env", `${key}=${value}`)

  // Vercel may evaluate server entrypoints during build/bundling. These keep
  // top-level production env checks from failing before the runtime exists.
  if (
    key === "DATABASE_URL" ||
    key === "BETTER_AUTH_SECRET" ||
    key === "EWATRADE_AUTH_SECRET" ||
    key === "AUTH_SECRET"
  ) {
    deployArgs.push("--build-env", `${key}=${value}`)
  }
}

console.log("Starting deployment...")
const deploy = run("bunx", [...deployArgs, ...vercelScopeArgs], {
  capture: true,
})
const deploymentUrl = getDeploymentUrl(deploy.stdout)

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
  console.log("Testing health endpoint...")
  const baseUrl = healthUrl || url
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
    redirect: "manual",
  })
  const body = await response.text()

  if (!response.ok) {
    console.error(`/health failed with ${response.status}: ${body}`)
    process.exit(1)
  }

  try {
    const health = JSON.parse(body)
    if (health.status !== "ok") {
      console.error(`/health returned unexpected JSON: ${body}`)
      process.exit(1)
    }
  } catch {
    console.error(`/health returned non-JSON response: ${body.slice(0, 200)}`)
    process.exit(1)
  }

  console.log(body)
}

console.log("Done.")
