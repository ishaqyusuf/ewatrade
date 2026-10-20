"use client"
import { FieldGroup, Input, MoneyInput } from "@ewatrade/ui"

import {
  FormCombobox,
  FormDatePicker,
  FormRadioChoices,
  FormSelectControl,
} from "@/components/forms/form-controls"
import { createExpenseFixture } from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import {
  formatFinanceMoney,
  parseFinanceMoney,
} from "@ewatrade/utils/finance-money"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { z } from "zod"
import {
  FinanceDetails,
  FinanceField,
  FinanceFormFooter,
  FinanceReview,
} from "./form-fields"
import {
  balanceChange,
  changes,
  dayIn,
  overdrawWarning,
  plainDay,
  todayIn,
  useMoneyBalances,
} from "./review-changes"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

const money = z.string().refine((value) => {
  try {
    parseFinanceMoney(value)
    return true
  } catch {
    return false
  }
}, "Enter an amount above zero, like 85000 or 85000.50.")
const schema = z
  .object({
    payee: z
      .string()
      .trim()
      .min(1, "Enter who you paid or owe.")
      .max(160, "Use 160 characters or fewer."),
    description: z
      .string()
      .trim()
      .min(1, "Say what this expense was for.")
      .max(200, "Use 200 characters or fewer."),
    amount: money,
    category: z.string().min(1, "Choose a spending category."),
    date: z.string().min(1, "Pick the date you spent it."),
    dueDate: z.string(),
    reference: z.string().max(160, "Use 160 characters or fewer."),
    paid: z.enum(["unpaid", "paid", "partial"]),
    paymentAccount: z.string(),
    paymentAmount: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.paid !== "unpaid" && !value.paymentAccount)
      ctx.addIssue({
        code: "custom",
        path: ["paymentAccount"],
        message: "Choose where the money came from.",
      })
    if (value.paid === "partial") {
      const part = money.safeParse(value.paymentAmount).success
      if (!part)
        ctx.addIssue({
          code: "custom",
          path: ["paymentAmount"],
          message: "Enter the part you paid, like 50000.",
        })
      else if (
        money.safeParse(value.amount).success &&
        BigInt(parseFinanceMoney(value.paymentAmount)) >=
          BigInt(parseFinanceMoney(value.amount))
      )
        ctx.addIssue({
          code: "custom",
          path: ["paymentAmount"],
          message:
            "That's the full amount or more. Choose Paid in full instead.",
        })
    }
    if (value.paid !== "paid" && value.dueDate && value.dueDate < value.date)
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "The due date can't be before the expense date.",
      })
  })
type Values = z.infer<typeof schema>

