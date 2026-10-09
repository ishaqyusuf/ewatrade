"use client"
import type { FinanceBillRow } from "@/components/finance/types"
import { selectColumn } from "@/components/tables/core"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { ColumnDef } from "@tanstack/react-table"
export const expenseStatusLabels = {
  PAID: "Paid",
  PARTIAL: "Partly paid",
  UNPAID: "Unpaid",
  VOID: "Cancelled",
} as const satisfies Record<FinanceBillRow["status"], string>

export function formatExpenseDate(value: Date | string, timezone: string) {
  return new Date(value).toLocaleDateString("en-NG", { timeZone: timezone })
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
      size: 120,
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
          "z-20 bg-background group-hover:bg-muted/40 group-focus-visible:bg-muted/40 group-aria-selected:bg-muted/60 md:sticky",
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
      header: "Payee",
      size: 180,
      minSize: 130,
      maxSize: 280,
      meta: {
        headerLabel: "Payee",
        sortField: "payeeName",
        skeleton: { type: "text" as const, width: "w-24" },
      },
    },
    {
      accessorKey: "totalMinor",
      header: "Total",
      size: 150,
      minSize: 120,
      maxSize: 200,
      meta: {
        headerLabel: "Total",
        sortField: "totalMinor",
        skeleton: { type: "text" as const, width: "w-20" },
      },
      cell: ({ row }) => formatFinanceMoney(row.original.totalMinor, currency),
    },
    {
      accessorKey: "paidMinor",
      header: "Paid",
      size: 150,
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
      header: "Outstanding",
      size: 150,
      minSize: 120,
      maxSize: 200,
      meta: {
        headerLabel: "Outstanding",
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
      cell: ({ row }) => expenseStatusLabels[row.original.status],
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
