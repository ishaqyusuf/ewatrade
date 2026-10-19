import { whatsAppTurnJobSchema } from "@ewatrade/assistant/channels/worker"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { safeCompare } from "../utils/safe-compare"
import { dispatchAssistantWhatsAppReply } from "./channel-delivery"
import { processAssistantChannelTurn } from "./channel-turn"

/** Narrow machine-authenticated endpoint; JSON can select only an existing ingress ID. */
export function registerAssistantChannelTurnRoute(
  app: OpenAPIHono,
  deps: {
    secret: () => string | undefined
    process: typeof processAssistantChannelTurn
    dispatch?: (ingressId: string) => Promise<unknown>
  } = {
    secret: () => process.env.INTERNAL_API_KEY,
    process: processAssistantChannelTurn,
    dispatch: dispatchAssistantWhatsAppReply,
  },
) {
  app.post("/api/internal/assistant/channel-turn", async (c) => {
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
    const parsed = whatsAppTurnJobSchema.safeParse(input)
    if (!parsed.success) return c.json({ code: "BAD_REQUEST" }, 400)
    try {
      const result = await deps.process(parsed.data.ingressId)
      if (["completed", "idle"].includes(result.status) && deps.dispatch) {
        try {
          await deps.dispatch(parsed.data.ingressId)
        } catch {
          console.error("[assistant] reply dispatch deferred to recovery")
        }
      }
      return c.json(result)
    } catch {
      return c.json({ code: "CHANNEL_TURN_UNAVAILABLE" }, 503)
    }
  })
}
