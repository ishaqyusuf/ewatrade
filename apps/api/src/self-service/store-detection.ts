import {
  type SelfServiceStoreDetectionResult,
  resolveSelfServiceStoreFromCoordinates,
} from "@ewatrade/db/queries"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { z } from "zod"

const resolveStoreDetectionSchema = z.object({
  accuracyMeters: z.number().finite().nonnegative().max(10_000).optional(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  maxCandidates: z.number().int().min(1).max(10).optional(),
})

export function registerSelfServiceStoreDetectionRoutes(app: OpenAPIHono) {
  app.post("/api/self-service/store-detection/resolve", async (c) => {
    const { prisma } = await import("@ewatrade/db")
    const body = await c.req.json().catch(() => null)
    const parsed = resolveStoreDetectionSchema.safeParse(body)

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid store detection request.",
          issues: parsed.error.issues,
        },
        400,
      )
    }

    const result: SelfServiceStoreDetectionResult =
      await resolveSelfServiceStoreFromCoordinates(prisma, parsed.data)

    return c.json(result, 200)
  })
}
