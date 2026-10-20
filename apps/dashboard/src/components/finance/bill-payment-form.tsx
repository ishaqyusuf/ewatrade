"use client"
import {
  Button,
  FieldGroup,
  FormActions,
  Input,
  MoneyInput,
} from "@ewatrade/ui"

import {
  FormDateControl,
  FormSelectControl,
} from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import {
  formatFinanceMoney,
  parseFinanceMoney,
} from "@ewatrade/utils/finance-money"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"
import { FinanceField, FinanceReview } from "./form-fields"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"
const schema = z.object({
  accountId: z.string().min(1),
  amount: z.string().refine((value) => {
    try {
      parseFinanceMoney(value)
      return true
    } catch {
      return false
    }
  }, "Enter a positive amount with up to two decimal places."),
  date: z.string().min(1),
  reference: z.string().max(160),
})
type Values = z.infer<typeof schema>
export function FinanceBillPaymentForm({
  book,
  billId,
}: { book: FinanceBook; billId: string }) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.finance.bill.queryOptions({ bookId: book.id, billId }),
  )
  const mutation = useMutation(trpc.finance.payBill.mutationOptions())
  const command = useFinanceCommand(
    useCompleteFinanceForm(),
    book.id,
    "payBill",
  )
  const [review, setReview] = useState<Values | null>(null)
  const accounts = book.accounts.filter(
    (account) =>
      ["CASH", "BANK", "CLEARING"].includes(account.purpose) &&
      !account.archivedAt,
  )
  const form = useZodForm<Values>(schema, {
    defaultValues: {
      accountId: accounts[0]?.id ?? "",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      reference: "",
    },
  })
  if (query.isPending) return <output>Loading bill…</output>
  if (query.isError)
    return (
      <FormFeedback appearance="dashboard">{query.error.message}</FormFeedback>
    )
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
  if (review)
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => submit(review)}
      >
        <p>
          {query.data.payeeName} · {query.data.description}
        </p>
        <p className="text-xl font-semibold">
          {formatFinanceMoney(
            parseFinanceMoney(review.amount),
            book.currencyCode,
          )}
        </p>
        <p className="text-sm">
          From{" "}
          {review.accountId === "OWNER_CAPITAL"
            ? "Owner personal funds (capital contribution)"
            : accounts.find((account) => account.id === review.accountId)?.name}
        </p>
      </FinanceReview>
    )
  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        if (
          BigInt(parseFinanceMoney(values.amount)) >
          BigInt(query.data.outstandingMinor)
        ) {
          form.setError("amount", {
            message: "Payment exceeds the outstanding amount.",
          })
          return
        }
        setReview(values)
      })}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        <p className="text-sm">
          {query.data.payeeName} · Outstanding{" "}
          {formatFinanceMoney(query.data.outstandingMinor, book.currencyCode)}
        </p>
        <FinanceField
          label={`Amount paid (${book.currencyCode})`}
          error={form.formState.errors.amount?.message}
        >
          <MoneyInput
            currencyCode={book.currencyCode}
            inputMode="decimal"
            {...form.register("amount")}
          />
        </FinanceField>
        <FinanceField label="Paid from">
          <FormSelectControl
            control={form.control}
            name={"accountId"}
            options={[
              {
                value: "OWNER_CAPITAL",
                label: <>Owner personal funds (capital contribution)</>,
              },
              ...(accounts.map((account) => ({
                value: account.id,
                label: account.name,
              })) ?? []),
            ]}
          />
        </FinanceField>
        <FinanceField label="Payment date">
          <FormDateControl type="date" control={form.control} name={"date"} />
        </FinanceField>
        <FinanceField label="Payment reference (optional)">
          <Input {...form.register("reference")} />
        </FinanceField>
        <FormActions>
          <Button appearance="form" type="submit">
            Review payment
          </Button>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
