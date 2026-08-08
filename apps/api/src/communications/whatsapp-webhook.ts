import type { OpenAPIHono } from "@hono/zod-openapi"

import { handleWhatsAppWebhookRequest } from "./whatsapp-runtime"

export function registerWhatsAppWebhookRoutes(app: OpenAPIHono) {
  app.on(["GET", "POST"], "/api/webhooks/whatsapp", (c) =>
    handleWhatsAppWebhookRequest(c.req.raw),
  )
}
