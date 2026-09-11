import { resolveCatalogOptionUnitPrice } from "@/lib/catalog-option-pricing"
import {
  isCatalogVariantPriceReady,
  isCatalogVariantQuantityReady,
} from "@/lib/catalog-variant-readiness"

export type CatalogVariantDraft = {
  barcode: string
  description: string
  enabled: boolean
  imageUrl: string
  price: string
  quantity: string
  quoteRequired: boolean
  sku: string
  storeIds: string[]
  unitPrices: Record<string, string>
}

export type CatalogVariantCombination = {
  key: string
  name: string
}

export type CatalogVariantUnit = {
  id: string
  name: string
  price: string
  stockBehavior?: "alternate_transaction" | "packaged_stock"
}

export type CatalogVariantStore = {
  id: string
  name: string
}

export type CatalogVariantManagerProps = {
  disabled?: boolean
  onPageChange?: () => void
  basePrice: string
  canonicalTransactionScale: number
  combinations: CatalogVariantCombination[]
  currencyCode: string
  drafts: Record<string, CatalogVariantDraft>
  kind: "product" | "service"
  makeDefaultDraft: () => CatalogVariantDraft
  onChangeDraft: (key: string, draft: CatalogVariantDraft) => void
  optionPricingOnly?: boolean
  stores: CatalogVariantStore[]
  unitName: string
  units: CatalogVariantUnit[]
}

export type CatalogVariantEditor = {
  draft: CatalogVariantDraft
  key: string
  unitId?: string
}
export type CatalogVariantRow = {
  key: string
  combinationKey: string
  unitId?: string
  title: string
  summary: string
  stock: string
  price: string
  description: string
  enabled: boolean
  stockNeedsSetup: boolean
  priceNeedsSetup: boolean
}
export type CatalogVariantRowProps = {
  row: CatalogVariantRow
  kind: "product" | "service"
  disabled: boolean
  onEdit: () => void
  onMenu: () => void
}
export function cloneVariantDraft(
  draft: CatalogVariantDraft,
): CatalogVariantDraft {
  return {
    ...draft,
    storeIds: [...draft.storeIds],
    unitPrices: { ...draft.unitPrices },
  }
}
export function catalogVariantRows(
  props: CatalogVariantManagerProps,
): CatalogVariantRow[] {
  const {
    kind,
    unitName,
    units,
    basePrice,
    currencyCode,
    canonicalTransactionScale,
    optionPricingOnly = false,
  } = props
  const canonicalName = unitName.trim() || "Stock unit"
  return props.combinations.flatMap((combination) => {
    const draft = props.drafts[combination.key] ?? props.makeDefaultDraft()
    const quantityReady = isCatalogVariantQuantityReady(
      draft.quantity,
      canonicalTransactionScale,
    )
    const invalidStock = Boolean(draft.quantity.trim()) && !quantityReady
    const stock = quantityReady
      ? `${draft.quantity.trim()} ${canonicalName}`
      : invalidStock
        ? "Stock invalid"
        : "Opening stock not declared"
    const canonicalPrice =
      draft.price.trim() || (optionPricingOnly ? "" : basePrice.trim())
    const listings =
      kind === "product"
        ? [
            {
              id: "canonical",
              name: canonicalName,
              price: canonicalPrice,
              stock,
            },
            ...units.map((unit) => ({
              id: unit.id,
              name: unit.name,
              price: resolveCatalogOptionUnitPrice({
                optionPrice: draft.price,
                optionPricingOnly,
                unitDefaultPrice: unit.price,
                unitOverridePrice: draft.unitPrices[unit.id] ?? "",
              }),
              stock:
                unit.stockBehavior === "packaged_stock"
                  ? "Prepared stock tracked separately"
                  : quantityReady
                    ? `Shared ${canonicalName} stock`
                    : stock,
            })),
          ]
        : [
            {
              id: "service",
              name: "",
              price: draft.price.trim() || basePrice.trim(),
              stock: "No inventory",
            },
          ]
    return listings.map((listing) => {
      const quote = kind === "service" && draft.quoteRequired
      const priceReady = quote || isCatalogVariantPriceReady(listing.price)
      const price = quote
        ? "Quote required"
        : priceReady
          ? `${currencyCode} ${listing.price}`
          : listing.price.trim()
            ? "Price invalid"
            : "Price not set"
      return {
        key: `${combination.key}-${listing.id}`,
        combinationKey: combination.key,
        unitId:
          kind === "product" && listing.id !== "canonical"
            ? listing.id
            : undefined,
        title: listing.name
          ? `${combination.name} · ${listing.name}`
          : combination.name,
        summary:
          kind === "service"
            ? quote
              ? price
              : priceReady
                ? `Fixed price · ${price}`
                : `${price} · Tap to configure`
            : `${listing.stock} · ${price}`,
        stock: listing.stock,
        price,
        description: draft.description.trim(),
        enabled: draft.enabled,
        stockNeedsSetup:
          kind === "product" &&
          invalidStock &&
          listing.stock === "Stock invalid",
        priceNeedsSetup: !priceReady,
      }
    })
  })
}
// Saving this child commits a draft, not an item: blank optional/inherited fields
// remain valid. The setup controller owns completeness at Catalog creation.
export function catalogVariantDraftIssue(
  draft: CatalogVariantDraft,
  props: CatalogVariantManagerProps,
): string | null {
  if (
    !(props.kind === "service" && draft.quoteRequired) &&
    draft.price.trim() &&
    !isCatalogVariantPriceReady(draft.price)
  )
    return "Enter a valid price with up to two decimal places."
  if (props.kind === "product") {
    if (
      draft.quantity.trim() &&
      !isCatalogVariantQuantityReady(
        draft.quantity,
        props.canonicalTransactionScale,
      )
    )
      return "Enter a valid opening quantity for the stock unit."
    if (
      props.units.some(
        (unit) =>
          Boolean(draft.unitPrices[unit.id]?.trim()) &&
          !isCatalogVariantPriceReady(draft.unitPrices[unit.id]),
      )
    )
      return "Enter valid selling-unit prices with up to two decimal places."
    if (draft.sku.trim().length > 120 || draft.barcode.trim().length > 120)
      return "Keep inventory codes within 120 characters."
  }
  if (draft.description.trim().length > 2000)
    return "Keep the description within 2,000 characters."
  const url = draft.imageUrl.trim()
  if (url) {
    try {
      if (
        url.length > 2000 ||
        !["http:", "https:"].includes(new URL(url).protocol)
      )
        return "Use a valid HTTP or HTTPS image link."
    } catch {
      return "Use a valid HTTP or HTTPS image link."
    }
  }
  return null
}
