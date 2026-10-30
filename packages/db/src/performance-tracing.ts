import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import pg from "pg"

export type PerformancePhase =
  | "auth"
  | "context"
  | "legal"
  | "sessionProof"
  | "qaProofFacts"
  | "qaDomain"
  | "scope"
  | "legalReuse"
  | "scopeReuse"
  | "pool"
  | "connection"
  | "poolBusy"
  | "sql"
  | "lockingSql"
  | "transactionSql"
  | "activityAdmission"
  | "activityStores"
  | "activityPageSql"
  | "activityFilterSql"
  | "activityList"
  | "activityFilters"
  | "serialization"
  | "proposalReview"
  | "proposalExecution"
  | "fulfillmentLock"
  | "fulfillmentReview"
  | "fulfillmentEffects"

type Measurement = { count: number; milliseconds: number; failures: number }
export type PerformanceTrace = {
  version: 1
  id: string
  kind: "request" | "job"
  milliseconds: number
  failed: boolean
  phases: Partial<Record<PerformancePhase, Measurement>>
}

const serverTimingPhases: PerformancePhase[] = [
  "auth",
  "legal",
  "sessionProof",
  "qaProofFacts",
  "qaDomain",
  "scope",
  "legalReuse",
  "scopeReuse",
  "context",
  "pool",
  "connection",
  "poolBusy",
  "sql",
  "lockingSql",
  "transactionSql",
  "activityAdmission",
  "activityStores",
  "activityPageSql",
  "activityFilterSql",
  "activityList",
  "activityFilters",
  "serialization",
  "proposalReview",
  "proposalExecution",
  "fulfillmentLock",
  "fulfillmentReview",
  "fulfillmentEffects",
]

/** Phase durations can overlap; they are accumulated work, not additive request time. */
export function formatPerformanceServerTiming(trace: PerformanceTrace) {
  const parts =
    Number.isFinite(trace.milliseconds) && trace.milliseconds >= 0
      ? [`ew_request;dur=${trace.milliseconds.toFixed(1)}`]
      : []
  for (const phase of serverTimingPhases) {
    const value = trace.phases[phase]
    if (
      !value ||
      !Number.isFinite(value.milliseconds) ||
      value.milliseconds < 0 ||
      !Number.isSafeInteger(value.count) ||
      value.count < 1
    )
      continue
    parts.push(
      `ew_${phase};dur=${value.milliseconds.toFixed(1)};desc="${value.count} calls"`,
    )
  }
  return parts.join(",")
}

const storage = new AsyncLocalStorage<PerformanceTrace>()

// Fixed phase names only. Never retain SQL, parameters, payloads, actors or errors.
function timer(phase: PerformancePhase) {
  const trace = storage.getStore()
  if (!trace) return (_failed = false) => {}
  const started = performance.now()
  let finished = false
  return (failed = false) => {
    if (finished) return
    finished = true
    trace.phases[phase] ??= {
      count: 0,
      milliseconds: 0,
      failures: 0,
    }
    const measurement = trace.phases[phase]
    measurement.count++
    measurement.milliseconds += performance.now() - started
    measurement.failures += Number(failed)
  }
}

export async function tracePhase<T>(
  phase: PerformancePhase,
  work: () => Promise<T>,
) {
  const finish = timer(phase)
  try {
    const value = await work()
    finish()
    return value
  } catch (error) {
    finish(true)
    throw error
  }
}

export function traceSynchronousPhase<T>(
  phase: PerformancePhase,
  work: () => T,
) {
  const finish = timer(phase)
  try {
    const value = work()
    finish()
    return value
  } catch (error) {
    finish(true)
    throw error
  }
}

/** Explicit lifetime for streamed responses; finish once and freeze exported facts. */
export function startPerformanceTrace(
  kind: PerformanceTrace["kind"],
  emit: (trace: PerformanceTrace) => void,
) {
  const trace: PerformanceTrace = {
    version: 1,
    id: randomUUID(),
    kind,
    milliseconds: 0,
    failed: false,
    phases: {},
  }
  const started = performance.now()
  let finished = false
  const snapshot = () =>
    structuredClone({ ...trace, milliseconds: performance.now() - started })
  return {
    run<T>(work: () => T): T {
      return storage.run(trace, work)
    },
    snapshot,
    finish(failed = false) {
      if (finished) return
      finished = true
      trace.failed = failed
      // Observability must not turn a committed command into a failed response.
      try {
        emit(snapshot())
      } catch {}
    },
  }
}

