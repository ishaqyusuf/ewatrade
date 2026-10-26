import { expect, test } from "bun:test"
import { OpenAPIHono } from "@hono/zod-openapi"
import { registerHealthRoutes } from "./health-routes"

test("both liveness aliases remain healthy during a database outage without probing it", async () => {
  let reads = 0
  const app = new OpenAPIHono()
  app.onError(() => new Response("unavailable", { status: 503 }))
  registerHealthRoutes(app, {
    countAccounts: async () => {
      reads++
      throw new Error("database unavailable")
    },
  })
  for (const path of ["/live", "/api/live"]) {
    const response = await app.request(path)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "ok" })
    expect(response.headers.get("cache-control")).toBe("no-store")
  }
  expect(reads).toBe(0)
  for (const path of ["/health", "/api/health"])
    expect((await app.request(path)).status).toBe(503)
  expect(reads).toBe(2)
})

test("readiness retains the existing database response and timing contract", async () => {
  const app = new OpenAPIHono()
  registerHealthRoutes(app, { countAccounts: async () => 3 })
  for (const path of ["/health", "/api/health"]) {
    const response = await app.request(path)
    expect(await response.json()).toEqual({
      status: "ok",
      database: { accounts: 3 },
    })
    expect(response.headers.get("server-timing")).toContain("app;dur=")
    expect(response.headers.get("x-server-timestamp")).toMatch(/^\d+$/)
  }
})
