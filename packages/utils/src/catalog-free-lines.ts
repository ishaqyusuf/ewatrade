import { majorToMinor } from "./currency"

/** Order lines recorded without a Catalog item: a typed amount plus optional words. */
export const catalogFreeLineKinds = ["quick_sale", "additional_cost"] as const
export type CatalogFreeLineKind = (typeof catalogFreeLineKinds)[number]

export const CATALOG_FREE_LINE_LABELS: Record<CatalogFreeLineKind, string> = {
  additional_cost: "Additional cost",
  quick_sale: "Quick sale",
}
export const CATALOG_FREE_NO_DESCRIPTION = "(no description)"
export const CATALOG_FREE_DESCRIPTION_MAX_LENGTH = 200

/** Title and detail as owners read them on carts, orders and receipts. */
export function catalogFreeLineDisplay(line: {
  kind: CatalogFreeLineKind
  description?: string | null
}) {
  const description = line.description?.trim() || null
  if (line.kind === "quick_sale")
    return { detail: null, title: description ?? "Quick sale" }
  return {
    detail: description ?? CATALOG_FREE_NO_DESCRIPTION,
    title: CATALOG_FREE_LINE_LABELS.additional_cost,
  }
}

/**
 * Starting point for saving a typed-price line as a Catalog item: the words as
 * the name, the typed price, and a kind that suits it. Null when there are no
 * words to name the item with.
 */
/**
 * A typed-price line as a new catalog item draft. Pass the line's total:
 * these lines are priced by order total (no unit price) and always qty 1.
 */
export function catalogFreeLineCatalogDraft(
  line: { kind: CatalogFreeLineKind; description?: string | null },
  amountMinor?: number | null,
) {
  const name = line.description?.trim()
  if (!name) return null
  return {
    kind:
      line.kind === "quick_sale" ? ("product" as const) : ("service" as const),
    name,
    priceMinor:
      typeof amountMinor === "number" && amountMinor > 0 ? amountMinor : null,
  }
}

export type CatalogFreeLineDraft = {
  id: string
  kind: CatalogFreeLineKind
  /** Major-unit text as typed, e.g. "1,500.50". */
  amount: string
  description: string
}

export function catalogFreeLineAmountMinor(line: CatalogFreeLineDraft) {
  const minor = majorToMinor(line.amount)
  return minor !== null && Number.isSafeInteger(minor) && minor > 0
    ? minor
    : null
}

export function catalogFreeLinesTotalMinor(lines: CatalogFreeLineDraft[]) {
  return lines.reduce(
    (total, line) => total + (catalogFreeLineAmountMinor(line) ?? 0),
    0,
  )
}

export function catalogFreeLinesError(lines: CatalogFreeLineDraft[]) {
  for (const line of lines) {
    if (catalogFreeLineAmountMinor(line) === null)
      return `Enter an amount for each ${CATALOG_FREE_LINE_LABELS[line.kind]}.`
    if (line.description.trim().length > CATALOG_FREE_DESCRIPTION_MAX_LENGTH)
      return `Descriptions must be at most ${CATALOG_FREE_DESCRIPTION_MAX_LENGTH} characters.`
  }
  return null
}

/** Order-create line payloads; call only after catalogFreeLinesError is null. */
export function catalogFreeOrderLines(lines: CatalogFreeLineDraft[]) {
  return lines.flatMap((line) => {
    const amountMinor = catalogFreeLineAmountMinor(line)
    if (amountMinor === null) return []
    const description = line.description.trim()
    return [
      {
        amountMinor,
        custom: line.kind,
        ...(description ? { description } : {}),
      },
    ]
  })
}
