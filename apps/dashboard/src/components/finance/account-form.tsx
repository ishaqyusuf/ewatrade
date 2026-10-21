"use client"
import { FieldGroup, Input } from "@ewatrade/ui"

import { FormRadioChoices } from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useFinanceParams } from "@/hooks/use-finance-params"
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
import { FinanceField, FinanceFormFooter } from "./form-fields"
import { PaymentMethodChecks } from "./payment-method-checks"
import { useCompleteFinanceForm } from "./use-complete-finance-form"
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(100, "Use 100 characters or fewer."),
  // MOBILE is a bank-type account marked as mobile money.
  purpose: z.enum(["CASH", "BANK", "MOBILE", "CLEARING"]),
  paymentMethods: z
    .array(z.enum(ORDER_PAYMENT_METHODS))
    .min(1, "Choose at least one way to pay."),
})
export function FinanceAccountForm({
  bookId,
  category = false,
}: { bookId: string; category?: boolean }) {
  const trpc = useTRPC()
  const { close } = useFinanceParams()
  const [savedName, setSavedName] = useState("")
  const complete = useCompleteFinanceForm(
    savedName
      ? category
        ? `Spending category “${savedName}” added.`
        : `Money account “${savedName}” added. Add what it holds with Move money → Starting balance.`
      : undefined,
  )
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
    // The select re-reports its value (for example on submit); only an actual
    // type change may replace the owner's method choices.
    let previous = form.getValues("purpose")
    const watching = form.watch((values, { name }) => {
      if (name !== "purpose" || !values.purpose || values.purpose === previous)
        return
      previous = values.purpose
      form.setValue("paymentMethods", [
        ...DEFAULT_MONEY_ACCOUNT_PAYMENT_METHODS[
          values.purpose === "MOBILE" ? "BANK" : values.purpose
        ],
      ])
    })
    return () => watching.unsubscribe()
  }, [form])
  return (
    <form
      onSubmit={
        category
          ? form.handleSubmit((values) => {
              setSavedName(values.name.trim())
              expense.mutate({ bookId, code, name: values.name })
            })
          : form.handleSubmit((values) => {
              setSavedName(values.name.trim())
              account.mutate({
                bookId,
                code,
                name: values.name,
                paymentMethods: values.paymentMethods,
                purpose: values.purpose === "MOBILE" ? "BANK" : values.purpose,
                mobileMoney: values.purpose === "MOBILE",
              })
            })
      }
    >
      <FieldGroup className="min-w-0 grid gap-5">
        <FinanceField label="Name" error={form.formState.errors.name?.message}>
          <Input
            {...form.register("name")}
            placeholder={
              category ? "Rent, Transport, Fuel…" : "Shop cash, GTBank current…"
            }
          />
        </FinanceField>
        {!category ? (
          <>
            <FinanceField label="Type">
              <FormRadioChoices
                control={form.control}
                name="purpose"
                label="Type"
                options={[
                  { value: "CASH", label: "Cash", hint: "A till or cash box." },
                  {
                    value: "BANK",
                    label: "Bank account",
                    hint: "A current or savings account at a bank.",
                  },
                  {
                    value: "MOBILE",
                    label: "Mobile money",
                    hint: "An OPay, PalmPay or Moniepoint wallet.",
                  },
                  {
                    value: "CLEARING",
                    label: "Card and POS money on its way",
                    hint: "Card and POS payments the provider hasn't paid into your bank yet.",
                  },
                ]}
              />
            </FinanceField>
            <Controller
              control={form.control}
              name="paymentMethods"
              render={({ field, fieldState }) => (
                <PaymentMethodChecks
                  purpose={purpose === "MOBILE" ? "BANK" : purpose}
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
        <FinanceFormFooter
          onCancel={() => void close()}
          submitLabel={category ? "Add category" : "Add account"}
          isSubmitting={pending}
          disabled={pending}
        />
      </FieldGroup>
    </form>
  )
}
