export type SaleReturnableDraft = {
  catalogItemId: string
  name: string
  /** Whole number as typed; validated on confirm. */
  quantity: string
}

/** Order-create returnables, or null when any count is not a whole number of at least 1. */
export function saleReturnableLines(drafts: SaleReturnableDraft[]) {
  const lines = drafts.map((draft) => ({
    catalogItemId: draft.catalogItemId,
    quantity: /^\d+$/.test(draft.quantity.trim())
      ? Number(draft.quantity.trim())
      : Number.NaN,
  }))
  return lines.every(
    (line) =>
      Number.isSafeInteger(line.quantity) &&
      line.quantity >= 1 &&
      line.quantity <= 100_000,
  )
    ? lines
    : null
}