export function FinanceExpenseForm({
  book,
  storeId,
}: { book: FinanceBook; storeId: string }) {
  const trpc = useTRPC()
  const [review, setReview] = useState<Values | null>(null)
  const balances = useMoneyBalances(book.id)
  const currency = book.currencyCode
  const totalMinor = review
    ? BigInt(parseFinanceMoney(review.amount))
    : BigInt(0)
  const paidMinor = !review
    ? BigInt(0)
    : review.paid === "paid"
      ? totalMinor
      : review.paid === "partial"
        ? BigInt(parseFinanceMoney(review.paymentAmount))
        : BigInt(0)
  const paidFrom =
    review &&
    review.paid !== "unpaid" &&
    review.paymentAccount !== "OWNER_CAPITAL"
      ? review.paymentAccount
      : undefined
  const after = paidFrom ? balances.get(paidFrom) : undefined
  const complete = useCompleteFinanceForm(
    review
      ? `Expense added.${after && paidMinor ? ` ${after.name} is now ${formatFinanceMoney((after.balanceMinor - paidMinor).toString(), currency)}.` : ""}`
      : undefined,
  )
  const command = useFinanceCommand(complete, book.id, "recordExpense")
  const mutation = useMutation(trpc.finance.recordExpense.mutationOptions())
  const { close } = useFinanceParams()
  const suppliers = useQuery(
    trpc.finance.suppliers.queryOptions({ bookId: book.id, limit: 50 }),
  )
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
      category: "",
      date: todayIn(book.timezone),
      dueDate: "",
      reference: "",
      paid: "paid",
      paymentAccount: "",
      paymentAmount: "",
    },
  })
  const quickFillSnapshot = useRef<Values | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
  const paid = form.watch("paid")
  const accountName = (id: string) =>
    id === "OWNER_CAPITAL"
      ? "Owner's own money"
      : (accounts.find((account) => account.id === id)?.name ?? "")
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
      dueAt:
        values.dueDate && values.paid !== "paid"
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
  if (review) {
    const left = totalMinor - paidMinor
    const total = formatFinanceMoney(totalMinor.toString(), currency)
    const category = categories.find((item) => item.id === review.category)
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => submit(review)}
        confirmLabel="Add expense"
        sentence={
          <>
            You're adding <b>{total}</b> spent with <b>{review.payee}</b> for{" "}
            {review.description}.
          </>
        }
        changes={changes([
          review.paid !== "unpaid" && review.paymentAccount === "OWNER_CAPITAL"
            ? {
                label: "Owner's money",
                after: `+${formatFinanceMoney(paidMinor.toString(), currency)}`,
                note: "Counts as money the owner put in.",
              }
            : balanceChange(balances, paidFrom, -paidMinor, currency),
          left > BigInt(0)
            ? {
                label: `Still to pay ${review.payee}`,
                after: formatFinanceMoney(left.toString(), currency),
              }
            : null,
        ])}
        warning={overdrawWarning(balances, paidFrom, paidMinor, currency)}
      >
        <FinanceDetails
          rows={[
            ["Paid to", review.payee],
            [
              "For",
              `${review.description}${category ? ` · ${category.name}` : ""}`,
            ],
            ["Date", plainDay(review.date)],
            [
              "Paid",
              review.paid === "unpaid"
                ? "Not yet"
                : review.paid === "paid"
                  ? `In full, from ${accountName(review.paymentAccount)}`
                  : `${formatFinanceMoney(paidMinor.toString(), currency)} from ${accountName(review.paymentAccount)}`,
            ],
            left > BigInt(0)
              ? [
                  "Still to pay",
                  `${formatFinanceMoney(left.toString(), currency)}${review.dueDate ? `, due ${plainDay(review.dueDate)}` : ""}`,
                ]
              : null,
            review.reference ? ["Reference", review.reference] : null,
          ]}
        />
      </FinanceReview>
    )
  }
  const errors = form.formState.errors
  return (
    <form onSubmit={form.handleSubmit(setReview)}>
      <FieldGroup className="min-w-0 grid gap-5">
        <QaDashboardQuickFill
          canUndo={canUndoQuickFill}
          formId="dashboard.finance.expense"
          isDirty={form.formState.isDirty}
          onFill={(context, sequence) => {
            quickFillSnapshot.current = form.getValues()
            const fixture = createExpenseFixture(context, sequence)
            form.reset(
              {
                ...form.getValues(),
                amount: fixture.amount,
                date: fixture.date,
                description: fixture.description,
                payee: fixture.payee,
              },
              { keepDefaultValues: true },
            )
            setCanUndoQuickFill(true)
          }}
          onUndo={() => {
            if (!quickFillSnapshot.current) return
            form.reset(quickFillSnapshot.current, { keepDefaultValues: true })
            quickFillSnapshot.current = null
            setCanUndoQuickFill(false)
          }}
        />
        <FinanceField
          label="Paid to"
          description="Pick a Supplier or type a new name."
          error={errors.payee?.message}
        >
          <FormCombobox
            control={form.control}
            name="payee"
            placeholder="Search or add a name…"
            createLabel="Add"
            empty="No Suppliers match. Keep typing to add the name."
            options={(suppliers.data?.data ?? []).map((supplier) => ({
              value: supplier.name,
              label: supplier.name,
              hint: `Supplier · ${supplier.code}`,
            }))}
          />
        </FinanceField>
        <FinanceField
          label="What was it for?"
          error={errors.description?.message}
        >
          <Input
            {...form.register("description")}
            placeholder="Diesel for generator"
          />
        </FinanceField>
        <FinanceField
          label="Spending category"
          error={errors.category?.message}
        >
          <FormCombobox
            control={form.control}
            name="category"
            placeholder="Choose a category"
            empty="No category matches."
            options={categories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
          />
        </FinanceField>
        <FinanceField label="Amount" error={errors.amount?.message}>
          <MoneyInput
            currencyCode={currency}
            inputMode="decimal"
            placeholder="0.00"
            {...form.register("amount")}
          />
        </FinanceField>
        <FinanceField label="Date" error={errors.date?.message}>
          <FormDatePicker
            control={form.control}
            name="date"
            min={dayIn(book.startsAt, book.timezone)}
            max={todayIn(book.timezone)}
          />
        </FinanceField>
        <FinanceField label="Have you paid?">
          <FormRadioChoices
            control={form.control}
            name="paid"
            label="Have you paid?"
            inline
            options={[
              { value: "paid", label: "Paid in full" },
              { value: "partial", label: "Paid part of it" },
              { value: "unpaid", label: "Not paid yet" },
            ]}
          />
        </FinanceField>
        {paid !== "unpaid" ? (
          <FinanceField
            label="Paid from"
            error={errors.paymentAccount?.message}
          >
            <FormSelectControl
              control={form.control}
              name="paymentAccount"
              placeholder="Choose an account"
              options={[
                ...accounts.map((account) => {
                  const balance = balances.get(account.id)
                  return {
                    value: account.id,
                    label: balance
                      ? `${account.name} · ${formatFinanceMoney(balance.balanceMinor.toString(), currency)}`
                      : account.name,
                  }
                }),
                {
                  value: "OWNER_CAPITAL",
                  label: "Owner's own money (they put it in)",
                },
              ]}
            />
          </FinanceField>
        ) : null}
        {paid === "partial" ? (
          <FinanceField
            label="Amount paid"
            error={errors.paymentAmount?.message}
          >
            <MoneyInput
              currencyCode={currency}
              inputMode="decimal"
              placeholder="0.00"
              {...form.register("paymentAmount")}
            />
          </FinanceField>
        ) : null}
        {paid !== "paid" ? (
          <FinanceField
            label="Due date (optional)"
            description="When you need to pay the rest."
            error={errors.dueDate?.message}
          >
            <FormDatePicker control={form.control} name="dueDate" />
          </FinanceField>
        ) : null}
        <FinanceField
          label="Reference (optional)"
          description="Receipt number or transfer reference."
        >
          <Input {...form.register("reference")} />
        </FinanceField>
        <FinanceFormFooter onCancel={() => void close()} submitLabel="Review" />
      </FieldGroup>
    </form>
  )
}
