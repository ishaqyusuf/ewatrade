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
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useMemo } from "react"

export type MoneyAccountRow = {
  id: string
  name: string
  purpose: string
  balanceMinor: string
}

const getAccountId = (account: MoneyAccountRow) => account.id

export function moneyAccountPurposeLabel(purpose: string) {
  return purpose === "CLEARING"
    ? "Awaiting settlement"
    : purpose === "CASH"
      ? "Cash"
      : "Bank"
}

function StatementButton({
  account,
  onOpen,
}: {
  account: MoneyAccountRow
  onOpen: (accountId: string) => void
}) {
  return (
    <Button
      appearance="form"
      variant="outline"
      aria-label={`View ${account.name} statement`}
      onClick={() => onOpen(account.id)}
    >
      View statement
    </Button>
  )
}

export function MoneyAccountsDataTable({
  accounts,
  currencyCode,
  bookId,
  view,
  onOpenStatement,
}: {
  accounts: MoneyAccountRow[]
  currencyCode: string
  bookId: string
  view: DirectoryView
  onOpenStatement: (accountId: string) => void
}) {
  const columns = useMemo<ColumnDef<MoneyAccountRow>[]>(
    () => [
      selectColumn((account) => account.name, "Select all money accounts"),
      {
        id: "name",
        header: "Account",
        cell: ({ row }) => (
          <div className="min-w-40">
            <p className="font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">
              {moneyAccountPurposeLabel(row.original.purpose)}
            </p>
          </div>
        ),
      },
      {
        id: "balance",
        header: () => <span className="block text-right">Balance</span>,
        cell: ({ row }) => (
          <p className="text-right text-lg font-medium tabular-nums">
            {formatFinanceMoney(row.original.balanceMinor, currencyCode)}
          </p>
        ),
      },
      {
        id: "actions",
        header: "Statement",
        cell: ({ row }) => (
          <StatementButton account={row.original} onOpen={onOpenStatement} />
        ),
      },
    ],
    [currencyCode, onOpenStatement],
  )
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows: accounts,
    getRowId: getAccountId,
    scope: bookId,
  })
  const table = useReactTable({
    data: accounts,
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
        selectAllLabel="Select all money accounts"
        summary={`${accounts.length} money account${accounts.length === 1 ? "" : "s"}`}
      />
      {view === "table" ? (
        <SimpleDirectoryTable table={table} label="Money accounts" />
      ) : (
        <DirectoryCollection view={view} label="Money account">
          {table.getRowModel().rows.map((row) => (
            <DirectoryRecord
              key={row.id}
              row={row}
              view={view}
              selectLabel={`Select ${row.original.name}`}
              title={row.original.name}
              onOpen={() => onOpenStatement(row.original.id)}
              description={moneyAccountPurposeLabel(row.original.purpose)}
              highlight={{
                label: "Balance",
                value: formatFinanceMoney(
                  row.original.balanceMinor,
                  currencyCode,
                ),
              }}
              actions={
                <StatementButton
                  account={row.original}
                  onOpen={onOpenStatement}
                />
              }
            />
          ))}
        </DirectoryCollection>
      )}
      <SelectionBar table={table} />
    </div>
  )
}
