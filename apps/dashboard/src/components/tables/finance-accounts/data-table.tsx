"use client"

import { spacedAccountNumber } from "@/components/business-banking/business-banking-model"
import { FinanceRow, FinanceRowList } from "@/components/finance/finance-rows"
import {
  DirectoryCollection,
  DirectoryRecord,
  SimpleDirectoryTable,
} from "@/components/tables/core"
import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import {
  type MoneyAccountPurpose,
  ORDER_PAYMENT_METHOD_LABELS,
  moneyAccountPaymentMethods,
} from "@ewatrade/utils/finance-payment-methods"
import { MoreHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useMemo } from "react"
import { moneyAccountPurposeLabel } from "./purpose-label"

export { moneyAccountPurposeLabel } from "./purpose-label"

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
  /** A BANK account that is a mobile money wallet. */
  mobileMoney?: boolean
  /** Present on BANK accounts the Owner/Admin may give payment-link details. */
  bankDetails?: {
    bankName: string | null
    accountNumber: string | null
    accountHolder: string | null
  }
}

/** "GTBank · 012 345 6789 · MAMA ADA LTD" under a bank account's name. */
function BankDetailsLine({ account }: { account: MoneyAccountRow }) {
  const bank = account.bankDetails
  if (!bank?.bankName || !bank.accountNumber || !bank.accountHolder) return null
  return (
    <p className="text-sm text-muted-foreground">
      {bank.bankName} · {spacedAccountNumber(bank.accountNumber)} ·{" "}
      {bank.accountHolder}
    </p>
  )
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

/** One menu per account: payment settings and, for banks, bank details. */
function AccountActions({
  account,
  onOpenPaymentSettings,
  onOpenBankDetails,
}: {
  account: MoneyAccountRow
  onOpenPaymentSettings: (accountId: string) => void
  onOpenBankDetails?: (accountId: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Options for ${account.name}`}
          />
        }
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent appearance="dashboard" align="end">
        <DropdownMenuItem onClick={() => onOpenPaymentSettings(account.id)}>
          Payment settings
        </DropdownMenuItem>
        {onOpenBankDetails && account.bankDetails ? (
          <DropdownMenuItem onClick={() => onOpenBankDetails(account.id)}>
            {account.bankDetails.accountNumber
              ? "Bank details"
              : "Add bank details"}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function MoneyAccountsDataTable({
  accounts,
  currencyCode,
  view,
  onOpenStatement,
  onOpenPaymentSettings,
  onOpenBankDetails,
}: {
  accounts: MoneyAccountRow[]
  currencyCode: string
  bookId: string
  view: DirectoryView
  onOpenStatement: (accountId: string) => void
  onOpenPaymentSettings: (accountId: string) => void
  onOpenBankDetails?: (accountId: string) => void
}) {
  const columns = useMemo<ColumnDef<MoneyAccountRow>[]>(
    () => [
      {
        id: "name",
        header: "Account",
        cell: ({ row }) => (
          <div className="min-w-40">
            <p className="flex items-center gap-2">
              <span className="font-medium">{row.original.name}</span>
              <PausedBadge account={row.original} />
            </p>
            <p className="text-sm text-muted-foreground">
              {moneyAccountPurposeLabel(
                row.original.purpose,
                row.original.mobileMoney,
              )}
            </p>
            <BankDetailsLine account={row.original} />
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
          <p className="text-right font-semibold tabular-nums">
            {formatFinanceMoney(row.original.balanceMinor, currencyCode)}
          </p>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Options</span>,
        cell: ({ row }) => (
          <AccountActions
            account={row.original}
            onOpenPaymentSettings={onOpenPaymentSettings}
            onOpenBankDetails={onOpenBankDetails}
          />
        ),
      },
    ],
    [currencyCode, onOpenPaymentSettings, onOpenBankDetails],
  )
  const table = useReactTable({
    data: accounts,
    columns,
    getRowId: getAccountId,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: false,
  })
  const total = formatFinanceMoney(
    accounts
      .reduce((sum, account) => sum + BigInt(account.balanceMinor), 0n)
      .toString(),
    currencyCode,
  )
  return (
    <div className="grid min-w-0 gap-3">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-muted-foreground">
          {accounts.length} account{accounts.length === 1 ? "" : "s"}
        </span>
        <span className="text-xl font-semibold tabular-nums">{total}</span>
      </p>
      <FinanceRowList label="Money accounts" className="md:hidden">
        {accounts.map((account) => (
          <FinanceRow
            key={account.id}
            title={account.name}
            subtitle={moneyAccountPurposeLabel(
              account.purpose,
              account.mobileMoney,
            )}
            amount={formatFinanceMoney(account.balanceMinor, currencyCode)}
            aside={<PausedBadge account={account} />}
            onOpen={() => onOpenStatement(account.id)}
          />
        ))}
      </FinanceRowList>
      {view === "table" ? (
        <div className="max-md:hidden">
          <SimpleDirectoryTable
            table={table}
            label="Money accounts"
            onRowOpen={(row) => onOpenStatement(row.original.id)}
          />
        </div>
      ) : (
        <div className="max-md:hidden">
          <DirectoryCollection
            view={view}
            label="Money account"
            cardColumns="md2-lg3"
          >
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
                    {moneyAccountPurposeLabel(
                      row.original.purpose,
                      row.original.mobileMoney,
                    )}
                    <BankDetailsLine account={row.original} />
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
                    onOpenBankDetails={onOpenBankDetails}
                  />
                }
              />
            ))}
          </DirectoryCollection>
        </div>
      )}
    </div>
  )
}
