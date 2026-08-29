import { prisma } from "@ewatrade/db"
import {
  PrescriptionPaymentError,
  processPrescriptionPaymentProviderEvent,
} from "@ewatrade/db/queries"
import { enqueuePrescriptionCommunicationDispatch } from "@ewatrade/jobs"
import { PaystackWebhookAdapter } from "@ewatrade/payments"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { getRequestTrace } from "../utils/request-trace"

export function registerPrescriptionPaystackWebhook(app: OpenAPIHono) {
  app.post("/api/prescriptions/webhooks/paystack", async (c) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim()
    if (!secretKey) {
      return c.json({ error: "Payment processing is unavailable." }, 503)
    }
    const body = await c.req.text()
    const adapter = new PaystackWebhookAdapter(secretKey)
    if (!adapter.verify(body, c.req.header("x-paystack-signature") ?? null)) {
      console.warn("[webhook] invalid signature", {
        provider: "paystack-prescriptions",
        requestId: getRequestTrace(c.req).requestId,
      })
      return c.json({ error: "Invalid payment signature." }, 401)
    }
    const event = adapter.parse(body)
    if (!event) return c.json({ received: true }, 200)
    try {
      const result = await processPrescriptionPaymentProviderEvent(prisma, {
        ...event,
        provider: "paystack",
      })
      if (result.communicationIntentId) {
        await enqueuePrescriptionCommunicationDispatch(
          result.communicationIntentId,
        )
      }
      return c.json({ received: true }, 200)
    } catch (error) {
      if (error instanceof PrescriptionPaymentError) {
        return c.json({ error: "Payment event could not be reconciled." }, 409)
      }
      throw error
    }
  })
}
