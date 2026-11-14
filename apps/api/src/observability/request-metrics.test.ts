import { describe, expect, test } from "bun:test"
import { trpcServer } from "@hono/trpc-server"
import { initTRPC } from "@trpc/server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { getRequestTrace } from "../utils/request-trace"
import {
  type ApiRequestMetric,
  apiRequestLabels,
  apiRequestMetrics,
} from "./request-metrics"

const t = initTRPC.create()
const router = t.router({
  account: t.router({
    health: t.procedure.query(() => "healthy"),
    status: t.procedure.query(() => "ready"),
  }),
})
const labels = apiRequestLabels(router._def.procedures)

function fixture(env: NodeJS.ProcessEnv, random = () => 0) {
  const samples: ApiRequestMetric[] = []
  const inner = new Hono()
  inner.use(async (c, next) => {
    c.header("X-Request-Id", getRequestTrace(c.req).requestId)
    await next()
  })
  inner.use(cors())
  inner.get("/api/files/:token", (c) => c.text("ok"))
  inner.use("/api/trpc/*", trpcServer({ router, endpoint: "/api/trpc" }))
  const app = new Hono()
  app.use(
    apiRequestMetrics(labels, {
      env,
      random,
      emit: (sample) => samples.push(sample),
    }),
  )
  app.route("/", inner)
  return { app, inner, samples }
}

describe("API request metrics", () => {
  test("normalizes Hono routes, status and request id without retaining inputs", async () => {
    const { app, samples } = fixture({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      APP_ENV: "production",
    })
    const response = await app.request(
      "/api/files/private-token?email=private",
      {
        headers: { "x-request-id": "private-identifier" },
      },
    )
    await app.request("/private-unknown")
    await app.request("/api/files/private-token", { method: "OPTIONS" })
    expect(samples.map(({ route, status }) => [route, status])).toEqual([
      ["/api/files/:token", 200],
      ["unmatched", 404],
      ["cors.preflight", 204],
    ])
    expect(samples[0]).toMatchObject({
      environment: "preview",
      method: "GET",
      requestId: response.headers.get("X-Request-Id"),
      firstInProcess: true,
    })
    expect(samples[0]?.responseSetupMs).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(samples)).not.toContain("private")
  })

  test("records known tRPC batch labels and dimensions without changing the response", async () => {
    const { app, samples } = fixture({ DEBUG_PERF: "true" })
    const response = await app.request(
      "/api/trpc/account.health%2Craw-token%2Caccount.status?batch=1",
    )
    expect(response.status).toBe(207)
    expect(await response.json()).toMatchObject([
      { result: { data: "healthy" } },
      { error: { data: { code: "NOT_FOUND" } } },
      { result: { data: "ready" } },
    ])
    expect(samples[0]).toMatchObject({
      route: "/api/trpc/*",
      procedures: ["account.health", "unknown", "account.status"],
      truncated: false,
    })
    expect(JSON.stringify(samples)).not.toContain("raw-token")
    expect(labels.batch("/api/trpc/%ZZ").procedures).toEqual(["unknown"])
    expect(
      labels.batch(`/api/trpc/${"account.health,".repeat(17)}`),
    ).toMatchObject({
      procedures: Array(16).fill("account.health"),
      truncated: true,
    })
  })

  test("captures first standalone request and samples later ones", async () => {
    const values = [0.5, 0.001]
    const { app, inner, samples } = fixture(
      { VERCEL: "1" },
      () => values.shift() ?? 1,
    )
    expect((await inner.request("/api/trpc/account.health")).status).toBe(200)
    for (let i = 0; i < 3; i++) await app.request("/api/files/test")
    expect(
      samples.map(({ firstInProcess, sampleRate }) => ({
        firstInProcess,
        sampleRate,
      })),
    ).toEqual([
      { firstInProcess: true, sampleRate: 1 },
      { firstInProcess: false, sampleRate: 0.01 },
    ])
  })
})
