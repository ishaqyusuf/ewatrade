import "./instrument"

import { auth } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import { toPublicErrorEnvelope } from "@ewatrade/errors"
import { trpcServer } from "@hono/trpc-server"
import { OpenAPIHono } from "@hono/zod-openapi"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { secureHeaders } from "hono/secure-headers"
import { registerBillingProviderEventRoutes } from "./billing/provider-events"
import { registerWhatsAppEmbeddedSignupRoutes } from "./communications/whatsapp-embedded-signup"
import { registerWhatsAppWebhookRoutes } from "./communications/whatsapp-webhook"
import { registerDomainPaystackWebhook } from "./domains/paystack-webhook"
import { captureApiError } from "./observability/sentry"
import { registerPrescriptionMediaDeliveryRoutes } from "./prescriptions/media-delivery"
import { registerPrescriptionPaystackWebhook } from "./prescriptions/paystack-webhook"
import { registerSelfServiceStoreDetectionRoutes } from "./self-service/store-detection"
import { registerServiceCommerceMediaDeliveryRoutes } from "./service-commerce/media-delivery"
import { registerServiceCommerceMediaUploadRoutes } from "./service-commerce/media-upload"
import { createTRPCContext } from "./trpc/init"
import { appRouter } from "./trpc/routers/_app"
import { getRequestTrace } from "./utils/request-trace"

const allowedOrigins =
  process.env.ALLOWED_API_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []

const app = new OpenAPIHono()

app.use(secureHeaders({ crossOriginResourcePolicy: "cross-origin" }))

app.use("*", async (c, next) => {
  const { requestId } = getRequestTrace(c.req)
  c.header("X-Request-Id", requestId)
  await next()
})

app.use(
  "*",
  cors({
    origin:
      allowedOrigins.length > 0
        ? allowedOrigins
        : [
            "http://ewatrade-pos.localhost",
            "http://ewatrade-dashboard.localhost",
            "http://localhost:3093",
            "http://127.0.0.1:3093",
            "http://localhost:3094",
            "http://127.0.0.1:3094",
          ],
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
      "X-Request-Id",
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

app.get("/health", async (c) => {
  const start = performance.now()
  const accounts = await prisma.account.count({})

  c.header("Server-Timing", `app;dur=${(performance.now() - start).toFixed(2)}`)
  c.header("X-Server-Timestamp", Date.now().toString())

  return c.json({ status: "ok", database: { accounts } }, 200)
})

registerBillingProviderEventRoutes(app)
registerDomainPaystackWebhook(app)
registerSelfServiceStoreDetectionRoutes(app)
registerPrescriptionMediaDeliveryRoutes(app)
registerServiceCommerceMediaDeliveryRoutes(app)
registerServiceCommerceMediaUploadRoutes(app)
registerPrescriptionPaystackWebhook(app)
registerWhatsAppWebhookRoutes(app)
registerWhatsAppEmbeddedSignupRoutes(app)

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))

app.use(
  "/api/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: createTRPCContext,
    endpoint: "/api/trpc",
    onError: ({ ctx, error, path }) => {
      captureApiError(error, {
        operation: path ? `trpc.${path}` : "trpc.unknown",
        requestId: ctx?.requestId,
      })
      console.error("[tRPC]", {
        path,
        code: error.code,
        requestId: ctx?.requestId,
      })
    },
  }),
)

app.onError((err, c) => {
  const { requestId } = getRequestTrace(c.req)
  if (err instanceof HTTPException) {
    const envelope = toPublicErrorEnvelope(err, requestId)
    return c.json(envelope, err.status)
  }

  captureApiError(err, {
    operation: "http.unhandled",
    requestId,
  })
  console.error("[Hono] unhandled request failure", {
    method: c.req.method,
    requestId,
    status: 500,
  })

  return c.json(toPublicErrorEnvelope(err, requestId), 500)
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
