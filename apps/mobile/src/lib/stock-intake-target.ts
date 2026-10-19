/** Requested navigation context only. Canonical reads/writes still authorize it. */
export type StockIntakeTarget = {
  catalogItemId: string
  storeId?: string
  variantId?: string
  inventoryUnitId?: string
  balanceSourceId?: string
}

export type StockIntakeTargetParams = {
  [Key in keyof StockIntakeTarget]?: unknown
}

export type ParsedStockIntakeTarget =
  | { kind: "generic" }
  | { kind: "invalid" }
  | { kind: "catalog"; target: StockIntakeTarget }

const targetKeys = [
  "catalogItemId",
  "storeId",
  "variantId",
  "inventoryUnitId",
  "balanceSourceId",
] as const

/** Duplicate/empty/malformed params must never become a generic stock form. */
export function parseStockIntakeTarget(
  params: StockIntakeTargetParams,
): ParsedStockIntakeTarget {
  if (targetKeys.every((key) => params[key] === undefined))
    return { kind: "generic" }

  const values: Partial<StockIntakeTarget> = {}
  for (const key of targetKeys) {
    const value = params[key]
    if (value === undefined) continue
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > 160 ||
      value.trim() !== value ||
      [...value].some((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
      })
    )
      return { kind: "invalid" }
    values[key] = value
  }
  if (!values.catalogItemId) return { kind: "invalid" }
  return {
    kind: "catalog",
    target: { ...values, catalogItemId: values.catalogItemId },
  }
}

export type StockIntakeTargetBalance = {
  balanceSourceId: string
  catalogItemId: string
  storeId: string
  variantId: string
  inventoryUnitId: string
}

export type StockIntakeTargetResolution<Row> = {
  status:
    | "invalid"
    | "unavailable"
    | "loading"
    | "scope_changed"
    | "empty"
    | "selection_missing"
    | "choose"
    | "selected"
  rows: Row[]
  selected: Row | null
}

/**
 * Resolve against the current authorized Store's fresh rows. Do not use cached
 * data while loading/refused, guess among variants/units/custody, or substitute
 * another balance when an explicit or previously selected source disappears.
 */
export function resolveStockIntakeTarget<Row extends StockIntakeTargetBalance>({
  parsed,
  rows,
  storeId,
  enabled,
  loading,
  selectedBalanceSourceId,
}: {
  parsed: ParsedStockIntakeTarget
  rows: readonly Row[]
  storeId: string | undefined
  enabled: boolean
  loading: boolean
  selectedBalanceSourceId?: string
}): StockIntakeTargetResolution<Row> {
  const empty = (status: StockIntakeTargetResolution<Row>["status"]) => ({
    status,
    rows: [],
    selected: null,
  })
  if (parsed.kind === "invalid") return empty("invalid")
  if (!enabled) return empty("unavailable")
  if (!storeId) return empty("loading")
  const target = parsed.kind === "catalog" ? parsed.target : null
  if (target?.storeId && target.storeId !== storeId)
    return empty("scope_changed")
  if (loading) return empty("loading")

  const scopedRows = rows.filter(
    (row) =>
      row.storeId === storeId &&
      (!target ||
        (row.catalogItemId === target.catalogItemId &&
          (!target.variantId || row.variantId === target.variantId) &&
          (!target.inventoryUnitId ||
            row.inventoryUnitId === target.inventoryUnitId) &&
          (!target.balanceSourceId ||
            row.balanceSourceId === target.balanceSourceId))),
  )
  if (!scopedRows.length) return empty("empty")

  if (selectedBalanceSourceId) {
    const selected = scopedRows.find(
      (row) => row.balanceSourceId === selectedBalanceSourceId,
    )
    return {
      status: selected ? "selected" : "selection_missing",
      rows: scopedRows,
      selected: selected ?? null,
    }
  }
  const selected =
    target && scopedRows.length === 1 ? (scopedRows[0] ?? null) : null
  return {
    status: selected ? "selected" : "choose",
    rows: scopedRows,
    selected,
  }
}
