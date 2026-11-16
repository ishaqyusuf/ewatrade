import type { Prisma } from "../../generated/prisma/client"

/** Fields needed to name a Store the way customers should see it. */
export const customerFacingStoreSelect = {
  name: true,
  tenant: {
    select: {
      name: true,
      _count: {
        select: { stores: { where: { status: { in: ["ACTIVE", "PAUSED"] } } } },
      },
    },
  },
} as const satisfies Prisma.StoreSelect

type CustomerFacingStore = {
  name: string
  tenant?: { name: string; _count?: { stores: number } } | null
}

/**
 * Customers see the business name. A business with more than one Store adds
 * the Store name, since "Main store" means nothing outside the business.
 */
export function customerFacingStoreName(store: CustomerFacingStore) {
  const storeName = store.name.trim()
  const businessName = store.tenant?.name.trim() ?? ""
  if (!businessName) return storeName
  const storeCount = store.tenant?._count?.stores ?? 1
  if (
    storeCount <= 1 ||
    !storeName ||
    storeName.toLowerCase() === businessName.toLowerCase()
  )
    return businessName
  return `${businessName} · ${storeName}`
}
