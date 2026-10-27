import type { PrismaClient } from "@ewatrade/db"
import {
  PaymentNotificationError,
  paymentNotificationBusinesses,
  paymentNotificationPolicyWriteSchema,
  readPaymentNotificationPolicy,
  readPaymentReportNotificationEligibility,
  savePaymentNotificationPolicy,
} from "@ewatrade/db/payment-report-notifications"
import { Hono } from "hono"
import { z } from "zod"
import { validOversightKey } from "./verify-key"

export function createPaymentNotificationOversightRoutes(
  getDb: () => PrismaClient,
  allowWrites = false,
) {
  const app = new Hono()
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
        {
          error:
            "Configuration writes are unavailable on this read-only service.",
        },
        503,
      )
    await next()
  })
  app.onError((error, c) => {
    if (error instanceof PaymentNotificationError)
      return c.json(
        { error: error.message },
        error.code === "CONFLICT"
          ? 409
          : error.code === "FORBIDDEN"
            ? 403
            : error.code === "NOT_FOUND"
              ? 404
              : error.code === "BAD_REQUEST"
                ? 400
                : 503,
      )
    return c.json(
      { error: "Payment notification settings are unavailable." },
      503,
    )
  })
  app.get("/", async (c) =>
    c.json(await readPaymentNotificationPolicy(getDb())),
  )
  app.put("/", async (c) => {
    const text = await c.req.text()
    if (text.length > 16_000) return c.json({ error: "Invalid settings" }, 400)
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return c.json({ error: "Invalid settings" }, 400)
    }
    const parsed = paymentNotificationPolicyWriteSchema
      .extend({ actorId: z.string().trim().min(1).max(128) })
      .strict()
      .safeParse(body)
    if (!parsed.success) return c.json({ error: "Invalid settings" }, 400)
    return c.json(await savePaymentNotificationPolicy(getDb(), parsed.data))
  })
  app.get("/businesses", async (c) => {
    const input = z
      .object({
        cursor: z.string().min(1).max(128).optional(),
        search: z.string().trim().max(100).optional(),
      })
      .strict()
      .safeParse(c.req.query())
    if (!input.success)
      return c.json({ error: "Invalid business selection" }, 400)
    return c.json(await paymentNotificationBusinesses(getDb(), input.data))
  })
  app.get("/usage/:tenantId", async (c) => {
    const id = z
      .string()
      .trim()
      .min(1)
      .max(128)
      .safeParse(c.req.param("tenantId"))
    if (!id.success) return c.json({ error: "Invalid business selection" }, 400)
    return c.json(
      await readPaymentReportNotificationEligibility(getDb(), {
        tenantId: id.data,
      }),
    )
  })
  return app
}
