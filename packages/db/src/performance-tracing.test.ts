import { describe, expect, test } from "bun:test"
import {
  type PerformanceTrace,
  instrumentMethod,
  tracePhase,
  traceSynchronousPhase,
  withPerformanceTrace,
} from "./performance-tracing"

describe("performance tracing", () => {
  test("concurrent requests retain their own counts and never log values/errors", async () => {
    const traces: PerformanceTrace[] = []
    const secret = "private-password-and-query-parameter"
    await Promise.all(
      [1, 3].map((count) =>
        withPerformanceTrace(
          "request",
          async () => {
            for (let n = 0; n < count; n++) {
              await tracePhase("sql", async () => {
                await Bun.sleep(1)
                return secret
              })
            }
            traceSynchronousPhase("serialization", () => ({ secret }))
          },
          (trace) => traces.push(trace),
        ),
      ),
    )
    expect(traces.map((t) => t.phases.sql?.count).sort()).toEqual([1, 3])
    expect(new Set(traces.map((t) => t.id)).size).toBe(2)
    expect(JSON.stringify(traces)).not.toContain(secret)
  })

  test("preserves Promise results and original failures even when exporter fails", async () => {
    const error = new Error("credential-bearing provider error")
    let evidence: PerformanceTrace | undefined
    const method = instrumentMethod(async (fail: boolean) => {
      if (fail) throw error
      return 42
    }, "sql")
    await expect(
      withPerformanceTrace(
        "job",
        async () => {
          expect(await method(false)).toBe(42)
          await method(true)
        },
        (trace) => {
          evidence = trace
          throw new Error("export failed")
        },
      ),
    ).rejects.toBe(error)
    expect(evidence?.phases.sql?.count).toBe(2)
    expect(evidence?.phases.sql?.failures).toBe(1)
    expect(evidence?.failed).toBe(true)
    expect(JSON.stringify(evidence)).not.toContain(error.message)
    expect(
      await withPerformanceTrace(
        "request",
        async () => 42,
        () => {
          throw error
        },
      ),
    ).toBe(42)
  })

  test("preserves callback receiver, arguments, release identity and single completion", async () => {
    const receiver = { marker: 7 }
    const release = () => {}
    const method = instrumentMethod(function (
      this: typeof receiver,
      callback: (error: null, value: number, release: () => void) => void,
    ) {
      callback.call(receiver, null, this.marker, release)
    }, "pool")
    let evidence: PerformanceTrace | undefined
    await withPerformanceTrace(
      "request",
      async () => {
        await new Promise<void>((resolve) =>
          method.call(
            receiver,
            function (this: typeof receiver, error, value, callbackRelease) {
              expect(this).toBe(receiver)
              expect(error).toBeNull()
              expect(value).toBe(7)
              expect(callbackRelease).toBe(release)
              resolve()
            },
          ),
        )
      },
      (trace) => {
        evidence = trace
      },
    )
    expect(evidence?.phases.pool?.count).toBe(1)
  })

  test("synchronous errors are timed and rethrown without retaining their contents", async () => {
    const error = new Error("private")
    let evidence: PerformanceTrace | undefined
    await expect(
      withPerformanceTrace(
        "request",
        async () => {
          traceSynchronousPhase("serialization", () => {
            throw error
          })
        },
        (trace) => {
          evidence = trace
        },
      ),
    ).rejects.toBe(error)
    expect(evidence?.phases.serialization?.failures).toBe(1)
    expect(JSON.stringify(evidence)).not.toContain("private")
  })

  test("a queued pool callback keeps its request when another request releases it", async () => {
    let releaseQueued: (() => void) | undefined
    const traces: PerformanceTrace[] = []
    const connect = instrumentMethod((callback: (error: null) => void) => {
      releaseQueued = () => callback(null)
    }, "pool")
    const waiting = withPerformanceTrace(
      "request",
      () =>
        new Promise<void>((resolve) =>
          connect(() => {
            traceSynchronousPhase("sql", () => 42)
            resolve()
          }),
        ),
      (trace) => traces.push(trace),
    )
    await withPerformanceTrace(
      "job",
      async () => {
        releaseQueued?.()
      },
      (trace) => traces.push(trace),
    )
    await waiting
    expect(
      traces.find((trace) => trace.kind === "request")?.phases.sql?.count,
    ).toBe(1)
    expect(
      traces.find((trace) => trace.kind === "job")?.phases.sql,
    ).toBeUndefined()
  })

  test("untraced queued work cannot inherit the releasing request", async () => {
    let releaseQueued: (() => void) | undefined
    let evidence: PerformanceTrace | undefined
    const connect = instrumentMethod((callback: (error: null) => void) => {
      releaseQueued = () => callback(null)
    }, "pool")
    connect(() => traceSynchronousPhase("sql", () => 42))
    await withPerformanceTrace(
      "request",
      async () => {
        releaseQueued?.()
      },
      (trace) => {
        evidence = trace
      },
    )
    expect(evidence?.phases.sql).toBeUndefined()
    expect(evidence?.phases.pool).toBeUndefined()
  })
})
