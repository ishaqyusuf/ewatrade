"use client"

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
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import Link from "next/link"

export type CustomerAccount =
  RouterOutputs["customers"]["listPage"]["items"][number]

const getAccountId = (customer: CustomerAccount) => customer.id
const contact = (customer: CustomerAccount) =>
  customer.phone ?? customer.email ?? "Saved customer"

function StatementLink({ customer }: { customer: CustomerAccount }) {
  return (
    <Link
      className="shrink-0 text-sm underline"
      href={`/customers/${encodeURIComponent(customer.id)}/statement`}
      aria-label={`View statement for ${customer.name}`}
    >
      View statement
    </Link>
  )
}

const columns: ColumnDef<CustomerAccount>[] = [
  selectColumn((customer) => customer.name, "Select all loaded customers"),
  {
    id: "name",
    header: "Customer",
    cell: ({ row }) => (
      <div className="min-w-48">
        <p className="font-medium">{row.original.name}</p>
        <p className="text-sm text-muted-foreground">{contact(row.original)}</p>
      </div>
    ),
  },
  {
    id: "actions",
    header: "Statement",
    cell: ({ row }) => <StatementLink customer={row.original} />,
  },
]

export function CustomerAccountsDataTable({
  rows,
  view,
  search,
}: {
  rows: CustomerAccount[]
  view: DirectoryView
  search: string
}) {
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
        selectAllLabel="Select all loaded customers"
        summary={`${rows.length} saved customers on this page`}
      />
      {view === "table" ? (
        <SimpleDirectoryTable table={table} label="Saved customers" />
      ) : (
        <DirectoryCollection view={view} label="Saved customer">
          {table.getRowModel().rows.map((row) => (
            <DirectoryRecord
              key={row.id}
              row={row}
              view={view}
              selectLabel={`Select ${row.original.name}`}
              title={row.original.name}
              description={contact(row.original)}
              actions={<StatementLink customer={row.original} />}
            />
          ))}
        </DirectoryCollection>
      )}
      <SelectionBar table={table} />
    </div>
  )
}
