import {
  type PerformanceTrace,
  formatPerformanceServerTiming,
  startPerformanceTrace,
} from "@ewatrade/db/performance-tracing"
import type { MiddlewareHandler } from "hono"

export type TraceCompletion = "complete" | "error" | "cancelled"

export function performanceTracingMiddleware(
  enabled: () => boolean,
  emit: (
    trace: PerformanceTrace,
    completion: TraceCompletion,
    status: number,
  ) => void,
): MiddlewareHandler {
  return async (c, next) => {
    if (!enabled()) return next()
    const response = await tracePerformanceResponse(
      async () => {
        await next()
        return c.res
      },
      (trace, completion) => emit(trace, completion, c.res.status),
    )
    // Hono preserves existing headers when replacing c.res; restore the merged
    // diagnostic value after that assignment rather than losing it to the old one.
    const timing = response.headers.get("Server-Timing")
    c.res = response
    if (timing) c.header("Server-Timing", timing)
  }
}

export function isStreamingPerformanceResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? ""
  // tRPC 11 negotiates JSONL but emits application/json + chunked encoding.
  const chunkedJson =
    /^application\/json(?:\s*;|$)/i.test(contentType) &&
    response.headers
      .get("transfer-encoding")
      ?.split(",")
      .some((value) => value.trim().toLowerCase() === "chunked")
  return Boolean(
    response.body &&
      (/^(application\/jsonl|text\/event-stream)(?:\s*;|$)/i.test(
        contentType,
      ) ||
        chunkedJson),
  )
}

/** Fixed numeric diagnostics only; response content is never retained. */
export async function tracePerformanceResponse(
  work: () => Promise<Response>,
  emit: (trace: PerformanceTrace, completion: TraceCompletion) => void,
) {
  let completion: TraceCompletion = "complete"
  const trace = startPerformanceTrace("request", (value) =>
    emit(value, completion),
  )
  const finish = (value: TraceCompletion) => {
    completion = value
    trace.finish(value !== "complete")
  }
  return trace.run(async () => {
    try {
      const response = await work()
      const headers = new Headers(response.headers)
      const setup = trace.snapshot()
      headers.set("X-Performance-Trace-Id", setup.id)
      const streaming = isStreamingPerformanceResponse(response)
      const timing = streaming
        ? `ew_responseSetup;dur=${setup.milliseconds.toFixed(1)}`
        : formatPerformanceServerTiming(setup)
      headers.set(
        "Server-Timing",
        [headers.get("Server-Timing"), timing].filter(Boolean).join(","),
      )
      if (!streaming || !response.body) {
        finish(response.status >= 500 ? "error" : "complete")
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        })
      }
      const reader = response.body.getReader()
      let cancelled = false
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const value = await trace.run(() => reader.read())
            if (cancelled) return
            if (value.done) {
              finish(response.status >= 500 ? "error" : "complete")
              controller.close()
            } else controller.enqueue(value.value)
          } catch (error) {
            if (cancelled) return
            finish("error")
            controller.error(error)
          }
        },
        async cancel(reason) {
          cancelled = true
          try {
            await trace.run(() => reader.cancel(reason))
          } finally {
            finish("cancelled")
          }
        },
      })
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch (error) {
      finish("error")
      throw error
    }
  })
}
