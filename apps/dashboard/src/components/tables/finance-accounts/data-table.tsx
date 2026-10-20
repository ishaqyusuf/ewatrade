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
import { Badge, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  type MoneyAccountPurpose,
  ORDER_PAYMENT_METHOD_LABELS,
  moneyAccountPaymentMethods,
} from "@ewatrade/utils/finance-payment-methods"
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
  /** Money in and out since the 1st of this month (UTC); asset accounts only. */
  monthDebitMinor?: string
  monthCreditMinor?: string
  paymentMethods: string[]
  paymentsPausedAt: Date | string | null
}

function PaymentMethodsTaken({ account }: { account: MoneyAccountRow }) {
  const methods = moneyAccountPaymentMethods({
    purpose: account.purpose as MoneyAccountPurpose,
    paymentMethods: account.paymentMethods,
  })
  return (
    <div className="flex flex-wrap gap-1">
      {methods.map((method) => (
        <Badge key={method} variant="outline">
          {ORDER_PAYMENT_METHOD_LABELS[method]}
        </Badge>
      ))}
    </div>
  )
}

function PausedBadge({ account }: { account: MoneyAccountRow }) {
  return account.paymentsPausedAt ? (
    <Badge variant="secondary">Paused</Badge>
  ) : null
}

const getAccountId = (account: MoneyAccountRow) => account.id

export function moneyAccountPurposeLabel(purpose: string) {
  return purpose === "CLEARING"
    ? "Card and POS money on its way"
    : purpose === "CASH"
      ? "Cash"
      : "Bank"
}

function AccountActions({
  account,
  onOpenPaymentSettings,
}: {
  account: MoneyAccountRow
  onOpenPaymentSettings: (accountId: string) => void
}) {
  return (
    <Button
      variant="outline"
      aria-label={`${account.name} payment settings`}
      onClick={() => onOpenPaymentSettings(account.id)}
    >
      Payment settings
    </Button>
  )
}

export function MoneyAccountsDataTable({
  accounts,
  currencyCode,
  bookId,
  view,
  onOpenStatement,
  onOpenPaymentSettings,
}: {
  accounts: MoneyAccountRow[]
  currencyCode: string
  bookId: string
  view: DirectoryView
  onOpenStatement: (accountId: string) => void
  onOpenPaymentSettings: (accountId: string) => void
}) {
  const columns = useMemo<ColumnDef<MoneyAccountRow>[]>(
    () => [
      selectColumn((account) => account.name, "Select all money accounts"),
      {
        id: "name",
        header: "Account",
        cell: ({ row }) => (
          <div className="min-w-40">
            <p className="flex items-center gap-2">
              <button
                type="button"
                className="text-left font-medium underline-offset-4 hover:underline focus-visible:underline"
                aria-label={`${row.original.name}: money in and out`}
                onClick={() => onOpenStatement(row.original.id)}
              >
                {row.original.name}
              </button>
              <PausedBadge account={row.original} />
            </p>
            <p className="text-xs text-muted-foreground">
              {moneyAccountPurposeLabel(row.original.purpose)}
            </p>
          </div>
        ),
      },
      {
        id: "takes",
        header: "Takes",
        cell: ({ row }) => <PaymentMethodsTaken account={row.original} />,
      },
      {
        id: "moneyIn",
        header: () => <span className="block text-right">In this month</span>,
        cell: ({ row }) => (
          <p className="text-right tabular-nums">
            {formatFinanceMoney(
              row.original.monthDebitMinor ?? "0",
              currencyCode,
            )}
          </p>
        ),
      },
      {
        id: "moneyOut",
        header: () => <span className="block text-right">Out this month</span>,
        cell: ({ row }) => (
          <p className="text-right tabular-nums">
            {formatFinanceMoney(
              row.original.monthCreditMinor ?? "0",
              currencyCode,
            )}
          </p>
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
        header: "Actions",
        cell: ({ row }) => (
          <AccountActions
            account={row.original}
            onOpenPaymentSettings={onOpenPaymentSettings}
          />
        ),
      },
    ],
    [currencyCode, onOpenStatement, onOpenPaymentSettings],
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
        summary={`${accounts.length} money account${accounts.length === 1 ? "" : "s"} · ${formatFinanceMoney(
          accounts
            .reduce(
              (total, account) => total + BigInt(account.balanceMinor),
              0n,
            )
            .toString(),
          currencyCode,
        )} in total`}
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
              description={
                <span className="grid gap-2">
                  {moneyAccountPurposeLabel(row.original.purpose)}
                  <PaymentMethodsTaken account={row.original} />
                </span>
              }
              badges={<PausedBadge account={row.original} />}
              highlight={{
                label: "Balance",
                value: formatFinanceMoney(
                  row.original.balanceMinor,
                  currencyCode,
                ),
              }}
              details={[
                {
                  label: "Money in this month",
                  value: formatFinanceMoney(
                    row.original.monthDebitMinor ?? "0",
                    currencyCode,
                  ),
                },
                {
                  label: "Money out this month",
                  value: formatFinanceMoney(
                    row.original.monthCreditMinor ?? "0",
                    currencyCode,
                  ),
                },
              ]}
              actions={
                <AccountActions
                  account={row.original}
                  onOpenPaymentSettings={onOpenPaymentSettings}
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