export async function withPerformanceTrace<T>(
  kind: PerformanceTrace["kind"],
  work: () => Promise<T>,
  emit: (trace: PerformanceTrace) => void,
) {
  const trace = startPerformanceTrace(kind, emit)
  return trace.run(async () => {
    let failed = false
    try {
      return await work()
    } catch (error) {
      failed = true
      throw error
    } finally {
      trace.finish(failed)
    }
  })
}

// pg supports callback and Promise overloads. Proxy preserves both signatures,
// the receiver, callback arguments, release callback and rejection identity.
export function instrumentMethod<T extends (...args: never[]) => unknown>(
  method: T,
  phase: PerformancePhase,
): T {
  return new Proxy(method, {
    apply(target, receiver, args) {
      const finish = timer(phase)
      const scope = storage.getStore()
      const last = args.length - 1
      if (typeof args[last] === "function") {
        args[last] = new Proxy(args[last], {
          apply(callback, callbackReceiver, callbackArgs) {
            finish(Boolean(callbackArgs[0]))
            const invoke = () =>
              Reflect.apply(callback, callbackReceiver, callbackArgs)
            return scope ? storage.run(scope, invoke) : storage.exit(invoke)
          },
        })
      }
      try {
        const result = Reflect.apply(target, receiver, args)
        if (result && typeof result.then === "function") {
          return result.then(
            (value: unknown) => {
              finish()
              return value
            },
            (error: unknown) => {
              finish(true)
              throw error
            },
          )
        }
        return result
      } catch (error) {
        finish(true)
        throw error
      }
    },
  })
}

export function createInstrumentedDatabasePool(options: pg.PoolConfig) {
  const BaseClient: new (options?: pg.ClientConfig) => pg.ClientBase =
    options.Client ?? pg.Client
  class MeasuredClient extends BaseClient {
    constructor(options?: pg.ClientConfig) {
      super(options)
      // Physical connection establishment (including TLS/auth), within checkout.
      this.connect = instrumentMethod(this.connect, "connection")
    }
  }
  return instrumentDatabasePool(
    new pg.Pool({ ...options, Client: MeasuredClient }),
  )
}

export function instrumentDatabasePool(pool: pg.Pool) {
  const connect = instrumentMethod(pool.connect, "pool")
  pool.connect = new Proxy(connect, {
    apply(target, receiver: pg.Pool, args) {
      // Whole checkout that STARTED with no idle capacity at the configured max.
      // This includes queueing and any replacement connection, not pure wait time.
      const busy =
        !receiver.ending &&
        receiver.idleCount === 0 &&
        receiver.totalCount >= receiver.options.max
      return Reflect.apply(
        busy ? instrumentMethod(target, "poolBusy") : target,
        receiver,
        args,
      )
    },
  })
  pool.on("connect", (client) => {
    const query = client.query
    client.query = new Proxy(query, {
      apply(target, receiver, args) {
        const text = typeof args[0] === "string" ? args[0] : args[0]?.text
        const locking =
          typeof text === "string" &&
          /\bFOR\s+(?:NO\s+KEY\s+)?UPDATE\b|\bpg_advisory_(?:xact_)?lock\s*\(/i.test(
            text,
          )
        const transactionControl =
          typeof text === "string" &&
          /^\s*(?:BEGIN\b|START\s+TRANSACTION\b|COMMIT\b|ROLLBACK\b|SAVEPOINT\b|RELEASE\s+SAVEPOINT\b|SET\s+TRANSACTION\b)/i.test(
            text,
          )
        const sql = instrumentMethod(target, "sql")
        const measured = transactionControl
          ? instrumentMethod(sql, "transactionSql")
          : sql
        // This is lock-taking statement duration, NOT measured lock wait.
        return Reflect.apply(
          locking ? instrumentMethod(measured, "lockingSql") : measured,
          receiver,
          args,
        )
      },
    })
  })
  return pool
}
