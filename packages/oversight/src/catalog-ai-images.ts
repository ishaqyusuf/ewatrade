import type { PrismaClient } from "@ewatrade/db"
import {
  CatalogAiError,
  catalogAiAnalytics,
  catalogAiTokenAnalytics,
  catalogAiUsage,
  loadCatalogAiPolicy,
  readCatalogAiPolicy,
  reconcileCatalogAiRequest,
  saveCatalogAiPolicy,
} from "@ewatrade/db/catalog-ai-images"
import { paymentNotificationBusinesses } from "@ewatrade/db/payment-report-notifications"
import { catalogAiPolicyWriteSchema } from "@ewatrade/utils/catalog-ai-images"
import { Hono } from "hono"
import { z } from "zod"
import { createCatalogAiLibraryRoutes } from "./catalog-ai-library"
import { validOversightKey } from "./verify-key"
export function createCatalogAiOversightRoutes(
  getDb: () => PrismaClient,
  allowWrites = false,
) {
  const app = new Hono()
  app.route("/library", createCatalogAiLibraryRoutes(getDb))
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store")
    const write = c.req.method !== "GET"
    const expected = write
      ? process.env.OVERSIGHT_WRITE_KEY
      : process.env.OVERSIGHT_READ_KEY
    if (
      (write && expected === process.env.OVERSIGHT_READ_KEY) ||
      !validOversightKey(
        c.req.header("Authorization")?.replace(/^Bearer /, ""),
        expected,
      )
    )
      return c.json({ error: "Unauthorized" }, 401)
    if (write && !allowWrites)
      return c.json(
        { error: "AI configuration writes are unavailable on this service." },
        503,
      )
    await next()
  })
  app.onError((error, c) =>
    c.json(
      {
        error:
          error instanceof CatalogAiError
            ? error.message
            : "AI controls are unavailable.",
      },
      error instanceof CatalogAiError
        ? (
            {
              BAD_REQUEST: 400,
              FORBIDDEN: 403,
              CONFLICT: 409,
              UNAVAILABLE: 503,
              LIMIT: 429,
              NOT_FOUND: 404,
            } as const
          )[error.code]
        : 503,
    ),
  )
  app.get("/", async (c) => c.json(await readCatalogAiPolicy(getDb())))
  app.put("/", async (c) => {
    const body = await c.req.text()
    if (body.length > 128_000)
      return c.json({ error: "Invalid AI settings" }, 400)
    let value: unknown
    try {
      value = JSON.parse(body)
    } catch {
      return c.json({ error: "Invalid AI settings" }, 400)
    }
    const input = catalogAiPolicyWriteSchema
      .extend({ actorId: z.string().trim().min(1).max(128) })
      .strict()
      .safeParse(value)
    if (!input.success) return c.json({ error: "Invalid AI settings" }, 400)
    return c.json(await saveCatalogAiPolicy(getDb(), input.data))
  })
  app.get("/analytics", async (c) => c.json(await catalogAiAnalytics(getDb())))
  app.get("/token-usage", async (c) =>
    c.json(await catalogAiTokenAnalytics(getDb())),
  )
  app.get("/businesses", async (c) => {
    const input = z
      .object({
        search: z.string().trim().max(100).optional(),
        cursor: z.string().min(1).max(128).optional(),
      })
      .strict()
      .safeParse(c.req.query())
    if (!input.success)
      return c.json({ error: "Invalid business selection" }, 400)
    return c.json(await paymentNotificationBusinesses(getDb(), input.data))
  })
  app.get("/usage/:tenantId", async (c) => {
    const tenantId = z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,128}$/)
      .safeParse(c.req.param("tenantId"))
    if (!tenantId.success) return c.json({ error: "Invalid business" }, 400)
    const { policy } = await loadCatalogAiPolicy(getDb())
    return c.json(await catalogAiUsage(getDb(), tenantId.data, policy))
  })
  app.get("/whatsapp", async (c) => {
    const { policy } = await loadCatalogAiPolicy(getDb())
    return c.json({
      monthlyMessages: policy.whatsapp.monthlyMessages,
      period: "monthly",
      counting: "outbound_send_attempts",
      source: "existing_outbound_policy",
    })
  })
  app.get("/requests", async (c) =>
    c.json({
      requests: await getDb().catalogAiImageJob.findMany({
        where: {
          OR: [{ state: "UNCERTAIN" }, { state: "FAILED", costMicros: null }],
        },
        take: 30,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          tenantId: true,
          state: true,
          providerRequestId: true,
          reservedCostMicros: true,
          createdAt: true,
        },
      }),
    }),
  )
  app.post("/requests/:id/reconcile", async (c) => {
    const text = await c.req.text()
    if (text.length > 2000)
      return c.json({ error: "Invalid reconciliation" }, 400)
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      return c.json({ error: "Invalid reconciliation" }, 400)
    }
    const parsed = z
      .object({
        commandId: z.string().uuid(),
        actorId: z.string().min(1).max(128),
        reason: z.string().trim().min(10).max(500),
        costMicros: z.number().int().min(0).max(1_000_000_000),
      })
      .strict()
      .safeParse(value)
    if (!parsed.success) return c.json({ error: "Invalid reconciliation" }, 400)
    return c.json(
      await reconcileCatalogAiRequest(getDb(), {
        ...parsed.data,
        id: c.req.param("id"),
      }),
    )
  })
  return app
}
