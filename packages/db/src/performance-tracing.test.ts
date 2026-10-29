import { describe, expect, test } from "bun:test"
import {
  type PerformanceTrace,
  formatPerformanceServerTiming,
  instrumentMethod,
  tracePhase,
  traceSynchronousPhase,
  withPerformanceTrace,
} from "./performance-tracing"

describe("performance tracing", () => {
  test("Server-Timing exports only fixed numeric phases, never labels or sensitive values", () => {
    const trace: PerformanceTrace = {
      version: 1,
      id: "private-request-id",
      kind: "request",
      milliseconds: 101.234,
      failed: false,
      phases: {
        auth: { count: 1, milliseconds: 10.125, failures: 0 },
        qaProofFacts: { count: 1, milliseconds: 3, failures: 0 },
        qaDomain: { count: 1, milliseconds: 7, failures: 0 },
        sql: { count: 3, milliseconds: 160.05, failures: 1 },
      },
    }
    Object.assign(trace.phases, {
      'secret;desc="private@example.test"': { count: 1, milliseconds: 2 },
    })
    expect(formatPerformanceServerTiming(trace)).toBe(
      'ew_request;dur=101.2,ew_auth;dur=10.1;desc="1 calls",ew_qaProofFacts;dur=3.0;desc="1 calls",ew_qaDomain;dur=7.0;desc="1 calls",ew_sql;dur=160.1;desc="3 calls"',
    )
    trace.phases.sql = {
      count: Number.NaN,
      milliseconds: Number.POSITIVE_INFINITY,
      failures: 0,
    }
    expect(formatPerformanceServerTiming(trace)).not.toContain("ew_sql")
    expect(formatPerformanceServerTiming(trace)).not.toContain("private")
  })
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
