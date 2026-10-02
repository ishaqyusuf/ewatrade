"use client"
import {
  Button,
  ControlField,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FieldGroup,
  FormActions,
  SubmitButton,
  Textarea,
} from "@ewatrade/ui"

import { FormFeedback } from "@/components/forms/form-feedback"
import type { ServiceCommerceQuoteDecisionFormValues } from "@/components/service-commerce/form-context"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

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
  onApprove: (
    values: ServiceCommerceQuoteDecisionFormValues,
  ) => Promise<unknown>
  onReject: (values: ServiceCommerceQuoteDecisionFormValues) => Promise<unknown>
}) {
  const form = useFormContext<ServiceCommerceQuoteDecisionFormValues>()
  const [confirmation, setConfirmation] = useState<"approve" | "reject" | null>(
    null,
  )

  const [submissionError, setSubmissionError] = useState<string | null>(null)

  return (
    <form>
      <FieldGroup className="min-w-0 grid gap-5">
        <section className="grid gap-3 rounded-none border border-border bg-card p-5">
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
            <div
              className="rounded-none border border-border p-4"
              key={option.id}
            >
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

        <FormActions>
          {approval.actions.canApprove ? (
            <Button
              appearance="form"
              type="button"
              onClick={() => {
                setSubmissionError(null)
                setConfirmation("approve")
              }}
            >
              Approve &amp; release
            </Button>
          ) : null}
          {approval.actions.canReject ? (
            <Button
              appearance="form"
              type="button"
              variant="outline"
              onClick={() => {
                setSubmissionError(null)
                setConfirmation("reject")
              }}
            >
              Reject version
            </Button>
          ) : null}
          {!approval.actions.canApprove && !approval.actions.canReject ? (
            <FormFeedback variant="default" appearance="dashboard">
              This decision is no longer available. Refresh the queue or ask an
              active selected approver.
            </FormFeedback>
          ) : null}
        </FormActions>
        <Dialog
          open={confirmation !== null}
          onOpenChange={(open, details) => {
            if (!open && isPending) {
              details.cancel()
              return
            }
            if (!open) setConfirmation(null)
          }}
        >
          <DialogContent className="max-w-[455px] p-4" hideClose={isPending}>
            <DialogHeader>
              <DialogTitle>
                {confirmation === "approve"
                  ? "Approve quote version"
                  : "Reject quote version"}
              </DialogTitle>
              <DialogDescription>
                {confirmation === "approve"
                  ? "Confirm release of this exact version. It will become customer-visible and its source will move to quoted."
                  : "Confirm rejection. This version stays private and a new immutable version is required before another request."}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="mt-4 gap-4">
              <ControlField
                label="Decision reason"
                error={form.formState.errors.reason?.message}
              >
                <Textarea
                  disabled={isPending}
                  placeholder="Record the commercial reason without customer-sensitive content."
                  {...form.register("reason")}
                />
              </ControlField>
              {submissionError ? (
                <FormFeedback appearance="dashboard">
                  {submissionError}
                </FormFeedback>
              ) : null}
              <FormActions>
                <Button
                  appearance="form"
                  disabled={isPending}
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmation(null)}
                >
                  Cancel
                </Button>
                <SubmitButton
                  type="button"
                  isSubmitting={isPending}
                  variant={
                    confirmation === "approve" ? "default" : "destructive"
                  }
                  onClick={form.handleSubmit(async (values) => {
                    if (!confirmation) return
                    setSubmissionError(null)
                    try {
                      await (confirmation === "approve" ? onApprove : onReject)(
                        values,
                      )
                      form.reset()
                      setConfirmation(null)
                    } catch (error) {
                      setSubmissionError(
                        error instanceof Error
                          ? error.message
                          : "The quote decision could not be saved. Try again.",
                      )
                    }
                  })}
                >
                  {confirmation === "approve"
                    ? "Confirm approval"
                    : "Confirm rejection"}
                </SubmitButton>
              </FormActions>
            </FieldGroup>
          </DialogContent>
        </Dialog>
      </FieldGroup>
    </form>
  )
}
