import { majorToMinor } from "@ewatrade/utils"

type ResolveCatalogOptionUnitPriceInput = {
  optionPrice: string
  optionPricingOnly: boolean
  unitDefaultPrice: string
  unitOverridePrice: string
}

type ResolveCatalogOptionUnitPriceMinorInput =
  ResolveCatalogOptionUnitPriceInput & {
    basePriceMinor?: number
  }

export function resolveCatalogOptionUnitPrice({
  optionPrice: _optionPrice,
  optionPricingOnly,
  unitDefaultPrice,
  unitOverridePrice,
}: ResolveCatalogOptionUnitPriceInput) {
  if (optionPricingOnly) return unitOverridePrice.trim()
  return unitOverridePrice.trim() || unitDefaultPrice.trim()
}

export function resolveCatalogOptionUnitPriceMinor({
  basePriceMinor: _basePriceMinor,
  ...input
}: ResolveCatalogOptionUnitPriceMinorInput) {
  return majorToMinor(resolveCatalogOptionUnitPrice(input)) ?? undefined
}
