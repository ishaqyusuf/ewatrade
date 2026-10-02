"use client"

import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Alert, AlertDescription, AlertTitle, Badge } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"

type Checklist = RouterOutputs["finance"]["periodCloseChecklist"]

const statusLabel = {
  PASS: "Pass",
  BLOCKED: "Blocked",
  REVIEW_REQUIRED: "Review required",
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
          <h4 className="font-medium">Operational close checklist</h4>
          <p className="text-sm text-muted-foreground">
            {new Date(checklist.from).toISOString().slice(0, 10)}–
            {new Date(checklist.through).toISOString().slice(0, 10)} UTC ·{" "}
            {checklist.currencyCode} · snapshot {checklist.snapshotSequence}
          </p>
        </div>
        <Badge variant={canProceed ? "secondary" : "destructive"}>
          {canProceed
            ? "Date lock eligible"
            : checklist.dateLockEligible
              ? "Resolve blockers"
              : "Date lock unavailable"}
        </Badge>
      </div>
      <Alert
        variant={canProceed ? "default" : "destructive"}
        appearance="dashboard"
      >
        <AlertTitle>
          {!checklist.dateLockEligible
            ? "This cutoff is not eligible for a date lock"
            : canProceed
              ? reviewRequired
                ? `${reviewRequired} review${reviewRequired === 1 ? "" : "s"} still required`
                : "Checklist checks pass"
              : `${blocked} blocking check${blocked === 1 ? "" : "s"} need attention`}
        </AlertTitle>
        <AlertDescription>
          A date lock only protects this posting cutoff. The current report
          coverage is{" "}
          {checklist.completeness.toLowerCase().replaceAll("_", " ")}. It does
          not certify fully reconciled business records or complete operational
          reconciliation.
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
                ? `Posted debits ${formatFinanceMoney(checklist.trialBalance.debitMinor, checklist.currencyCode)} · credits ${formatFinanceMoney(checklist.trialBalance.creditMinor, checklist.currencyCode)}.`
                : check.explanation}
            </p>
          </li>
        ))}
      </ul>
      <div className="grid gap-2">
        <h5 className="text-sm font-medium">Cash at the exact cutoff</h5>
        {checklist.cash.length ? (
          <ul className="grid gap-2">
            {checklist.cash.map((row) => (
              <li
                key={row.accountId}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>{row.name}</span>
                <span className="text-muted-foreground">
                  Posted{" "}
                  {formatFinanceMoney(
                    row.closingBalanceMinor,
                    checklist.currencyCode,
                  )}
                  {row.observedBalanceMinor === null
                    ? " · no cutoff count"
                    : ` · counted ${formatFinanceMoney(row.observedBalanceMinor, checklist.currencyCode)}`}
                  {` · ${statusLabel[row.status]}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No posted cash accounts were returned for this Book.
          </p>
        )}
        {!checklist.cashCountCoverageComplete ? (
          <p className="text-sm text-destructive">
            Cash-count coverage exceeds the bounded review limit of{" "}
            {checklist.cashCountReviewLimit}; this list is incomplete.
          </p>
        ) : null}
      </div>
      {checklist.coverageGaps.length ? (
        <div className="grid gap-1">
          <h5 className="text-sm font-medium">Known report coverage gaps</h5>
          <p className="text-sm text-muted-foreground">
            {checklist.coverageGaps.map(sourceGapLabel).join(" · ")}
          </p>
        </div>
      ) : null}
      {checklist.checks.some((check) => check.id === "YEAR_END_EARNINGS") ? (
        <p className="text-sm text-muted-foreground">
          Closing dates does not transfer earnings; year-end retained earnings
          remains a separate workflow.
        </p>
      ) : null}
      {canProceed ? (
        <p className="text-sm text-muted-foreground">
          {reviewRequired
            ? "The listed reviews remain open. A date lock does not mark them complete or waive them."
            : "Operational source coverage remains separate from date-lock eligibility."}
        </p>
      ) : null}
    </section>
  )
}
