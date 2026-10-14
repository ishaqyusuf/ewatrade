import { AsyncLocalStorage } from "node:async_hooks"

// Pure runner tools for the G04 custody verifier. No connection, environment
// loading or other side effects on import; the integration file and launcher
// supply real clients.

export class NestedTransactionRefused extends Error {}
export class SectionUnrun extends Error {}

type TransactionLike = {
  $executeRawUnsafe(sql: string): Promise<unknown>
}

/**
 * Runs each `$transaction(fn)` inside its own SAVEPOINT on one outer
 * transaction, so a command that throws (for example an injected receipt
 * failure) rolls back exactly its own writes and the section continues from
 * the prior state. Concurrent callbacks are serialized on one savepoint
 * stack; a nested `$transaction` from inside a callback is refused instead of
 * deadlocking. Limits: the callback's isolation/timeout options are not
 * applied (the outer transaction governs), and a savepoint is not a separate
 * transaction, so commit-time serialization between commands is not
 * exercised.
 */
export function createSavepointDb<T extends TransactionLike>(
  tx: T,
  options: { onEvent?: (event: string) => void } = {},
): T {
  const inside = new AsyncLocalStorage<true>()
  let tail: Promise<unknown> = Promise.resolve()
  let counter = 0
  const proxy: T = new Proxy(tx, {
    get(target, key) {
      if (key === "$transaction")
        return (callback: unknown) => {
          if (typeof callback !== "function")
            return Promise.reject(
              new Error(
                "Batch transactions are not supported by the savepoint adapter.",
              ),
            )
          if (inside.getStore())
            return Promise.reject(
              new NestedTransactionRefused(
                "Nested transaction refused by the savepoint adapter.",
              ),
            )
          const run = async () => {
            counter += 1
            const name = `custody_sp_${counter}`
            await target.$executeRawUnsafe(`SAVEPOINT ${name}`)
            options.onEvent?.(`savepoint:${name}`)
            try {
              const result = await inside.run(true, () =>
                (callback as (db: T) => Promise<unknown>)(proxy),
              )
              await target.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`)
              options.onEvent?.(`release:${name}`)
              return result
            } catch (error) {
              await target.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`)
              await target.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`)
              options.onEvent?.(`rollback:${name}`)
              throw error
            }
          }
          const result = tail.then(run, run)
          tail = result.catch(() => undefined)
          return result
        }
      const value = Reflect.get(target, key)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
  return proxy
}

/**
 * The verifier's failing database: inside each `$transaction`, the proposal's
 * completion update (`status: "COMPLETED"`) throws "Injected receipt
 * failure"; everything else passes through. Over a savepoint adapter the
 * throw rolls back that command's writes only.
 */
export function injectReceiptFailure<
  T extends { $transaction: (...args: never[]) => Promise<unknown> },
>(db: T): T {
  const wrapTx = (tx: Record<string | symbol, unknown>) =>
    new Proxy(tx, {
      get(target, key) {
        if (key === "assistantActionProposal") {
          const delegate = target[key] as Record<string | symbol, unknown>
          return new Proxy(delegate, {
            get(model, method) {
              if (method === "update")
                return async (args: { data?: { status?: string } }) => {
                  if (args.data?.status === "COMPLETED")
                    throw Error("Injected receipt failure")
                  return (model.update as (a: unknown) => Promise<unknown>)(
                    args,
                  )
                }
              const value = Reflect.get(model, method)
              return typeof value === "function" ? value.bind(model) : value
            },
          })
        }
        const value = Reflect.get(target, key)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
  return new Proxy(db, {
    get(target, key) {
      if (key === "$transaction")
        return (callback: (tx: unknown) => Promise<unknown>, opts?: unknown) =>
          (
            target.$transaction as unknown as (
              cb: (tx: unknown) => Promise<unknown>,
              o?: unknown,
            ) => Promise<unknown>
          )(
            (tx) => callback(wrapTx(tx as Record<string | symbol, unknown>)),
            opts,
          )
      const value = Reflect.get(target, key)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}

/**
 * Makes a planned capability visible to this process only, restoring the
 * exact prior value on every exit (success, throw or rejection).
 */
export async function withRolloutOverride<T>(
  entry: object,
  value: string,
  run: () => Promise<T>,
): Promise<T> {
  const prior = Reflect.get(entry, "rollout")
  Reflect.set(entry, "rollout", value)
  try {
    return await run()
  } finally {
    Reflect.set(entry, "rollout", prior)
  }
}

/** Runs cancellable work; on deadline it cancels, then rejects DEADLINE. */
export function withDeadline<T>(
  ms: number,
  work: () => Promise<T>,
  cancel: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        cancel()
      } catch {
        // Cleanup failure never hides the deadline itself.
      } finally {
        reject(Object.assign(new Error("deadline"), { code: "DEADLINE" }))
      }
    }, ms)
    Promise.resolve()
      .then(work)
      .then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        (error) => {
          clearTimeout(timer)
          reject(error)
        },
      )
  })
}

/** Refuses a section before any transaction when its budget cannot fit. */
export function assertSectionFits(input: {
  section: string
  statements: number | undefined
  medianMs: number
  budgetMs?: number
}) {
  const budgetMs = input.budgetMs ?? 20_000
  if (!input.statements || input.statements <= 0)
    throw new SectionUnrun(
      `Unrun: section ${input.section} has no reviewed statement budget.`,
    )
  const projected = Math.round(input.statements * input.medianMs)
  if (!Number.isFinite(projected) || projected > budgetMs)
    throw new SectionUnrun(
      `Unrun: section ${input.section} needs ~${input.statements} statements × ${input.medianMs} ms = ${projected} ms, over ${budgetMs} ms. No transaction was started.`,
    )
  return projected
}

/**
 * A section's reported outcome. Only a section whose assertions finished AND
 * whose forced rollback sentinel was returned is completed; the absence of an
 * error alone is not completion. A failed or unrun section's count is partial
 * and must never be used as a budget. Count scope: the child's Prisma query
 * events for this section's transaction (SET LOCAL, setup, savepoints,
 * section work); it excludes driver-level BEGIN/ROLLBACK not emitted as
 * query events, the preflight, and the launcher's separate audit.
 */
export function sectionOutcome(input: {
  section: string
  stage: string
  statements: number
  rolledBack: boolean
  error?: unknown
}) {
  const error = input.error
  const completed =
    error === undefined && input.rolledBack && input.stage === "rollback"
  const outcome = completed
    ? ("completed" as const)
    : error instanceof SectionUnrun
      ? ("unrun" as const)
      : ("failed" as const)
  return {
    section: input.section,
    outcome,
    stage: input.stage,
    statements: input.statements,
    statementsScope: "child-prisma-query-events-section-transaction" as const,
    statementsComplete: completed,
    errorCode:
      error === undefined
        ? completed
          ? null
          : "NOT_ROLLED_BACK"
        : safeErrorCode(error),
  }
}

/**
 * First-failure stop: once a section fails or is refused, no later section
 * starts its transaction; each is reported UNRUN instead.
 */
export function createSectionSequencer() {
  let stoppedBy: string | null = null
  return {
    next(section: string) {
      return stoppedBy
        ? {
            run: false as const,
            reason: `UNRUN: an earlier section (${stoppedBy}) stopped the run.`,
          }
        : { run: true as const }
    },
    fail(section: string) {
      stoppedBy ??= section
    },
    get stoppedBy() {
      return stoppedBy
    },
  }
}

/** Error codes only; never messages that might carry values. */
export function safeErrorCode(error: unknown) {
  const code = (error as { code?: unknown })?.code
  if (typeof code === "string" && /^[A-Z0-9_]{2,40}$/.test(code)) return code
  if (error instanceof SectionUnrun) return "UNRUN"
  if (error instanceof NestedTransactionRefused) return "NESTED_TRANSACTION"
  return "ERROR"
}

/**
 * The post-run fixture audit verdict. A timeout or error is a failure, never
 * a pass; zero rows proves only that the planned fixture is absent, not that
 * unrelated rows are unchanged.
 */
export function auditVerdict(
  result:
    | { kind: "counts"; counts: Record<string, number> }
    | { kind: "error"; code: string }
    | { kind: "timeout" }
    | { kind: "nothing_planned" },
) {
  if (result.kind === "nothing_planned")
    return { pass: true, detail: "No fixture IDs were planned." }
  if (result.kind !== "counts")
    return {
      pass: false,
      detail:
        result.kind === "timeout"
          ? "Audit timed out; fixture absence is unknown."
          : `Audit failed (${result.code}); fixture absence is unknown.`,
    }
  const leftover = Object.entries(result.counts).filter(([, n]) => n !== 0)
  return leftover.length
    ? {
        pass: false,
        detail: `Fixture rows remain: ${leftover.map(([k, n]) => `${k}=${n}`).join(", ")}.`,
      }
    : {
        pass: true,
        detail:
          "Planned fixture rows are absent. Unrelated rows are not checked.",
      }
}

/** One planned-ID record, written before any fixture write. */
export function plannedIdsLine(ids: {
  section: string
  tenantId: string
  userId: string
  storeId: string
}) {
  return `${JSON.stringify({ planned: ids })}\n`
}

// ---------------------------------------------------------------------------
// Launcher logic (pure or dependency-injected, tested offline).

export const authorizedHost =
  "ep-royal-dew-awnlogem-pooler.c-12.us-east-1.aws.neon.tech"
export const authorizedDatabase = "ewatrade_qa_v1"
const allowedParameters = new Set(["sslmode", "channel_binding"])

/**
 * The child's own exact-target check, before it connects: PostgreSQL
 * protocol, no routing parameters, and the effective driver configuration
 * (host, port, database as an unconnected pg.Client resolves them) equal to
 * the authorized QA target on 5432.
 */
export function assertEffectiveTarget(
  url: string,
  effective: { host?: unknown; port?: unknown; database?: unknown },
) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("Custody verifier target is not a usable URL.")
  }
  const problems = [
    parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:",
    [...parsed.searchParams.keys()].some((key) => !allowedParameters.has(key)),
    parsed.hostname !== authorizedHost,
    parsed.port !== "5432",
    parsed.pathname !== `/${authorizedDatabase}`,
    effective.host !== authorizedHost,
    String(effective.port) !== "5432",
    effective.database !== authorizedDatabase,
  ]
  if (problems.some(Boolean))
    throw new Error(
      "Custody verifier runs only on the authorized ewatrade_qa_v1 target.",
    )
}

export const sectionNames = ["A", "B", "C", "D", "E", "F", "G", "H"] as const

/** Strict, explicit arguments; anything ambiguous is refused. */
export function parseRunnerArgs(args: string[]) {
  if (args.length === 1 && args[0] === "--self-test")
    return { mode: "self-test" as const }
  if (args[0] !== "--run")
    throw Error("Use --self-test, or --run --sections … --budgets ….")
  const options = new Map<string, string>()
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (
      !key ||
      !["--sections", "--budgets", "--environment-root"].includes(key) ||
      value === undefined ||
      options.has(key)
    )
      throw Error(`Unexpected or repeated argument ${String(key)}.`)
    options.set(key, value)
  }
  const sections = (options.get("--sections") ?? "").split(",")
  if (
    !sections.length ||
    sections.some(
      (name) => !(sectionNames as readonly string[]).includes(name),
    ) ||
    new Set(sections).size !== sections.length
  )
    throw Error("Name each reviewed section exactly once (A–H).")
  const budgets: Record<string, number> = {}
  for (const pair of (options.get("--budgets") ?? "").split(",")) {
    const match = /^([A-H])=([1-9][0-9]{0,2})$/.exec(pair)
    const name = match?.[1]
    const value = Number(match?.[2])
    if (
      !match ||
      !name ||
      !sections.includes(name) ||
      name in budgets ||
      value > 500
    )
      throw Error(`Invalid or unrequested statement budget "${pair}".`)
    budgets[name] = value
  }
  for (const name of sections)
    if (!(name in budgets))
      throw Error(`Section ${name} needs a reviewed statement budget.`)
  const environmentRoot = options.get("--environment-root")
  if (environmentRoot !== undefined && !environmentRoot.startsWith("/"))
    throw Error("--environment-root must be an absolute path.")
  return { mode: "run" as const, sections, budgets, environmentRoot }
}

/** Whole-run 120 s: child work, cancellation, then the reserved audit. */
export function runnerDeadlines() {
  return {
    totalMs: 120_000,
    childMs: 100_000,
    cancelMs: 5_000,
    auditMs: 15_000,
  }
}

/** Child environment: every ambient PG* key and DATABASE_URL dropped. */
export function childEnvironment(
  base: Record<string, string | undefined>,
  input: {
    url: string
    sections: string[]
    budgets: Record<string, number>
    planFile: string
    marker: string
    signingKey: string
  },
) {
  const env: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(base))
    if (!key.startsWith("PG") && key !== "DATABASE_URL") env[key] = value
  return {
    ...env,
    EWATRADE_DATABASE_URL: input.url,
    DATABASE_PROFILE_VERIFIED: "1",
    DEV_PROFILE: "local",
    APP_ENV: "local",
    NODE_ENV: "development",
    RUN_DATABASE_INTEGRATION_TESTS: "1",
    ASSISTANT_REHEARSAL_MODE: "true",
    ASSISTANT_APPROVAL_SIGNING_KEY: input.signingKey,
    QA_STOCK_CUSTODY_RUN: input.marker,
    QA_STOCK_CUSTODY_SECTIONS: input.sections.join(","),
    QA_STOCK_CUSTODY_BUDGETS: JSON.stringify(input.budgets),
    QA_STOCK_CUSTODY_PLAN_FILE: input.planFile,
  }
}

/** The plan file's first line, written by the launcher before the child. */
export function planHeader(marker: string) {
  return `${JSON.stringify({ plan: "g04-custody", marker })}\n`
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const exactKeys = (value: unknown, keys: string) =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join() === keys
/**
 * Strict plan reader: missing file, truncated last line, malformed lines,
 * any header or record with other than its exact keys, a wrong marker,
 * unknown sections and non-UUID IDs all fail closed. A header with no
 * entries means no fixture was planned (so none was written).
 */
export function parsePlan(text: string | null, marker: string) {
  if (text === null) throw new Error("PLAN_MISSING")
  if (!text.endsWith("\n")) throw new Error("PLAN_TRUNCATED")
  const [header, ...lines] = text.slice(0, -1).split("\n")
  const parse = (line: string | undefined) => {
    try {
      return JSON.parse(line ?? "") as unknown
    } catch {
      throw new Error("PLAN_MALFORMED")
    }
  }
  const head = parse(header) as { plan?: unknown; marker?: unknown }
  if (
    !exactKeys(head, "marker,plan") ||
    head.plan !== "g04-custody" ||
    head.marker !== marker
  )
    throw new Error("PLAN_HEADER")
  return lines.map((line) => {
    const row = parse(line) as { planned?: Record<string, unknown> }
    const planned = row?.planned
    if (
      !exactKeys(row, "planned") ||
      !exactKeys(planned, "section,storeId,tenantId,userId") ||
      !planned ||
      !(sectionNames as readonly unknown[]).includes(planned.section) ||
      ![planned.tenantId, planned.userId, planned.storeId].every(
        (id) => typeof id === "string" && uuid.test(id),
      )
    )
      throw new Error("PLAN_INVALID")
    return planned as {
      section: string
      tenantId: string
      userId: string
      storeId: string
    }
  })
}

export type ChildLike = {
  kill(signal: "SIGTERM" | "SIGKILL"): void
  onExit(
    listener: (result: { code: number | null; signal: string | null }) => void,
  ): void
}
export type AuditClientLike = {
  connect(): Promise<void>
  query(
    sql: string,
    values: unknown[],
  ): Promise<{ rows: Array<{ n?: unknown }> }>
  end(): Promise<void>
  destroy(): void
}
const auditSql = {
  tenants:
    'SELECT count(*)::int AS n FROM "Tenant" WHERE "id" = ANY($1::text[])',
  users: 'SELECT count(*)::int AS n FROM "User" WHERE "id" = ANY($1::text[])',
  stores: 'SELECT count(*)::int AS n FROM "Store" WHERE "id" = ANY($1::text[])',
  custody:
    'SELECT count(*)::int AS n FROM "StockBalanceSource" WHERE "tenantId" = ANY($1::text[])',
} as const

class Cancelled extends Error {
  code = "CANCELLED"
}
/**
 * Cancellation shared by the lifecycle and the launcher's backstop. Once
 * cancelled: every tracked timer is cleared, the child is SIGKILLed, the
 * audit client is destroyed, late listeners are ignored and no plan read,
 * audit or query may start.
 */
export function createRunControl() {
  let cancelled = false
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const cleanups: Array<() => void> = []
  return {
    get cancelled() {
      return cancelled
    },
    sleep(ms: number) {
      return new Promise<void>((resolve) => {
        const timer = setTimeout(
          () => {
            timers.delete(timer)
            resolve()
          },
          Math.max(0, ms),
        )
        timers.add(timer)
      })
    },
    onCancel(cleanup: () => void) {
      if (cancelled) cleanup()
      else cleanups.push(cleanup)
    },
    assertLive() {
      if (cancelled) throw new Cancelled("Run cancelled")
    },
    cancel() {
      if (cancelled) return
      cancelled = true
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      for (const cleanup of cleanups.splice(0))
        try {
          cleanup()
        } catch {
          // Each cleanup is attempted; a throwing one never blocks the rest.
        }
    },
  }
}
export type RunControl = ReturnType<typeof createRunControl>

/**
 * The launcher's backstop at the same absolute ceiling, using the same
 * cleanup: cancel the run (SIGKILL child, destroy audit), then exit 1.
 */
export function installBackstop(input: {
  totalMs: number
  control: RunControl
  exit: (code: number) => void
  report: (line: string) => void
  setTimer?: (callback: () => void, ms: number) => unknown
}) {
  const setTimer =
    input.setTimer ?? ((callback, ms) => setTimeout(callback, ms))
  return setTimer(() => {
    input.control.cancel()
    input.report(
      JSON.stringify({
        g04CustodyRun: { passed: false, reason: "BACKSTOP_EXIT" },
      }),
    )
    input.exit(1)
  }, input.totalMs)
}

type RunResult = {
  passed: boolean
  child: {
    exited: boolean
    code: number | null
    signal: string | null
    timedOut: boolean
  }
  audit: {
    pass: boolean
    detail: string
    statements: number
    cleanup: "none" | "closed" | "forced" | "failed"
  }
  reason: string
}
/**
 * The launcher's whole lifecycle with injected child, plan reader, audit
 * client and run control. The ceiling actively cancels (SIGKILL, destroy,
 * timers cleared) and no work starts afterwards. The audit runs only after a
 * confirmed child exit; otherwise absence is unknown and the run fails.
 */
export async function orchestrateRun(deps: {
  startChild(): ChildLike
  readPlanFile(): string | null
  makeAuditClient(): AuditClientLike
  marker: string
  deadlines: ReturnType<typeof runnerDeadlines>
  control?: RunControl
}): Promise<RunResult> {
  const { deadlines } = deps
  const control = deps.control ?? createRunControl()
  const started = Date.now()
  const left = () => deadlines.totalMs - (Date.now() - started)
  const unknown = (reason: string, detail: string): RunResult => ({
    passed: false,
    child: { exited: false, code: null, signal: null, timedOut: true },
    audit: { pass: false, detail, statements: 0, cleanup: "none" },
    reason,
  })
  const work = async (): Promise<RunResult> => {
    control.assertLive()
    const child = deps.startChild()
    control.onCancel(() => child.kill("SIGKILL"))
    let exit: { code: number | null; signal: string | null } | null = null
    const exited = new Promise<void>((resolve) =>
      child.onExit((result) => {
        if (control.cancelled) return
        exit = result
        resolve()
      }),
    )
    let timedOut = false
    await Promise.race([exited, control.sleep(deadlines.childMs)])
    control.assertLive()
    if (!exit) {
      timedOut = true
      child.kill("SIGTERM")
      await Promise.race([
        exited,
        control.sleep(Math.min(3_000, deadlines.cancelMs)),
      ])
      control.assertLive()
      if (!exit) child.kill("SIGKILL")
      await Promise.race([exited, control.sleep(deadlines.cancelMs - 3_000)])
      control.assertLive()
    }
    const finalExit = exit as {
      code: number | null
      signal: string | null
    } | null
    const childState = {
      exited: finalExit !== null,
      code: finalExit?.code ?? null,
      signal: finalExit?.signal ?? null,
      timedOut,
    }
    if (!childState.exited)
      return {
        ...unknown(
          "CHILD_UNCONFIRMED",
          "Child termination unconfirmed; it might still write, so fixture absence is unknown.",
        ),
        child: childState,
      }
    control.assertLive()
    let planned: ReturnType<typeof parsePlan>
    try {
      planned = parsePlan(deps.readPlanFile(), deps.marker)
    } catch (error) {
      return {
        passed: false,
        child: childState,
        audit: {
          pass: false,
          detail: `Plan evidence unusable (${(error as Error).message}); fixture absence is unknown.`,
          statements: 0,
          cleanup: "none",
        },
        reason: "PLAN_UNUSABLE",
      }
    }
    const audit = await runAudit(
      deps.makeAuditClient,
      planned,
      Math.min(deadlines.auditMs, left()),
      control,
    )
    const passed =
      childState.code === 0 &&
      !timedOut &&
      audit.pass &&
      audit.cleanup !== "failed"
    return {
      passed,
      child: childState,
      audit,
      reason: passed
        ? "PASSED"
        : audit.cleanup === "failed"
          ? "AUDIT_CLEANUP_FAILED"
          : timedOut
            ? "CHILD_TIMEOUT"
            : "FAILED",
    }
  }
  return withDeadline(deadlines.totalMs, work, () => control.cancel()).catch(
    (error): RunResult =>
      safeErrorCode(error) === "DEADLINE" || control.cancelled
        ? unknown(
            "PROCESS_DEADLINE",
            "Whole-run ceiling reached; the run was cancelled and fixture absence is unknown.",
          )
        : unknown("ERROR", "Run failed; fixture absence is unknown."),
  )
}

/**
 * Read-only absence audit with fixed SQL. Counts (the absence verdict) and
 * connection cleanup are reported separately: `closed` after end(), `forced`
 * when a failed or hanging end() was followed by a successful destroy, and
 * `failed` when cleanup could not be confirmed (which fails the run).
 */
export async function runAudit(
  makeClient: () => AuditClientLike,
  planned: ReturnType<typeof parsePlan>,
  ms: number,
  control: RunControl = createRunControl(),
) {
  if (!planned.length)
    return {
      ...auditVerdict({ kind: "nothing_planned" }),
      statements: 0,
      cleanup: "none" as const,
    }
  control.assertLive()
  const client = makeClient()
  let destroyed = false
  const destroy = () => {
    try {
      client.destroy()
      destroyed = true
      return true
    } catch {
      return false
    }
  }
  control.onCancel(destroy)
  let statements = 0
  const ids = (key: "tenantId" | "userId" | "storeId") =>
    planned.map((row) => row[key])
  const deadline = Date.now() + ms
  // The audit's own deadline invalidates its work, not only the socket: a
  // connect or query released after it can never start another query.
  let expired = false
  const assertWithinAudit = () => {
    control.assertLive()
    if (expired)
      throw Object.assign(new Error("audit expired"), { code: "AUDIT_EXPIRED" })
  }
  let verdict: { pass: boolean; detail: string }
  try {
    const counts = await withDeadline(
      Math.max(0, deadline - Date.now() - 1_000),
      async () => {
        assertWithinAudit()
        await client.connect()
        assertWithinAudit()
        const count = async (sql: string, values: string[]) => {
          assertWithinAudit()
          statements++
          const n = Number((await client.query(sql, [values])).rows[0]?.n)
          assertWithinAudit()
          if (!Number.isInteger(n)) throw new Error("AUDIT_RESULT")
          return n
        }
        return {
          tenants: await count(auditSql.tenants, ids("tenantId")),
          users: await count(auditSql.users, ids("userId")),
          stores: await count(auditSql.stores, ids("storeId")),
          custody: await count(auditSql.custody, ids("tenantId")),
        }
      },
      () => {
        expired = true
        destroy()
      },
    )
    verdict = auditVerdict({ kind: "counts", counts })
  } catch (error) {
    verdict = auditVerdict(
      safeErrorCode(error) === "DEADLINE"
        ? { kind: "timeout" }
        : { kind: "error", code: safeErrorCode(error) },
    )
  }
  let cleanup: "closed" | "forced" | "failed"
  if (destroyed) cleanup = "forced"
  else
    try {
      await withDeadline(
        Math.max(0, Math.min(1_000, deadline - Date.now())),
        () => client.end(),
        () => {},
      )
      cleanup = "closed"
    } catch {
      cleanup = destroy() ? "forced" : "failed"
    }
  return { ...verdict, statements, cleanup }
}

/**
 * Runs requested sections strictly in order in ONE test case. The first
 * section that does not complete stops the run: every later section is
 * reported UNRUN (no transaction started) before the failure is thrown, so
 * the report never depends on later test callbacks running.
 */
export async function runSectionsInSequence(
  sections: string[],
  runOne: (section: string) => Promise<ReturnType<typeof sectionOutcome>>,
  report: (value: unknown) => void,
) {
  const outcomes: Array<{ section: string; outcome: string }> = []
  for (const [index, section] of sections.entries()) {
    let result: ReturnType<typeof sectionOutcome>
    try {
      result = await runOne(section)
    } catch (error) {
      result = sectionOutcome({
        section,
        stage: "unknown",
        statements: 0,
        rolledBack: false,
        error,
      })
    }
    outcomes.push(result)
    report({ section: result })
    if (result.outcome !== "completed") {
      for (const later of sections.slice(index + 1)) {
        const unrun = {
          section: later,
          outcome: "unrun",
          reason: `An earlier section (${section}) stopped the run; no transaction was started.`,
        }
        outcomes.push(unrun)
        report({ section: unrun })
      }
      throw new Error(
        `Section ${section} did not complete (${result.outcome}).`,
      )
    }
  }
  return outcomes
}
