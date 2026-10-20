import { type TableColumnMeta, selectColumn } from "@/components/tables/core"
import type { DashboardCustomerRow } from "@/lib/sales-operations"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { ColumnDef } from "@tanstack/react-table"

export function customerColumns(
  currencyCode: string,
): ColumnDef<DashboardCustomerRow>[] {
  const sortable = (sortField: string): TableColumnMeta => ({ sortField })
  return [
    selectColumn((customer) => customer.name),
    {
      id: "name",
      accessorKey: "name",
      header: "Customer",
      size: 250,
      minSize: 200,
      enableResizing: true,
      enableHiding: false,
      meta: {
        ...sortable("name"),
        headerLabel: "Customer",
        sticky: true,
        reorderable: false,
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-aria-selected:bg-muted/60",
        skeleton: { type: "avatar-text" },
      },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {getCustomerContact(row.original)}
          </p>
        </div>
      ),
    },
    {
      id: "orderCount",
      accessorKey: "orderCount",
      header: "Orders",
      size: 110,
      minSize: 90,
      meta: {
        ...sortable("orderCount"),
        skeleton: { type: "text", width: "w-12" },
      },
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.orderCount}</span>
      ),
    },
    {
      id: "totalMinor",
      accessorKey: "totalMinor",
      header: "Total",
      size: 150,
      minSize: 120,
      meta: {
        ...sortable("totalMinor"),
        skeleton: { type: "text", width: "w-20" },
      },
      sortingFn: (rowA, rowB, columnId) =>
        compareCustomerTotals(
          rowA.getValue<string>(columnId),
          rowB.getValue<string>(columnId),
        ),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatFinanceMoney(row.original.totalMinor, currencyCode)}
        </span>
      ),
    },
    {
      id: "lastOrder",
      accessorFn: (customer) => customer.lastOrder.orderNumber,
      header: "Last order",
      size: 150,
      minSize: 120,
      meta: {
        ...sortable("lastOrder"),
        skeleton: { type: "text", width: "w-20" },
      },
      cell: ({ row }) => row.original.lastOrder.orderNumber,
    },
    {
      id: "lastSeenAt",
      accessorKey: "lastSeenAt",
      header: "Last seen",
      size: 160,
      minSize: 130,
      meta: {
        ...sortable("lastSeenAt"),
        skeleton: { type: "text", width: "w-24" },
      },
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatCustomerDate(row.original.lastSeenAt)}
        </span>
      ),
    },
  ]
}

export function getCustomerContact(customer: DashboardCustomerRow) {
  return customer.phone ?? customer.email ?? customer.identityType
}

export function compareCustomerTotals(left: string, right: string) {
  const leftMinor = BigInt(left)
  const rightMinor = BigInt(right)
  return leftMinor < rightMinor ? -1 : leftMinor > rightMinor ? 1 : 0
}

export function formatCustomerDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date)
}
