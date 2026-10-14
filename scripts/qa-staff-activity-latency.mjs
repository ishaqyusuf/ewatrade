// S05 bounded latency diagnostic for the authorized Development QA target.
//
//   node scripts/qa-staff-activity-latency.mjs --run [--environment-root ABS]
//   node scripts/qa-staff-activity-latency.mjs --self-test
//
// Read-only and bounded: DNS (3 samples), unauthenticated TCP to 5432
// (5 samples, each socket destroyed), one authenticated session with five
// `SELECT 1` and the server-side plans of the constant `SELECT 1` and
// `SELECT now()`. No business tables, writes, DDL, locks, transactions or
// provider calls; only the fixed statements below are ever sent. Prints
// timings, counts and sanitized codes only (never the URL, credentials or
// row values). Every phase has a deadline that cancels its own work; the
// first failure ends the run and later phases stay UNRUN; the whole process
// stops at 58 s. Results are observations, not root causes: client/server
// timing gaps mix network, TLS, pooler queueing, client overhead and server
// timing scope, and TCP to 5432 does not measure authenticated TLS/pooler.
import { promises as dns } from "node:dns"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseConnectionString } from "pg-connection-string"
import {
  applyDatabaseProfile,
  databaseTargetsEqual,
  loadProductionDatabaseUrl,
} from "./database-profile.mjs"
import { loadRootEnvironment } from "./environment-profile.mjs"

export const authorizedHost =
  "ep-royal-dew-awnlogem-pooler.c-12.us-east-1.aws.neon.tech"
export const authorizedDatabase = "ewatrade_qa_v1"
export const authorizedPort = 5432
/** Query parameters that cannot change where the driver connects. */
const allowedParameters = new Set(["sslmode", "channel_binding"])
const statements = {
  ping: "SELECT 1",
  planSelect: "EXPLAIN (ANALYZE, FORMAT JSON) SELECT 1",
  planNow: "EXPLAIN (ANALYZE, FORMAT JSON) SELECT now()",
}
export const defaultDeadlines = {
  processMs: 58_000,
  dnsSampleMs: 2_000,
  tcpSampleMs: 2_000,
  connectMs: 15_000,
  querySampleMs: 2_000,
  planMs: 3_000,
  cleanupMs: 3_000,
}
const planned = { dns: 3, tcp: 5, connect: 1, ping: 5, serverPlans: 2 }

/**
 * Pure guard, run before any DNS/TCP/authenticated work: explicit local
 * Development profile, the shared Production exclusion, then the target the
 * driver will actually use (as parsed by pg's own connection-string parser)
 * must be exactly the authorized PostgreSQL host, port 5432 and database,
 * with no routing overrides. Returns the URL for internal use only.
 */
export function resolveTarget({ loaded, productionUrl }) {
  if (!loaded.profileExists || loaded.profile !== "local")
    throw new Error("An explicit .env.local Development profile is required.")
  const env = applyDatabaseProfile({ ...loaded.env }, productionUrl)
  const url = env.EWATRADE_DATABASE_URL
  let target
  try {
    target = new URL(url)
  } catch {
    throw new Error("The Development profile has no usable database URL.")
  }
  if (target.protocol !== "postgresql:" && target.protocol !== "postgres:")
    throw new Error("Only a PostgreSQL target is allowed.")
  for (const name of target.searchParams.keys())
    if (!allowedParameters.has(name))
      throw new Error("Connection parameters that can reroute are refused.")
  const effective = parseConnectionString(url)
  if (
    target.hostname !== authorizedHost ||
    effective.host !== authorizedHost ||
    (target.port !== "" && target.port !== String(authorizedPort)) ||
    // An absent port parses as "" and means the PostgreSQL default 5432.
    (effective.port != null &&
      effective.port !== "" &&
      String(effective.port) !== String(authorizedPort)) ||
    effective.database !== authorizedDatabase ||
    target.pathname !== `/${authorizedDatabase}`
  )
    throw new Error(
      "The selected database is not the authorized ewatrade_qa_v1 QA target.",
    )
  // The shared exclusion compared URLs; re-check against the effective one.
  if (productionUrl && databaseTargetsEqual(url, productionUrl))
    throw new Error("The Production database target is refused.")
  // Pin the port in the URL itself: without it pg falls back to ambient
  // PGPORT, so TCP and authentication could diverge.
  target.port = String(authorizedPort)
  const pinned = target.toString()
  const effectivePinned = parseConnectionString(pinned)
  if (
    effectivePinned.host !== authorizedHost ||
    String(effectivePinned.port) !== String(authorizedPort) ||
    effectivePinned.database !== authorizedDatabase ||
    (productionUrl && databaseTargetsEqual(pinned, productionUrl))
  )
    throw new Error(
      "The selected database is not the authorized ewatrade_qa_v1 QA target.",
    )
  return { url: pinned, host: authorizedHost, port: authorizedPort }
}

