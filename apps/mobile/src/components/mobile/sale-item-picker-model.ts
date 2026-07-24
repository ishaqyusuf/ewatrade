export const SALE_ITEM_PICKER_COMPACT_LIMIT = 5

export type SaleItemPickerPresentation = "screen" | "sheet"

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

export function getSaleItemPickerLineCounts<T extends { id: string }>(
  lines: SaleItemPickerLine<T>[],
) {
  const counts = new Map<string, number>()
  for (const line of lines) {
    counts.set(line.offering.id, (counts.get(line.offering.id) ?? 0) + 1)
  }
  return counts
}

export function removeSaleItemPickerLine<T>(
  lines: SaleItemPickerLine<T>[],
  lineId: string,
) {
  return lines.filter((line) => line.id !== lineId)
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

export function openSaleItemPicker<T>({
  choices,
  hasUnloadedChoices,
  onOpenScreen,
  onOpenSheet,
}: {
  choices: T[]
  hasUnloadedChoices: boolean
  onOpenScreen: () => void
  onOpenSheet: (choices: T[]) => void
}): SaleItemPickerPresentation {
  const presentation = getSaleItemPickerPresentation({
    choiceCount: choices.length,
    hasUnloadedChoices,
  })

  if (presentation === "screen") {
    onOpenScreen()
  } else {
    onOpenSheet(choices)
  }

  return presentation
}

export function getSaleItemPickerPresentation({
  choiceCount,
  hasUnloadedChoices,
}: {
  choiceCount: number
  hasUnloadedChoices: boolean
}): SaleItemPickerPresentation {
  return hasUnloadedChoices || choiceCount > SALE_ITEM_PICKER_COMPACT_LIMIT
    ? "screen"
    : "sheet"
}
