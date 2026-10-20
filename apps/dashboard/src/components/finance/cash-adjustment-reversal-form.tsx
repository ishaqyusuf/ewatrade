"use client"
import { Button, FieldGroup, FormActions, Input } from "@ewatrade/ui"

import { FormDateControl } from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"
import { FinanceField, FinanceReview } from "./form-fields"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

type CashCount = RouterOutputs["finance"]["cashCount"]
const dateValue = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid UTC date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
  }, "Choose a valid UTC date.")
const createSchema = (minDate: string) =>
  z
    .object({
      reason: z.string().trim().min(1, "Enter a reason.").max(400),
      date: dateValue,
    })
    .superRefine((value, context) => {
      const reversalTime = new Date(`${value.date}T00:00:00.000Z`).getTime()
      const today = new Date().toISOString().slice(0, 10)
      if (value.date < minDate) {
        context.addIssue({
          code: "custom",
          path: ["date"],
          message: "The reversal date cannot precede the cash adjustment.",
        })
      }
      if (value.date > today || !Number.isFinite(reversalTime)) {
        context.addIssue({
          code: "custom",
          path: ["date"],
          message: "Choose a date no later than today (UTC).",
        })
      }
    })
type Values = z.infer<ReturnType<typeof createSchema>>
type Review = {
  adjustmentId: string
  adjustmentDescription: string
  adjustmentRecordedAt: Date
  snapshot: string
  effectiveAt: Date
  reason: string
}

export function FinanceCashAdjustmentReversalForm({
  bookId,
  count,
  onBack,
}: {
  bookId: string
  count: CashCount
  onBack: () => void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const mutation = useMutation(
    trpc.finance.reverseCashAdjustment.mutationOptions(),
  )
  const command = useFinanceCommand(
    useCompleteFinanceForm(),
    bookId,
    "cashAdjustmentReversal",
  )
  const adjustment = count.adjustment
  const minDate = new Date(count.asOf).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const schema = createSchema(minDate)
  const [review, setReview] = useState<Review | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [prepareError, setPrepareError] = useState<string | null>(null)
  const form = useZodForm<Values>(schema, {
    defaultValues: { reason: "", date: today },
  })

  async function prepare(values: Values) {
    if (preparing) return
    if (!command.ready) {
      setPrepareError(
        "Checking saved submissions. Wait before reviewing again.",
      )
      return
    }
    setPreparing(true)
    setPrepareError(null)
    try {
      const current = await client.fetchQuery(
        trpc.finance.cashCount.queryOptions(
          { bookId, countId: count.id },
          { staleTime: 0 },
        ),
      )
      const currentAdjustment = current.adjustment
      if (!currentAdjustment || currentAdjustment.id !== adjustment?.id) {
        throw new Error(
          "The cash adjustment changed. Refresh the count before continuing.",
        )
      }
      if (currentAdjustment.reversal) {
        throw new Error("This cash adjustment has already been reversed.")
      }
      const requestedDate = new Date(`${values.date}T00:00:00.000Z`)
      const effectiveAt =
        requestedDate < new Date(current.asOf)
          ? new Date(current.asOf)
          : requestedDate
      const recovery = command.recoveryMetadata
      setReview({
        adjustmentId: currentAdjustment.id,
        adjustmentDescription: currentAdjustment.description,
        adjustmentRecordedAt: currentAdjustment.recordedAt,
        snapshot:
          recovery?.countId === count.id &&
          recovery.entryId === currentAdjustment.id &&
          typeof recovery.expectedSnapshotSequence === "string"
            ? recovery.expectedSnapshotSequence
            : current.currentSnapshotSequence,
        effectiveAt,
        reason: values.reason,
      })
    } catch (failure) {
      setPrepareError(
        failure instanceof Error
          ? failure.message
          : "Unable to review the current cash adjustment.",
      )
    } finally {
      setPreparing(false)
    }
  }

  function submit(value: Review) {
    const payload = {
      bookId,
      entryId: value.adjustmentId,
      expectedSnapshotSequence: value.snapshot,
      reason: value.reason,
      effectiveAt: value.effectiveAt,
    }
    void command.run({
      payload,
      recoveryMetadata: {
        entryId: value.adjustmentId,
        countId: count.id,
        expectedSnapshotSequence: value.snapshot,
      },
      write: (clientCommandId) =>
        mutation.mutateAsync({ ...payload, clientCommandId }),
    })
  }

  if (review)
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => submit(review)}
      >
        <h3 className="font-medium">Reverse cash-count adjustment</h3>
        <p className="break-words text-sm">{review.adjustmentDescription}</p>
        <p className="text-sm">
          Original adjustment recorded{" "}
          {new Date(review.adjustmentRecordedAt).toISOString()}.
        </p>
        <p className="text-sm">
          Effective at: {review.effectiveAt.toISOString()} UTC · Reviewed
          journal snapshot {review.snapshot}
        </p>
        <p className="break-words text-sm">Reason: {review.reason}</p>
        <p className="border border-border p-4 text-sm">
          This posts opposite accounting entries for the adjustment. It does not
          return cash or issue a refund. The physical count and original
          adjustment remain in history, and the count difference remains visible
          for review.
        </p>
        <p className="text-sm font-medium">
          Adjustment amount:{" "}
          {formatFinanceMoney(count.differenceMinor, count.currencyCode)}
        </p>
      </FinanceReview>
    )

  return (
    <form onSubmit={form.handleSubmit((values) => void prepare(values))}>
      <FieldGroup className="min-w-0 grid gap-5">
        <h3 className="font-semibold">Reverse cash-count adjustment</h3>
        <p className="break-words text-sm">{adjustment?.description}</p>
        <p className="text-sm text-muted-foreground">
          This reverses the accounting entry only. It does not return cash or
          issue a refund. The original count and adjustment stay in history.
        </p>
        <FinanceField
          label="Effective date (UTC)"
          error={form.formState.errors.date?.message}
        >
          <FormDateControl
            required
            type="date"
            min={minDate}
            max={today}
            disabled={preparing}
            control={form.control}
            name={"date"}
          />
        </FinanceField>
        <FinanceField
          label="Reason for reversal"
          error={form.formState.errors.reason?.message}
        >
          <Input
            required
            maxLength={400}
            disabled={preparing}
            {...form.register("reason")}
          />
        </FinanceField>
        {prepareError ? (
          <FormFeedback appearance="dashboard">{prepareError}</FormFeedback>
        ) : null}
        <FormActions>
          <Button
            appearance="form"
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={preparing}
          >
            Back to count
          </Button>
          <Button
            appearance="form"
            type="submit"
            disabled={preparing || !command.ready}
          >
            {preparing
              ? "Checking current entries…"
              : !command.ready
                ? "Checking saved submissions…"
                : "Review reversal"}
          </Button>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
