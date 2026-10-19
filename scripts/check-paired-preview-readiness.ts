import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { inspectApiPreviewReadiness } from "./check-api-preview-readiness.mjs"
import { databaseTargetsEqual } from "./database-profile.mjs"
import {
  loadRootEnvironment,
  readEnvironmentFile,
} from "./environment-profile.mjs"

type Env = Record<string, string | undefined>
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const apiOrigin = "https://preview-api.ewatrade.com"
const dashboardOrigin = "https://preview-dashboard.ewatrade.com"
let inspectionStep = "arguments"
const assistantFlags = [
  "ASSISTANT_WHATSAPP_ENABLED",
  "ASSISTANT_WHATSAPP_READS_ENABLED",
  "ASSISTANT_WHATSAPP_WRITES_ENABLED",
  "ASSISTANT_WHATSAPP_MEDIA_ENABLED",
  "ASSISTANT_WHATSAPP_SETUP_ENABLED",
  "ASSISTANT_WHATSAPP_PRODUCT_ENABLED",
  "ASSISTANT_WHATSAPP_WORKFLOW_WRITES_ENABLED",
]

function argumentsFor(args: string[]) {
  const options: Record<string, string> = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (
      !key ||
      ![
        "--profile-root",
        "--source-root",
        "--api-env",
        "--dashboard-env",
      ].includes(key) ||
      !value ||
      value.startsWith("--") ||
      options[key]
    )
      throw new Error("INVALID_ARGUMENTS")
    options[key] = path.resolve(value)
  }
  if (Boolean(options["--api-env"]) !== Boolean(options["--dashboard-env"]))
    throw new Error("BOTH_HOSTED_ENV_SNAPSHOTS_REQUIRED")
  return options
}

function includesOrigin(value: string | undefined, expected: string) {
  return (
    value
      ?.split(",")
      .map((entry) => entry.trim())
      .includes(expected) === true
  )
}

function sameDatabase(left: string | undefined, right: string | undefined) {
  try {
    return Boolean(left && right && databaseTargetsEqual(left, right))
  } catch {
    return false
  }
}

function authSecret(env: Env) {
  return env.BETTER_AUTH_SECRET?.trim() || env.AUTH_SECRET?.trim()
}

