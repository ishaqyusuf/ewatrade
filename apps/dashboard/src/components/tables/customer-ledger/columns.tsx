import {
  type LedgerEntry,
  ledgerLabels,
} from "@/components/customer-ledger/types"
import { type TableColumnMeta, selectColumn } from "@/components/tables/core"
import { Badge, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { ColumnDef } from "@tanstack/react-table"
export function customerLedgerColumns(
  currency: string,
  open: (id: string) => void,
): ColumnDef<LedgerEntry>[] {
  const amount = (side: string, entry: LedgerEntry) =>
    formatFinanceMoney(entry.side === side ? entry.amountMinor : "0", currency)
  const meta = (
    headerLabel: string,
    extra: Partial<TableColumnMeta> = {},
  ): TableColumnMeta => ({
    headerLabel,
    skeleton: { type: "text", width: "w-24" },
    ...extra,
  })
  return [
    selectColumn((entry) => `statement entry ${entry.sequence}`),
    {
      id: "date",
      accessorKey: "effectiveAt",
      header: "Date (UTC)",
      size: 170,
      enableHiding: false,
      meta: meta("Date (UTC)", {
        sticky: true,
        reorderable: false,
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-focus-visible:bg-muted/40 group-aria-selected:bg-muted/60",
      }),
      cell: ({ row }) =>
        new Date(row.original.effectiveAt).toISOString().slice(0, 10),
    },
    {
      id: "record",
      accessorKey: "description",
      header: "Record",
      size: 320,
      meta: meta("Record"),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate">{row.original.description}</p>
          <p className="text-xs text-muted-foreground">
            {ledgerLabels[row.original.kind] ?? row.original.kind} · #
            {row.original.sequence}
          </p>
          {row.original.reversalOfId ? (
            <Badge variant="secondary">Correction</Badge>
          ) : null}
        </div>
      ),
    },
    {
      id: "debit",
      header: "Debit",
      size: 170,
      meta: meta("Debit"),
      cell: ({ row }) => (
        <span className="tabular-nums">{amount("DEBIT", row.original)}</span>
      ),
    },
    {
      id: "credit",
      header: "Credit",
      size: 170,
      meta: meta("Credit"),
      cell: ({ row }) => (
        <span className="tabular-nums">{amount("CREDIT", row.original)}</span>
      ),
    },
    {
      id: "balance",
      accessorKey: "runningBalanceMinor",
      header: "Running net balance",
      size: 210,
      meta: meta("Running net balance"),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatFinanceMoney(row.original.runningBalanceMinor, currency)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      size: 96,
      enableHiding: false,
      enableResizing: false,
      meta: meta("Actions", { sticky: true, reorderable: false }),
      cell: ({ row }) => (
        <Button
          variant="ghost"
          aria-label={`View entry ${row.original.sequence}`}
          onClick={() => open(row.original.id)}
        >
          View
        </Button>
      ),
    },
  ]
}