/** Error codes only (e.g. ETIMEDOUT, 28P01); never messages or values. */
export function safeCode(error) {
  const code = error?.code
  return typeof code === "string" && /^[A-Z0-9_]{2,40}$/.test(code)
    ? code
    : "ERROR"
}

const round = (value) => Math.round(value * 10) / 10
const metric = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** Real network dependencies; the self-test injects stubs instead. */
export const realDependencies = {
  makeResolver: () => new dns.Resolver({ timeout: 1_500, tries: 1 }),
  connectSocket: (host, port) => net.connect({ host, port }),
  makeClient: async (config) => {
    const { default: pg } = await import("pg")
    return new pg.Client(config)
  },
  now: () => performance.now(),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (timer) => clearTimeout(timer),
  exit: (code) => process.exit(code),
  log: (line) => console.info(line),
}

class StopRun extends Error {}

/**
 * Runs the bounded phases. The first failure ends the run: later phases stay
 * UNRUN and cleanup runs. Attempts count only work actually started.
 */
export async function diagnose(
  { url, host, port },
  deps = realDependencies,
  deadlines = defaultDeadlines,
) {
  const phase = (name) => ({
    planned: planned[name],
    attempted: 0,
    completed: 0,
    status: "UNRUN",
  })
  const report = {
    dns: { ...phase("dns"), samplesMs: [] },
    tcp: { ...phase("tcp"), samplesMs: [] },
    connect: { ...phase("connect"), samplesMs: [] },
    ping: { ...phase("ping"), samplesMs: [] },
    serverPlans: { ...phase("serverPlans"), plans: [] },
  }
  // Everything that can still be running, so a deadline can cancel it.
  const active = { resolver: null, socket: null, client: null }
  let current = null
  let finished = false
  const destroyClient = () => active.client?.connection?.stream?.destroy()
  const stopAll = () => {
    active.resolver?.cancel()
    active.socket?.destroy()
    destroyClient()
  }
  const print = (outcome) =>
    deps.log(JSON.stringify({ s05Latency: report, outcome }))
  const ceiling = deps.setTimer(() => {
    if (finished) return
    finished = true
    stopAll()
    if (current && report[current].status === "running") {
      report[current].status = "deadline"
      report[current].errorCode = "PROCESS_DEADLINE"
    }
    print("process_deadline")
    deps.exit(2)
  }, deadlines.processMs)

  /** Runs one cancellable attempt; on deadline it cancels, then rejects. */
  const bounded = (ms, start, cancel) =>
    new Promise((resolve, reject) => {
      const timer = deps.setTimer(() => {
        cancel()
        reject(Object.assign(new Error("deadline"), { code: "DEADLINE" }))
      }, ms)
      Promise.resolve()
        .then(start)
        .then(
          (value) => {
            deps.clearTimer(timer)
            resolve(value)
          },
          (error) => {
            deps.clearTimer(timer)
            reject(error)
          },
        )
    })
  const begin = (name) => {
    current = name
    report[name].status = "running"
  }
  const attempt = async (name, work) => {
    report[name].attempted++
    try {
      return await work()
    } catch (error) {
      // After the process deadline the phase is already finalized.
      if (finished) throw new StopRun()
      report[name].status = report[name].completed > 0 ? "partial" : "error"
      report[name].errorCode = safeCode(error)
      throw new StopRun()
    }
  }
  const done = (name) => {
    report[name].status = "ok"
    current = null
  }

  try {
    // 1. DNS only: no connection.
    begin("dns")
    let address
    for (let index = 0; index < planned.dns; index++) {
      const resolver = deps.makeResolver()
      active.resolver = resolver
      const started = deps.now()
      try {
        const addresses = await attempt("dns", () =>
          bounded(
            deadlines.dnsSampleMs,
            () => resolver.resolve4(host),
            () => resolver.cancel(),
          ),
        )
        report.dns.samplesMs.push(round(deps.now() - started))
        report.dns.completed++
        address ??= addresses?.[0]
      } finally {
        active.resolver = null
      }
    }
    if (!address) {
      report.dns.status = "error"
      report.dns.errorCode = "NO_ADDRESS"
      throw new StopRun()
    }
    done("dns")

    // 2. Unauthenticated TCP handshake only; each socket is destroyed.
    begin("tcp")
    for (let index = 0; index < planned.tcp; index++) {
      const started = deps.now()
      try {
        await attempt("tcp", () =>
          bounded(
            deadlines.tcpSampleMs,
            () =>
              new Promise((resolve, reject) => {
                const socket = deps.connectSocket(address, port)
                active.socket = socket
                socket.once("connect", () => {
                  socket.destroy()
                  resolve()
                })
                socket.once("error", (error) => {
                  socket.destroy()
                  reject(error)
                })
              }),
            () => active.socket?.destroy(),
          ),
        )
        report.tcp.samplesMs.push(round(deps.now() - started))
        report.tcp.completed++
      } finally {
        active.socket?.destroy()
        active.socket = null
      }
    }
    done("tcp")

    // 3. One authenticated session: connect, then five constant pings.
    begin("connect")
    const client = await deps.makeClient({
      connectionString: url,
      connectionTimeoutMillis: deadlines.connectMs,
      query_timeout: deadlines.querySampleMs,
      application_name: "s05-latency-diagnostic",
    })
    active.client = client
    client.on?.("error", () => {})
    const connectStarted = deps.now()
    await attempt("connect", () =>
      bounded(deadlines.connectMs + 500, () => client.connect(), destroyClient),
    )
    report.connect.samplesMs.push(round(deps.now() - connectStarted))
    report.connect.completed = 1
    done("connect")

    begin("ping")
    for (let index = 0; index < planned.ping; index++) {
      const started = deps.now()
      await attempt("ping", () =>
        bounded(
          deadlines.querySampleMs + 500,
          () => client.query(statements.ping),
          destroyClient,
        ),
      )
      report.ping.samplesMs.push(round(deps.now() - started))
      report.ping.completed++
    }
    done("ping")

    // 4. Server-side timing of constant statements (plan metrics only).
    begin("serverPlans")
    for (const [name, sql] of [
      ["select1", statements.planSelect],
      ["now", statements.planNow],
    ]) {
      const started = deps.now()
      const result = await attempt("serverPlans", () =>
        bounded(deadlines.planMs, () => client.query(sql), destroyClient),
      )
      const plan = result?.rows?.[0]?.["QUERY PLAN"]?.[0] ?? {}
      report.serverPlans.plans.push({
        name,
        clientMs: round(deps.now() - started),
        serverPlanningMs: metric(plan["Planning Time"]),
        serverExecutionMs: metric(plan["Execution Time"]),
      })
      report.serverPlans.completed++
    }
    done("serverPlans")
  } catch (error) {
    if (!(error instanceof StopRun) && !finished) {
      // Unexpected local error: record it on the active phase, safely.
      if (current) {
        report[current].status = "error"
        report[current].errorCode = safeCode(error)
      }
    }
  } finally {
    const client = active.client
    if (client) {
      await bounded(
        deadlines.cleanupMs,
        () => client.end(),
        destroyClient,
      ).catch(destroyClient)
      active.client = null
    }
    stopAll()
    deps.clearTimer(ceiling)
  }
  if (finished) return report
  finished = true
  const allOk = Object.values(report).every((entry) => entry.status === "ok")
  print(allOk ? "completed" : "incomplete")
  return report
}

