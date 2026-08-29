import { type Prisma, prisma } from "@ewatrade/db"
import {
  markDomainOrderPaid,
  markDomainOrderRefunded,
  recordDomainRefundEvent,
} from "@ewatrade/db/queries"
import {
  parsePaystackRefundEvent,
  verifyPaystackSignature,
} from "@ewatrade/domains"
import { enqueueDomainRegistration } from "@ewatrade/jobs"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { z } from "zod"
import { getRequestTrace } from "../utils/request-trace"

const paystackEventSchema = z.object({
  data: z.object({
    amount: z.number().int().nonnegative(),
    currency: z.string().trim().min(3),
    reference: z.string().trim().min(1),
    status: z.string(),
  }),
  event: z.string(),
})

export function registerDomainPaystackWebhook(app: OpenAPIHono) {
  app.post("/api/domains/webhooks/paystack", async (c) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim()

    if (!secretKey) {
      return c.json({ error: "Paystack is not configured." }, 503)
    }

    const body = await c.req.text()
    const signature = c.req.header("x-paystack-signature") ?? null

    if (!verifyPaystackSignature({ body, secretKey, signature })) {
      console.warn("[webhook] invalid signature", {
        provider: "paystack-domains",
        requestId: getRequestTrace(c.req).requestId,
      })
      return c.json({ error: "Invalid Paystack signature." }, 401)
    }

    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch {
      return c.json({ error: "Invalid Paystack event." }, 400)
    }

    const refundEvent = parsePaystackRefundEvent(payload)

    if (
      refundEvent &&
      refundEvent.event === "refund.processed" &&
      ["processed", "success"].includes(refundEvent.status)
    ) {
      await markDomainOrderRefunded(prisma, {
        paymentReference: refundEvent.paymentReference,
        providerEventId: refundEvent.providerEventId,
        rawEvent: payload as Prisma.InputJsonValue,
      })
      return c.json({ received: true }, 200)
    }

    if (refundEvent) {
      await recordDomainRefundEvent(prisma, {
        paymentReference: refundEvent.paymentReference,
        providerEventId: refundEvent.providerEventId,
        rawEvent: payload as Prisma.InputJsonValue,
        status: refundEvent.event === "refund.failed" ? "FAILED" : "PENDING",
      })
      return c.json({ received: true }, 200)
    }

    const parsed = paystackEventSchema.safeParse(payload)

    if (!parsed.success) {
      return c.json({ error: "Invalid Paystack event." }, 400)
    }

    if (
      parsed.data.event !== "charge.success" ||
      parsed.data.data.status !== "success"
    ) {
      return c.json({ received: true }, 200)
    }

    const result = await markDomainOrderPaid(prisma, {
      amountMinor: parsed.data.data.amount,
      currencyCode: parsed.data.data.currency,
      paymentReference: parsed.data.data.reference,
      providerEventId: `${parsed.data.event}:${parsed.data.data.reference}`,
      rawEvent: parsed.data as Prisma.InputJsonValue,
    })

    if (result.newlyPaid) {
      await enqueueDomainRegistration({ orderId: result.order.id })
    }

    return c.json({ received: true }, 200)
  })
}
