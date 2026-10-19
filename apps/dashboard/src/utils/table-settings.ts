import type {
  ColumnDef,
  ColumnOrderState,
  ColumnSizingState,
  VisibilityState,
} from "@tanstack/react-table"
import { z } from "zod"

export const tableIds = [
  "catalog",
  "orders",
  "service-work",
  "prescriptions",
  "expenses",
  "finance-suppliers",
  "finance-bank-statements",
  "customer-ledger",
  "inventory",
  "inventory-operations",
  "stock-transfers",
  "customers",
  "staff",
  "domains",
  "store-conversations",
] as const
export type TableId = (typeof tableIds)[number]

export const tableSettingsSchema = z
  .object({
    columns: z
      .record(z.string().min(1).max(80), z.boolean())
      .refine((value) => Object.keys(value).length <= 40),
    sizing: z
      .record(z.string().min(1).max(80), z.number().finite().min(30).max(2000))
      .refine((value) => Object.keys(value).length <= 40),
    order: z.array(z.string().min(1).max(80)).max(40),
  })
  .strict()

export type TableSettings = {
  columns: VisibilityState
  sizing: ColumnSizingState
  order: ColumnOrderState
  scope?: string
}

export function getDefaultTableSettings(): TableSettings {
  return { columns: {}, sizing: {}, order: [] }
}

export function mergeWithDefaults(
  saved?: Partial<TableSettings>,
): TableSettings {
  return {
    columns: saved?.columns ?? {},
    sizing: saved?.sizing ?? {},
    order: saved?.order ?? [],
    scope: saved?.scope,
  }
}

export function getColumnIds<T>(columns: ColumnDef<T>[]): string[] {
  return columns.flatMap((column) => {
    const id =
      column.id ??
      ("accessorKey" in column ? String(column.accessorKey) : undefined)
    return id ? [id] : []
  })
}

export function normalizeColumnOrder(
  saved: string[],
  columnIds: string[],
  fixedColumnIds: string[] = [],
): string[] {
  const known = new Set(columnIds)
  const fixed = new Set([...fixedColumnIds, "select", "actions"])
  const isMovable = (id: string) => known.has(id) && !fixed.has(id)
  const movable = [...new Set(saved)].filter(isMovable)
  const defaults = columnIds.filter(isMovable)
  // A column the saved order has never seen goes next to its default
  // neighbours: after the nearest earlier one, else before the nearest later one.
  defaults.forEach((id, index) => {
    if (movable.includes(id)) return
    const before = defaults
      .slice(0, index)
      .reverse()
      .find((other) => movable.includes(other))
    if (before) {
      movable.splice(movable.indexOf(before) + 1, 0, id)
      return
    }
    const after = defaults
      .slice(index + 1)
      .find((other) => movable.includes(other))
    movable.splice(after ? movable.indexOf(after) : movable.length, 0, id)
  })
  const leading = columnIds.filter((id) => fixed.has(id) && id !== "actions")
  return [...leading, ...movable, ...(known.has("actions") ? ["actions"] : [])]
}

export function normalizeTableSettings(
  saved: Partial<TableSettings> | undefined,
  columnIds: string[],
  fixedColumnIds: string[] = [],
): TableSettings {
  const settings = mergeWithDefaults(saved)
  const known = new Set(columnIds)
  const fixed = new Set([...fixedColumnIds, "select", "actions"])
  return {
    columns: Object.fromEntries(
      Object.entries(settings.columns)
        .filter(([id]) => known.has(id))
        .map(([id, visible]) => [id, fixed.has(id) || visible]),
    ),
    sizing: Object.fromEntries(
      Object.entries(settings.sizing).filter(([id]) => known.has(id)),
    ),
    order: normalizeColumnOrder(settings.order, columnIds, fixedColumnIds),
    scope: settings.scope,
  }
}
