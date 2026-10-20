"use client"
import { FieldGroup, FormActions, SubmitButton } from "@ewatrade/ui"

import { FormDateControl } from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import { useMutation } from "@tanstack/react-query"
import { z } from "zod"
import { FinanceField } from "./form-fields"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

const schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
export function FinanceSetupForm() {
  const trpc = useTRPC()
  const complete = useCompleteFinanceForm()
  const form = useZodForm<z.infer<typeof schema>>(schema, {
    defaultValues: { date: new Date().toISOString().slice(0, 10) },
  })
  const mutation = useMutation(
    trpc.finance.setup.mutationOptions({ onSuccess: complete }),
  )
  return (
    <form
      onSubmit={form.handleSubmit((values) =>
        mutation.mutate({ startsAt: new Date(`${values.date}T00:00:00.000Z`) }),
      )}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        <p className="text-sm text-muted-foreground">
          Choose when these books begin. Add your cash and bank opening balances
          after setup. Older sales and payments are not imported automatically.
        </p>
        <FinanceField
          label="Bookkeeping start date"
          error={form.formState.errors.date?.message}
        >
          <FormDateControl
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            control={form.control}
            name={"date"}
          />
        </FinanceField>
        {mutation.error ? (
          <FormFeedback appearance="dashboard">
            {mutation.error.message}
          </FormFeedback>
        ) : null}
        <FormActions>
          <SubmitButton
            isSubmitting={mutation.isPending}
            type="submit"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Setting up…" : "Create financial book"}
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
