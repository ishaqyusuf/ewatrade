import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type SupplierAging = RouterOutputs["finance"]["supplierPayableAging"]
export type SupplierAgingCursor = NonNullable<SupplierAging["nextCursor"]>

export const supplierAgingBucketLabels = {
  NOT_DUE: "Not due",
  DUE_TODAY: "Due today",
  OVERDUE_1_30: "1–30 days overdue",
  OVERDUE_31_60: "31–60 days overdue",
  OVERDUE_61_90: "61–90 days overdue",
  OVERDUE_91_PLUS: "91+ days overdue",
  UNDATED: "Undated",
} as const

export function isSupplierAgingDay(value: string, startsAt: Date | string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const day = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(day.getTime()) &&
    day.toISOString().slice(0, 10) === value &&
    value <= "9999-12-30" &&
    value >= new Date(startsAt).toISOString().slice(0, 10)
  )
}

// Never reveal a cache entry from another supplier, Book, day or pinned page.
export function matchesSupplierAgingScope(
  data: SupplierAging,
  scope: {
    bookId: string
    supplierId: string
    asOfDate: string
    snapshotSequence?: string
  },
) {
  return (
    data.supplier.bookId === scope.bookId &&
    data.supplier.id === scope.supplierId &&
    data.asOfDate === scope.asOfDate &&
    data.dateBasis === "UTC" &&
    data.controlScope === "SUPPLIER_ALL_STORES" &&
    (scope.snapshotSequence === undefined ||
      data.snapshotSequence === scope.snapshotSequence)
  )
}
