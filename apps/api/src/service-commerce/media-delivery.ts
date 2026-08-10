import { consumeDevelopmentPrivateMediaViewerGrant } from "@ewatrade/service-commerce"
import type { OpenAPIHono } from "@hono/zod-openapi"

export function registerServiceCommerceMediaDeliveryRoutes(app: OpenAPIHono) {
  app.get("/api/service-commerce/media/:token", (context) => {
    try {
      const media = consumeDevelopmentPrivateMediaViewerGrant(
        context.req.param("token"),
      )
      const body = media.bytes.slice().buffer as ArrayBuffer
      return new Response(body, {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "Content-Disposition": `inline; filename="${safeFileName(media.fileName)}"`,
          "Content-Type": media.mimeType,
          "Cross-Origin-Resource-Policy": "same-site",
          "Referrer-Policy": "no-referrer",
        },
      })
    } catch {
      return context.json({ error: "Not found" }, 404)
    }
  })
}

function safeFileName(value: string) {
  return value.replaceAll(/[\r\n"\\]/g, "_").slice(0, 180)
}
