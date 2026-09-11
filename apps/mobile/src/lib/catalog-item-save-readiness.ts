import { majorToMinor } from "@ewatrade/utils"

type CatalogItemSaveReadinessInput = {
  defaultQuoteRequired: boolean
  kind: "product" | "service"
  name: string
  price: string
  showAdvanced: boolean
  unitName: string
}

export type CatalogItemSaveReadiness = {
  canSave: boolean
  hint?: string
}

export function getCatalogItemSaveReadiness({
  defaultQuoteRequired,
  kind,
  name,
  price,
  showAdvanced,
  unitName,
}: CatalogItemSaveReadinessInput): CatalogItemSaveReadiness {
  if (!name.trim()) {
    return {
      canSave: false,
      hint: `Enter a ${kind} name to continue.`,
    }
  }

  if (price.trim() && majorToMinor(price) === null) {
    return { canSave: false, hint: "Enter a valid price to continue." }
  }

  if (kind === "product" && !showAdvanced && !unitName.trim()) {
    return { canSave: false, hint: "Enter a stock unit to continue." }
  }

  if (
    kind === "service" &&
    !showAdvanced &&
    !defaultQuoteRequired &&
    majorToMinor(price) === null
  ) {
    return { canSave: false, hint: "Enter a selling price to continue." }
  }

  return { canSave: true }
}
