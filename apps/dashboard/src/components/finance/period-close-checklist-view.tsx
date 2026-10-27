"use client"

import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Alert, AlertDescription, AlertTitle, Badge } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { plainDay } from "./review-changes"

type Checklist = RouterOutputs["finance"]["periodCloseChecklist"]

const statusLabel = {
  PASS: "OK",
  BLOCKED: "Fix",
  REVIEW_REQUIRED: "Look at",
} as const

// Plain words for the server's checks, by id; unknown ids keep the server text.
const PLAIN_CHECKS: Record<string, [string, string]> = {
  CONTIGUOUS_DATES: [
    "Follows the last closed date",
    "There's no gap between this and the last time you closed.",
  ],
  POSTED_TRIAL_BALANCE: ["Money in and out adds up", ""],
  POSTED_POSITION_IDENTITY: [
    "What you own equals what you owe plus owner's money",
    "Checked for everything recorded in Finance.",
  ],
  CASH_RECONCILIATION: [
    "Cash counted on the closing date",
    "Count each cash account on the closing date. A missing or different count needs a look.",
  ],
  BANK_RECONCILIATION: [
    "Bank and card money",
    "Check your bank statements are uploaded and every line is matched.",
  ],
  CUSTOMER_RECONCILIATION: [
    "What Customers owe you",
    "Check what each Customer owes and has paid ahead with them.",
  ],
  SUPPLIER_RECONCILIATION: [
    "What you owe Suppliers",
    "Check it against their bills and what you paid ahead.",
  ],
  INVENTORY_RECONCILIATION: [
    "Stock",
    "Stock costs aren't fully linked to Finance yet, so profit may be incomplete.",
  ],
  OPENING_AND_ADJUSTMENTS: [
    "Starting balances",
    "Check the starting balances you added once against your old books.",
  ],
  YEAR_END_EARNINGS: [
    "Profit for the year",
    "Closing a month doesn't move profit into owner's money. That happens at year end.",
  ],
}

function sourceGapLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ")
}

