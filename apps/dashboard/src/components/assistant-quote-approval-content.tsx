"use client"

import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useId } from "react"

type Detail = RouterOutputs["serviceCommerce"]["assistantQuoteApprovalDetail"]
const label = (value: string) => value.replaceAll("_", " ")
const money = (value: number | null, currency: string) =>
  value === null ? "Not recorded" : formatFinanceMoney(String(value), currency)

export function AssistantQuoteApprovalContent({
  approval,
  checkedAt,
}: { approval: Detail; checkedAt: number }) {
  const reviewId = useId()
  const optionsId = useId()
  return (
    <div className="grid gap-5 text-sm">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="text-lg font-medium">
            Quotation version {approval.version}
          </h3>
          <p className="text-lg font-medium tabular-nums">
            {money(approval.totalMinor, approval.currencyCode)}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-muted-foreground">Stored decision</dt>
            <dd className="font-medium capitalize">{label(approval.status)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Saved policy revision</dt>
            <dd className="font-medium">{approval.policyRevision}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">Requested at (UTC)</dt>
            <dd>
              <time dateTime={new Date(approval.requestedAt).toISOString()}>
                {new Date(approval.requestedAt).toISOString()}
              </time>
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-muted-foreground">Expiry (UTC)</dt>
            <dd>
              {approval.expiresAt ? (
                <time dateTime={new Date(approval.expiresAt).toISOString()}>
                  {new Date(approval.expiresAt).toISOString()}
                </time>
              ) : (
                "No expiry recorded"
              )}
            </dd>
          </div>
        </dl>
      </section>
      <section
        className="grid gap-2 rounded-lg border p-4"
        aria-labelledby={reviewId}
      >
        <h3 id={reviewId} className="font-medium">
          Current eligibility
        </h3>
        <p>
          {approval.currentReview.stale
            ? (approval.currentReview.reason ??
              "The saved version is unavailable for a current decision.")
            : approval.actions.canApprove
              ? "The current actor is eligible for a separate approval review."
              : "Approval is unavailable to the current actor for this saved decision."}
        </p>
        <p className="text-muted-foreground">
          Current eligibility does not change the stored decision. This view
          performs no approval, rejection or release.
        </p>
        <p className="text-xs text-muted-foreground">
          Checked at{" "}
          <time dateTime={new Date(checkedAt).toISOString()}>
            {new Date(checkedAt).toISOString()}
          </time>{" "}
          (UTC).
        </p>
      </section>
      <section className="grid gap-3" aria-labelledby={optionsId}>
        <h3 id={optionsId} className="font-medium">
          Saved offer options
        </h3>
        <p className="text-muted-foreground">
          Each option has its own total. The options are alternatives and their
          totals are not added together.
        </p>
        {approval.options.length ? (
          approval.options.map((option) => (
            <article
              key={option.id}
              className="grid gap-3 rounded-lg border p-4"
            >
              <div className="flex flex-wrap justify-between gap-3">
                <h4 className="font-medium">{option.label}</h4>
                <p className="font-medium tabular-nums">
                  {money(option.totalMinor, approval.currencyCode)}
                </p>
              </div>
              <p className="text-muted-foreground">
                Saved availability: {label(option.availabilityOutcome)}.
              </p>
              <ul className="grid gap-3">
                {option.lines.map((line, index) => (
                  <li
                    key={`${option.id}:${index}`}
                    className="grid gap-1 border-t pt-3"
                  >
                    <p className="font-medium">
                      {line.offeringName ??
                        line.catalogItemName ??
                        "Saved item"}
                      {line.variantName ? ` · ${line.variantName}` : ""}
                    </p>
                    <p className="text-muted-foreground">
                      {label(line.outcome)} · quantity{" "}
                      {line.quantity ?? "not recorded"}
                    </p>
                    <p className="tabular-nums">
                      Unit price{" "}
                      {money(line.unitPriceMinor, approval.currencyCode)} · line
                      total {money(line.totalMinor, approval.currencyCode)}
                    </p>
                  </li>
                ))}
              </ul>
            </article>
          ))
        ) : (
          <p>No saved offer options are recorded for this version.</p>
        )}
      </section>
    </div>
  )
}
