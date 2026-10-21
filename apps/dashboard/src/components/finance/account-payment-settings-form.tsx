"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTRPC } from "@/trpc/client"
import { FieldGroup, Switch } from "@ewatrade/ui"
import {
  type MoneyAccountPurpose,
  type OrderPaymentMethod,
  moneyAccountPaymentMethods,
  moneyAccountPaymentMethodsProblem,
} from "@ewatrade/utils/finance-payment-methods"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { PaymentMethodGaps } from "./finance-accounts"
import { FinanceFormFooter } from "./form-fields"
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
  if (balances.isPending) return <output>Loading money account…</output>
  if (balances.isError)
    return (
      <FormFeedback appearance="dashboard">
        {balances.error.message}
      </FormFeedback>
    )
  if (!account)
    return (
      <FormFeedback appearance="dashboard">
        This money account is no longer in use.
      </FormFeedback>
    )
  const purpose = account.purpose as MoneyAccountPurpose
  return (
    <SettingsFields
      key={account.id}
      accounts={balances.data.accounts}
      bookId={book.id}
      accountId={account.id}
      name={account.name}
      purpose={purpose}
      initialMethods={moneyAccountPaymentMethods({
        purpose,
        paymentMethods: account.paymentMethods,
      })}
      initialAvailable={!account.paymentsPausedAt}
      initialMobileMoney={account.mobileMoney}
    />
  )
}

function SettingsFields({
  accounts,
  bookId,
  accountId,
  name,
  purpose,
  initialMethods,
  initialAvailable,
  initialMobileMoney,
}: {
  accounts: Array<
    Parameters<typeof PaymentMethodGaps>[0]["accounts"][number] & {
      id: string
    }
  >
  bookId: string
  accountId: string
  name: string
  purpose: MoneyAccountPurpose
  initialMethods: OrderPaymentMethod[]
  initialAvailable: boolean
  initialMobileMoney: boolean
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [methods, setMethods] = useState(initialMethods)
  const [available, setAvailable] = useState(initialAvailable)
  const [mobileMoney, setMobileMoney] = useState(initialMobileMoney)
  const complete = useCompleteFinanceForm(
    `Payment settings saved for ${name}.${available ? "" : " It's paused for new payments."}`,
  )
  const { close } = useFinanceParams()
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
          ...(purpose === "BANK" ? { mobileMoney } : {}),
        })
      }}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        <p className="text-sm text-muted-foreground">
          Which payments {name} takes, and whether staff can choose it.
        </p>
        <PaymentMethodChecks
          purpose={purpose}
          value={methods}
          onChange={setMethods}
          disabled={save.isPending}
          error={tried ? (problem ?? undefined) : undefined}
        />
        {/* biome-ignore lint/a11y/noLabelWithoutControl: the switch is the label's child */}
        <label className="flex cursor-pointer items-start justify-between gap-4 border border-border px-3 py-2.5">
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">Use for new payments</span>
            <span className="text-xs text-muted-foreground">
              Turn off to pause it. Its balance and history stay, and refunds
              can still come out of it.
            </span>
          </span>
          <Switch
            checked={available}
            disabled={save.isPending}
            onCheckedChange={(checked) => setAvailable(checked === true)}
          />
        </label>
        {purpose === "BANK" ? (
          // biome-ignore lint/a11y/noLabelWithoutControl: the switch is the label's child
          <label className="flex cursor-pointer items-start justify-between gap-4 border border-border px-3 py-2.5">
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">Mobile money</span>
              <span className="text-xs text-muted-foreground">
                A mobile money wallet rather than a bank account. Only changes
                how it's labelled.
              </span>
            </span>
            <Switch
              checked={mobileMoney}
              disabled={save.isPending}
              onCheckedChange={(checked) => setMobileMoney(checked === true)}
            />
          </label>
        ) : null}
        <PaymentMethodGaps
          fix="Choose them here or on another account."
          accounts={accounts.map((row) =>
            row.id === accountId
              ? {
                  ...row,
                  paymentMethods: methods,
                  paymentsPausedAt: available ? null : new Date(),
                }
              : row,
          )}
        />
        {save.error ? (
          <FormFeedback appearance="dashboard">
            {save.error.message}
          </FormFeedback>
        ) : null}
        <FinanceFormFooter
          onCancel={() => void close()}
          submitLabel="Save"
          isSubmitting={save.isPending}
          disabled={save.isPending}
        />
      </FieldGroup>
    </form>
  )
}
