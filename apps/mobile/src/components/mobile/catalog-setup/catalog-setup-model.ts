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
  relationCount: string
  relationDirection: CatalogUnitRelationDirection
  stockBehavior: "alternate_transaction" | "packaged_stock"
  transactionScale: number
}

export type VariantComposerMode = "variant-type" | "variant-value"

export type SellingUnitEditorFieldsProps = {
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

export const PRODUCT_VARIANT_TYPES = [
  "Size",
  "Color",
  "Material",
  "Length",
  "Weight",
  "Package",
  "Quality",
]

export const SERVICE_OPTION_TYPES = [
  "Package",
  "Service level",
  "Turnaround",
  "Visit type",
  "Add-on",
]

const VARIANT_VALUE_SUGGESTIONS_BY_LABEL: Record<string, string[]> = {
  Color: ["Black", "White", "Blue", "Red", "Green", "Yellow", "Brown", "Grey"],
  Length: ["Short", "Regular", "Long", "Extra long"],
  Material: ["Cotton", "Leather", "Denim", "Polyester", "Wool", "Silk"],
  Package: ["Single", "Pack", "Carton", "Bundle", "Dozen", "Half pack"],
  Quality: ["Standard", "Premium", "Grade A", "Grade B", "Economy"],
  "Service level": ["Standard", "Express", "Same day", "Next day"],
  Size: ["XS", "S", "M", "L", "XL", "XXL"],
  Turnaround: ["Same day", "24 hours", "48 hours", "3 days", "1 week"],
  Weight: ["Light", "Medium", "Heavy", "1 kg", "5 kg", "10 kg"],
}

const SERVICE_VARIANT_VALUE_SUGGESTIONS_BY_LABEL: Record<string, string[]> = {
  "Add-on": ["Standard", "Extra", "Premium", "Optional upgrade"],
  Package: ["Basic", "Standard", "Premium"],
  "Service level": ["Standard", "Express", "Premium"],
  Turnaround: ["Same day", "24 hours", "48 hours", "3 days", "1 week"],
  "Visit type": ["Remote", "In-store", "On-site", "Customer location"],
}

export function getVariantValueSuggestions(
  label: string,
  kind: CatalogItemKind,
) {
  const suggestionsByLabel =
    kind === "service"
      ? SERVICE_VARIANT_VALUE_SUGGESTIONS_BY_LABEL
      : VARIANT_VALUE_SUGGESTIONS_BY_LABEL
  const normalizedLabel = label.trim().toLowerCase()
  const suggestionLabel = Object.keys(suggestionsByLabel).find(
    (knownLabel) => knownLabel.toLowerCase() === normalizedLabel,
  )

  return suggestionLabel ? suggestionsByLabel[suggestionLabel] : []
}

export function getEmptyProductOptionHint(label: string) {
  const suggestions = getVariantValueSuggestions(label, "product").slice(0, 3)

  if (suggestions.length > 0) {
    return `Try ${suggestions.join(", ")}, or your own value.`
  }

  return "Add the first customer choice for this option."
}

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
