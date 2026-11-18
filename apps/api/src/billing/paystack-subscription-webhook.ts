import { prisma } from "@ewatrade/db"
import {
  isWebReconciliationConfigured,
  paystackWebhookSecrets,
  verifyPaystackSignatureHeader,
  verifyPaystackSubscriptionWebhook,
} from "@ewatrade/payments/web-subscriptions"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import { processPaystackSubscriptionEvent } from "./web-subscriptions"

export function registerPaystackSubscriptionWebhook(
  app: OpenAPIHono,
  dependencies: {
    configured: () => boolean
    secrets: () => Array<{ kind: "signing" | "legacy"; secret: string }>
    process: (payload: unknown) => Promise<void>
  } = {
    configured: () => isWebReconciliationConfigured(),
    secrets: () => paystackWebhookSecrets(),
    process: (payload) => processPaystackSubscriptionEvent(prisma, payload),
  },
) {
  app.post(
    "/api/billing/webhooks/paystack",
    bodyLimit({
      maxSize: 256_000,
      onError: (c) => c.json({ error: "Event too large." }, 413),
    }),
    async (c) => {
      // Continue reconciling paid receipts even when new checkout is disabled.
      if (!dependencies.configured())
        return c.json({ error: "Subscription processing is unavailable." }, 503)
      const raw = await c.req.text()
      if (new TextEncoder().encode(raw).length > 256_000)
        return c.json({ error: "Event too large." }, 413)
      const signature = c.req.header("paystack-signature") ?? null
      const legacySignature = c.req.header("x-paystack-signature") ?? null
      const authentic = dependencies
        .secrets()
        .some(({ kind, secret }) =>
          kind === "signing"
            ? verifyPaystackSignatureHeader(raw, signature, secret)
            : verifyPaystackSubscriptionWebhook(raw, legacySignature, secret),
        )
      if (!authentic)
        return c.json({ error: "Invalid payment signature." }, 401)
      let payload: unknown
      try {
        payload = JSON.parse(raw)
      } catch {
        return c.json({ error: "Invalid event." }, 400)
      }
      try {
        await dependencies.process(payload)
        return c.json({ received: true }, 200)
      } catch {
        // No provider payload/card/authorization or secret is emitted to logs.
        return c.json(
          { error: "Subscription event is awaiting reconciliation." },
          503,
        )
      }
    },
  )
}
