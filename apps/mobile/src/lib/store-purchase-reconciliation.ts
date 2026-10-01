export async function completeStorePurchase(steps: {
  verify: () => Promise<unknown>
  finish: () => Promise<unknown>
  refresh: () => Promise<unknown>
}) {
  await steps.verify()

  let storeFinished = true
  try {
    await steps.finish()
  } catch {
    storeFinished = false
  }

  let refreshed = true
  try {
    await steps.refresh()
  } catch {
    refreshed = false
  }

  return { storeFinished, refreshed }
}

type RestoreProduct = { store: string; productId: string }
type RestorablePurchase = { purchaseState: string; productId: string }

export async function restoreMappedStorePurchases<
  TPurchase extends RestorablePurchase,
  TProducts extends readonly RestoreProduct[],
>(steps: {
  store: string
  loadProducts: () => Promise<TProducts | null>
  listPurchases: () => Promise<readonly TPurchase[]>
  reconcile: (purchase: TPurchase, products: TProducts) => Promise<void>
}) {
  // A fresh server catalog is required before reading store history. Cached
  // mappings may belong to an earlier business or a retired product.
  const products = await steps.loadProducts()
  if (!products) return "catalog_unavailable" as const
  const mappedIds = new Set(
    products
      .filter((product) => product.store === steps.store)
      .map((product) => product.productId),
  )
  if (mappedIds.size === 0) return "unmapped" as const

  const purchases = await steps.listPurchases()
  const matching = purchases.filter(
    (purchase) =>
      purchase.purchaseState === "purchased" &&
      mappedIds.has(purchase.productId),
  )
  if (matching.length === 0) return "none" as const
  for (const purchase of matching) await steps.reconcile(purchase, products)
  return "restored" as const
}