// ---------------------------------------------------------------------------
// Offline self-test: synthetic credentials and in-memory stubs only. No DNS,
// sockets or database clients are created, not even on loopback.

function stubDependencies(script, overrides = {}) {
  const calls = {
    resolvers: 0,
    resolverCancels: 0,
    sockets: 0,
    socketDestroys: 0,
    clients: 0,
    queries: [],
    ends: 0,
    streamDestroys: 0,
    exits: [],
  }
  const logs = []
  let clock = 0
  const pending = (cancelable) =>
    new Promise((_, reject) => {
      cancelable.reject = reject
    })
  const deps = {
    makeResolver: () => {
      calls.resolvers++
      const index = calls.resolvers
      const resolver = {
        resolve4: () => {
          const step = script.dns?.[index - 1] ?? "ok"
          if (step === "hang") return pending(resolver)
          if (step === "fail")
            return Promise.reject(
              Object.assign(new Error("x"), { code: "ENOTFOUND" }),
            )
          return Promise.resolve(["192.0.2.10"])
        },
        cancel: () => {
          calls.resolverCancels++
          resolver.reject?.(
            Object.assign(new Error("x"), { code: "ECANCELLED" }),
          )
        },
      }
      return resolver
    },
    connectSocket: () => {
      calls.sockets++
      const index = calls.sockets
      const handlers = {}
      const socket = {
        once: (event, handler) => {
          handlers[event] = handler
        },
        destroy: () => {
          calls.socketDestroys++
        },
      }
      queueMicrotask(() => {
        const step = script.tcp?.[index - 1] ?? "ok"
        if (step === "ok") handlers.connect?.()
        if (step === "fail")
          handlers.error?.(
            Object.assign(new Error("x"), { code: "ECONNREFUSED" }),
          )
      })
      return socket
    },
    makeClient: async () => {
      calls.clients++
      const client = {
        connection: {
          stream: {
            destroy: () => {
              calls.streamDestroys++
              client.reject?.(
                Object.assign(new Error("x"), { code: "ECONNRESET" }),
              )
            },
          },
        },
        on: () => {},
        connect: () =>
          script.connect === "hang" ? pending(client) : Promise.resolve(),
        query: (sql) => {
          calls.queries.push(sql)
          if (sql.startsWith("EXPLAIN"))
            return Promise.resolve({
              rows: [
                {
                  "QUERY PLAN": [
                    { "Planning Time": 0, "Execution Time": 0.004 },
                  ],
                },
              ],
            })
          return Promise.resolve({ rows: [{ "?column?": 1 }] })
        },
        end: () => {
          calls.ends++
          return script.end === "hang" ? pending(client) : Promise.resolve()
        },
      }
      return client
    },
    now: () => {
      clock += 1
      return clock
    },
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (timer) => clearTimeout(timer),
    exit: (code) => calls.exits.push(code),
    log: (line) => logs.push(line),
    ...overrides,
  }
  return { deps, calls, logs }
}

