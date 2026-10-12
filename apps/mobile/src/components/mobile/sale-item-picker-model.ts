export function getSaleOfferingStockLabel(input: {
  availableQuantity?: string
  kind: "product_unit" | "service"
  unitName: string
}) {
  if (input.kind !== "product_unit" || input.availableQuantity === undefined) {
    return null
  }
  return `${input.availableQuantity} ${input.unitName} available`
}

export type SaleItemPickerLine<T> = {
  id: string
  offering: T
  quantity: string
}

export function addSaleItemPickerLine<T>({
  lineId,
  lines,
  offering,
}: {
  lineId: string
  lines: SaleItemPickerLine<T>[]
  offering: T
}) {
  return [...lines, { id: lineId, offering, quantity: "1" }]
}

export function removeSaleItemPickerLine<T>(
  lines: SaleItemPickerLine<T>[],
  lineId: string,
) {
  return lines.filter((line) => line.id !== lineId)
}

export function selectInitialCatalogItemLine<
  T extends { catalogItemId: string; disabledReason?: string; id: string },
>({
  catalogItemId,
  offeringId,
  choices,
  lineId,
  lines,
}: {
  catalogItemId: string
  offeringId?: string
  choices: T[]
  lineId: string
  lines: SaleItemPickerLine<T>[]
}) {
  const offering = choices.find(
    (choice) =>
      choice.catalogItemId === catalogItemId &&
      !choice.disabledReason &&
      (!offeringId || choice.id === offeringId),
  )
  if (!offering || lines.some((line) => line.offering.id === offering.id)) {
    return lines
  }
  return addSaleItemPickerLine({ lineId, lines, offering })
}

export function updateSaleItemPickerLineQuantity<T>(
  lines: SaleItemPickerLine<T>[],
  lineId: string,
  quantity: string,
) {
  return lines.map((line) =>
    line.id === lineId ? { ...line, quantity } : line,
  )
}

export function getSelectableSaleItemChoices<
  T extends { disabledReason?: string },
>(choices: T[]) {
  return choices.filter((choice) => !choice.disabledReason)
}
