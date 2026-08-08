import { consumeDevelopmentAuthorizedMedia } from "@ewatrade/prescriptions"
import type { OpenAPIHono } from "@hono/zod-openapi"

export function registerPrescriptionMediaDeliveryRoutes(app: OpenAPIHono) {
  app.get("/api/prescriptions/media/:token", (c) => {
    try {
      const media = consumeDevelopmentAuthorizedMedia(c.req.param("token"))
      return new Response(media.bytes, {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "Content-Disposition": "inline",
          "Content-Type": media.mediaType,
          "Cross-Origin-Resource-Policy": "same-site",
          "Referrer-Policy": "no-referrer",
        },
      })
    } catch {
      return c.json({ error: "Not found" }, 404)
    }
  })
}
