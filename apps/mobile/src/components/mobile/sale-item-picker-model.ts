export const SALE_ITEM_PICKER_COMPACT_LIMIT = 5

export type SaleItemPickerPresentation = "screen" | "sheet"

export function getSelectableSaleItemChoices<
  T extends { disabledReason?: string },
>(choices: T[]) {
  return choices.filter((choice) => !choice.disabledReason)
}

export function shouldFetchNextSaleItemPickerPage({
  attemptedCursors,
  choiceCount,
  isOffline,
  nextCursor,
}: {
  attemptedCursors: ReadonlySet<string>
  choiceCount: number
  isOffline: boolean
  nextCursor?: string
}) {
  return Boolean(
    !isOffline &&
      choiceCount <= SALE_ITEM_PICKER_COMPACT_LIMIT &&
      nextCursor &&
      !attemptedCursors.has(nextCursor),
  )
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
