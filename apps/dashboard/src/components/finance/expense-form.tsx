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
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import {
  formatFinanceMoney,
  parseFinanceMoney,
} from "@ewatrade/utils/finance-money"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { z } from "zod"
import { FinanceField, FinanceReview } from "./form-fields"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

const money = z.string().refine((value) => {
  try {
    parseFinanceMoney(value)
    return true
  } catch {
    return false
  }
}, "Enter a positive amount with up to two decimal places.")
const schema = z
  .object({
    payee: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(200),
    amount: money,
    category: z.string().min(1),
    date: z.string().min(1),
    dueDate: z.string(),
    reference: z.string().max(160),
    paid: z.enum(["unpaid", "paid", "partial"]),
    paymentAccount: z.string(),
    paymentAmount: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.paid !== "unpaid" && !value.paymentAccount)
      ctx.addIssue({
        code: "custom",
        path: ["paymentAccount"],
        message: "Choose the account used to pay.",
      })
    if (
      value.paid === "partial" &&
      (!money.safeParse(value.paymentAmount).success ||
        (money.safeParse(value.amount).success &&
          BigInt(parseFinanceMoney(value.paymentAmount)) >
            BigInt(parseFinanceMoney(value.amount))))
    )
      ctx.addIssue({
        code: "custom",
        path: ["paymentAmount"],
        message: "Enter a payment no greater than the expense.",
      })
  })
type Values = z.infer<typeof schema>

export function FinanceExpenseForm({
  book,
  storeId,
}: { book: FinanceBook; storeId: string }) {
  const trpc = useTRPC()
  const complete = useCompleteFinanceForm()
  const command = useFinanceCommand(complete, book.id, "recordExpense")
  const mutation = useMutation(trpc.finance.recordExpense.mutationOptions())
  const [review, setReview] = useState<Values | null>(null)
  const categories = book.accounts.filter(
    (account) => account.purpose === "OPERATING_EXPENSE" && !account.archivedAt,
  )
  const accounts = book.accounts.filter(
    (account) =>
      ["CASH", "BANK", "CLEARING"].includes(account.purpose) &&
      !account.archivedAt,
  )
  const form = useZodForm<Values>(schema, {
    defaultValues: {
      payee: "",
      description: "",
      amount: "",
      category: categories[0]?.id ?? "",
      date: new Date().toISOString().slice(0, 10),
      dueDate: "",
      reference: "",
      paid: "unpaid",
      paymentAccount: accounts[0]?.id ?? "",
      paymentAmount: "",
    },
  })
  const paid = form.watch("paid")
  function submit(values: Values) {
    const amountMinor = parseFinanceMoney(values.amount)
    const incurredAt = new Date(`${values.date}T00:00:00.000Z`)
    const payload = {
      bookId: book.id,
      storeId,
      payeeName: values.payee,
      description: values.description,
      reference: values.reference || undefined,
      incurredAt,
      dueAt: values.dueDate
        ? new Date(`${values.dueDate}T00:00:00.000Z`)
        : undefined,
      lines: [
        {
          accountId: values.category,
          description: values.description,
          amountMinor,
        },
      ],
      payment:
        values.paid === "unpaid"
          ? undefined
          : {
              ...(values.paymentAccount === "OWNER_CAPITAL"
                ? { funding: "OWNER_CAPITAL" as const }
                : {
                    funding: "BUSINESS_ACCOUNT" as const,
                    accountId: values.paymentAccount,
                  }),
              amountMinor:
                values.paid === "paid"
                  ? amountMinor
                  : parseFinanceMoney(values.paymentAmount),
              effectiveAt: incurredAt,
              reference: values.reference || undefined,
            },
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
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Payee</dt>
            <dd>{review.payee}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Expense</dt>
            <dd>
              {review.description} ·{" "}
              {formatFinanceMoney(
                parseFinanceMoney(review.amount),
                book.currencyCode,
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Payment</dt>
            <dd>
              {review.paid === "unpaid"
                ? "Unpaid bill"
                : `${formatFinanceMoney(parseFinanceMoney(review.paid === "paid" ? review.amount : review.paymentAmount), book.currencyCode)} from ${review.paymentAccount === "OWNER_CAPITAL" ? "Owner personal funds (capital contribution)" : accounts.find((account) => account.id === review.paymentAccount)?.name}`}
            </dd>
          </div>
        </dl>
      </FinanceReview>
    )
  return (
    <form onSubmit={form.handleSubmit(setReview)}>
      <FieldGroup className="min-w-0 grid gap-5">
        <FinanceField
          label="Paid to / owed to"
          error={form.formState.errors.payee?.message}
        >
          <Input {...form.register("payee")} autoComplete="off" />
        </FinanceField>
        <FinanceField
          label="What was this for?"
          error={form.formState.errors.description?.message}
        >
          <Input {...form.register("description")} />
        </FinanceField>
        <FinanceField
          label="Category"
          error={form.formState.errors.category?.message}
        >
          <FormSelectControl
            control={form.control}
            name={"category"}
            options={[
              ...(categories.map((category) => ({
                value: category.id,
                label: category.name,
              })) ?? []),
            ]}
          />
        </FinanceField>
        <FinanceField
          label={`Total (${book.currencyCode})`}
          error={form.formState.errors.amount?.message}
        >
          <MoneyInput
            currencyCode={book.currencyCode}
            inputMode="decimal"
            {...form.register("amount")}
          />
        </FinanceField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FinanceField
            label="Expense date"
            error={form.formState.errors.date?.message}
          >
            <FormDateControl type="date" control={form.control} name={"date"} />
          </FinanceField>
          <FinanceField label="Due date (optional)">
            <FormDateControl
              type="date"
              control={form.control}
              name={"dueDate"}
            />
          </FinanceField>
        </div>
        <FinanceField label="Payment status">
          <FormSelectControl
            control={form.control}
            name={"paid"}
            options={[
              { value: "unpaid", label: <>Unpaid</> },
              { value: "paid", label: <>Paid in full</> },
              { value: "partial", label: <>Partly paid</> },
            ]}
          />
        </FinanceField>
        {paid !== "unpaid" ? (
          <FinanceField
            label="Paid from"
            error={form.formState.errors.paymentAccount?.message}
          >
            <FormSelectControl
              control={form.control}
              name={"paymentAccount"}
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
        ) : null}
        {paid === "partial" ? (
          <FinanceField
            label={`Amount paid (${book.currencyCode})`}
            error={form.formState.errors.paymentAmount?.message}
          >
            <MoneyInput
              currencyCode={book.currencyCode}
              inputMode="decimal"
              {...form.register("paymentAmount")}
            />
          </FinanceField>
        ) : null}
        <FinanceField label="Receipt or payment reference (optional)">
          <Input {...form.register("reference")} />
        </FinanceField>
        <FormActions>
          <Button appearance="form" type="submit">
            Review expense
          </Button>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
