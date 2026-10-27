import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import {
  applyDatabaseProfile,
  loadProductionDatabaseUrl,
} from "./database-profile.mjs"
import { loadRootEnvironment } from "./environment-profile.mjs"

export type DoctorOptions = {
  profile: "local" | "dev" | "preview"
  services: string[]
  offline: boolean
  requireQa: boolean
  database: boolean
  device?: string
  help: boolean
}
export type Check = {
  name: string
  status: "pass" | "fail" | "skip"
  detail: string
}
const origins: Record<string, string> = {
  api: "https://ewatrade-api.localhost",
  dashboard: "https://ewatrade-dashboard.localhost",
  marketing: "https://ewatrade.localhost",
  storefront: "https://ewatrade-storefront.localhost",
}
const usage = `Usage: bun run qa:doctor [--profile local|dev|preview] [--services api,dashboard,mobile]
  --offline       Configuration checks only; no HTTP or Android calls
  --require-qa    Require enabled QA access (does not prove populated profiles)
  --database      Also probe database readiness (wakes the selected Neon database)
  --device SERIAL Run existing Android connection diagnostics with --no-launch
Default services: api,dashboard. Named URLs refer to locally running services.
The default API check is SQL-free liveness; --require-qa also checks database readiness.
No services are started, database changes applied, or provider settings changed.
Android diagnostics install reverse mappings on the explicitly selected device.`

export function parseDoctorArgs(args: string[]): DoctorOptions {
  const options: DoctorOptions = {
    profile: "local",
    services: ["api", "dashboard"],
    offline: false,
    requireQa: false,
    database: false,
    help: false,
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const value = () => {
      const next = args[++i]
      if (!next || next.startsWith("-"))
        throw new Error(`Missing value for ${arg}`)
      return next
    }
    if (arg === "--profile") {
      const profile = value()
      if (!["local", "dev", "preview"].includes(profile))
        throw new Error("Doctor supports non-production profiles only.")
      options.profile = profile as DoctorOptions["profile"]
    } else if (arg === "--services") {
      options.services = [...new Set(value().split(","))]
      if (
        options.services.some(
          (name) => ![...Object.keys(origins), "mobile"].includes(name),
        )
      )
        throw new Error(
          "Unknown service. Use api,dashboard,marketing,storefront,mobile.",
        )
    } else if (arg === "--offline") options.offline = true
    else if (arg === "--require-qa") options.requireQa = true
    else if (arg === "--database") options.database = true
    else if (arg === "--device") options.device = value()
    else if (arg === "--help" || arg === "-h") options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (options.device && (options.profile !== "local" || options.offline))
    throw new Error(
      "Android diagnostics require --profile local without --offline.",
    )
  if (
    (options.database ||
      options.requireQa ||
      options.services.includes("mobile")) &&
    !options.services.includes("api")
  )
    options.services.push("api")
  return options
}

export function inspectDoctorConfig(
  root: string,
  profile: DoctorOptions["profile"],
): Check[] {
  const checks: Check[] = []
  try {
    // Reuse the canonical loader and isolation guard; never log loaded values.
    const loaded = loadRootEnvironment(root, { DEV_PROFILE: profile })
    if (!loaded.profileExists)
      throw new Error("Selected profile file is missing.")
    applyDatabaseProfile(loaded.env, loadProductionDatabaseUrl(root))
    checks.push({
      name: "profile",
      status: "pass",
      detail: `${loaded.profileFile}: database target isolation verified without connecting.`,
    })
  } catch {
    checks.push({
      name: "profile",
      status: "fail",
      detail:
        "Check the selected root profile and production identity using the environment runbook; no values were printed.",
    })
  }
  for (const [name, file, repair] of [
    [
      "dependencies",
      "node_modules/.bin/tsc",
      "Install frozen dependencies with the pinned Bun version.",
    ],
    [
      "generated client",
      "packages/db/generated/prisma/client.ts",
      "Run bun run db:generate (schema-only generation).",
    ],
  ])
    checks.push({
      name,
      status: existsSync(resolve(root, file)) ? "pass" : "fail",
      detail: existsSync(resolve(root, file))
        ? "Present; freshness is not certified."
        : repair,
    })
  return checks
}

export async function inspectDoctorServices(
  options: DoctorOptions,
  env: NodeJS.ProcessEnv,
  request: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Check[]> {
  const checks: Check[] = []
  async function probe(
    name: string,
    url: string,
    validate: (response: Response) => Promise<boolean>,
  ) {
    try {
      const response = await request(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(4000),
      })
      if (!(await validate(response))) throw new Error("Unexpected response")
      checks.push({
        name,
        status: "pass",
        detail: "Expected local service response received.",
      })
    } catch {
      checks.push({
        name,
        status: "fail",
        detail: `Check the named host and selected root dev stack (${options.profile}); no response body was printed.`,
      })
    }
  }
  await Promise.all(
    options.services.map(async (name) => {
      if (name === "mobile") {
        const port = env.MOBILE_PORT || env.EXPO_PORT || "3096"
        if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
          checks.push({
            name: "Metro",
            status: "fail",
            detail: "Invalid MOBILE_PORT/EXPO_PORT.",
          })
          return
        }
        await probe(
          "Metro",
          `http://127.0.0.1:${port}/status`,
          async (r) =>
            r.status === 200 &&
            (await r.text()).includes("packager-status:running"),
        )
      } else if (name === "api") {
        const database = options.database || options.requireQa
        await probe(
          database ? "API database readiness" : "API liveness",
          `${origins.api}/${database ? "health" : "live"}`,
          async (r) => r.status === 200 && (await r.json()).status === "ok",
        )
        if (!options.requireQa) {
          checks.push({
            name: "QA capability",
            status: "skip",
            detail:
              "Not requested; use --require-qa for connected QA readiness.",
          })
          return
        }
        const input = encodeURIComponent(
          JSON.stringify({ json: { contractVersion: 1 } }),
        )
        await probe(
          "QA capability",
          `${origins.api}/api/trpc/qaAccess.capability?input=${input}`,
          async (r) => {
            if (r.status !== 200) return false
            const capability = (await r.json())?.result?.data?.json
            const environments =
              options.profile === "preview"
                ? ["preview"]
                : options.profile === "dev"
                  ? ["dev", "development"]
                  : ["local", "development"]
            if (capability?.available === true)
              return environments.includes(capability.environment)
            return false
          },
        )
      } else {
        await probe(
          name,
          origins[name],
          async (r) =>
            r.status === 200 ||
            ((r.status === 307 || r.status === 302) &&
              /^\/(login|sign-in)(\?|$|\/)/.test(
                r.headers.get("location") || "",
              )),
        )
      }
    }),
  )
  return checks
}

