import type { QaProfile, QaProfileCounts } from "@ewatrade/utils/qa-profiles"
import type { DbClient } from "./types"

/** Only call after grant validation and the existing eligible-membership query. */
export async function loadQaProfileCounts(
  db: DbClient,
  profiles: QaProfile[],
  qaDomain: string,
): Promise<Map<string, QaProfileCounts>> {
  if (!profiles.length) return new Map()
  const tenantIds = [...new Set(profiles.map((profile) => profile.business.id))]
  const stores = [
    ...new Map(
      profiles.map((profile) => [
        profile.store.id,
        { tenantId: profile.business.id, storeId: profile.store.id },
      ]),
    ).values(),
  ]
  // Repeat the QA fence in the aggregate reads so purging/inactivation cannot
  // expose other datasets. No client-selected IDs or per-profile queries.
  const tenant = {
    dataClassification: "QA" as const,
    isActive: true,
    qaPurgeStartedAt: null,
    qaSourceDomain: qaDomain,
  }
  const [catalog, orders] = await Promise.allSettled([
    db.catalogItem.groupBy({
      by: ["tenantId", "kind"],
      where: {
        tenantId: { in: tenantIds },
        tenant,
        systemRole: null,
        status: { not: "ARCHIVED" },
        archivedAt: null,
      },
      _count: { _all: true },
    }),
    db.commercialOrder.groupBy({
      by: ["tenantId", "storeId"],
      where: { OR: stores, tenant, store: { status: "ACTIVE" } },
      _count: { _all: true },
    }),
  ])
  const catalogByTenant = new Map<
    string,
    { catalogItems: number; services: number }
  >()
  if (catalog.status === "fulfilled") {
    for (const row of catalog.value) {
      const counts = catalogByTenant.get(row.tenantId) ?? {
        catalogItems: 0,
        services: 0,
      }
      counts.catalogItems += row._count._all
      if (row.kind === "SERVICE") counts.services += row._count._all
      catalogByTenant.set(row.tenantId, counts)
    }
  }
  const ordersByStore = new Map(
    orders.status === "fulfilled"
      ? orders.value.map((row) => [
          JSON.stringify([row.tenantId, row.storeId]),
          row._count._all,
        ])
      : [],
  )
  return new Map(
    profiles.map((profile) => [
      profile.profileReference,
      {
        catalogItems:
          catalog.status === "fulfilled"
            ? (catalogByTenant.get(profile.business.id)?.catalogItems ?? 0)
            : null,
        services:
          catalog.status === "fulfilled"
            ? (catalogByTenant.get(profile.business.id)?.services ?? 0)
            : null,
        orders:
          orders.status === "fulfilled"
            ? (ordersByStore.get(
                JSON.stringify([profile.business.id, profile.store.id]),
              ) ?? 0)
            : null,
      },
    ]),
  )
}
