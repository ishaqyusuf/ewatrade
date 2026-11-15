import "server-only"

import { prisma } from "@ewatrade/db"
import { getRetailOpsTenantPlanFeatures } from "@ewatrade/db/retail-ops-subscriptions"
import type { RetailOpsPlanFeature } from "@ewatrade/db/subscription-plans"
import { cache } from "react"

/** Only read when the joined workspace read could not supply the features. */
const readPlanFeatures = cache((tenantId: string) =>
  getRetailOpsTenantPlanFeatures(prisma, { tenantId }).catch(() => undefined),
)

/**
 * Plan features for navigation gates. The workspace read already joins them
 * (no extra SQL); the fallback read runs at most once per request, shared by
 * the shell and the Settings layout. Undefined means unknown: navigation stays
 * ungated and the API still enforces.
 */
export async function getDashboardPlanFeatures(tenant: {
  id: string
  planFeatures?: RetailOpsPlanFeature[]
}): Promise<RetailOpsPlanFeature[] | undefined> {
  return tenant.planFeatures ?? readPlanFeatures(tenant.id)
}
