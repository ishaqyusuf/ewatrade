"use client"
import { FieldGroup, Input } from "@ewatrade/ui"

import { FormDatePicker } from "@/components/forms/form-controls"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"
import {
  FinanceBackTo,
  FinanceDetails,
  FinanceField,
  FinanceFormFooter,
  FinanceReview,
} from "./form-fields"
import {
  balanceChange,
  changes,
  moneyText,
  plainDay,
  todayIn,
  useMoneyBalances,
} from "./review-changes"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

export type BillCorrectionTarget = {
  billId: string
  paymentId?: string
  description: string
  amountMinor: string
  payeeName: string
  billDescription: string
  outstandingMinor: string
  accountId?: string
}
const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Say why, so others understand later.")
    .max(400, "Use 400 characters or fewer."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
})
type Values = z.infer<typeof schema>

/** Cancel an expense or undo one of its payments, inside the Expense sheet. */
export function FinanceBillCorrectionForm({
  book,
  target,
  onBack,
}: {
  book: FinanceBook
  target: BillCorrectionTarget
  onBack: () => void
}) {
  const trpc = useTRPC()
  const currency = book.currencyCode
  const balances = useMoneyBalances(book.id)
  const undo = Boolean(target.paymentId)
  const amount = moneyText(target.amountMinor, currency)
  const outstanding = BigInt(target.outstandingMinor)
  const reverse = useMutation(trpc.finance.reverseBillPayment.mutationOptions())
  const cancel = useMutation(trpc.finance.voidExpense.mutationOptions())
  const command = useFinanceCommand(
    useCompleteFinanceForm(
      undo
        ? `Payment undone. ${target.payeeName} is owed ${moneyText(outstanding + BigInt(target.amountMinor), currency)} again.`
        : `${target.billDescription} is cancelled. It stays in history.`,
    ),
    book.id,
    undo ? "reverseBillPayment" : "voidExpense",
  )
  const [review, setReview] = useState<Values | null>(null)
  const form = useZodForm<Values>(schema, {
    defaultValues: { reason: "", date: todayIn(book.timezone) },
  })
  const title = undo ? "Undo payment" : "Cancel expense"
  function submit(values: Values) {
    const common = {
      bookId: book.id,
      reason: values.reason,
      effectiveAt: new Date(`${values.date}T00:00:00.000Z`),
    }
    const paymentId = target.paymentId
    const payload = paymentId
      ? { ...common, paymentId }
      : { ...common, billId: target.billId }
    void command.run({
      payload,
      write: (clientCommandId) =>
        paymentId
          ? reverse.mutateAsync({ ...payload, clientCommandId, paymentId })
          : cancel.mutateAsync({
              ...payload,
              clientCommandId,
              billId: target.billId,
            }),
    })
  }
  const back = (
    <FinanceBackTo
      label="Back to expense"
      onBack={onBack}
      title={title}
      description={
        undo
          ? "Takes back a payment in your records. No money moves."
          : "It stops counting in Spending and Still to pay, and stays in history."
      }
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
          confirmLabel={title}
          sentence={
            undo ? (
              <>
                This takes back the <b>{amount}</b> payment to{" "}
                {target.payeeName} in your records. It doesn't send or return
                any money. The payment stays in history, marked Undone.
              </>
            ) : (
              <>
                This cancels the <b>{amount}</b> expense{" "}
                {target.billDescription}. It stops counting in Spending and
                Still to pay. You'll still see it, marked Cancelled, with your
                reason.
              </>
            )
          }
          changes={changes(
            undo
              ? [
                  balanceChange(
                    balances,
                    target.accountId,
                    BigInt(target.amountMinor),
                    currency,
                  ),
                  {
                    label: `Still to pay ${target.payeeName}`,
                    before: moneyText(outstanding, currency),
                    after: moneyText(
                      outstanding + BigInt(target.amountMinor),
                      currency,
                    ),
                  },
                ]
              : [
                  outstanding > BigInt(0)
                    ? {
                        label: `Still to pay ${target.payeeName}`,
                        before: moneyText(outstanding, currency),
                        after: moneyText(BigInt(0), currency),
                      }
                    : null,
                ],
          )}
        >
          <FinanceDetails
            rows={[
              ["Date", plainDay(review.date)],
              ["Why", review.reason],
            ]}
          />
        </FinanceReview>
      </div>
    )
  const errors = form.formState.errors
  return (
    <form onSubmit={form.handleSubmit(setReview)}>
      <FieldGroup className="min-w-0 grid gap-5">
        {back}
        <div className="grid gap-0.5 border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="flex justify-between gap-3 font-medium">
            <span>{target.description}</span>
            <span className="tabular-nums">{amount}</span>
          </span>
          <span className="text-muted-foreground">
            {target.billDescription} · {target.payeeName}
          </span>
        </div>
        <FinanceField label="Date" error={errors.date?.message}>
          <FormDatePicker
            control={form.control}
            name="date"
            max={todayIn(book.timezone)}
          />
        </FinanceField>
        <FinanceField
          label={
            undo ? "Why are you undoing it?" : "Why are you cancelling it?"
          }
          error={errors.reason?.message}
        >
          <Input
            maxLength={400}
            placeholder={
              undo
                ? "The transfer failed and came back"
                : "Entered twice, or it was waived"
            }
            {...form.register("reason")}
          />
        </FinanceField>
        <FinanceFormFooter onCancel={onBack} submitLabel="Review" />
      </FieldGroup>
    </form>
  )
}
