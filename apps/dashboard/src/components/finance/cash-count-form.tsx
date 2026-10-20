"use client"
import { FieldGroup, Input, MoneyInput } from "@ewatrade/ui"

import { FormSelectControl } from "@/components/forms/form-controls"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import { parseFinanceCashCount } from "@ewatrade/utils/finance-money"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { z } from "zod"
import {
  FinanceDetails,
  FinanceField,
  FinanceFormFooter,
  FinanceReview,
} from "./form-fields"
import { moneyText, useMoneyBalances } from "./review-changes"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

const schema = z.object({
  accountId: z.string().min(1, "Choose the cash account."),
  amount: z.string().refine((value) => {
    try {
      parseFinanceCashCount(value)
      return true
    } catch {
      return false
    }
  }, "Enter what you counted, like 183000. Enter 0 if the till is empty."),
  reference: z
    .string()
    .trim()
    .min(1, "Add a short note, like Closing till count.")
    .max(200, "Use 200 characters or fewer."),
})
type Values = z.infer<typeof schema>

export function FinanceCashCountForm({ book }: { book: FinanceBook }) {
  const trpc = useTRPC()
  const mutation = useMutation(trpc.finance.recordCashCount.mutationOptions())
  const [review, setReview] = useState<(Values & { asOf: Date }) | null>(null)
  const balances = useMoneyBalances(book.id)
  const currency = book.currencyCode
  const shouldHold = (accountId: string) =>
    balances.get(accountId)?.balanceMinor
  const difference = (accountId: string, amount: string) => {
    const held = shouldHold(accountId)
    try {
      return held === undefined
        ? undefined
        : BigInt(parseFinanceCashCount(amount)) - held
    } catch {
      return undefined
    }
  }
  const diffText = (diff: bigint) =>
    diff === BigInt(0)
      ? "no difference"
      : `${moneyText(diff < BigInt(0) ? -diff : diff, currency)} ${diff < BigInt(0) ? "short" : "over"}`
  const reviewDiff = review
    ? difference(review.accountId, review.amount)
    : undefined
  const command = useFinanceCommand(
    useCompleteFinanceForm(
      review
        ? `Count saved${reviewDiff === undefined ? "." : `: ${diffText(reviewDiff)}.`}`
        : undefined,
    ),
    book.id,
    "recordCashCount",
  )
  const { close } = useFinanceParams()
  const savedAccountId = command.recoveryMetadata?.accountId
  const accounts = book.accounts.filter(
    (account) => account.purpose === "CASH" && !account.archivedAt,
  )
  const form = useZodForm<Values>(schema, {
    defaultValues: {
      accountId: accounts.length === 1 ? (accounts[0]?.id ?? "") : "",
      amount: "",
      reference: "",
    },
  })
  useEffect(() => {
    if (
      savedAccountId &&
      book.accounts.some((account) => account.id === savedAccountId)
    ) {
      form.setValue("accountId", savedAccountId)
    }
  }, [book.accounts, form.setValue, savedAccountId])
  const watchedAccount = form.watch("accountId")
  const watchedAmount = form.watch("amount")
  const held = watchedAccount ? shouldHold(watchedAccount) : undefined
  const liveDiff = watchedAmount
    ? difference(watchedAccount, watchedAmount)
    : undefined
  const countHint =
    held === undefined
      ? undefined
      : `${accounts.find((account) => account.id === watchedAccount)?.name} should hold ${moneyText(held, currency)}.${liveDiff === undefined ? "" : liveDiff === BigInt(0) ? " That matches." : ` You're ${diffText(liveDiff)}.`}`
  if (!accounts.length)
    return <p>Add a cash account first, then count its cash.</p>
  if (review)
    return (
      <FinanceReview
        command={command}
        confirmLabel="Save count"
        sentence={
          <>
            You counted{" "}
            <b>{moneyText(parseFinanceCashCount(review.amount), currency)}</b>{" "}
            in{" "}
            {accounts.find((account) => account.id === review.accountId)?.name}
            {reviewDiff === undefined ? "." : `: ${diffText(reviewDiff)}.`}
          </>
        }
        note="Saving a count doesn't change the balance. If there's a difference, look for missing sales or expenses first. You can adjust it later from the count."
        onBack={() => setReview(null)}
        onConfirm={() => {
          const payload = {
            bookId: book.id,
            accountId: review.accountId,
            observedBalanceMinor: parseFinanceCashCount(review.amount),
            asOf: review.asOf,
            reference: review.reference,
          }
          void command.run({
            payload,
            recoveryMetadata: {
              accountId: review.accountId,
              asOf: review.asOf.toISOString(),
            },
            write: (clientCommandId) =>
              mutation.mutateAsync({ ...payload, clientCommandId }),
          })
        }}
      >
        <FinanceDetails
          rows={[
            [
              "Should hold",
              shouldHold(review.accountId) === undefined
                ? null
                : moneyText(
                    shouldHold(review.accountId) ?? BigInt(0),
                    currency,
                  ),
            ],
            [
              "Counted",
              moneyText(parseFinanceCashCount(review.amount), currency),
            ],
            [
              "Difference",
              reviewDiff === undefined ? null : diffText(reviewDiff),
            ],
            [
              "Counted at",
              review.asOf.toLocaleString("en-NG", {
                timeZone: book.timezone,
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }),
            ],
            ["Note", review.reference],
          ]}
        />
      </FinanceReview>
    )
  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        const saved = command.recoveryMetadata
        const asOf =
          saved?.accountId === values.accountId && saved.asOf
            ? new Date(saved.asOf)
            : new Date()
        setReview({ ...values, asOf })
      })}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        <p className="text-sm text-muted-foreground">
          Count the cash in the till now. We compare it with what the account
          should hold.
        </p>
        <FinanceField
          label="Cash account"
          error={form.formState.errors.accountId?.message}
        >
          <FormSelectControl
            control={form.control}
            name="accountId"
            placeholder="Choose a cash account"
            options={accounts.map((account) => ({
              value: account.id,
              label: account.name,
            }))}
          />
        </FinanceField>
        <FinanceField
          label="Cash you counted"
          description={countHint}
          error={form.formState.errors.amount?.message}
        >
          <MoneyInput
            currencyCode={book.currencyCode}
            inputMode="decimal"
            placeholder="0.00"
            {...form.register("amount")}
          />
        </FinanceField>
        <FinanceField
          label="Note"
          error={form.formState.errors.reference?.message}
        >
          <Input
            {...form.register("reference")}
            placeholder="Closing till count"
          />
        </FinanceField>
        <FinanceFormFooter onCancel={() => void close()} submitLabel="Review" />
      </FieldGroup>
    </form>
  )
}
