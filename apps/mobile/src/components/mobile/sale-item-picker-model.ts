export const SALE_ITEM_PICKER_COMPACT_LIMIT = 5

export type SaleItemPickerPresentation = "screen" | "sheet"

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

export function commitSaleItemPickerDraft<T>({
  currentQuantities,
  draft,
}: {
  currentQuantities: Record<string, string>
  draft: Record<string, T>
}) {
  const quantities = Object.fromEntries(
    Object.keys(draft).map((choiceId) => [
      choiceId,
      currentQuantities[choiceId] ?? "1",
    ]),
  )

  return {
    quantities,
    selectedChoices: { ...draft },
  }
}
