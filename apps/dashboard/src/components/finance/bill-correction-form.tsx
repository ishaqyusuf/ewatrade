"use client"
import { Button, FieldGroup, FormActions, Input } from "@ewatrade/ui"

import { FormDateControl } from "@/components/forms/form-controls"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"
import { FinanceField, FinanceReview } from "./form-fields"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

export type BillCorrectionTarget = {
  billId: string
  paymentId?: string
  description: string
  amountMinor: string
}
const schema = z.object({
  reason: z.string().trim().min(1, "Enter a reason.").max(400),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
})
type Values = z.infer<typeof schema>

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
  const reverse = useMutation(trpc.finance.reverseBillPayment.mutationOptions())
  const cancel = useMutation(trpc.finance.voidExpense.mutationOptions())
  const command = useFinanceCommand(
    useCompleteFinanceForm(),
    book.id,
    target.paymentId ? "reverseBillPayment" : "voidExpense",
  )
  const [review, setReview] = useState<Values | null>(null)
  const form = useZodForm<Values>(schema, {
    defaultValues: {
      reason: "",
      date: new Date().toISOString().slice(0, 10),
    },
  })
  const action = target.paymentId ? "Reverse payment" : "Cancel expense"
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
  const explanation = target.paymentId
    ? "This corrects the recorded payment and reopens the amount owed. It does not send money or issue a refund. The original payment remains in history."
    : "This cancels the recorded expense. Its original amount and correction history remain available."
  if (review)
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => submit(review)}
      >
        <h4 className="font-medium">{action}</h4>
        <p>
          {target.description} ·{" "}
          {formatFinanceMoney(target.amountMinor, book.currencyCode)}
        </p>
        <p className="text-sm">{explanation}</p>
        <p className="text-sm">Effective date: {review.date}</p>
        <p className="break-words text-sm">Reason: {review.reason}</p>
      </FinanceReview>
    )
  return (
    <form onSubmit={form.handleSubmit(setReview)}>
      <FieldGroup className="min-w-0 grid gap-5">
        <h3 className="font-semibold">{action}</h3>
        <p>
          {target.description} ·{" "}
          {formatFinanceMoney(target.amountMinor, book.currencyCode)}
        </p>
        <p className="text-sm text-muted-foreground">{explanation}</p>
        <FinanceField
          label="Correction date"
          error={form.formState.errors.date?.message}
        >
          <FormDateControl type="date" control={form.control} name={"date"} />
        </FinanceField>
        <FinanceField
          label="Reason for correction"
          error={form.formState.errors.reason?.message}
        >
          <Input maxLength={400} {...form.register("reason")} />
        </FinanceField>
        <FormActions>
          <Button
            appearance="form"
            type="button"
            variant="outline"
            onClick={onBack}
          >
            Back to expense
          </Button>
          <Button appearance="form" type="submit">
            Review correction
          </Button>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
