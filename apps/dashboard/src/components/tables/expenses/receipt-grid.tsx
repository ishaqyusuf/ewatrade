"use client"

import type { FinanceBillRow } from "@/components/finance/types"
import { RowSelectCheckbox } from "@/components/tables/core"
import { cn } from "@/utils"
import { Button } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { File01Icon, FileRemoveIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { Row } from "@tanstack/react-table"
import { ExpenseStatusPill, formatExpenseDate } from "./columns"

/**
 * Finance pages workshop 01 Spending grid: receipt first, fixed 4 / 3 / 2 / 1
 * columns. Receipt image previews arrive with private thumbnails (ADR-0051);
 * until then each card shows whether a receipt is attached.
 */
export function ExpenseReceiptGrid({
  rows,
  timezone,
  currency,
  onOpen,
}: {
  rows: Row<FinanceBillRow>[]
  timezone: string
  currency: string
  onOpen: (billId: string) => void
}) {
  return (
    <ul
      aria-label="Expense grid"
      className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {rows.map((row) => (
        <li key={row.id} className="min-w-0">
          <ExpenseReceiptCard
            row={row}
            timezone={timezone}
            currency={currency}
            onOpen={onOpen}
          />
        </li>
      ))}
    </ul>
  )
}

function ExpenseReceiptCard({
  row,
  timezone,
  currency,
  onOpen,
}: {
  row: Row<FinanceBillRow>
  timezone: string
  currency: string
  onOpen: (billId: string) => void
}) {
  const bill = row.original
  const owed = bill.status !== "VOID" && bill.outstandingMinor !== "0"
  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden border border-border bg-background",
        row.getIsSelected() && "ring-2 ring-primary",
      )}
    >
      <div className="relative aspect-[4/3] bg-muted">
        <ReceiptPreview bill={bill} />
        <span className="absolute top-2.5 left-2.5 grid border border-border bg-background p-1">
          <RowSelectCheckbox row={row} label={`Select ${bill.description}`} />
        </span>
      </div>
      <div className="grid flex-1 content-start gap-1 px-4 pt-3.5 pb-3">
        <button
          type="button"
          className="truncate text-left font-medium underline-offset-4 hover:underline focus-visible:underline"
          onClick={() => onOpen(bill.id)}
        >
          {bill.description}
        </button>
        <span className="truncate text-[13px] text-muted-foreground">
          {bill.payeeName} · {formatExpenseDate(bill.incurredAt, timezone)}
        </span>
        <span className="mt-2.5 text-xl font-semibold tabular-nums">
          {formatFinanceMoney(bill.totalMinor, currency)}
        </span>
        <span>
          <ExpenseStatusPill status={bill.status} />
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2 text-[13px] text-muted-foreground">
        <span>
          {bill.status === "VOID"
            ? "Cancelled"
            : owed
              ? `Still to pay ${formatFinanceMoney(bill.outstandingMinor, currency)}`
              : "Paid in full"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-none"
          aria-label={`View expense ${bill.description}`}
          onClick={() => onOpen(bill.id)}
        >
          View
        </Button>
      </div>
    </article>
  )
}

function ReceiptPreview({ bill }: { bill: FinanceBillRow }) {
  const attached = bill.receiptCount > 0
  return (
    <span
      className={cn(
        "grid size-full place-content-center justify-items-center gap-1.5 text-[13px]",
        attached || bill.status === "VOID"
          ? "text-muted-foreground"
          : "text-amber-700 dark:text-amber-300",
      )}
    >
      <HugeiconsIcon
        icon={attached ? File01Icon : FileRemoveIcon}
        className="size-7"
        aria-hidden="true"
      />
      {attached
        ? "Receipt attached"
        : bill.status === "VOID"
          ? "No receipt"
          : "No receipt yet"}
    </span>
  )
}
