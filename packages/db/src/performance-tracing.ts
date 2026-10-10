import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import type pg from "pg"

export type PerformancePhase =
  | "auth"
  | "context"
  | "pool"
  | "sql"
  | "lockingSql"
  | "serialization"
  | "proposalReview"
  | "proposalExecution"

type Measurement = { count: number; milliseconds: number; failures: number }
export type PerformanceTrace = {
  version: 1
  id: string
  kind: "request" | "job"
  milliseconds: number
  failed: boolean
  phases: Partial<Record<PerformancePhase, Measurement>>
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

export async function withPerformanceTrace<T>(
  kind: PerformanceTrace["kind"],
  work: () => Promise<T>,
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
  return storage.run(trace, async () => {
    try {
      return await work()
    } catch (error) {
      trace.failed = true
      throw error
    } finally {
      trace.milliseconds = performance.now() - started
      // Observability must not turn a committed command into a failed response.
      try {
        emit(trace)
      } catch {}
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

export function instrumentDatabasePool(pool: pg.Pool) {
  pool.connect = instrumentMethod(pool.connect, "pool")
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
        const measured = instrumentMethod(target, "sql")
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