export function FinancePeriodCloseChecklistView({
  checklist,
}: {
  checklist: Checklist
}) {
  const blocked = checklist.checks.filter(
    (check) => check.status === "BLOCKED",
  ).length
  const reviewRequired = checklist.checks.filter(
    (check) => check.status === "REVIEW_REQUIRED",
  ).length
  const canProceed = checklist.dateLockEligible && blocked === 0
  const rank = { BLOCKED: 0, REVIEW_REQUIRED: 1, PASS: 2 } as const
  const open = checklist.checks
    .filter((check) => check.status !== "PASS")
    .sort((a, b) => rank[a.status] - rank[b.status])
  const ok = checklist.checks.filter((check) => check.status === "PASS")
  return (
    <section className="grid gap-4 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-medium">Before you close</h4>
          <p className="text-sm text-muted-foreground">
            {plainDay(new Date(checklist.from).toISOString().slice(0, 10))} –{" "}
            {plainDay(new Date(checklist.through).toISOString().slice(0, 10))}
          </p>
        </div>
        <Badge variant={canProceed ? "secondary" : "destructive"}>
          {canProceed
            ? "Ready to close"
            : checklist.dateLockEligible
              ? "Fix these first"
              : "Can't close yet"}
        </Badge>
      </div>
      <Alert
        variant={canProceed ? "default" : "destructive"}
        appearance="dashboard"
      >
        <AlertTitle>
          {!checklist.dateLockEligible
            ? "You can't close up to this date yet"
            : canProceed
              ? reviewRequired
                ? `${reviewRequired} ${reviewRequired === 1 ? "thing" : "things"} to look at`
                : "All checks are OK"
              : `${blocked} ${blocked === 1 ? "check needs" : "checks need"} fixing first`}
        </AlertTitle>
        <AlertDescription>
          Closing stops anyone changing records up to this date. It doesn't
          prove every naira is accounted for: some sales and stock costs
          aren&apos;t linked to Finance yet.
        </AlertDescription>
      </Alert>
      {/* Exceptions first: what needs fixing or a look, then the OK checks folded away. */}
      <ul className="grid gap-3">
        {open.map((check) => (
          <CheckRow key={check.id} check={check} checklist={checklist} />
        ))}
      </ul>
      {ok.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {ok.length} {ok.length === 1 ? "check is" : "checks are"} OK
          </summary>
          <ul className="mt-3 grid gap-3">
            {ok.map((check) => (
              <CheckRow key={check.id} check={check} checklist={checklist} />
            ))}
          </ul>
        </details>
      ) : null}
      <div className="grid gap-2">
        <h5 className="text-sm font-medium">Cash on the closing date</h5>
        {checklist.cash.length ? (
          <ul className="grid gap-2">
            {checklist.cash.map((row) => (
              <li
                key={row.accountId}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>{row.name}</span>
                <span className="text-muted-foreground">
                  Your records{" "}
                  {formatFinanceMoney(
                    row.closingBalanceMinor,
                    checklist.currencyCode,
                  )}
                  {row.observedBalanceMinor === null
                    ? " · not counted"
                    : ` · counted ${formatFinanceMoney(row.observedBalanceMinor, checklist.currencyCode)}`}
                  {` · ${statusLabel[row.status]}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No cash accounts found.
          </p>
        )}
        {!checklist.cashCountCoverageComplete ? (
          <p className="text-sm text-destructive">
            There are more cash counts than we can check here (limit{" "}
            {checklist.cashCountReviewLimit}), so this list is incomplete.
          </p>
        ) : null}
      </div>
      {checklist.coverageGaps.length ? (
        <div className="grid gap-1">
          <h5 className="text-sm font-medium">
            What your reports don't cover yet
          </h5>
          <p className="text-sm text-muted-foreground">
            {checklist.coverageGaps.map(sourceGapLabel).join(" · ")}
          </p>
        </div>
      ) : null}
      {checklist.checks.some((check) => check.id === "YEAR_END_EARNINGS") ? (
        <p className="text-sm text-muted-foreground">
          Closing a month doesn't close the year's profit. That is a separate
          step.
        </p>
      ) : null}
      {canProceed ? (
        <p className="text-sm text-muted-foreground">
          {reviewRequired
            ? "These items stay open. Closing doesn't mark them done."
            : "Closing doesn't check every sale or stock record."}
        </p>
      ) : null}
    </section>
  )
}

function CheckRow({
  check,
  checklist,
}: {
  check: Checklist["checks"][number]
  checklist: Checklist
}) {
  return (
    <li className="grid gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {PLAIN_CHECKS[check.id]?.[0] ?? check.label}
        </span>
        <Badge
          variant={
            check.status === "BLOCKED"
              ? "destructive"
              : check.status === "PASS"
                ? "secondary"
                : "outline"
          }
        >
          {statusLabel[check.status]}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {check.id === "POSTED_TRIAL_BALANCE"
          ? `Money in and out adds up: ${formatFinanceMoney(checklist.trialBalance.debitMinor, checklist.currencyCode)} each way.`
          : PLAIN_CHECKS[check.id]?.[1] || check.explanation}
      </p>
      {check.id === "INVENTORY_RECONCILIATION" ? (
        <StockValueToday bookId={checklist.bookId} />
      ) : null}
      {check.id === "OPENING_AND_ADJUSTMENTS" ? (
        <StartingBalancesToday bookId={checklist.bookId} />
      ) : null}
    </li>
  )
}

const OPENING_SOURCE_WORDS: Record<string, string> = {
  OPENING_BALANCE: "money accounts",
  CUSTOMER_LEDGER_OPENING: "Customers",
  CUSTOMER_LEDGER_REVERSAL: "undone Customer balances",
  SUPPLIER_OPENING_PAYABLE: "what you owed Suppliers",
  SUPPLIER_OPENING_ADVANCE: "Supplier prepayments",
  SUPPLIER_ENTRY_REVERSAL: "undone Supplier balances",
}

/** What makes up opening equity today, and what can't be in it yet. */
function StartingBalancesToday({ bookId }: { bookId: string }) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.finance.openingEquityReconciliation.queryOptions(
      { bookId },
      { retry: false },
    ),
  )
  if (!query.data)
    return query.isError ? (
      <p className="text-sm text-muted-foreground">
        Starting balances couldn&apos;t load.
      </p>
    ) : null
  const r = query.data
  const money = (minor: string) => formatFinanceMoney(minor, r.currencyCode)
  const parts = r.sources.map(
    (row) =>
      `${OPENING_SOURCE_WORDS[row.sourceKind] ?? row.sourceKind.toLowerCase().replaceAll("_", " ")} ${money(row.netMinor)}`,
  )
  const stock = r.openingStock
  return (
    <div className="grid gap-1 text-sm text-muted-foreground">
      <p>
        Starting balances add up to {money(r.openingEquityMinor)}
        {parts.length ? `: ${parts.join(", ")}.` : "."}
      </p>
      {stock.knownCount || stock.unknownCostCount ? (
        <p>
          {stock.knownCount
            ? `Starting stock worth ${money(stock.knownValueMinor)} isn't in these balances yet.`
            : ""}
          {stock.unknownCostCount
            ? ` ${stock.unknownCostCount} starting stock ${stock.unknownCostCount === 1 ? "item has" : "items have"} no known cost.`
            : ""}
        </p>
      ) : null}
      {r.unexpectedSourceKinds.length ? (
        <p>Other records also changed starting balances. Look at them.</p>
      ) : null}
      <p>
        Equipment, loans, tax, prepayments and bills you owe can&apos;t be added
        as starting balances yet.
      </p>
    </div>
  )
}

/** Today's stock pool value against the Inventory account (not at the cutoff). */
function StockValueToday({ bookId }: { bookId: string }) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.finance.inventoryReconciliation.queryOptions(
      { bookId },
      { retry: false },
    ),
  )
  if (!query.data)
    return query.isError ? (
      <p className="text-sm text-muted-foreground">
        Today&apos;s stock value couldn&apos;t load.
      </p>
    ) : null
  const r = query.data
  const money = (minor: string) => formatFinanceMoney(minor, r.currencyCode)
  const notes = [
    r.differenceMinor !== "0"
      ? `Difference ${money(r.differenceMinor)}.`
      : null,
    r.pools.unknownCount
      ? `${r.pools.unknownCount} ${r.pools.unknownCount === 1 ? "item has" : "items have"} no known cost.`
      : null,
    r.uncoveredStockCount
      ? `${r.uncoveredStockCount} ${r.uncoveredStockCount === 1 ? "item in stock was" : "items in stock were"} never valued.`
      : null,
    r.ledger.inTransitMinor !== "0"
      ? `${money(r.ledger.inTransitMinor)} of goods are on the way.`
      : null,
  ].filter(Boolean)
  return (
    <p className="text-sm text-muted-foreground">
      Today: stock is valued at {money(r.pools.knownValueMinor)} and the
      Inventory account shows {money(r.ledger.onHandMinor)}.
      {notes.length ? ` ${notes.join(" ")}` : " They match."}
    </p>
  )
}