const fastDeadlines = {
  processMs: 5_000,
  dnsSampleMs: 30,
  tcpSampleMs: 30,
  connectMs: 30,
  querySampleMs: 30,
  planMs: 30,
  cleanupMs: 30,
}
const target = { url: "postgresql://synthetic", host: "synthetic", port: 5432 }

async function selfTest() {
  const good = `postgresql://synthetic:synthetic@${authorizedHost}/${authorizedDatabase}?sslmode=require`
  const production =
    "postgresql://synthetic:synthetic@ep-synthetic-prod.us-east-1.aws.neon.tech/prod?sslmode=require"
  const loaded = (url, extra = {}) => ({
    profile: "local",
    profileExists: true,
    env: { APP_ENV: "local", DEV_PROFILE: "local", EWATRADE_DATABASE_URL: url },
    ...extra,
  })
  const guard =
    (url, options = {}) =>
    () =>
      resolveTarget({
        loaded: loaded(url, options.loaded),
        productionUrl:
          "productionUrl" in options ? options.productionUrl : production,
      })
  const results = []
  const check = (name, ok) => {
    results.push(ok)
    console.info(JSON.stringify({ selfTest: name, ok }))
  }
  const refuses = (run) => {
    try {
      run()
      return false
    } catch {
      return true
    }
  }

  // Guard: synthetic credentials, pure.
  check("authorized target accepted", !refuses(guard(good)))
  check(
    "missing profile refused",
    refuses(guard(good, { loaded: { profileExists: false } })),
  )
  check(
    "production profile refused",
    refuses(guard(good, { loaded: { profile: "production" } })),
  )
  check(
    "Production-equivalent target refused",
    refuses(guard(good, { productionUrl: good })),
  )
  check(
    "missing Production reference refused",
    refuses(guard(good, { productionUrl: undefined })),
  )
  check(
    "other Development host refused",
    refuses(guard(good.replace("ep-royal-dew-awnlogem", "ep-other-host"))),
  )
  check(
    "other database refused",
    refuses(guard(good.replace(`/${authorizedDatabase}`, "/ewatrade_dev"))),
  )
  check("query host override refused", refuses(guard(`${good}&host=127.0.0.1`)))
  check(
    "query hostaddr override refused",
    refuses(guard(`${good}&hostaddr=192.0.2.1`)),
  )
  check("query port override refused", refuses(guard(`${good}&port=5433`)))
  check("query dbname override refused", refuses(guard(`${good}&dbname=other`)))
  check(
    "query options override refused",
    refuses(guard(`${good}&options=-c%20search_path%3Dx`)),
  )
  check(
    "non-5432 URL port refused",
    refuses(guard(good.replace(authorizedHost, `${authorizedHost}:6543`))),
  )
  check(
    "explicit 5432 URL port accepted",
    !refuses(guard(good.replace(authorizedHost, `${authorizedHost}:5432`))),
  )
  check(
    "non-PostgreSQL protocol refused",
    refuses(guard(good.replace("postgresql:", "mysql:"))),
  )
  // Ambient PG* defaults cannot move the authenticated client off 5432.
  // Constructing pg.Client opens nothing; the environment is restored.
  {
    const { default: pg } = await import("pg")
    const saved = process.env.PGPORT
    process.env.PGPORT = "5433"
    try {
      const fromBare = resolveTarget({
        loaded: loaded(good),
        productionUrl: production,
      })
      const fromExplicit = resolveTarget({
        loaded: loaded(good.replace(authorizedHost, `${authorizedHost}:5432`)),
        productionUrl: production,
      })
      const bare = new pg.Client({ connectionString: fromBare.url })
      const explicit = new pg.Client({ connectionString: fromExplicit.url })
      check(
        "ambient PGPORT=5433 cannot move the client off 5432",
        bare.port === 5432 &&
          explicit.port === 5432 &&
          bare.host === authorizedHost &&
          bare.database === authorizedDatabase,
      )
    } finally {
      if (saved === undefined) Reflect.deleteProperty(process.env, "PGPORT")
      else process.env.PGPORT = saved
    }
    check("PGPORT restored after the check", process.env.PGPORT === saved)
  }
  check(
    "unsafe error text reduced to a code",
    safeCode({ code: "ETIMEDOUT", message: good }) === "ETIMEDOUT" &&
      safeCode({ message: good }) === "ERROR",
  )

  // Phases: in-memory stubs only.
  {
    const { deps, calls } = stubDependencies({})
    const report = await diagnose(target, deps, fastDeadlines)
    check(
      "success runs every phase once with fixed statements",
      Object.values(report).every((entry) => entry.status === "ok") &&
        report.dns.attempted === 3 &&
        report.tcp.attempted === 5 &&
        report.ping.attempted === 5 &&
        calls.clients === 1 &&
        calls.queries.length === 7 &&
        calls.queries.every((sql) => Object.values(statements).includes(sql)) &&
        calls.ends === 1 &&
        calls.socketDestroys >= 5,
    )
    check(
      "zero server timing reported as 0, not null",
      report.serverPlans.plans[0]?.serverPlanningMs === 0,
    )
  }
  {
    const { deps, calls } = stubDependencies({ dns: ["ok", "fail"] })
    const report = await diagnose(target, deps, fastDeadlines)
    check(
      "DNS sample 2 failure stops the run; later phases UNRUN",
      report.dns.status === "partial" &&
        report.dns.attempted === 2 &&
        report.dns.errorCode === "ENOTFOUND" &&
        ["tcp", "connect", "ping", "serverPlans"].every(
          (name) =>
            report[name].status === "UNRUN" && report[name].attempted === 0,
        ) &&
        calls.sockets === 0 &&
        calls.clients === 0,
    )
  }
  {
    const { deps, calls } = stubDependencies({ tcp: ["fail"] })
    const report = await diagnose(target, deps, fastDeadlines)
    check(
      "first TCP failure stops before authentication",
      report.tcp.status === "error" &&
        report.tcp.attempted === 1 &&
        report.tcp.errorCode === "ECONNREFUSED" &&
        report.connect.status === "UNRUN" &&
        calls.clients === 0 &&
        calls.queries.length === 0,
    )
  }
  {
    const { deps, calls } = stubDependencies({ dns: ["hang"] })
    const report = await diagnose(target, deps, fastDeadlines)
    check(
      "DNS deadline cancels the resolver",
      report.dns.errorCode === "DEADLINE" &&
        calls.resolverCancels >= 1 &&
        report.tcp.status === "UNRUN",
    )
  }
  {
    const { deps, calls } = stubDependencies({ tcp: ["hang"] })
    const report = await diagnose(target, deps, fastDeadlines)
    check(
      "TCP deadline destroys the socket",
      report.tcp.errorCode === "DEADLINE" &&
        calls.socketDestroys >= 1 &&
        calls.clients === 0,
    )
  }
  {
    const { deps, calls } = stubDependencies({ connect: "hang" })
    const report = await diagnose(target, deps, fastDeadlines)
    check(
      "connect deadline destroys the stream, then cleanup ends the client",
      report.connect.errorCode === "ECONNRESET" ||
        report.connect.errorCode === "DEADLINE"
        ? calls.streamDestroys >= 1 &&
            calls.ends === 1 &&
            report.ping.status === "UNRUN"
        : false,
    )
  }
  {
    const { deps, calls } = stubDependencies({ end: "hang" })
    await diagnose(target, deps, fastDeadlines)
    check(
      "hung cleanup is bounded and destroys the stream",
      calls.ends === 1 && calls.streamDestroys >= 1,
    )
  }
  {
    const { deps, calls, logs } = stubDependencies({ connect: "hang" })
    const report = await diagnose(target, deps, {
      ...fastDeadlines,
      processMs: 10,
      connectMs: 5_000,
    })
    check(
      "process deadline cancels active work, finalizes the phase and exits 2",
      calls.exits.includes(2) &&
        calls.streamDestroys >= 1 &&
        report.connect.status === "deadline" &&
        report.connect.errorCode === "PROCESS_DEADLINE" &&
        logs.some((line) => line.includes('"outcome":"process_deadline"')),
    )
  }

  const failed = results.filter((ok) => !ok).length
  console.info(
    JSON.stringify({
      selfTest: "summary",
      cases: results.length,
      failed,
      network: "none",
    }),
  )
  process.exitCode = failed ? 1 : 0
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === "--self-test") await selfTest()
  else {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    )
    const run = args[0] === "--run"
    const rest = args.slice(1)
    if (
      !run ||
      (rest.length !== 0 &&
        (rest.length !== 2 ||
          rest[0] !== "--environment-root" ||
          !path.isAbsolute(rest[1])))
    )
      throw Error(
        "Use --self-test, or --run with an optional absolute --environment-root.",
      )
    const environmentRoot = rest[1] ?? root
    const loaded = loadRootEnvironment(environmentRoot, {
      ...process.env,
      APP_ENV: "local",
      DEV_PROFILE: "local",
      NODE_ENV: "development",
    })
    const resolved = resolveTarget({
      loaded,
      productionUrl: loadProductionDatabaseUrl(environmentRoot),
    })
    console.info(
      "Running the bounded read-only S05 latency diagnostic against the authorized Development QA target; Production excluded.",
    )
    const report = await diagnose(resolved)
    process.exitCode = Object.values(report).every(
      (entry) => entry.status === "ok",
    )
      ? 0
      : 1
  }
}
