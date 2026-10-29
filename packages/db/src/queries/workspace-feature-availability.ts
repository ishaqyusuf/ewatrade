import type { DbClient } from "./types"
import {
  type WorkspaceFeaturePresenceFacts,
  workspaceFeaturePresenceQuery,
} from "./workspace-feature-presence"

export type WorkspaceFeatureAvailability = {
  hasActiveSellableItems: boolean
  hasCatalogItems: boolean
  hasCustomers: boolean
  hasInventoryActivity: boolean
  hasOrders: boolean
  hasPrescriptionCommerce: boolean
  hasProductItems: boolean
  hasReportableActivity: boolean
  hasServiceItems: boolean
  hasServiceJobs: boolean
  hasStaff: boolean
  storeId: string
}

type WorkspaceFeaturePresence = {
  activeSellableItem: unknown
  catalogKinds: Array<"PRODUCT" | "SERVICE">
  customer: unknown
  inventoryActivity: unknown
  order: unknown
  prescriptionCommerce: unknown
  serviceJob: unknown
  staff: unknown
}

export function deriveWorkspaceFeatureAvailability(
  input: WorkspaceFeaturePresence & { storeId: string },
): WorkspaceFeatureAvailability {
  const hasOrders = input.order !== null
  const hasServiceJobs = input.serviceJob !== null
  const hasInventoryActivity = input.inventoryActivity !== null
  const hasProductItems = input.catalogKinds.includes("PRODUCT")
  const hasServiceItems = input.catalogKinds.includes("SERVICE")

  return {
    hasActiveSellableItems: input.activeSellableItem !== null,
    hasCatalogItems: hasProductItems || hasServiceItems,
    hasCustomers: input.customer !== null,
    hasInventoryActivity,
    hasOrders,
    hasPrescriptionCommerce: input.prescriptionCommerce !== null,
    hasProductItems,
    hasReportableActivity: hasOrders || hasServiceJobs || hasInventoryActivity,
    hasServiceItems,
    hasServiceJobs,
    hasStaff: input.staff !== null,
    storeId: input.storeId,
  }
}

export async function getWorkspaceFeatureAvailability(
  db: DbClient,
  input: { storeId: string; tenantId: string },
): Promise<WorkspaceFeatureAvailability> {
  const [facts] = await db.$queryRaw<WorkspaceFeaturePresenceFacts[]>(
    workspaceFeaturePresenceQuery(input),
  )
  if (!facts) throw new Error("Workspace feature presence is unavailable.")
  return deriveWorkspaceFeatureAvailability({
    activeSellableItem: facts.hasActiveSellableItems ? true : null,
    catalogKinds: [
      ...(facts.hasProductItems ? ["PRODUCT" as const] : []),
      ...(facts.hasServiceItems ? ["SERVICE" as const] : []),
    ],
    customer: facts.hasCustomers ? true : null,
    inventoryActivity: facts.hasInventoryActivity ? true : null,
    order: facts.hasOrders ? true : null,
    prescriptionCommerce: facts.hasPrescriptionCommerce ? true : null,
    serviceJob: facts.hasServiceJobs ? true : null,
    staff: facts.hasStaff ? true : null,
    storeId: input.storeId,
  })
}
