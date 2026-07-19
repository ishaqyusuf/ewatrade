type CatalogDetailInput = {
  itemName: string
  offeringCount: number
  offeringName?: string | null
  variantName?: string | null
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase()
}

export function catalogItemDetail({
  itemName,
  offeringCount,
  offeringName,
  variantName,
}: CatalogDetailInput) {
  const itemKey = normalized(itemName)
  const details = [variantName, offeringName]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value) => normalized(value) !== itemKey)
    .filter(
      (value, index, values) =>
        values.findIndex(
          (candidate) => normalized(candidate) === normalized(value),
        ) === index,
    )

  if (details.length > 0) return details.join(" · ")
  return `${offeringCount} ${offeringCount === 1 ? "offering" : "offerings"}`
}
