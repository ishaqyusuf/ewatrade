import { type TableColumnMeta, selectColumn } from "@/components/tables/core"
import type {
  DashboardCustomerBalance,
  DashboardCustomerRow,
} from "@/lib/sales-operations"
import { cn } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { CustomerActionsMenu } from "./action-menu"

export const CUSTOMER_SUBTITLE_CLASS =
  "truncate text-[13.5px] text-muted-foreground"

export type CustomerColumnOptions = {
  currencyCode: string
  /** Owners and admins see balances and open statements. */
  canSeeBalances: boolean
  onEdit: (customerId: string) => void
}

export function customerColumns({
  currencyCode,
  canSeeBalances,
  onEdit,
}: CustomerColumnOptions): ColumnDef<DashboardCustomerRow>[] {
  const sortable = (sortField: string): TableColumnMeta => ({ sortField })
  const columns: ColumnDef<DashboardCustomerRow>[] = [
    selectColumn((customer) => customer.name, "Select all"),
    {
      id: "name",
      accessorKey: "name",
      header: "Customer",
      size: 260,
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
        <div className="flex min-w-0 items-center gap-3">
          <CustomerAvatar customer={row.original} />
          <div className="min-w-0">
            <CustomerName
              customer={row.original}
              canSeeBalances={canSeeBalances}
            />
            <CustomerContact customer={row.original} />
          </div>
        </div>
      ),
    },
  ]
  if (canSeeBalances)
    columns.push({
      id: "balance",
      accessorFn: (customer) => customer.balance?.netMinor ?? null,
      header: "Balance",
      size: 200,
      minSize: 150,
      meta: {
        ...sortable("balance"),
        skeleton: { type: "text", width: "w-24" },
      },
      sortingFn: (rowA, rowB) =>
        compareCustomerBalances(rowA.original.balance, rowB.original.balance),
      cell: ({ row }) => (
        <CustomerBalance
          balance={row.original.balance}
          currencyCode={currencyCode}
        />
      ),
    })
  columns.push(
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
      cell: ({ row }) =>
        row.original.orderCount ? (
          <span className="tabular-nums">{row.original.orderCount}</span>
        ) : (
          <span className="text-muted-foreground">None yet</span>
        ),
    },
    {
      id: "totalMinor",
      accessorKey: "totalMinor",
      header: "Total spent",
      size: 150,
      minSize: 120,
      meta: {
        ...sortable("totalMinor"),
        headerLabel: "Total spent",
        skeleton: { type: "text", width: "w-20" },
      },
      sortingFn: (rowA, rowB, columnId) =>
        compareCustomerTotals(
          rowA.getValue<string>(columnId),
          rowB.getValue<string>(columnId),
        ),
      cell: ({ row }) =>
        row.original.orderCount ? (
          <span className="tabular-nums">
            {formatFinanceMoney(row.original.totalMinor, currencyCode)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "lastSeenAt",
      accessorKey: "lastSeenAt",
      header: "Last order",
      size: 170,
      minSize: 130,
      meta: {
        ...sortable("lastSeenAt"),
        headerLabel: "Last order",
        skeleton: { type: "text", width: "w-24" },
      },
      cell: ({ row }) => {
        const order = row.original.lastOrder
        return order ? (
          <div className="min-w-0">
            <p className="truncate">{formatCustomerDate(order.createdAt)}</p>
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              {order.orderNumber}
            </p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
    {
      id: "actions",
      header: "Actions",
      size: 64,
      minSize: 64,
      enableHiding: false,
      enableResizing: false,
      meta: { headerLabel: "Actions", reorderable: false },
      cell: ({ row }) => (
        <CustomerActionsMenu
          customer={row.original}
          canSeeBalances={canSeeBalances}
          onEdit={onEdit}
        />
      ),
    },
  )
  return columns
}

export function customerStatementHref(customerId: string) {
  return `/customers/${encodeURIComponent(customerId)}/statement`
}

export function CustomerName({
  customer,
  canSeeBalances,
  className,
}: {
  customer: DashboardCustomerRow
  canSeeBalances: boolean
  className?: string
}) {
  const base = cn("block min-w-0 truncate font-medium", className)
  return canSeeBalances && customer.customerId ? (
    <Link
      href={customerStatementHref(customer.customerId)}
      className={cn(
        base,
        "underline-offset-4 outline-none hover:underline focus-visible:underline",
      )}
    >
      {customer.name}
    </Link>
  ) : (
    <p className={base}>{customer.name}</p>
  )
}

export function CustomerContact({
  customer,
  className,
}: {
  customer: DashboardCustomerRow
  className?: string
}) {
  const contact = customer.phone ?? customer.email
  return (
    <p
      className={cn(
        "truncate text-xs text-muted-foreground",
        !contact && "italic",
        className,
      )}
    >
      {getCustomerContact(customer)}
    </p>
  )
}

export function CustomerAvatar({
  customer,
  className,
}: {
  customer: DashboardCustomerRow
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold",
        className,
      )}
    >
      {customer.identityType === "walk-in" ? "·" : initials(customer.name)}
    </span>
  )
}

/** "₦45,000 owes you", "₦12,500 paid ahead" or "Paid up"; never a minus sign. */
export function CustomerBalance({
  balance,
  currencyCode,
  compact = false,
}: {
  balance: DashboardCustomerBalance | null
  currencyCode: string
  compact?: boolean
}) {
  if (!balance) return <span className="text-muted-foreground">—</span>
  const view = describeCustomerBalance(balance)
  if (view.kind === "settled")
    return <span className="text-muted-foreground">Paid up</span>
  return (
    <div
      className={cn(
        "min-w-0",
        compact && "flex flex-wrap items-baseline gap-x-1.5",
      )}
    >
      <p
        className={cn(
          "font-semibold tabular-nums",
          view.kind === "owes"
            ? "text-amber-700 dark:text-amber-300"
            : "text-primary",
        )}
      >
        {formatFinanceMoney(view.amountMinor, currencyCode)}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {view.kind === "owes"
          ? view.afterPaidAheadMinor
            ? `owes you, after ${formatFinanceMoney(view.afterPaidAheadMinor, currencyCode)} paid ahead`
            : "owes you"
          : "paid ahead"}
      </p>
    </div>
  )
}

export type CustomerBalanceView =
  | { kind: "settled" }
  | { kind: "owes"; amountMinor: string; afterPaidAheadMinor: string | null }
  | { kind: "paidAhead"; amountMinor: string }

/** Owing wins: the amount is net of any money paid ahead and says so. */
export function describeCustomerBalance(
  balance: DashboardCustomerBalance,
): CustomerBalanceView {
  const owed = BigInt(balance.owedMinor)
  const paidAhead = BigInt(balance.paidAheadMinor)
  const net = BigInt(balance.netMinor)
  if (owed > BigInt(0) && net > BigInt(0))
    return {
      kind: "owes",
      amountMinor: net.toString(),
      afterPaidAheadMinor: paidAhead > BigInt(0) ? paidAhead.toString() : null,
    }
  if (paidAhead > BigInt(0) && net < BigInt(0))
    return { kind: "paidAhead", amountMinor: (-net).toString() }
  return { kind: "settled" }
}

export function getCustomerContact(customer: DashboardCustomerRow) {
  return (
    customer.phone ??
    customer.email ??
    (customer.identityType === "walk-in"
      ? "Sales with no customer details"
      : "No phone or email")
  )
}

export function compareCustomerTotals(left: string, right: string) {
  const leftMinor = BigInt(left)
  const rightMinor = BigInt(right)
  return leftMinor < rightMinor ? -1 : leftMinor > rightMinor ? 1 : 0
}

/** Net balance order; customers without an account sort below everyone. */
export function compareCustomerBalances(
  left: DashboardCustomerBalance | null,
  right: DashboardCustomerBalance | null,
) {
  if (!left || !right) return left ? 1 : right ? -1 : 0
  return compareCustomerTotals(left.netMinor, right.netMinor)
}

export function formatCustomerDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date)
}

function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/)
  const first = words[0]?.[0] ?? "?"
  const second = words[1]?.[0] ?? ""
  return `${first}${second}`.toUpperCase()
}
