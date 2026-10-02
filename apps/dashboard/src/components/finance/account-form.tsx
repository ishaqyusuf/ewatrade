"use client"
import { FieldGroup, FormActions, Input, SubmitButton } from "@ewatrade/ui"

import { FormSelectControl } from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"
import { FinanceField } from "./form-fields"
import { useCompleteFinanceForm } from "./use-complete-finance-form"
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(100, "Use 100 characters or fewer."),
  purpose: z.enum(["CASH", "BANK", "CLEARING"]),
})
export function FinanceAccountForm({
  bookId,
  category = false,
}: { bookId: string; category?: boolean }) {
  const trpc = useTRPC()
  const complete = useCompleteFinanceForm()
  const [code] = useState(
    () => `${category ? "E" : "M"}_${crypto.randomUUID().slice(0, 12)}`,
  )
  const form = useZodForm<z.infer<typeof schema>>(schema, {
    defaultValues: { name: "", purpose: "BANK" },
  })
  const account = useMutation(
    trpc.finance.createMoneyAccount.mutationOptions({ onSuccess: complete }),
  )
  const expense = useMutation(
    trpc.finance.createExpenseCategory.mutationOptions({ onSuccess: complete }),
  )
  const pending = account.isPending || expense.isPending
  const error = account.error ?? expense.error
  return (
    <form
      onSubmit={form.handleSubmit((values) =>
        category
          ? expense.mutate({ bookId, code, name: values.name })
          : account.mutate({ bookId, code, ...values }),
      )}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        <FinanceField
          label={category ? "Category name" : "Account name"}
          error={form.formState.errors.name?.message}
        >
          <Input
            {...form.register("name")}
            placeholder={
              category
                ? "Rent, transport, utilities…"
                : "Shop cash or business bank…"
            }
          />
        </FinanceField>
        {!category ? (
          <FinanceField label="Account type">
            <FormSelectControl
              control={form.control}
              name={"purpose"}
              options={[
                { value: "BANK", label: <>Bank account</> },
                { value: "CASH", label: <>Cash</> },
                { value: "CLEARING", label: <>Payments awaiting settlement</> },
              ]}
            />
          </FinanceField>
        ) : null}
        {error ? (
          <FormFeedback appearance="dashboard">{error.message}</FormFeedback>
        ) : null}
        <FormActions>
          <SubmitButton isSubmitting={pending} type="submit" disabled={pending}>
            {pending
              ? "Saving…"
              : category
                ? "Create category"
                : "Create account"}
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
