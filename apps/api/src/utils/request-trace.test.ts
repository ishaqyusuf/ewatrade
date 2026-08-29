import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { getRequestTrace } from "./request-trace"

describe("request trace", () => {
  test("mints and reuses one server-owned opaque request id", async () => {
    const app = new Hono()
    app.get("/", (context) => {
      const first = getRequestTrace(context.req)
      const second = getRequestTrace(context.req)
      return context.json({ first, second })
    })
    const response = await app.request("/", {
      headers: { "x-request-id": "order_01HXPRIVATE" },
    })
    const trace = (await response.json()) as {
      first: { cfRay: null; requestId: string }
      second: { cfRay: null; requestId: string }
    }
    expect(trace.first.requestId).toMatch(/^req_[0-9a-f-]{36}$/i)
    expect(trace.first.requestId).not.toContain("order_01HXPRIVATE")
    expect(trace.second).toEqual(trace.first)
  })

  test("rejects sensitive or unbounded inbound identifiers", async () => {
    const app = new Hono()
    app.get("/", (context) =>
      context.text(getRequestTrace(context.req).requestId),
    )
    const response = await app.request("/", {
      headers: { "x-request-id": "customer email private@example.com" },
    })
    expect(await response.text()).toMatch(/^req_[0-9a-f-]{36}$/i)
  })
})
