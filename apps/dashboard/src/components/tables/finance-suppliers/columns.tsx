"use client"

import { formatFinanceShortDate } from "@/components/finance/format-date"
import type { FinanceSupplierRow } from "@/components/finance/types"
import { Pill } from "@/components/orders/overview/order-overview-parts"
import { type TableColumnMeta, selectColumn } from "@/components/tables/core"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { ColumnDef } from "@tanstack/react-table"

export type FinanceSupplierListRow =
  RouterOutputs["finance"]["supplierDirectory"]["items"][number]

/** Overdue is red, a coming due date amber; nothing owed shows Paid up or Paid ahead. */
export function SupplierDuePill({
  supplier,
}: { supplier: FinanceSupplierListRow }) {
  if (supplier.owedMinor === "0")
    return supplier.paidAheadMinor !== "0" ? (
      <Pill tone="green">Paid ahead</Pill>
    ) : (
      <Pill tone="muted">Paid up</Pill>
    )
  if (!supplier.nextDueAt) return <Pill tone="amber">No due date</Pill>
  const day = formatFinanceShortDate(supplier.nextDueAt)
  return supplier.overdue ? (
    <Pill tone="red">Overdue · {day}</Pill>
  ) : (
    <Pill tone="amber">Due {day}</Pill>
  )
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
    return <span className="text-muted-foreground">…</span>
  if (!strong && value === "0")
    return <span className="text-muted-foreground">—</span>
  return (
    <span className={`tabular-nums ${strong ? "font-semibold" : ""}`}>
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
      header: "You owe",
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
      id: "nextDue",
      header: "Next due",
      size: 170,
      minSize: 140,
      maxSize: 240,
      meta: {
        headerLabel: "Next due",
        skeleton: { type: "badge", width: "w-24" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => <SupplierDuePill supplier={row.original} />,
    },
    {
      id: "paidAhead",
      header: "Paid ahead",
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
