"use client"

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
  return `${new Date(statement.startsAt).toISOString().slice(0, 10)} – ${new Date(statement.endsAt).toISOString().slice(0, 10)}`
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
          "z-20 bg-background group-hover:bg-muted/40 group-focus-visible:bg-muted/40 group-aria-selected:bg-muted/60 md:sticky",
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
      header: "Statement dates",
      size: 240,
      minSize: 200,
      maxSize: 300,
      meta: {
        headerLabel: "Statement dates",
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
      header: "Transactions",
      size: 120,
      minSize: 110,
      maxSize: 160,
      meta: {
        headerLabel: "Transactions",
        skeleton: { type: "text", width: "w-12" },
      } satisfies TableColumnMeta,
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.rowCount}</span>
      ),
    },
    {
      accessorKey: "closingBalanceMinor",
      header: "Closing balance",
      size: 200,
      minSize: 160,
      maxSize: 280,
      meta: {
        headerLabel: "Closing balance",
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
          aria-label={`Review ${row.original.reference}`}
          onClick={() => openStatement(row.original.id)}
        >
          Review
        </Button>
      ),
    },
  ]
}
