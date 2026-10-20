"use client"
import { expensePill } from "@/components/finance/expense-status"
import { formatFinanceShortDate } from "@/components/finance/format-date"
import type { FinanceBillRow } from "@/components/finance/types"
import { Pill } from "@/components/orders/overview/order-overview-parts"
import { selectColumn } from "@/components/tables/core"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { File01Icon, FileRemoveIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ColumnDef } from "@tanstack/react-table"

export { expenseStatusLabels } from "@/components/finance/expense-status"

export function formatExpenseDate(value: Date | string, timezone: string) {
  return formatFinanceShortDate(value, timezone)
}

export function ExpenseStatusPill({
  status,
}: { status: FinanceBillRow["status"] }) {
  const pill = expensePill(status)
  return <Pill tone={pill.tone}>{pill.label}</Pill>
}

/** Attached receipts, or a prompt when an open expense has none. */
export function ExpenseReceipt({ bill }: { bill: FinanceBillRow }) {
  if (bill.receiptCount > 0)
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <HugeiconsIcon
          icon={File01Icon}
          className="size-4"
          aria-hidden="true"
        />
        {bill.receiptCount === 1 ? "Attached" : `${bill.receiptCount} files`}
      </span>
    )
  if (bill.status === "VOID")
    return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300">
      <HugeiconsIcon
        icon={FileRemoveIcon}
        className="size-4"
        aria-hidden="true"
      />
      Missing
    </span>
  )
}

export function expenseColumns(
  currency: string,
  timezone: string,
  open: (id: string) => void,
): ColumnDef<FinanceBillRow>[] {
  return [
    selectColumn((bill) => bill.description, "Select all loaded expenses"),
    {
      accessorKey: "incurredAt",
      header: "Date",
      size: 100,
      minSize: 100,
      maxSize: 180,
      enableResizing: true,
      meta: {
        headerLabel: "Date",
        sortField: "incurredAt",
        skeleton: { type: "text" as const, width: "w-20" },
      },
      cell: ({ row }) => formatExpenseDate(row.original.incurredAt, timezone),
    },
    {
      accessorKey: "description",
      header: "Expense",
      size: 260,
      minSize: 180,
      maxSize: 420,
      enableHiding: false,
      meta: {
        headerLabel: "Expense",
        sortField: "description",
        sticky: true,
        reorderable: false,
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-aria-selected:bg-muted/60 md:sticky",
        skeleton: { type: "text" as const, width: "w-40" },
      },
      cell: ({ row }) => (
        <button
          type="button"
          data-row-interactive="true"
          className="truncate text-left font-medium underline-offset-4 hover:underline focus-visible:underline"
          onClick={() => open(row.original.id)}
        >
          {row.original.description}
        </button>
      ),
    },
    {
      accessorKey: "payeeName",
      header: "Paid to",
      size: 160,
      minSize: 130,
      maxSize: 280,
      meta: {
        headerLabel: "Paid to",
        sortField: "payeeName",
        skeleton: { type: "text" as const, width: "w-24" },
      },
    },
    {
      accessorKey: "totalMinor",
      header: "Amount",
      size: 130,
      minSize: 120,
      maxSize: 200,
      meta: {
        headerLabel: "Amount",
        sortField: "totalMinor",
        skeleton: { type: "text" as const, width: "w-20" },
      },
      cell: ({ row }) => formatFinanceMoney(row.original.totalMinor, currency),
    },
    {
      accessorKey: "paidMinor",
      header: "Paid",
      size: 130,
      minSize: 120,
      maxSize: 200,
      meta: {
        headerLabel: "Paid",
        sortField: "paidMinor",
        skeleton: { type: "text" as const, width: "w-20" },
      },
      cell: ({ row }) => formatFinanceMoney(row.original.paidMinor, currency),
    },
    {
      accessorKey: "outstandingMinor",
      header: "Still to pay",
      size: 130,
      minSize: 120,
      maxSize: 200,
      meta: {
        headerLabel: "Still to pay",
        skeleton: { type: "text" as const, width: "w-20" },
      },
      cell: ({ row }) =>
        formatFinanceMoney(row.original.outstandingMinor, currency),
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 110,
      minSize: 100,
      maxSize: 150,
      meta: {
        headerLabel: "Status",
        skeleton: { type: "badge" as const, width: "w-16" },
      },
      cell: ({ row }) => <ExpenseStatusPill status={row.original.status} />,
    },
    {
      id: "receipt",
      header: "Receipt",
      size: 110,
      minSize: 100,
      maxSize: 160,
      meta: {
        headerLabel: "Receipt",
        skeleton: { type: "text" as const, width: "w-16" },
      },
      cell: ({ row }) => <ExpenseReceipt bill={row.original} />,
    },
    {
      id: "actions",
      size: 80,
      minSize: 80,
      maxSize: 80,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerLabel: "Actions",
        sticky: true,
        reorderable: false,
        className: "z-20 border-l bg-background md:sticky",
        skeleton: { type: "icon" as const },
      },
      cell: ({ row }) => (
        <Button
          aria-label={`View expense ${row.original.description}`}
          data-row-interactive="true"
          className="rounded-none"
          size="sm"
          variant="ghost"
          onClick={() => open(row.original.id)}
        >
          View
        </Button>
      ),
    },
  ]
}
