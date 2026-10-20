import {
  type LedgerEntry,
  formatLedgerDate,
  ledgerBalanceWords,
  ledgerLabels,
} from "@/components/customer-ledger/types"
import { type TableColumnMeta, selectColumn } from "@/components/tables/core"
import { Badge, Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { ColumnDef } from "@tanstack/react-table"

/** Column ids stay the stored ones (debit, credit, record) so saved layouts keep working. */
export function customerLedgerColumns(
  currency: string,
  open: (id: string) => void,
): ColumnDef<LedgerEntry>[] {
  const money = (minor: string) => formatFinanceMoney(minor, currency)
  const meta = (
    headerLabel: string,
    extra: Partial<TableColumnMeta> = {},
  ): TableColumnMeta => ({
    headerLabel,
    skeleton: { type: "text", width: "w-24" },
    ...extra,
  })
  return [
    selectColumn(
      (entry) =>
        `${ledgerLabels[entry.kind] ?? "entry"}, ${formatLedgerDate(entry.effectiveAt)}`,
      "Select all",
    ),
    {
      id: "date",
      accessorKey: "effectiveAt",
      header: "Date",
      size: 150,
      enableHiding: false,
      meta: meta("Date", {
        sticky: true,
        reorderable: false,
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-aria-selected:bg-muted/60",
      }),
      cell: ({ row }) => formatLedgerDate(row.original.effectiveAt),
    },
    {
      id: "record",
      accessorKey: "description",
      header: "Details",
      size: 320,
      meta: meta("Details"),
      cell: ({ row }) => {
        const entry = row.original
        const label = ledgerLabels[entry.kind] ?? "Entry"
        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{label}</p>
            {entry.description && entry.description !== label ? (
              <p className="truncate text-xs text-muted-foreground">
                {entry.description}
              </p>
            ) : null}
            {entry.reversalOfId ? (
              <Badge variant="secondary">Undoes an earlier entry</Badge>
            ) : null}
          </div>
        )
      },
    },
    {
      id: "debit",
      header: "Charged",
      size: 150,
      meta: meta("Charged"),
      cell: ({ row }) =>
        row.original.side === "DEBIT" ? (
          <span className="tabular-nums">
            {money(row.original.amountMinor)}
          </span>
        ) : null,
    },
    {
      id: "credit",
      header: "Paid",
      size: 150,
      meta: meta("Paid"),
      cell: ({ row }) =>
        row.original.side === "CREDIT" ? (
          <span className="tabular-nums">
            {money(row.original.amountMinor)}
          </span>
        ) : null,
    },
    {
      id: "balance",
      accessorKey: "runningBalanceMinor",
      header: "Balance",
      size: 190,
      meta: meta("Balance"),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {ledgerBalanceWords(row.original.runningBalanceMinor, money)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Details",
      size: 64,
      enableHiding: false,
      enableResizing: false,
      meta: meta("Details", { sticky: true, reorderable: false }),
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Details for ${ledgerLabels[row.original.kind] ?? "entry"}, ${formatLedgerDate(row.original.effectiveAt)}`}
          onClick={() => open(row.original.id)}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Button>
      ),
    },
  ]
}
