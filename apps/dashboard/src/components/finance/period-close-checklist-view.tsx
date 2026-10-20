"use client"

import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Alert, AlertDescription, AlertTitle, Badge } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"

type Checklist = RouterOutputs["finance"]["periodCloseChecklist"]

const statusLabel = {
  PASS: "OK",
  BLOCKED: "Fix",
  REVIEW_REQUIRED: "Look at",
} as const

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
  return (
    <section className="grid gap-4 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-medium">Before you close</h4>
          <p className="text-sm text-muted-foreground">
            {new Date(checklist.from).toISOString().slice(0, 10)}–
            {new Date(checklist.through).toISOString().slice(0, 10)} ·{" "}
            {checklist.currencyCode}
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
          prove every naira is accounted for. Your reports are{" "}
          {checklist.completeness.toLowerCase().replaceAll("_", " ")}.
        </AlertDescription>
      </Alert>
      <ul className="grid gap-3">
        {checklist.checks.map((check) => (
          <li
            key={check.id}
            className="grid gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{check.label}</span>
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
                ? `Debits ${formatFinanceMoney(checklist.trialBalance.debitMinor, checklist.currencyCode)} · credits ${formatFinanceMoney(checklist.trialBalance.creditMinor, checklist.currencyCode)}.`
                : check.explanation}
            </p>
          </li>
        ))}
      </ul>
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
