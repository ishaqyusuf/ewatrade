import { expect, test } from "bun:test"
import {
  type PerformanceTrace,
  tracePhase,
} from "@ewatrade/db/performance-tracing"
import { Hono } from "hono"
import {
  type TraceCompletion,
  performanceTracingMiddleware,
  tracePerformanceResponse,
} from "./performance-trace-response"

function requireReader(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Expected a response body")
  return reader
}

test("JSONL response setup is not reported as completed query work", async () => {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const traces: { trace: PerformanceTrace; completion: TraceCompletion }[] = []
  const encoder = new TextEncoder()
  const response = await tracePerformanceResponse(
    async () =>
      new Response(
        new ReadableStream({
          async start(controller) {
            controller.enqueue(encoder.encode("first\n"))
            await tracePhase("sql", async () => gate)
            controller.enqueue(encoder.encode("last\n"))
            controller.close()
          },
        }),
        {
          headers: {
            "content-type": "application/jsonl",
            "cache-control": "private, no-store",
          },
        },
      ),
    (trace, completion) => traces.push({ trace, completion }),
  )
  const reader = response.body?.getReader()
  try {
    expect(new TextDecoder().decode((await reader?.read())?.value)).toBe(
      "first\n",
    )
    expect(traces).toEqual([])
    expect(response.headers.get("server-timing")).toContain(
      "ew_responseSetup;dur=",
    )
    expect(response.headers.get("server-timing")).not.toContain("ew_request")
  } finally {
    release()
  }
  expect(new TextDecoder().decode((await reader?.read())?.value)).toBe("last\n")
  await reader?.read()
  expect(traces).toHaveLength(1)
  expect(traces[0]?.completion).toBe("complete")
  expect(traces[0]?.trace.phases.sql?.count).toBe(1)
  expect(response.headers.get("cache-control")).toBe("private, no-store")
})

test("Hono keeps prior timing/security headers and default-off responses remain untouched", async () => {
  for (const enabled of [false, true]) {
    const traces: PerformanceTrace[] = []
    const app = new Hono()
    app.use(
      "*",
      performanceTracingMiddleware(
        () => enabled,
        (trace) => traces.push(trace),
      ),
    )
    app.use("*", async (c, next) => {
      await next()
      c.header("Server-Timing", "legacy;dur=1")
      c.header("Cache-Control", "private, no-store")
      c.header("X-Content-Type-Options", "nosniff")
    })
    app.get("/", (c) => {
      c.header("Set-Cookie", "first=fixture; HttpOnly", { append: true })
      c.header("Set-Cookie", "second=fixture; HttpOnly", { append: true })
      return c.body(null, 204)
    })
    const response = await app.request("http://fixture.test/")
    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.getSetCookie()).toEqual([
      "first=fixture; HttpOnly",
      "second=fixture; HttpOnly",
    ])
    expect(response.headers.get("Server-Timing")).toContain("legacy;")
    expect(response.headers.get("Server-Timing")?.includes("ew_request;")).toBe(
      enabled,
    )
    expect(traces.length).toBe(enabled ? 1 : 0)
  }
})

test("ordinary responses preserve status, cookies and fixed timing when the exporter throws", async () => {
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "private, no-store",
    "server-timing": "app;dur=1",
  })
  headers.append("set-cookie", "first=fixture; HttpOnly")
  headers.append("set-cookie", "second=fixture; HttpOnly")
  const response = await tracePerformanceResponse(
    async () => {
      await tracePhase("sql", async () => undefined)
      return new Response('{"ok":true}', { status: 403, headers })
    },
    () => {
      throw new Error("private exporter failure")
    },
  )
  expect(response.status).toBe(403)
  expect(await response.text()).toBe('{"ok":true}')
  expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie())
  expect(response.headers.get("server-timing")).toContain("ew_sql;")
  expect(response.headers.get("server-timing")).not.toContain("private")
})

test("stream failures and cancellation finish once, preserve behavior and exclude private reasons", async () => {
  for (const mode of ["error", "cancel"] as const) {
    const traces: { trace: PerformanceTrace; completion: TraceCompletion }[] =
      []
    const secret = new Error("private stream reason")
    let fail = (_error: unknown) => {}
    let upstreamCancelled: unknown
    const response = await tracePerformanceResponse(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([1]))
              fail = (error) => controller.error(error)
            },
            cancel(reason) {
              upstreamCancelled = reason
            },
          }),
          { headers: { "content-type": "text/event-stream; charset=utf-8" } },
        ),
      (trace, completion) => {
        traces.push({ trace, completion })
        throw new Error("private exporter error")
      },
    )
    const reader = requireReader(response)
    await reader.read()
    expect(traces).toEqual([])
    if (mode === "error") {
      fail(secret)
      await expect(reader.read()).rejects.toBe(secret)
      expect(traces[0]?.completion).toBe("error")
    } else {
      await reader.cancel(secret)
      expect(upstreamCancelled).toBe(secret)
      expect(traces[0]?.completion).toBe("cancelled")
    }
    expect(traces).toHaveLength(1)
    expect(traces[0]?.trace.failed).toBe(true)
    expect(JSON.stringify(traces)).not.toContain("private")
  }
})

test("cancelled snapshots cannot acquire late work from a finished upstream operation", async () => {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let late: Promise<void> | undefined
  const traces: PerformanceTrace[] = []
  const response = await tracePerformanceResponse(
    async () => {
      late = tracePhase("sql", async () => gate)
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]))
          },
        }),
        { headers: { "content-type": "application/jsonl" } },
      )
    },
    (trace) => traces.push(trace),
  )
  const reader = requireReader(response)
  await reader.read()
  await reader.cancel()
  const snapshot = JSON.stringify(traces)
  release()
  await late
  expect(JSON.stringify(traces)).toBe(snapshot)
  expect(traces).toHaveLength(1)
})
