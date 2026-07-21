import { prisma } from "@ewatrade/db"
import { getWorkspaceFeatureAvailability } from "@ewatrade/db/queries"
import { cache } from "react"
import "server-only"

export const getDashboardFeatureAvailability = cache(
  async (storeId: string, tenantId: string) =>
    getWorkspaceFeatureAvailability(prisma, { storeId, tenantId }),
)
