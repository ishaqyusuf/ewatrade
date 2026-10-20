"use client"
import { FieldGroup, Input, MoneyInput } from "@ewatrade/ui"

import {
  FormDatePicker,
  FormSelectControl,
} from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { z } from "zod"
import {
  FinanceDetails,
  FinanceField,
  FinanceFormFooter,
  FinanceReview,
} from "./form-fields"
import {
  amountInput,
  balanceChange,
  changes,
  dayIn,
  minorOf,
  moneyAccounts,
  moneyText,
  overdrawWarning,
  paidFromOptions,
  plainDay,
  todayIn,
  useMoneyBalances,
} from "./review-changes"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"
const schema = z.object({
  accountId: z.string().min(1, "Choose where the money came from."),
  amount: z.string().refine((value) => {
    try {
      parseFinanceMoney(value)
      return true
    } catch {
      return false
    }
  }, "Enter an amount above zero, like 50000."),
  date: z.string().min(1, "Pick the date you paid."),
  reference: z.string().max(160, "Use 160 characters or fewer."),
})
type Values = z.infer<typeof schema>
export function FinanceBillPaymentForm({
  book,
  billId,
}: { book: FinanceBook; billId: string }) {
  const trpc = useTRPC()
  const currency = book.currencyCode
  const query = useQuery(
    trpc.finance.bill.queryOptions({ bookId: book.id, billId }),
  )
  const balances = useMoneyBalances(book.id)
  const mutation = useMutation(trpc.finance.payBill.mutationOptions())
  const [review, setReview] = useState<Values | null>(null)
  const outstanding = query.data
    ? BigInt(query.data.outstandingMinor)
    : BigInt(0)
  const paying = review ? minorOf(review.amount) : BigInt(0)
  const left = outstanding - paying
  const command = useFinanceCommand(
    useCompleteFinanceForm(
      review && query.data
        ? `Payment recorded. ${query.data.description} ${left === BigInt(0) ? "is now paid." : `has ${moneyText(left, currency)} still to pay.`}`
        : undefined,
    ),
    book.id,
    "payBill",
  )
  const { close } = useFinanceParams()
  const accounts = moneyAccounts(book.accounts)
  const form = useZodForm<Values>(schema, {
    defaultValues: {
      accountId: "",
      amount: "",
      date: todayIn(book.timezone),
      reference: "",
    },
  })
  useEffect(() => {
    if (query.data && !form.getValues("amount"))
      form.setValue("amount", amountInput(query.data.outstandingMinor))
  }, [query.data, form])
  if (query.isPending) return <output>Loading expense…</output>
  if (query.isError)
    return (
      <FormFeedback appearance="dashboard">{query.error.message}</FormFeedback>
    )
  const bill = query.data
  function submit(values: Values) {
    const payload = {
      bookId: book.id,
      billId,
      ...(values.accountId === "OWNER_CAPITAL"
        ? { funding: "OWNER_CAPITAL" as const }
        : {
            funding: "BUSINESS_ACCOUNT" as const,
            accountId: values.accountId,
          }),
      amountMinor: parseFinanceMoney(values.amount),
      effectiveAt: new Date(`${values.date}T00:00:00.000Z`),
      reference: values.reference || undefined,
    }
    void command.run({
      payload,
      write: (clientCommandId) =>
        mutation.mutateAsync({ ...payload, clientCommandId }),
    })
  }
  const accountName = (id: string) =>
    id === "OWNER_CAPITAL"
      ? "Owner's own money"
      : (accounts.find((account) => account.id === id)?.name ?? "")
  if (review) {
    const from =
      review.accountId === "OWNER_CAPITAL" ? undefined : review.accountId
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => submit(review)}
        confirmLabel="Record payment"
        sentence={
          <>
            You're paying <b>{moneyText(paying, currency)}</b> to{" "}
            <b>{bill.payeeName}</b> from {accountName(review.accountId)}.
          </>
        }
        changes={changes([
          balanceChange(balances, from, -paying, currency),
          {
            label: `Still to pay ${bill.payeeName}`,
            before: moneyText(outstanding, currency),
            after: moneyText(left, currency),
            note:
              left === BigInt(0)
                ? "This expense will show as Paid."
                : undefined,
          },
        ])}
        warning={overdrawWarning(balances, from, paying, currency)}
      >
        <FinanceDetails
          rows={[
            ["Expense", bill.description],
            ["Paid from", accountName(review.accountId)],
            ["Date paid", plainDay(review.date)],
            review.reference ? ["Reference", review.reference] : null,
          ]}
        />
      </FinanceReview>
    )
  }
  const errors = form.formState.errors
  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        if (minorOf(values.amount) > outstanding) {
          form.setError("amount", {
            message: `That's more than the ${moneyText(outstanding, currency)} still to pay.`,
          })
          return
        }
        setReview(values)
      })}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        <div className="grid gap-0.5 border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">
            {bill.description} · {bill.payeeName}
          </span>
          <span className="text-muted-foreground">
            {moneyText(outstanding, currency)} still to pay
          </span>
        </div>
        <FinanceField
          label="Amount"
          description="The full amount still to pay. Change it to pay part."
          error={errors.amount?.message}
        >
          <MoneyInput
            currencyCode={currency}
            inputMode="decimal"
            placeholder="0.00"
            {...form.register("amount")}
          />
        </FinanceField>
        <FinanceField label="Paid from" error={errors.accountId?.message}>
          <FormSelectControl
            control={form.control}
            name="accountId"
            placeholder="Choose an account"
            options={paidFromOptions(accounts, balances, currency)}
          />
        </FinanceField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FinanceField label="Date paid" error={errors.date?.message}>
            <FormDatePicker
              control={form.control}
              name="date"
              min={dayIn(book.startsAt, book.timezone)}
              max={todayIn(book.timezone)}
            />
          </FinanceField>
          <FinanceField label="Reference (optional)">
            <Input {...form.register("reference")} />
          </FinanceField>
        </div>
        <FinanceFormFooter onCancel={() => void close()} submitLabel="Review" />
      </FieldGroup>
    </form>
  )
}
