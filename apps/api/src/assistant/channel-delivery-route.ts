import { whatsAppDeliveryJobSchema } from "@ewatrade/assistant/channels/delivery"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { safeCompare } from "../utils/safe-compare"
import { processAssistantChannelDelivery } from "./channel-delivery"

/** Narrow machine-authenticated endpoint; JSON can select only an existing outbox ID. */
export function registerAssistantChannelDeliveryRoute(
  app: OpenAPIHono,
  deps: {
    secret: () => string | undefined
    process: typeof processAssistantChannelDelivery
  } = {
    secret: () => process.env.INTERNAL_API_KEY,
    process: processAssistantChannelDelivery,
  },
) {
  app.post("/api/internal/assistant/channel-delivery", async (c) => {
    c.header("Cache-Control", "no-store")
    if (!safeCompare(c.req.header("x-internal-key"), deps.secret()))
      return c.json({ code: "UNAUTHORIZED" }, 401)
    const raw = await c.req.text()
    if (new TextEncoder().encode(raw).length > 512)
      return c.json({ code: "PAYLOAD_TOO_LARGE" }, 413)
    let input: unknown
    try {
      input = JSON.parse(raw)
    } catch {
      return c.json({ code: "BAD_REQUEST" }, 400)
    }
    const parsed = whatsAppDeliveryJobSchema.safeParse(input)
    if (!parsed.success) return c.json({ code: "BAD_REQUEST" }, 400)
    try {
      const result = await deps.process(parsed.data.outboxId)
      return c.json(result)
    } catch {
      return c.json({ code: "CHANNEL_DELIVERY_UNAVAILABLE" }, 503)
    }
  })
}
