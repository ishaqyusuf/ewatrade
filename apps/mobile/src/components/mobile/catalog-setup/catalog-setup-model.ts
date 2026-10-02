import type { CatalogUnitRelationDirection } from "@ewatrade/utils"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import * as Crypto from "expo-crypto"

export type CatalogItemKind = "product" | "service"

export type CatalogItemCompletion = {
  kind: CatalogItemKind
  name: string
}

export type SimpleCatalogItemScreenProps = {
  initialKind?: CatalogItemKind
  onComplete?: (completion: CatalogItemCompletion) => void
}

export type MobileOptionGroup = {
  id: string
  name: string
  values: Array<{ id: string; label: string }>
}

export type MobileUnitDraft = {
  id: string
  name: string
  price: string
  referenceUnitId?: string
  relationCount: string
  relationDirection: CatalogUnitRelationDirection
  stockBehavior: "alternate_transaction" | "packaged_stock"
  transactionScale: number
}

export type VariantComposerMode = "variant-type" | "variant-value"

export type SellingUnitEditorFieldsProps = {
  referenceUnits?: MobileUnitDraft[]
  currencyCode: string
  isEditingUnit: boolean
  multiplePriceOptions: boolean
  onChangeDirection: (direction: CatalogUnitRelationDirection) => void
  onChangeDraft: (update: Partial<MobileUnitDraft>) => void
  unitEditorDraft: MobileUnitDraft
  unitEditorError: string | null
  unitName: string
}

export const VARIANT_COMPOSER_DEFAULT_SUGGESTION_COUNT = 5
export const DEFAULT_UNIT_TRANSACTION_SCALE = 2

export function newUnit(): MobileUnitDraft {
  return {
    id: Crypto.randomUUID(),
    name: "",
    price: "",
    relationCount: "",
    relationDirection: "units_per_canonical",
    stockBehavior: "alternate_transaction",
    transactionScale: DEFAULT_UNIT_TRANSACTION_SCALE,
  }
}

export function unitKey(index: number) {
  return `unit-${index + 2}`
}

export function catalogCreateErrorMessage(message: string) {
  if (message.includes("unrecognized_keys") && message.includes("variants")) {
    return "Catalog option details are not available on the connected server yet. Please try again after it updates."
  }

  return message
}

export function requirePriceMinor(
  priceMinor: number | undefined,
  offeringName: string,
) {
  if (priceMinor === undefined) {
    throw new Error(`Enter a price for ${offeringName}.`)
  }

  return priceMinor
}

export function getExactOpeningStock(
  value: string,
  maxScale = DEFAULT_UNIT_TRANSACTION_SCALE,
) {
  const normalized = value.trim()
  if (!normalized) return undefined

  return parseExactDecimal(normalized, {
    maxScale,
  })
}