export async function runDoctor(
  options: DoctorOptions,
  root = resolve(import.meta.dir, ".."),
) {
  if (options.help) {
    console.log(usage)
    return 0
  }
  const checks = inspectDoctorConfig(root, options.profile)
  if (!checks.some((check) => check.status === "fail") && !options.offline) {
    const { env } = loadRootEnvironment(root, { DEV_PROFILE: options.profile })
    checks.push(...(await inspectDoctorServices(options, env)))
    if (options.device && !checks.some((check) => check.status === "fail")) {
      const args = [
        "apps/mobile/scripts/prepare-android-dev.mjs",
        "--device",
        options.device,
        "--no-launch",
        "--metro-port",
        env.MOBILE_PORT || env.EXPO_PORT || "3096",
        "--api-port",
        env.API_PORT || "3095",
      ]
      if (options.requireQa) args.push("--require-qa")
      const result = spawnSync("node", args, {
        cwd: root,
        stdio: "inherit",
        timeout: 30000,
      })
      checks.push({
        name: "Android",
        status: result.status === 0 ? "pass" : "fail",
        detail: "Existing connection helper; app not launched.",
      })
    }
  } else
    checks.push({
      name: "runtime",
      status: "skip",
      detail: "No HTTP/device probes performed; runtime readiness unverified.",
    })
  for (const check of checks)
    console.log(`${check.status.toUpperCase()} ${check.name}: ${check.detail}`)
  console.log(
    "Doctor does not certify running source revision, schema parity, jobs, populated QA profiles, or release acceptance.",
  )
  return checks.some((check) => check.status === "fail") ? 1 : 0
}

if (import.meta.main) {
  try {
    process.exitCode = await runDoctor(parseDoctorArgs(process.argv.slice(2)))
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Doctor failed.")
    process.exitCode = 1
  }
}
