type ReceiptUnit = { id: string; name: string; stockBehavior: string }
type ReceiptOffering = {
  id: string
  status: string
  productUnit: { inventoryUnitId: string } | null
  stores: Array<{ storeId: string; isAvailable: boolean }>
}
export type ReceiptCatalogItem = {
  name: string
  status: string
  product: {
    id: string
    currentUnitConfiguration: { units: ReceiptUnit[] } | null
  } | null
  variants: Array<{
    id: string
    name: string
    status: string
    offerings: ReceiptOffering[]
  }>
}
type ReceiptBalance = {
  productId: string
  variantId: string
  inventoryUnitId: string
  custodyType: string
}

export function missingInventoryReceiptOptions(
  items: ReceiptCatalogItem[],
  rows: ReceiptBalance[],
  storeId: string,
  productId?: string | null,
) {
  const options: Array<{
    value: string
    offeringId: string
    label: string
    needsAvailability: boolean
  }> = []
  for (const item of items) {
    const product = item.product
    if (
      !product ||
      item.status !== "active" ||
      (productId && product.id !== productId)
    )
      continue
    for (const variant of item.variants) {
      if (variant.status !== "active") continue
      for (const unit of product.currentUnitConfiguration?.units ?? []) {
        if (unit.stockBehavior === "alternate_transaction") continue
        if (
          rows.some(
            (row) =>
              row.productId === product.id &&
              row.variantId === variant.id &&
              row.inventoryUnitId === unit.id &&
              row.custodyType === "STORE",
          )
        )
          continue
        const offering = variant.offerings.find(
          (candidate) =>
            candidate.status === "active" &&
            candidate.productUnit?.inventoryUnitId === unit.id,
        )
        if (!offering) continue
        options.push({
          value: `offering:${offering.id}`,
          offeringId: offering.id,
          needsAvailability: !offering.stores.some(
            (store) => store.storeId === storeId && store.isAvailable,
          ),
          label: `${item.name} · ${variant.name} · ${unit.name} (0)`,
        })
      }
    }
  }
  return options
}