async function main() {
  const args = argumentsFor(process.argv.slice(2))
  const profileRoot = args["--profile-root"] ?? root
  const sourceRoot = args["--source-root"] ?? root
  const source = (name: string) =>
    readFileSync(path.join(sourceRoot, name), "utf8")
  inspectionStep = "pure_configuration_helpers"
  const { applyEwatradeSharedEnv } = await import(
    pathToFileURL(path.join(sourceRoot, "packages/utils/src/shared-env.ts"))
      .href
  )
  const { getQaAcceleratorAvailability } = await import(
    pathToFileURL(path.join(sourceRoot, "packages/utils/src/qa-accelerator.ts"))
      .href
  )
  inspectionStep = "selected_profiles"
  const selected = loadRootEnvironment(profileRoot, {
    APP_ENV: "preview",
    DEV_PROFILE: "preview",
    NODE_ENV: "production",
  }).env
  const production = loadRootEnvironment(profileRoot, {
    APP_ENV: "production",
    DEV_PROFILE: "production",
    NODE_ENV: "production",
  }).env
  applyEwatradeSharedEnv(selected)
  applyEwatradeSharedEnv(production)
  const overrides = (origin: string) => ({
    APP_ENV: "preview",
    NODE_ENV: "production",
    PLATFORM_DOMAIN: new URL(origin).hostname,
    NEXT_PUBLIC_PLATFORM_DOMAIN: new URL(origin).hostname,
    BETTER_AUTH_URL: origin,
    API_URL: apiOrigin,
    NEXT_PUBLIC_API_URL: apiOrigin,
    NEXT_PUBLIC_DASHBOARD_URL: dashboardOrigin,
  })
  const apiEnvPath = args["--api-env"]
  const dashboardEnvPath = args["--dashboard-env"]
  const hasSnapshots = Boolean(apiEnvPath && dashboardEnvPath)
  const api: Env = apiEnvPath
    ? readEnvironmentFile(apiEnvPath)
    : { ...selected, ...overrides(apiOrigin) }
  const dashboard: Env = dashboardEnvPath
    ? readEnvironmentFile(dashboardEnvPath)
    : { ...selected, ...overrides(dashboardOrigin) }
  applyEwatradeSharedEnv(api)
  applyEwatradeSharedEnv(dashboard)
  const issues = inspectApiPreviewReadiness(profileRoot).map(
    (issue: string) => `PROFILE_${issue}`,
  )
  const checks: Record<string, boolean> = {}
  const check = (name: string, passed: boolean) => {
    checks[name] = passed
    if (!passed) issues.push(name)
  }
  for (const [name, env, origin] of [
    ["API", api, apiOrigin],
    ["DASHBOARD", dashboard, dashboardOrigin],
  ] as const) {
    check(
      `${name}_PREVIEW_RUNTIME`,
      env.APP_ENV === "preview" && env.NODE_ENV === "production",
    )
    check(
      `${name}_HOST_SCOPED_COOKIE_DOMAIN`,
      env.PLATFORM_DOMAIN === new URL(origin).hostname &&
        env.NEXT_PUBLIC_PLATFORM_DOMAIN === new URL(origin).hostname,
    )
    check(`${name}_HTTPS_AUTH_ORIGIN`, env.BETTER_AUTH_URL === origin)
    check(
      `${name}_EXACT_API_URLS`,
      env.API_URL === apiOrigin && env.NEXT_PUBLIC_API_URL === apiOrigin,
    )
    check(
      `${name}_EXACT_DASHBOARD_URL`,
      env.NEXT_PUBLIC_DASHBOARD_URL === dashboardOrigin,
    )
    check(
      `${name}_SELECTED_PREVIEW_DATABASE`,
      sameDatabase(env.EWATRADE_DATABASE_URL, selected.EWATRADE_DATABASE_URL),
    )
    check(
      `${name}_PRODUCTION_DATABASE_SEPARATE`,
      Boolean(production.EWATRADE_DATABASE_URL) &&
        !sameDatabase(
          env.EWATRADE_DATABASE_URL,
          production.EWATRADE_DATABASE_URL,
        ),
    )
    check(
      `${name}_SELECTED_PREVIEW_AUTH_SECRET`,
      Boolean(authSecret(selected)) && authSecret(env) === authSecret(selected),
    )
    check(
      `${name}_PRODUCTION_AUTH_SECRET_SEPARATE`,
      Boolean(authSecret(production)) &&
        authSecret(env) !== authSecret(production),
    )
    check(
      `${name}_SELECTED_QA_SECRET`,
      Boolean(selected.QA_ACCELERATOR_SECRET) &&
        env.QA_ACCELERATOR_SECRET === selected.QA_ACCELERATOR_SECRET,
    )
    check(
      `${name}_PRODUCTION_QA_SECRET_SEPARATE`,
      !production.QA_ACCELERATOR_SECRET ||
        env.QA_ACCELERATOR_SECRET !== production.QA_ACCELERATOR_SECRET,
    )
    check(
      `${name}_EXACT_TRUSTED_PAIR`,
      [apiOrigin, dashboardOrigin].every((value) =>
        includesOrigin(env.BETTER_AUTH_TRUSTED_ORIGINS, value),
      ),
    )
    check(
      `${name}_EXACT_CORS_DASHBOARD`,
      includesOrigin(env.ALLOWED_API_ORIGINS, dashboardOrigin),
    )
    check(
      `${name}_ASSISTANT_DISABLED`,
      assistantFlags.every((flag) => env[flag] !== "true"),
    )
    check(
      `${name}_QA_FRONT_DOOR_AVAILABLE`,
      getQaAcceleratorAvailability({
        env,
        origin: dashboardOrigin,
        platform: "web",
        clientContractVersion: 1,
      }).available === true,
    )
    check(
      `${name}_QA_FOREIGN_ORIGIN_REFUSED`,
      getQaAcceleratorAvailability({
        env,
        origin: "https://unapproved.example.test",
        platform: "web",
        clientContractVersion: 1,
      }).available === false,
    )
    check(
      `${name}_QA_PRODUCTION_REFUSED`,
      getQaAcceleratorAvailability({
        env: { ...env, APP_ENV: "production", QA_ACCELERATOR_ENABLED: "false" },
        origin: dashboardOrigin,
        platform: "web",
        clientContractVersion: 1,
      }).available === false,
    )
    check(
      `${name}_NO_PUBLIC_HOSTING_BYPASS`,
      Object.entries(env).every(
        ([key, value]) =>
          !key.startsWith("NEXT_PUBLIC_") ||
          !value ||
          !/BYPASS|PROTECTION/i.test(key),
      ),
    )
  }
  // Import only Next configuration, with public configuration inputs and no credentials.
  inspectionStep = "next_configuration"
  const originalEnv = { ...process.env }
  let rewrites: Array<{ source: string; destination: string }> = []
  let pageExtensions: string[] = []
  try {
    for (const key of Object.keys(process.env)) delete process.env[key]
    for (const key of [
      "APP_ENV",
      "NODE_ENV",
      "API_URL",
      "NEXT_PUBLIC_API_URL",
      "NEXT_PUBLIC_PLATFORM_DOMAIN",
      "QA_ACCELERATOR_ENABLED",
    ]) {
      if (dashboard[key]) process.env[key] = dashboard[key]
    }
    const config = await import(
      pathToFileURL(path.join(sourceRoot, "apps/dashboard/next.config.ts")).href
    )
    rewrites = await config.nextConfig.rewrites()
    pageExtensions = config.nextConfig.pageExtensions
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, originalEnv)
  }
  check(
    "DASHBOARD_ACTUAL_REWRITES_PINNED_TO_API",
    rewrites.length > 0 &&
      rewrites.every(
        (row: { source: string; destination: string }) =>
          row.destination === `${apiOrigin}${row.source}`,
      ),
  )
  check(
    "DASHBOARD_TRPC_SAME_ORIGIN_REWRITE",
    rewrites.some(
      (row: { source: string; destination: string }) =>
        row.source === "/api/trpc/:path*" &&
        row.destination === `${apiOrigin}/api/trpc/:path*`,
    ),
  )
  check("DASHBOARD_QA_ROUTES_INCLUDED", pageExtensions.includes("qa.ts"))
  inspectionStep = "source_fingerprints"
  const sourceFiles = [
    "packages/auth/src/index.ts",
    "packages/utils/src/qa-accelerator.ts",
    "apps/dashboard/next.config.ts",
    "apps/dashboard/src/app/api/qa-access/route.qa.ts",
    "apps/dashboard/src/trpc/client.tsx",
    "apps/dashboard/src/trpc/server.tsx",
    "apps/api/src/trpc/init.ts",
  ]
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        observedAt: new Date().toISOString(),
        scope: hasSnapshots
          ? "provided_environment_snapshots_and_source"
          : "local_profile_and_proposed_surface_overrides_only",
        status: issues.length
          ? "not_ready"
          : hasSnapshots
            ? "configuration_ready_not_runtime_accepted"
            : "proposed_configuration_ready_not_installed",
        apiOrigin,
        dashboardOrigin,
        requiredNonSecretSurfaceOverrides: {
          api: overrides(apiOrigin),
          dashboard: overrides(dashboardOrigin),
        },
        checks,
        issues,
        rewrites: checks.DASHBOARD_ACTUAL_REWRITES_PINNED_TO_API
          ? rewrites
          : [],
        sourceSha256: Object.fromEntries(
          sourceFiles.map((name) => [
            name,
            createHash("sha256").update(source(name)).digest("hex"),
          ]),
        ),
        acceptance: {
          hostedRuntime: false,
          authenticatedBrowser: false,
          signedMobile: false,
          workerCanaries: false,
          otpChanged: false,
          providerMutations: false,
        },
      },
      null,
      2,
    ),
  )
  if (issues.length) process.exitCode = 1
}

try {
  await main()
} catch {
  // Imported configuration or malformed credentials must not escape in diagnostics.
  console.error(
    JSON.stringify({
      status: "not_ready",
      issues: ["PAIRED_PREVIEW_CONFIGURATION_INSPECTION_FAILED"],
      step: inspectionStep,
    }),
  )
  process.exitCode = 1
}
