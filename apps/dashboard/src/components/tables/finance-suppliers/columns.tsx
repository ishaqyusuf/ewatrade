"use client"

import type { FinanceSupplierRow } from "@/components/finance/types"
import { type TableColumnMeta, selectColumn } from "@/components/tables/core"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { ColumnDef } from "@tanstack/react-table"

/** A supplier row with its balances; undefined while they load. */
export type FinanceSupplierListRow = FinanceSupplierRow & {
  owedMinor?: string
  paidAheadMinor?: string
}

function Amount({
  value,
  currency,
  strong = false,
}: {
  value?: string
  currency: string
  strong?: boolean
}) {
  if (value === undefined)
    return <span className="block text-right text-muted-foreground">…</span>
  if (!strong && value === "0")
    return <span className="block text-right text-muted-foreground">—</span>
  return (
    <span
      className={`block text-right tabular-nums ${strong ? "font-semibold" : ""}`}
    >
      {formatFinanceMoney(value, currency)}
    </span>
  )
}

export function financeSupplierColumns(
  openStatement: (id: string) => void,
  currency = "NGN",
): ColumnDef<FinanceSupplierListRow>[] {
  return [
    selectColumn((supplier) => supplier.name),
    {
      accessorKey: "name",
      header: "Supplier",
      size: 300,
      minSize: 200,
      maxSize: 520,
      enableHiding: false,
      meta: {
        headerLabel: "Supplier",
        sticky: true,
        reorderable: false,
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-aria-selected:bg-muted/60 md:sticky",
        skeleton: { type: "text", width: "w-40" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => (
        <div className="grid min-w-0">
          <button
            type="button"
            data-row-interactive="true"
            className="truncate text-left font-medium underline-offset-4 hover:underline focus-visible:underline"
            onClick={() => openStatement(row.original.id)}
          >
            {row.original.name}
          </button>
          <span className="truncate text-[13px] text-muted-foreground">
            {row.original.code}
          </span>
        </div>
      ),
    },
    {
      id: "owed",
      header: () => <span className="block text-right">You owe</span>,
      size: 180,
      minSize: 140,
      maxSize: 260,
      meta: {
        headerLabel: "You owe",
        skeleton: { type: "text", width: "w-24" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => (
        <Amount value={row.original.owedMinor} currency={currency} strong />
      ),
    },
    {
      id: "paidAhead",
      header: () => <span className="block text-right">Paid ahead</span>,
      size: 180,
      minSize: 140,
      maxSize: 260,
      meta: {
        headerLabel: "Paid ahead",
        skeleton: { type: "text", width: "w-24" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => (
        <Amount value={row.original.paidAheadMinor} currency={currency} />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      size: 96,
      minSize: 96,
      maxSize: 96,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerLabel: "Actions",
        sticky: true,
        reorderable: false,
        className: "z-20 border-l bg-background md:sticky",
        skeleton: { type: "icon" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => (
        <ViewSupplierButton
          supplier={row.original}
          onOpen={() => openStatement(row.original.id)}
        />
      ),
    },
  ]
}

export function ViewSupplierButton({
  supplier,
  onOpen,
}: {
  supplier: FinanceSupplierRow
  onOpen: () => void
}) {
  return (
    <Button
      type="button"
      aria-label={`Open ${supplier.name}`}
      data-row-interactive="true"
      className="rounded-none"
      size="sm"
      variant="ghost"
      onClick={onOpen}
    >
      Open
    </Button>
  )
}
