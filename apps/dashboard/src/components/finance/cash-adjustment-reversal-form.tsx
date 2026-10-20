"use client"
import { FieldGroup, Input } from "@ewatrade/ui"

import { FormDatePicker } from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"
import {
  FinanceBackTo,
  FinanceDetails,
  FinanceField,
  FinanceFormFooter,
  FinanceReview,
} from "./form-fields"
import { moneyText, plainDay } from "./review-changes"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

type CashCount = RouterOutputs["finance"]["cashCount"]
const dateValue = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
  }, "Pick a date.")
const createSchema = (minDate: string) =>
  z
    .object({
      reason: z
        .string()
        .trim()
        .min(1, "Say why, so others understand later.")
        .max(400, "Use 400 characters or fewer."),
      date: dateValue,
    })
    .superRefine((value, context) => {
      const reversalTime = new Date(`${value.date}T00:00:00.000Z`).getTime()
      const today = new Date().toISOString().slice(0, 10)
      if (value.date < minDate) {
        context.addIssue({
          code: "custom",
          path: ["date"],
          message: "Pick the count day or later.",
        })
      }
      if (value.date > today || !Number.isFinite(reversalTime)) {
        context.addIssue({
          code: "custom",
          path: ["date"],
          message: "Pick today or an earlier day.",
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
    useCompleteFinanceForm(
      `Adjustment undone. ${count.accountName} is back to its recorded balance.`,
    ),
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
      setPrepareError("Checking what you saved. Wait a moment, then try again.")
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
          "The adjustment changed. Close and open the count again.",
        )
      }
      if (currentAdjustment.reversal) {
        throw new Error("This adjustment has already been undone.")
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
          : "We couldn't check this adjustment. Try again.",
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

  const back = (
    <FinanceBackTo
      label="Back to count"
      onBack={onBack}
      title="Undo adjustment"
      description="Takes the adjustment back in your records. No cash moves."
    />
  )
  if (review)
    return (
      <div className="grid gap-5">
        {back}
        <FinanceReview
          command={command}
          onBack={() => setReview(null)}
          onConfirm={() => submit(review)}
          confirmLabel="Undo adjustment"
          sentence={
            <>
              This undoes the{" "}
              <b>
                {moneyText(absolute(count.differenceMinor), count.currencyCode)}
              </b>{" "}
              adjustment to {count.accountName}. No cash moves. The count and
              its difference stay in history.
            </>
          }
        >
          <FinanceDetails
            rows={[
              ["Adjustment", review.adjustmentDescription],
              ["Date", plainDay(review.effectiveAt.toISOString().slice(0, 10))],
              ["Why", review.reason],
            ]}
          />
        </FinanceReview>
      </div>
    )

  return (
    <form onSubmit={form.handleSubmit((values) => void prepare(values))}>
      <FieldGroup className="min-w-0 grid gap-5">
        {back}
        <p className="break-words border border-border bg-muted/40 px-3 py-2 text-sm">
          {adjustment?.description}
        </p>
        <FinanceField label="Date" error={form.formState.errors.date?.message}>
          <FormDatePicker
            min={minDate}
            max={today}
            disabled={preparing}
            control={form.control}
            name="date"
          />
        </FinanceField>
        <FinanceField
          label="Why are you undoing it?"
          error={form.formState.errors.reason?.message}
        >
          <Input
            maxLength={400}
            disabled={preparing}
            placeholder="Found the missing sale"
            {...form.register("reason")}
          />
        </FinanceField>
        {prepareError ? (
          <FormFeedback appearance="dashboard">{prepareError}</FormFeedback>
        ) : null}
        <FinanceFormFooter
          onCancel={onBack}
          submitLabel="Review"
          isSubmitting={preparing}
          disabled={preparing || !command.ready}
        />
      </FieldGroup>
    </form>
  )
}

function absolute(minor: string) {
  const value = BigInt(minor)
  return value < BigInt(0) ? -value : value
}
