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
  optionPrice,
  optionPricingOnly,
  unitDefaultPrice,
  unitOverridePrice,
}: ResolveCatalogOptionUnitPriceInput) {
  if (optionPricingOnly) return unitOverridePrice.trim()

  return (
    unitOverridePrice.trim() || unitDefaultPrice.trim() || optionPrice.trim()
  )
}

export function resolveCatalogOptionUnitPriceMinor({
  basePriceMinor,
  ...input
}: ResolveCatalogOptionUnitPriceMinorInput) {
  const resolvedPriceMinor = majorToMinor(resolveCatalogOptionUnitPrice(input))

  return (
    resolvedPriceMinor ?? (input.optionPricingOnly ? undefined : basePriceMinor)
  )
}
