export class StoreBillingSessionChanged extends Error {
  constructor() {
    super("Billing session changed")
    this.name = "StoreBillingSessionChanged"
  }
}

function assertCurrent(isCurrent?: () => boolean) {
  if (isCurrent && !isCurrent()) throw new StoreBillingSessionChanged()
}

export async function completeStorePurchase(steps: {
  /** Local lifetime fence; the server still verifies receipt ownership. */
  isCurrent?: () => boolean
  verify: () => Promise<unknown>
  finish: () => Promise<unknown>
  refresh: () => Promise<unknown>
}) {
  assertCurrent(steps.isCurrent)
  await steps.verify()
  assertCurrent(steps.isCurrent)

  let storeFinished = true
  try {
    await steps.finish()
  } catch {
    storeFinished = false
  }
  assertCurrent(steps.isCurrent)

  let refreshed = true
  try {
    await steps.refresh()
  } catch {
    refreshed = false
  }
  assertCurrent(steps.isCurrent)

  return { storeFinished, refreshed }
}

type RestoreProduct = { store: string; productId: string }
type RestorablePurchase = { purchaseState: string; productId: string }

export async function restoreMappedStorePurchases<
  TPurchase extends RestorablePurchase,
  TProducts extends readonly RestoreProduct[],
>(steps: {
  isCurrent?: () => boolean
  store: string
  loadProducts: () => Promise<TProducts | null>
  listPurchases: () => Promise<readonly TPurchase[]>
  reconcile: (purchase: TPurchase, products: TProducts) => Promise<void>
}) {
  assertCurrent(steps.isCurrent)
  // A fresh server catalog is required before reading store history. Cached
  // mappings may belong to an earlier business or a retired product.
  const products = await steps.loadProducts()
  assertCurrent(steps.isCurrent)
  if (!products) return "catalog_unavailable" as const
  const mappedIds = new Set(
    products
      .filter((product) => product.store === steps.store)
      .map((product) => product.productId),
  )
  if (mappedIds.size === 0) return "unmapped" as const

  const purchases = await steps.listPurchases()
  assertCurrent(steps.isCurrent)
  const matching = purchases.filter(
    (purchase) =>
      purchase.purchaseState === "purchased" &&
      mappedIds.has(purchase.productId),
  )
  if (matching.length === 0) return "none" as const
  for (const purchase of matching) {
    assertCurrent(steps.isCurrent)
    await steps.reconcile(purchase, products)
  }
  assertCurrent(steps.isCurrent)
  return "restored" as const
}
