"use client"
import {
  formatLedgerDate,
  ledgerBalanceWords,
  ledgerLabels,
} from "@/components/customer-ledger/types"
import type { LedgerEntry } from "@/components/customer-ledger/types"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"

/** Phones: one row per statement line, tap for its details. */
export function CustomerLedgerEntryList({
  entries,
  currencyCode,
  onOpen,
}: {
  entries: LedgerEntry[]
  currencyCode: string
  onOpen: (id: string) => void
}) {
  const money = (minor: string) => formatFinanceMoney(minor, currencyCode)
  return (
    <ul
      aria-label="Statement"
      className="divide-y divide-border overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
    >
      {entries.map((entry) => {
        const label = ledgerLabels[entry.kind] ?? "Entry"
        return (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onOpen(entry.id)}
              className="grid min-h-[64px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 text-left transition-colors hover:bg-[var(--hover)]"
            >
              <span className="truncate text-base font-medium">{label}</span>
              <span className="text-right text-base tabular-nums">
                {entry.side === "CREDIT" ? "− " : ""}
                {money(entry.amountMinor)}
              </span>
              <span className="truncate text-sm text-muted-foreground">
                {formatLedgerDate(entry.effectiveAt)}
                {entry.description && entry.description !== label
                  ? ` · ${entry.description}`
                  : ""}
              </span>
              <span className="text-right text-sm text-muted-foreground tabular-nums">
                {ledgerBalanceWords(entry.runningBalanceMinor, money)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
