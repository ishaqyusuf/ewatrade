function normalized(value: string) {
  return value.trim().toLocaleLowerCase()
}

export function publicServiceDisplayName(
  itemName: string,
  variantName?: string | null,
  offeringName?: string | null,
) {
  return [itemName, variantName, offeringName]
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => value.split(/\s+[·|/]\s+/))
    .filter((value) => normalized(value) !== "default")
    .filter(
      (value, index, candidates) =>
        candidates.findIndex(
          (candidate) => normalized(candidate) === normalized(value),
        ) === index,
    )
    .join(" · ")
}

export function publicServiceDetail(
  itemName: string,
  variantName?: string | null,
  offeringName?: string | null,
) {
  const displayName = publicServiceDisplayName(
    itemName,
    variantName,
    offeringName,
  )
  const prefix = `${itemName} · `
  return displayName.startsWith(prefix)
    ? displayName.slice(prefix.length)
    : "Standard service"
}
