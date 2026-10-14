// G04 custody verifier launcher for the authorized Development QA target.
//
//   bun --env-file=/dev/null scripts/qa-assistant-stock-custody.mjs --self-test
//   bun --env-file=/dev/null scripts/qa-assistant-stock-custody.mjs \
//     --run --sections E --budgets E=100 [--environment-root ABS]
//
// Nothing connects without --run and an explicit, reviewed section list with
// a strictly parsed statement budget for every section (no default). The
// guard runs before any network work: explicit root .env.local profile, the
// shared Production exclusion, and the effective pg-parsed target pinned to
// the exact QA host, port 5432 and ewatrade_qa_v1 (the latency diagnostic's
// guard, reused unchanged). The lifecycle (child, cancellation, plan
// evidence, read-only audit, bounded cleanup, whole-run ceiling) lives in the
// tested runner tools; this file only wires real processes and clients.
// The URL and credentials are never printed.
import { spawn } from "node:child_process"
import { randomBytes, randomUUID } from "node:crypto"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  childEnvironment,
  createRunControl,
  installBackstop,
  orchestrateRun,
  parseRunnerArgs,
  planHeader,
  runnerDeadlines,
} from "../apps/api/src/assistant/general-stock-custody-runner-tools.ts"
import { loadProductionDatabaseUrl } from "./database-profile.mjs"
import { loadRootEnvironment } from "./environment-profile.mjs"
import { authorizedHost, resolveTarget } from "./qa-staff-activity-latency.mjs"

export const integrationFile =
  "apps/api/src/assistant/general-stock-custody.integration.test.ts"

async function run(parsed) {
  const deadlines = runnerDeadlines()
  // One control for the lifecycle and the backstop: the same cleanup
  // (SIGKILL child, destroy audit, clear timers) at the absolute 120 s
  // ceiling, measured from launcher start, with no added allowance.
  const control = createRunControl()
  installBackstop({
    totalMs: deadlines.totalMs,
    control,
    exit: (code) => process.exit(code),
    report: (line) => console.info(line),
  })
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const environmentRoot = parsed.environmentRoot ?? root
  const loaded = loadRootEnvironment(environmentRoot, {
    ...process.env,
    APP_ENV: "local",
    DEV_PROFILE: "local",
    NODE_ENV: "development",
  })
  const { url } = resolveTarget({
    loaded,
    productionUrl: loadProductionDatabaseUrl(environmentRoot),
  })
  const marker = randomUUID()
  const workDir = mkdtempSync(path.join(tmpdir(), "g04-custody-"))
  const planFile = path.join(workDir, "planned.jsonl")
  // Owned and pre-created: a missing file is never mistaken for "no plan".
  writeFileSync(planFile, planHeader(marker), { flag: "wx" })
  const env = childEnvironment(loaded.env, {
    url,
    sections: parsed.sections,
    budgets: parsed.budgets,
    planFile,
    marker,
    signingKey: randomBytes(32).toString("hex"),
  })
  console.info(
    `Running G04 custody sections ${parsed.sections.join(",")} on the authorized Development QA target; Production excluded; whole run ≤ ${deadlines.totalMs / 1000} s.`,
  )
  let childProcess
  const result = await orchestrateRun({
    marker,
    deadlines,
    control,
    startChild() {
      childProcess = spawn(
        "bun",
        ["--env-file=/dev/null", "test", "--bail", integrationFile],
        { cwd: root, env, stdio: "inherit" },
      )
      return {
        kill: (signal) => childProcess.kill(signal),
        onExit: (listener) => {
          childProcess.once("exit", (code, signal) =>
            listener({ code, signal }),
          )
          childProcess.once("error", () =>
            listener({ code: null, signal: "SPAWN_ERROR" }),
          )
        },
      }
    },
    readPlanFile: () =>
      existsSync(planFile) ? readFileSync(planFile, "utf8") : null,
    makeAuditClient() {
      // Destroy may arrive before or during client creation; once destroyed,
      // no connection is started (or kept) by this wrapper.
      let client
      let destroyed = false
      return {
        async connect() {
          const { default: pg } = await import("pg")
          if (destroyed)
            throw Object.assign(new Error("audit destroyed"), {
              code: "AUDIT_EXPIRED",
            })
          client = new pg.Client({
            connectionString: url,
            connectionTimeoutMillis: 10_000,
            query_timeout: 5_000,
            application_name: "g04-custody-audit",
          })
          client.on("error", () => {})
          await client.connect()
          if (destroyed) {
            client.connection?.stream?.destroy()
            throw Object.assign(new Error("audit destroyed"), {
              code: "AUDIT_EXPIRED",
            })
          }
        },
        query: (sql, values) => {
          if (destroyed || !client)
            return Promise.reject(
              Object.assign(new Error("audit destroyed"), {
                code: "AUDIT_EXPIRED",
              }),
            )
          return client.query(sql, values)
        },
        end: () => (client ? client.end() : Promise.resolve()),
        destroy: () => {
          destroyed = true
          client?.connection?.stream?.destroy()
        },
      }
    },
  })
  // Same cleanup as the ceiling: kills a still-live child, destroys any
  // audit client and clears timers before exiting.
  control.cancel()
  // Plan evidence is kept whenever the run did not pass.
  if (result.passed) rmSync(workDir, { recursive: true, force: true })
  console.info(
    JSON.stringify({
      g04CustodyRun: {
        ...result,
        planEvidence: result.passed ? "removed" : workDir,
      },
    }),
  )
  process.exit(result.passed ? 0 : 1)
}

