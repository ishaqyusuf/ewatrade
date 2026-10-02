"use client"
import type { FinanceBillRow } from "@/components/finance/types"
import { Button, Checkbox } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { ColumnDef } from "@tanstack/react-table"
export function expenseColumns(
  currency: string,
  timezone: string,
  open: (id: string) => void,
): ColumnDef<FinanceBillRow>[] {
  return [
    {
      id: "select",
      size: 44,
      minSize: 44,
      maxSize: 44,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerLabel: "Select",
        sticky: true,
        className: "z-20 bg-background md:sticky",
        skeleton: { type: "checkbox" as const },
      },
      header: ({ table }) => (
        <Checkbox
          aria-label="Select loaded expenses"
          checked={table.getIsAllRowsSelected()}
          onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select ${row.original.description}`}
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
        />
      ),
    },
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
      cell: ({ row }) =>
        new Date(row.original.incurredAt).toLocaleDateString("en-NG", {
          timeZone: timezone,
        }),
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
        className: "z-20 bg-background md:sticky",
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
      cell: ({ row }) =>
        ({
          PAID: "Paid",
          PARTIAL: "Partly paid",
          UNPAID: "Unpaid",
          VOID: "Cancelled",
        })[row.original.status],
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
