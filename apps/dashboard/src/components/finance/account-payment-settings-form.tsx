"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import {
  Checkbox,
  CheckboxField,
  FieldGroup,
  FormActions,
  SubmitButton,
} from "@ewatrade/ui"
import {
  type MoneyAccountPurpose,
  type OrderPaymentMethod,
  moneyAccountPaymentMethods,
  moneyAccountPaymentMethodsProblem,
} from "@ewatrade/utils/finance-payment-methods"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { PaymentMethodChecks } from "./payment-method-checks"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

/** Which payment methods an account takes, and whether it takes new payments. */
export function FinanceAccountPaymentSettingsForm({
  book,
  accountId,
}: {
  book: FinanceBook
  accountId: string
}) {
  const trpc = useTRPC()
  const balances = useQuery(
    trpc.finance.balances.queryOptions({ bookId: book.id }),
  )
  const account = balances.data?.accounts.find(
    (row) =>
      row.id === accountId &&
      !row.archivedAt &&
      ["CASH", "BANK", "CLEARING"].includes(row.purpose),
  )
  if (balances.isPending) return <output>Loading account…</output>
  if (balances.isError)
    return (
      <FormFeedback appearance="dashboard">
        {balances.error.message}
      </FormFeedback>
    )
  if (!account)
    return (
      <FormFeedback appearance="dashboard">
        This money account is no longer active.
      </FormFeedback>
    )
  const purpose = account.purpose as MoneyAccountPurpose
  return (
    <SettingsFields
      key={account.id}
      bookId={book.id}
      accountId={account.id}
      name={account.name}
      purpose={purpose}
      initialMethods={moneyAccountPaymentMethods({
        purpose,
        paymentMethods: account.paymentMethods,
      })}
      initialAvailable={!account.paymentsPausedAt}
    />
  )
}

function SettingsFields({
  bookId,
  accountId,
  name,
  purpose,
  initialMethods,
  initialAvailable,
}: {
  bookId: string
  accountId: string
  name: string
  purpose: MoneyAccountPurpose
  initialMethods: OrderPaymentMethod[]
  initialAvailable: boolean
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const complete = useCompleteFinanceForm()
  const [methods, setMethods] = useState(initialMethods)
  const [available, setAvailable] = useState(initialAvailable)
  const [tried, setTried] = useState(false)
  const save = useMutation(
    trpc.finance.updateMoneyAccountPayments.mutationOptions({
      onSuccess: async () => {
        // Open order screens pick up the new choices too.
        await queryClient.invalidateQueries({
          queryKey: trpc.orders.paymentAccounts.queryKey(),
        })
        await complete()
      },
    }),
  )
  const problem = moneyAccountPaymentMethodsProblem(purpose, methods)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        setTried(true)
        if (problem) return
        save.mutate({
          bookId,
          accountId,
          paymentMethods: methods,
          availableForPayments: available,
        })
      }}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        <p className="text-sm font-medium">{name}</p>
        <PaymentMethodChecks
          purpose={purpose}
          value={methods}
          onChange={setMethods}
          disabled={save.isPending}
          error={tried ? (problem ?? undefined) : undefined}
        />
        <CheckboxField
          label="Available for new payments"
          description="A paused account keeps its balance and history, and refunds can still come out of it. Staff just can't choose it for new payments."
        >
          <Checkbox
            checked={available}
            disabled={save.isPending}
            onCheckedChange={(checked) => setAvailable(checked === true)}
          />
        </CheckboxField>
        {save.error ? (
          <FormFeedback appearance="dashboard">
            {save.error.message}
          </FormFeedback>
        ) : null}
        <FormActions>
          <SubmitButton
            isSubmitting={save.isPending}
            type="submit"
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save payment settings"}
          </SubmitButton>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
