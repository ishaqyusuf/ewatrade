import type { Prisma } from "@ewatrade/db/types"

/** Guarded runner evidence only. Never records arguments, SQL, credentials or contacts. */
export function serviceIntakeRollbackTimings() {
  const started = performance.now()
  let currentPhase = "transaction-entry"
  let transactionBodyStartedMs: number | null = null
  const phases: Array<{
    phase: string
    startedMs: number
    durationMs: number
    outcome: "ok" | "error"
  }> = []
  const calls: Array<{
    phase: string
    operation: string
    startedMs: number
    durationMs: number
    outcome: "ok" | "error"
  }> = []
  const timed = async <T>(
    operation: string,
    run: () => PromiseLike<T>,
  ): Promise<T> => {
    const at = performance.now()
    const phase = currentPhase
    let outcome: "ok" | "error" = "ok"
    try {
      return await run()
    } catch (error) {
      outcome = "error"
      throw error
    } finally {
      calls.push({
        phase,
        operation,
        startedMs: Math.round(at - started),
        durationMs: Math.round(performance.now() - at),
        outcome,
      })
    }
  }
  return {
    async phase<T>(phase: string, run: () => Promise<T>): Promise<T> {
      const previous = currentPhase
      currentPhase = phase
      const at = performance.now()
      let outcome: "ok" | "error" = "ok"
      try {
        return await run()
      } catch (error) {
        outcome = "error"
        throw error
      } finally {
        phases.push({
          phase,
          startedMs: Math.round(at - started),
          durationMs: Math.round(performance.now() - at),
          outcome,
        })
        currentPhase = previous
      }
    },
    transaction(tx: Prisma.TransactionClient): Prisma.TransactionClient {
      transactionBodyStartedMs = Math.round(performance.now() - started)
      return new Proxy(tx, {
        get(target, key) {
          const value = Reflect.get(target, key)
          if (typeof value === "function")
            return (...args: unknown[]) =>
              timed(String(key), () => value.apply(target, args))
          if (
            typeof key !== "string" ||
            key.startsWith("$") ||
            !value ||
            typeof value !== "object"
          )
            return value
          return new Proxy(value, {
            get(delegate, method) {
              const operation = Reflect.get(delegate, method)
              if (typeof operation !== "function") return operation
              return (...args: unknown[]) =>
                timed(`${key}.${String(method)}`, () =>
                  operation.apply(delegate, args),
                )
            },
          })
        },
      })
    },
    evidence: () => ({
      version: 2 as const,
      elapsedMs: Math.round(performance.now() - started),
      transactionBodyStartedMs,
      phases,
      calls,
    }),
  }
}
