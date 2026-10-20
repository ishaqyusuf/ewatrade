"use client"
import {
  formatFinanceDate,
  formatFinanceShortDate,
} from "@/components/finance/format-date"
import { Pill } from "@/components/orders/overview/order-overview-parts"

import type {
  FinanceBankStatementRow,
  FinanceBook,
} from "@/components/finance/types"
import { type TableColumnMeta, selectColumn } from "@/components/tables/core"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { ColumnDef } from "@tanstack/react-table"

export function getStatementAccountName(
  book: Pick<FinanceBook, "accounts"> | null,
  statement: FinanceBankStatementRow,
) {
  return (
    book?.accounts.find((account) => account.id === statement.accountId)
      ?.name ?? "Bank account"
  )
}

export function formatStatementRange(statement: FinanceBankStatementRow) {
  return `${formatFinanceShortDate(statement.startsAt, "UTC")} – ${formatFinanceDate(statement.endsAt, "UTC")}`
}

/** Lines still to match are amber; a fully matched statement is green. */
export function StatementMatchPill({
  statement,
}: {
  statement: FinanceBankStatementRow
}) {
  return statement.unmatchedCount ? (
    <Pill tone="amber">{statement.unmatchedCount} to match</Pill>
  ) : (
    <Pill tone="green">All matched</Pill>
  )
}

export function financeBankStatementColumns(
  book: Pick<FinanceBook, "accounts" | "currencyCode"> | null,
  openStatement: (id: string) => void,
): ColumnDef<FinanceBankStatementRow>[] {
  return [
    selectColumn((statement) => statement.reference),
    {
      accessorKey: "reference",
      header: "Statement",
      size: 240,
      minSize: 180,
      maxSize: 420,
      enableHiding: false,
      meta: {
        headerLabel: "Statement",
        sticky: true,
        reorderable: false,
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-aria-selected:bg-muted/60 md:sticky",
        skeleton: { type: "text", width: "w-40" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => (
        <span className="truncate">{row.original.reference}</span>
      ),
    },
    {
      accessorKey: "accountId",
      header: "Account",
      size: 220,
      minSize: 140,
      maxSize: 320,
      meta: {
        headerLabel: "Account",
        skeleton: { type: "text", width: "w-32" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => (
        <span className="truncate">
          {getStatementAccountName(book, row.original)}
        </span>
      ),
    },
    {
      id: "range",
      header: "Dates",
      size: 240,
      minSize: 200,
      maxSize: 300,
      meta: {
        headerLabel: "Dates",
        skeleton: { type: "text", width: "w-40" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {formatStatementRange(row.original)}
        </span>
      ),
    },
    {
      accessorKey: "rowCount",
      header: "Lines",
      size: 120,
      minSize: 110,
      maxSize: 160,
      meta: {
        headerLabel: "Lines",
        skeleton: { type: "text", width: "w-12" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.rowCount}</span>
      ),
    },
    {
      id: "toMatch",
      header: "To match",
      size: 140,
      minSize: 120,
      maxSize: 180,
      meta: {
        headerLabel: "To match",
        skeleton: { type: "badge", width: "w-20" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => <StatementMatchPill statement={row.original} />,
    },
    {
      accessorKey: "closingBalanceMinor",
      header: "Balance at the end",
      size: 200,
      minSize: 160,
      maxSize: 280,
      meta: {
        headerLabel: "Balance at the end",
        skeleton: { type: "text", width: "w-28" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatFinanceMoney(
            row.original.closingBalanceMinor,
            row.original.currencyCode,
          )}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      size: 96,
      minSize: 96,
      maxSize: 96,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerLabel: "Actions",
        sticky: true,
        reorderable: false,
        className: "z-20 border-l bg-background md:sticky",
        skeleton: { type: "icon" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => (
        <Button
          type="button"
          data-row-interactive="true"
          variant="ghost"
          size="sm"
          aria-label={`Open ${row.original.reference}`}
          onClick={() => openStatement(row.original.id)}
        >
          Open
        </Button>
      ),
    },
  ]
}
