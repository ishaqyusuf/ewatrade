"use client"
import { FieldGroup, FormActions, SubmitButton } from "@ewatrade/ui"

import { FormDatePicker } from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"
import { FinanceField } from "./form-fields"
import { plainDay, todayIn } from "./review-changes"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

function firstOfMonth() {
  return `${todayIn().slice(0, 8)}01`
}
const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date.")
    .refine((value) => value <= todayIn(), "Pick today or an earlier day."),
})
/** Start date for Finance; shown on the empty Finance page (and in its sheet). */
export function FinanceSetupForm() {
  const trpc = useTRPC()
  const [started, setStarted] = useState("")
  const complete = useCompleteFinanceForm(
    started
      ? `Finance is set up from ${plainDay(started)}. Next, add your money accounts and what they held that day.`
      : undefined,
  )
  const form = useZodForm<z.infer<typeof schema>>(schema, {
    defaultValues: { date: firstOfMonth() },
  })
  const mutation = useMutation(
    trpc.finance.setup.mutationOptions({ onSuccess: complete }),
  )
  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        setStarted(values.date)
        mutation.mutate({ startsAt: new Date(`${values.date}T00:00:00.000Z`) })
      })}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        <FinanceField
          label="Start date"
          description="Usually the first day of this month. It can't be in the future."
          error={form.formState.errors.date?.message}
        >
          <FormDatePicker max={todayIn()} control={form.control} name="date" />
        </FinanceField>
        {mutation.error ? (
          <FormFeedback appearance="dashboard">
            We couldn't set up Finance. {mutation.error.message}
          </FormFeedback>
        ) : null}
        <FormActions>
          <SubmitButton
            isSubmitting={mutation.isPending}
            type="submit"
            disabled={mutation.isPending}
          >
            Set up finance
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
