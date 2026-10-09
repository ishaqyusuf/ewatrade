import "./shared-env"
import "./instrument"
import { appUpdateDependencies } from "./app-update/context"
import { registerAppUpdateRoutes } from "./app-update/routes"

import { auth } from "@ewatrade/auth"
import { prisma } from "@ewatrade/db"
import { isLegalSignupSessionBlocked } from "@ewatrade/db/legal-session-access"
import { withPerformanceTrace } from "@ewatrade/db/performance-tracing"
import { isPrescriptionProductionLaunchApproved } from "@ewatrade/db/queries"
import { toPublicErrorEnvelope } from "@ewatrade/errors"
import { trpcServer } from "@hono/trpc-server"
import { OpenAPIHono } from "@hono/zod-openapi"
import { Hono } from "hono"
import type { Context } from "hono"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { secureHeaders } from "hono/secure-headers"
import { registerAccountPrivacyResendWebhook } from "./account-privacy/resend-webhook"
import { registerAssistantAttachmentRoutes } from "./assistant/attachment-upload"
import { registerAssistantChatRoutes } from "./assistant/chat-route"
import { registerGeneralAssistantChatRoutes } from "./assistant/general-chat-route"
import { registerBillingProviderEventRoutes } from "./billing/provider-events"
import { registerStoreNotificationRoutes } from "./billing/store-notifications"
import { registerCatalogPhotoPreviewRoutes } from "./catalog/photo-preview"
import { registerCatalogPublicPhotoRoutes } from "./catalog/photo-public"
import { registerCatalogPhotoUploadRoutes } from "./catalog/photo-upload"
import { registerWhatsAppEmbeddedSignupRoutes } from "./communications/whatsapp-embedded-signup"
import { registerWhatsAppWebhookRoutes } from "./communications/whatsapp-webhook"
import { registerDomainPaystackWebhook } from "./domains/paystack-webhook"
import { registerFinanceExpenseReceiptDeliveryRoutes } from "./finance/expense-receipt-delivery"
import {
  financeExpenseReceiptDeliveryStorage,
  prepareFinanceExpenseReceiptDelivery,
} from "./finance/expense-receipt-delivery-context"
import { registerFinanceExpenseReceiptUploadRoutes } from "./finance/expense-receipt-upload"
import { captureApiError } from "./observability/sentry"
import { registerPrescriptionMediaDeliveryRoutes } from "./prescriptions/media-delivery"
import { registerPrescriptionPaystackWebhook } from "./prescriptions/paystack-webhook"
import { isPrescriptionTrpcRoute } from "./prescriptions/trpc-launch-route"
import { registerSelfServiceStoreDetectionRoutes } from "./self-service/store-detection"
import { registerStoreConversationAttachmentRoutes } from "./service-commerce/conversation-attachments-routes"
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

app.use("*", async (c, next) => {
  if (process.env.PERFORMANCE_TRACE !== "true") return next()
  return withPerformanceTrace("request", next, (trace) => {
    c.header("X-Performance-Trace-Id", trace.id)
    console.info(
      "[performance]",
      JSON.stringify({ ...trace, status: c.res.status }),
    )
  })
})

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
      "x-store-conversation-credential",
      "x-store-conversation-installation",
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
  if (
    !isPrescriptionProductionLaunchApproved() &&
    isPrescriptionTrpcRoute(c.req.path)
  ) {
    c.header("Cache-Control", "no-store")
    return c.json({ error: "Pharmacy Commerce is unavailable." }, 404)
  }
  await next()
})

app.use("/api/trpc/*", async (c, next) => {
  const start = performance.now()
  await next()

  const duration = performance.now() - start
  const procedures = c.req.path
    .replace("/api/trpc/", "")
    .split(",")
    .filter(Boolean)

  if (procedures.includes("search.global")) {
    c.header("Cache-Control", "private, no-store")
  }

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

const healthHandler = async (c: Context) => {
  const start = performance.now()
  const accounts = await prisma.account.count({})

  c.header("Server-Timing", `app;dur=${(performance.now() - start).toFixed(2)}`)
  c.header("X-Server-Timestamp", Date.now().toString())

  return c.json({ status: "ok", database: { accounts } }, 200)
}

app.get("/health", healthHandler)
app.get("/api/health", healthHandler)

registerAppUpdateRoutes(app, appUpdateDependencies)
registerBillingProviderEventRoutes(app)
registerAccountPrivacyResendWebhook(app)
registerStoreNotificationRoutes(app)
registerCatalogPhotoUploadRoutes(app)
registerCatalogPhotoPreviewRoutes(app)
registerCatalogPublicPhotoRoutes(app)
registerFinanceExpenseReceiptUploadRoutes(app)
registerFinanceExpenseReceiptDeliveryRoutes(app, {
  prepare: prepareFinanceExpenseReceiptDelivery,
  storage: financeExpenseReceiptDeliveryStorage,
  secret: () => process.env.RECEIPT_DOWNLOAD_SECRET,
})
registerDomainPaystackWebhook(app)
registerSelfServiceStoreDetectionRoutes(app)
registerAssistantChatRoutes(app)
registerAssistantAttachmentRoutes(app)
registerGeneralAssistantChatRoutes(app)
registerPrescriptionMediaDeliveryRoutes(app)
registerServiceCommerceMediaDeliveryRoutes(app)
registerServiceCommerceMediaUploadRoutes(app)
registerStoreConversationAttachmentRoutes(app)
registerPrescriptionPaystackWebhook(app)
registerWhatsAppWebhookRoutes(app)
registerWhatsAppEmbeddedSignupRoutes(app)

// Account creation must pass a surface that records the exact legal version.
app.use("/api/auth/sign-up/*", async (c, next) => {
  if (
    process.env.APP_ENV === "production" ||
    process.env.NODE_ENV === "production"
  ) {
    c.header("Cache-Control", "no-store")
    return c.json({ error: "Account creation is unavailable here." }, 404)
  }
  await next()
})

app.use("/api/auth/*", async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path.startsWith("/api/auth/sign-in/") || path === "/api/auth/sign-out") {
    await next()
    return
  }
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (
    session?.user?.id &&
    (await isLegalSignupSessionBlocked(prisma, session.user.id))
  ) {
    c.header("Cache-Control", "no-store")
    return c.json({ error: "Account setup is incomplete." }, 403)
  }
  await next()
})

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw))

app.use(
  "/api/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: createTRPCContext,
    endpoint: "/api/trpc",
    allowMethodOverride: true,
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

export { app }

// Vercel's Hono adapter detects a direct `hono` entrypoint. Route the shared
// API app through that entrypoint while local Bun continues to serve `app`.
const vercelApp = new Hono()
vercelApp.route("/", app)
export default vercelApp