async function selfTest() {
  const results = []
  const check = (name, ok) => {
    results.push(ok)
    console.info(JSON.stringify({ selfTest: name, ok }))
  }
  const refuses = (work) => {
    try {
      work()
      return false
    } catch {
      return true
    }
  }
  check(
    "no arguments refused",
    refuses(() => parseRunnerArgs([])),
  )
  check(
    "duplicate budget refused",
    refuses(() =>
      parseRunnerArgs(["--run", "--sections", "E", "--budgets", "E=100,E=1"]),
    ),
  )
  check(
    "extra budget field refused",
    refuses(() =>
      parseRunnerArgs(["--run", "--sections", "E", "--budgets", "E=100=1"]),
    ),
  )
  const parsed = parseRunnerArgs([
    "--run",
    "--sections",
    "E",
    "--budgets",
    "E=100",
  ])
  check(
    "explicit E=100 accepted",
    parsed.mode === "run" && parsed.budgets.E === 100,
  )
  const good = `postgresql://synthetic:synthetic@${authorizedHost}/ewatrade_qa_v1?sslmode=require`
  const production =
    "postgresql://synthetic:synthetic@ep-synthetic-prod.us-east-1.aws.neon.tech/prod?sslmode=require"
  const loaded = (url) => ({
    profile: "local",
    profileExists: true,
    env: { APP_ENV: "local", DEV_PROFILE: "local", EWATRADE_DATABASE_URL: url },
  })
  const pinned = resolveTarget({
    loaded: loaded(good),
    productionUrl: production,
  })
  check("target pinned to 5432", new URL(pinned.url).port === "5432")
  check(
    "Production-equivalent target refused",
    refuses(() => resolveTarget({ loaded: loaded(good), productionUrl: good })),
  )
  check(
    "routing override refused",
    refuses(() =>
      resolveTarget({
        loaded: loaded(`${good}&host=127.0.0.1`),
        productionUrl: production,
      }),
    ),
  )
  const env = childEnvironment(
    { PATH: "/bin", PGSSLMODE: "disable", PGPORT: "6000" },
    {
      url: pinned.url,
      sections: ["E"],
      budgets: { E: 100 },
      planFile: "/tmp/plan",
      marker: "m",
      signingKey: "k".repeat(64),
    },
  )
  check(
    "child environment pinned with no ambient PG keys",
    env.EWATRADE_DATABASE_URL === pinned.url &&
      !Object.keys(env).some((key) => key.startsWith("PG")),
  )
  const deadlines = runnerDeadlines()
  check(
    "deadlines reserve cancellation and audit inside 120 s",
    deadlines.childMs + deadlines.cancelMs + deadlines.auditMs ===
      deadlines.totalMs && deadlines.totalMs === 120_000,
  )
  const failed = results.filter((ok) => !ok).length
  console.info(
    JSON.stringify({
      selfTest: "summary",
      cases: results.length,
      failed,
      network: "none",
      lifecycle:
        "covered offline in general-stock-custody-runner-tools.test.ts",
    }),
  )
  process.exitCode = failed ? 1 : 0
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  const parsed = parseRunnerArgs(process.argv.slice(2))
  if (parsed.mode === "self-test") await selfTest()
  else await run(parsed)
}
