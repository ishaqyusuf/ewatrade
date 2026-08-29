import type { OpenAPIHono } from "@hono/zod-openapi"

import { getRequestTrace } from "../utils/request-trace"
import { handleWhatsAppWebhookRequest } from "./whatsapp-runtime"

export function registerWhatsAppWebhookRoutes(app: OpenAPIHono) {
  app.on(["GET", "POST"], "/api/webhooks/whatsapp", (c) => {
    const { requestId } = getRequestTrace(c.req)
    return handleWhatsAppWebhookRequest(c.req.raw, requestId)
  })
}
