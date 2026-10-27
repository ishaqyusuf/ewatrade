"use client"

import { formatFinanceShortDate } from "@/components/finance/format-date"
import { Pill } from "@/components/orders/overview/order-overview-parts"
import {
  DirectoryCollection,
  DirectoryRecord,
  DirectoryToolbar,
  SelectionBar,
  SimpleDirectoryTable,
  selectColumn,
  useLoadedRowSelection,
} from "@/components/tables/core"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo } from "react"

export type CustomerAccount =
  RouterOutputs["finance"]["customerBalanceDirectory"]["items"][number]

const getAccountId = (customer: CustomerAccount) => customer.id
const contact = (customer: CustomerAccount) =>
  customer.phone ?? customer.email ?? "Saved Customer"
const statementHref = (customer: CustomerAccount) =>
  `/customers/${encodeURIComponent(customer.id)}/statement`

function OpenStatement({ customer }: { customer: CustomerAccount }) {
  return (
    <Link
      className="shrink-0 px-2 text-sm underline-offset-4 hover:underline"
      href={statementHref(customer)}
      aria-label={`Open ${customer.name}`}
    >
      Open
    </Link>
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
    return <p className="text-right text-muted-foreground">…</p>
  if (!strong && value === "0")
    return <p className="text-right text-muted-foreground">—</p>
  return (
    <p className={`text-right tabular-nums ${strong ? "font-semibold" : ""}`}>
      {formatFinanceMoney(value, currency)}
    </p>
  )
}

/** How long the oldest unpaid charge has waited: amber, red after 30 days. */
function OwingSince({ customer }: { customer: CustomerAccount }) {
  if (!customer.owingSince) {
    if (customer.paidAheadMinor !== "0")
      return <Pill tone="green">Paid ahead</Pill>
    return customer.owedMinor === "0" ? <Pill tone="muted">Paid up</Pill> : null
  }
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(customer.owingSince).getTime()) / 864e5),
  )
  return (
    <Pill tone={days > 30 ? "red" : "amber"}>
      {days === 0
        ? "Owing since today"
        : `Owing ${days} day${days === 1 ? "" : "s"}`}
    </Pill>
  )
}

function LastPayment({
  customer,
  currency,
}: {
  customer: CustomerAccount
  currency: string
}) {
  if (!customer.lastPaymentAt || !customer.lastPaymentMinor)
    return <span className="text-muted-foreground">—</span>
  return (
    <span className="tabular-nums">
      {formatFinanceMoney(customer.lastPaymentMinor, currency)}{" "}
      <span className="text-muted-foreground">
        · {formatFinanceShortDate(customer.lastPaymentAt)}
      </span>
    </span>
  )
}

export function CustomerAccountsDataTable({
  rows,
  view,
  search,
  currencyCode,
  count,
  owedMinor,
}: {
  rows: CustomerAccount[]
  view: DirectoryView
  search: string
  currencyCode: string
  count: number
  owedMinor: string
}) {
  const router = useRouter()
  const columns = useMemo<ColumnDef<CustomerAccount>[]>(
    () => [
      selectColumn((customer) => customer.name, "Select all loaded Customers"),
      {
        id: "name",
        header: "Customer",
        cell: ({ row }) => (
          <div className="grid min-w-48">
            <Link
              href={statementHref(row.original)}
              className="font-medium underline-offset-4 hover:underline"
            >
              {row.original.name}
            </Link>
            <p className="text-sm text-muted-foreground">
              {contact(row.original)}
            </p>
          </div>
        ),
      },
      {
        id: "owed",
        header: () => <span className="block text-right">Owes you</span>,
        cell: ({ row }) => (
          <Amount
            value={row.original.owedMinor}
            currency={currencyCode}
            strong
          />
        ),
      },
      {
        id: "owingSince",
        header: "Owing since",
        cell: ({ row }) => <OwingSince customer={row.original} />,
      },
      {
        id: "lastPayment",
        header: "Last payment",
        cell: ({ row }) => (
          <LastPayment customer={row.original} currency={currencyCode} />
        ),
      },
      {
        id: "paidAhead",
        header: () => <span className="block text-right">Paid ahead</span>,
        cell: ({ row }) => (
          <Amount value={row.original.paidAheadMinor} currency={currencyCode} />
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => <OpenStatement customer={row.original} />,
      },
    ],
    [currencyCode],
  )
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows,
    getRowId: getAccountId,
    scope: search.trim(),
  })
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: getAccountId,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
  })
  return (
    <div className="grid min-w-0 gap-3">
      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel="Select all loaded Customers"
        summary={`${count} Customer${count === 1 ? "" : "s"} · they owe you ${formatFinanceMoney(owedMinor, currencyCode)}`}
      />
      {view === "table" ? (
        <SimpleDirectoryTable table={table} label="Customer balances" />
      ) : (
        <DirectoryCollection view={view} label="Customer" cardColumns="md2-lg3">
          {table.getRowModel().rows.map((row) => (
            <DirectoryRecord
              key={row.id}
              row={row}
              view={view}
              selectLabel={`Select ${row.original.name}`}
              title={row.original.name}
              onOpen={() => router.push(statementHref(row.original))}
              description={contact(row.original)}
              badges={<OwingSince customer={row.original} />}
              highlight={
                row.original.owedMinor === undefined
                  ? undefined
                  : {
                      label: "Owes you",
                      value: formatFinanceMoney(
                        row.original.owedMinor,
                        currencyCode,
                      ),
                    }
              }
              details={
                row.original.paidAheadMinor &&
                row.original.paidAheadMinor !== "0"
                  ? [
                      {
                        label: "Paid ahead",
                        value: formatFinanceMoney(
                          row.original.paidAheadMinor,
                          currencyCode,
                        ),
                      },
                    ]
                  : undefined
              }
              actions={<OpenStatement customer={row.original} />}
            />
          ))}
        </DirectoryCollection>
      )}
      <SelectionBar table={table} />
    </div>
  )
}
