"use client"

import type { ServiceCommerceQuoteDecisionFormValues } from "@/components/service-commerce/form-context"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import { useState } from "react"
import { useFormContext } from "react-hook-form"

type ApprovalDetail = RouterOutputs["serviceCommerce"]["quoteApprovalDetail"]

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    currency,
    style: "currency",
  }).format(amount / 100)
}

export function QuoteApprovalForm({
  approval,
  isPending,
  onApprove,
  onReject,
}: {
  approval: ApprovalDetail
  isPending: boolean
  onApprove: (values: ServiceCommerceQuoteDecisionFormValues) => void
  onReject: (values: ServiceCommerceQuoteDecisionFormValues) => void
}) {
  const form = useFormContext<ServiceCommerceQuoteDecisionFormValues>()
  const [confirmation, setConfirmation] = useState<"approve" | "reject" | null>(
    null,
  )

  return (
    <form className="grid gap-5">
      <section className="grid gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Exact Quote Version
            </p>
            <h2 className="font-semibold">Version {approval.version}</h2>
            <p className="text-sm text-muted-foreground">
              {approval.sourceKind.replace("_", " ")} · policy revision{" "}
              {approval.policyRevision}
            </p>
          </div>
          <p className="text-lg font-semibold tabular-nums">
            {money(approval.totalMinor, approval.currencyCode)}
          </p>
        </div>
        {approval.options.map((option) => (
          <div className="rounded-lg border border-border p-4" key={option.id}>
            <div className="flex justify-between gap-3 text-sm font-medium">
              <span>{option.label}</span>
              <span>{money(option.totalMinor, approval.currencyCode)}</span>
            </div>
            <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
              {option.lines.map((line, index) => (
                <li
                  className="flex justify-between gap-3"
                  key={`${line.offeringName}:${index}`}
                >
                  <span>
                    {line.catalogItemName} {line.variantName}
                    {line.quantity ? ` × ${line.quantity}` : ""}
                  </span>
                  <span>{money(line.totalMinor, approval.currencyCode)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Decision reason</span>
        <textarea
          className="min-h-24 rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="Record the commercial reason without customer-sensitive content."
          {...form.register("reason")}
        />
        {form.formState.errors.reason ? (
          <span className="text-destructive" role="alert">
            {form.formState.errors.reason.message}
          </span>
        ) : null}
      </label>

      {confirmation ? (
        <div
          className="grid gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"
          role="alert"
        >
          <p className="text-sm">
            {confirmation === "approve"
              ? "Confirm release of this exact version. It will become customer-visible and its source will move to quoted."
              : "Confirm rejection. This version stays private and a new immutable version is required before another request."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isPending}
              onClick={form.handleSubmit(
                confirmation === "approve" ? onApprove : onReject,
              )}
              type="button"
              variant={confirmation === "approve" ? "default" : "destructive"}
            >
              {isPending
                ? "Saving…"
                : confirmation === "approve"
                  ? "Confirm approval"
                  : "Confirm rejection"}
            </Button>
            <Button
              disabled={isPending}
              onClick={() => setConfirmation(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {approval.actions.canApprove ? (
            <Button onClick={() => setConfirmation("approve")} type="button">
              Approve & release
            </Button>
          ) : null}
          {approval.actions.canReject ? (
            <Button
              onClick={() => setConfirmation("reject")}
              type="button"
              variant="outline"
            >
              Reject version
            </Button>
          ) : null}
          {!approval.actions.canApprove && !approval.actions.canReject ? (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              This decision is no longer available. Refresh the queue or ask an
              active selected approver.
            </p>
          ) : null}
        </div>
      )}
    </form>
  )
}
