"use client"
import {
  Button,
  FieldGroup,
  FormActions,
  Input,
  MoneyInput,
} from "@ewatrade/ui"

import { FormSelectControl } from "@/components/forms/form-controls"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import {
  formatFinanceMoney,
  parseFinanceCashCount,
} from "@ewatrade/utils/finance-money"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { z } from "zod"
import { FinanceField, FinanceReview } from "./form-fields"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

const schema = z.object({
  accountId: z.string().min(1),
  amount: z.string().refine((value) => {
    try {
      parseFinanceCashCount(value)
      return true
    } catch {
      return false
    }
  }, "Enter the cash counted, including zero, with up to two decimal places."),
  reference: z.string().trim().min(1).max(200),
})
type Values = z.infer<typeof schema>

export function FinanceCashCountForm({ book }: { book: FinanceBook }) {
  const trpc = useTRPC()
  const mutation = useMutation(trpc.finance.recordCashCount.mutationOptions())
  const command = useFinanceCommand(
    useCompleteFinanceForm(),
    book.id,
    "recordCashCount",
  )
  const [review, setReview] = useState<(Values & { asOf: Date }) | null>(null)
  const savedAccountId = command.recoveryMetadata?.accountId
  const accounts = book.accounts.filter(
    (account) => account.purpose === "CASH" && !account.archivedAt,
  )
  const form = useZodForm<Values>(schema, {
    defaultValues: {
      accountId: accounts[0]?.id ?? "",
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
  if (!accounts.length)
    return <p>Create a cash account before recording a count.</p>
  if (review)
    return (
      <FinanceReview
        command={command}
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
        <p>
          {accounts.find((account) => account.id === review.accountId)?.name}
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          {formatFinanceMoney(
            parseFinanceCashCount(review.amount),
            book.currencyCode,
          )}
        </p>
        <p>{review.reference}</p>
        <p className="text-sm text-muted-foreground">
          Count time:{" "}
          {review.asOf.toLocaleString("en-NG", { timeZone: book.timezone })}.
          Any difference will remain visible for investigation. Recording a
          count does not adjust the cash balance.
        </p>
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
          Count the cash physically present now. We compare it with this
          account’s recorded balance at the count time.
        </p>
        <FinanceField
          label="Cash account"
          error={form.formState.errors.accountId?.message}
        >
          <FormSelectControl
            control={form.control}
            name={"accountId"}
            options={[
              ...(accounts.map((account) => ({
                value: account.id,
                label: account.name,
              })) ?? []),
            ]}
          />
        </FinanceField>
        <FinanceField
          label={`Cash counted (${book.currencyCode})`}
          error={form.formState.errors.amount?.message}
        >
          <MoneyInput
            currencyCode={book.currencyCode}
            inputMode="decimal"
            {...form.register("amount")}
          />
        </FinanceField>
        <FinanceField
          label="Count reference or note"
          error={form.formState.errors.reference?.message}
        >
          <Input
            {...form.register("reference")}
            placeholder="Closing till count"
          />
        </FinanceField>
        <FormActions>
          <Button appearance="form" type="submit">
            Review cash count
          </Button>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
