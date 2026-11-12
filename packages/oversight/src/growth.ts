import type { PrismaClient } from "@ewatrade/db"
import {
  growthBusinessDetail,
  growthOverview,
  growthProductQualifiedLeads,
} from "@ewatrade/db/growth-metrics"
import { Hono } from "hono"
import { z } from "zod"

// Lifecycle marketing read side for Oversight (plan §5.2). Mounted behind the
// Oversight read-key middleware; read-only, nothing here is merchant-facing.
// The business detail is the seam for the later operator console, where an
// operator picks a snapshot and sends a chosen message under their own name.
const leadsQuery = z
  .object({
    page: z.coerce.number().int().min(0).max(1000).default(0),
    take: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
const tenantParam = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/)

export function createGrowthOversightRoutes(getDb: () => PrismaClient) {
  const routes = new Hono()
  routes.get("/overview", async (c) =>
    c.json(json(await growthOverview(getDb()))),
  )
  routes.get("/leads", async (c) => {
    const parsed = leadsQuery.safeParse(c.req.query())
    if (!parsed.success) return c.json({ error: "Invalid filters" }, 400)
    return c.json(json(await growthProductQualifiedLeads(getDb(), parsed.data)))
  })
  routes.get("/businesses/:tenantId", async (c) => {
    const tenantId = tenantParam.safeParse(c.req.param("tenantId"))
    if (!tenantId.success) return c.json({ error: "Invalid business" }, 400)
    const detail = await growthBusinessDetail(getDb(), tenantId.data)
    if (!detail) return c.json({ error: "Business not found" }, 404)
    return c.json(json(detail))
  })
  return routes
}

/** JSON-safe copy: BigInt (kobo totals) becomes a number. */
function json<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? Number(v) : v)),
  )
}
