"use client"
import { FieldGroup, FormActions, Input, SubmitButton } from "@ewatrade/ui"

import { FormSelectControl } from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import {
  DEFAULT_MONEY_ACCOUNT_PAYMENT_METHODS,
  ORDER_PAYMENT_METHODS,
} from "@ewatrade/utils/finance-payment-methods"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Controller } from "react-hook-form"
import { z } from "zod"
import { FinanceField } from "./form-fields"
import { PaymentMethodChecks } from "./payment-method-checks"
import { useCompleteFinanceForm } from "./use-complete-finance-form"
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(100, "Use 100 characters or fewer."),
  purpose: z.enum(["CASH", "BANK", "CLEARING"]),
  paymentMethods: z
    .array(z.enum(ORDER_PAYMENT_METHODS))
    .min(1, "Choose at least one payment method."),
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
    defaultValues: {
      name: "",
      purpose: "BANK",
      paymentMethods: [...DEFAULT_MONEY_ACCOUNT_PAYMENT_METHODS.BANK],
    },
  })
  const account = useMutation(
    trpc.finance.createMoneyAccount.mutationOptions({ onSuccess: complete }),
  )
  const expense = useMutation(
    trpc.finance.createExpenseCategory.mutationOptions({ onSuccess: complete }),
  )
  const pending = account.isPending || expense.isPending
  const error = account.error ?? expense.error
  const purpose = form.watch("purpose")
  // A new type starts from that type's usual payment methods.
  useEffect(() => {
    const watching = form.watch((values, { name }) => {
      if (name === "purpose" && values.purpose)
        form.setValue("paymentMethods", [
          ...DEFAULT_MONEY_ACCOUNT_PAYMENT_METHODS[values.purpose],
        ])
    })
    return () => watching.unsubscribe()
  }, [form])
  return (
    <form
      onSubmit={
        category
          ? form.handleSubmit((values) =>
              expense.mutate({ bookId, code, name: values.name }),
            )
          : form.handleSubmit((values) =>
              account.mutate({ bookId, code, ...values }),
            )
      }
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
          <>
            <FinanceField label="Account type">
              <FormSelectControl
                control={form.control}
                name={"purpose"}
                options={[
                  { value: "BANK", label: <>Bank account</> },
                  { value: "CASH", label: <>Cash</> },
                  {
                    value: "CLEARING",
                    label: <>POS / payments awaiting settlement</>,
                  },
                ]}
              />
            </FinanceField>
            <Controller
              control={form.control}
              name="paymentMethods"
              render={({ field, fieldState }) => (
                <PaymentMethodChecks
                  purpose={purpose}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={pending}
                  error={fieldState.error?.message}
                />
              )}
            />
          </>
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
