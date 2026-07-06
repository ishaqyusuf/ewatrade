import { auth } from "@ewatrade/auth"
import { trpcServer } from "@hono/trpc-server"
import { OpenAPIHono } from "@hono/zod-openapi"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { secureHeaders } from "hono/secure-headers"
import { createTRPCContext } from "./trpc/init"
import { appRouter } from "./trpc/routers/_app"
import { getRequestTrace } from "./utils/request-trace"

const allowedOrigins =
  process.env.ALLOWED_API_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []

const app = new OpenAPIHono()

app.use(secureHeaders({ crossOriginResourcePolicy: "cross-origin" }))

app.use(
  "*",
  cors({
    origin:
      allowedOrigins.length > 0
        ? allowedOrigins
        : ["http://localhost:3094", "http://127.0.0.1:3094"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: [
      "Authorization",
      "Content-Type",
      "User-Agent",
      "accept-language",
      "cf-ray",
      "trpc-accept",
      "x-force-primary",
      "x-internal-key",
      "x-request-id",
      "x-tenant-slug",
      "x-trpc-source",
    ],
    exposeHeaders: [
      "Content-Length",
      "Content-Type",
      "Cache-Control",
      "Cross-Origin-Resource-Policy",
      "Server-Timing",
    ],
    credentials: true,
    maxAge: 86400,
  }),
)

const debugPerf = process.env.DEBUG_PERF === "true"

app.use("/api/trpc/*", async (c, next) => {
  const start = performance.now()
  await next()

  const duration = performance.now() - start
  const procedures = c.req.path
    .replace("/api/trpc/", "")
    .split(",")
    .filter(Boolean)

  c.header(
    "Server-Timing",
    `total;dur=${duration.toFixed(1)},procedures;desc="${procedures.join(",")}"`,
  )

  if (debugPerf) {
    const { requestId, cfRay } = getRequestTrace(c.req)

    console.info("[perf:trpc]", {
      totalMs: Number(duration.toFixed(2)),
      procedureCount: procedures.length,
      procedures,
      status: c.res.status,
      requestId,
      cfRay,
    })
  }
})

app.get("/favicon.ico", (c) => c.body(null, 204))
app.get("/robots.txt", (c) => c.body(null, 204))

app.get("/health", (c) => {
  const start = performance.now()

  c.header("Server-Timing", `app;dur=${(performance.now() - start).toFixed(2)}`)
  c.header("X-Server-Timestamp", Date.now().toString())

  return c.json({ status: "ok" }, 200)
})

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))

app.use(
  "/api/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: createTRPCContext,
    endpoint: "/api/trpc",
    onError: ({ error, path, input }) => {
      console.error("[tRPC]", {
        path,
        code: error.code,
        message: error.message,
        cause: error.cause instanceof Error ? error.cause.message : undefined,
        input,
        stack: error.stack,
      })
    },
  }),
)

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse()
  }

  console.error(`[Hono] ${c.req.method} ${c.req.path}`, {
    message: err.message,
    stack: err.stack,
  })

  return c.json({ error: "Internal Server Error" }, 500)
})

const requestedPort = Number(
  process.env.PORT ?? process.env.PORTLESS_APP_PORT ?? 3095,
)
const port = Number.isFinite(requestedPort) ? requestedPort : 3095

export { app }

export default {
  port,
  fetch: app.fetch,
  host: "0.0.0.0",
  idleTimeout: 60,
}
