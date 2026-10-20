"use client"
import { FieldGroup, Input, MoneyInput } from "@ewatrade/ui"
import { financePostingDayStart } from "@ewatrade/utils/finance-posting-date"

import {
  FormDatePicker,
  FormRadioChoices,
  FormSelectControl,
} from "@/components/forms/form-controls"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
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

const schema = z
  .object({
    kind: z.enum([
      "TRANSFER",
      "OWNER_CONTRIBUTION",
      "OWNER_WITHDRAWAL",
      "OPENING_BALANCE",
    ]),
    accountId: z.string().min(1, "Choose an account."),
    destinationAccountId: z.string(),
    amount: z.string().refine((value) => {
      try {
        parseFinanceMoney(value)
        return true
      } catch {
        return false
      }
    }, "Enter an amount above zero, like 100000."),
    description: z
      .string()
      .trim()
      .min(1, "Add a short note, like Banked takings.")
      .max(500, "Use 500 characters or fewer."),
    date: z.string().min(1, "Pick a date."),
  })
  .superRefine((value, ctx) => {
    if (
      value.kind === "TRANSFER" &&
      (!value.destinationAccountId ||
        value.destinationAccountId === value.accountId)
    )
      ctx.addIssue({
        code: "custom",
        path: ["destinationAccountId"],
        message: "Choose a different account to move it to.",
      })
  })
type Values = z.infer<typeof schema>

const movementLabels: Record<Values["kind"], string> = {
  TRANSFER: "Moved between accounts",
  OWNER_CONTRIBUTION: "Owner put money in",
  OWNER_WITHDRAWAL: "Owner took money out",
  OPENING_BALANCE: "Starting balance",
}
export function FinanceMoneyForm({ book }: { book: FinanceBook }) {
  const trpc = useTRPC()
  const currency = book.currencyCode
  const balances = useMoneyBalances(book.id)
  const [review, setReview] = useState<Values | null>(null)
  const accounts = moneyAccounts(book.accounts)
  const name = (id: string) =>
    accounts.find((account) => account.id === id)?.name ?? ""
  const command = useFinanceCommand(
    useCompleteFinanceForm(
      review
        ? review.kind === "TRANSFER"
          ? `Moved ${moneyText(minorOf(review.amount), currency)} from ${name(review.accountId)} to ${name(review.destinationAccountId)}.`
          : `Recorded ${moneyText(minorOf(review.amount), currency)} for ${name(review.accountId)}.`
        : undefined,
    ),
    book.id,
    "recordMoney",
  )
  const { close } = useFinanceParams()
  const mutation = useMutation(trpc.finance.recordMoney.mutationOptions())
  const startDay = dayIn(book.startsAt, book.timezone)
  const datedSchema = schema.superRefine((value, ctx) => {
    if (value.kind !== "OPENING_BALANCE" && value.date < startDay)
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: `Pick ${plainDay(startDay)} or later. That's when you started using Finance.`,
      })
  })
  const form = useZodForm<Values>(datedSchema, {
    defaultValues: {
      kind: "TRANSFER",
      accountId: "",
      destinationAccountId: "",
      amount: "",
      description: "",
      date: todayIn(book.timezone),
    },
  })
  const kind = form.watch("kind")
  function submit(values: Values) {
    const shared = {
      bookId: book.id,
      accountId: values.accountId,
      amountMinor: parseFinanceMoney(values.amount),
      description: values.description,
      effectiveAt:
        values.kind === "OPENING_BALANCE"
          ? new Date(book.startsAt)
          : financePostingDayStart(values.date, book.startsAt),
    }
    const payload =
      values.kind === "TRANSFER"
        ? {
            ...shared,
            kind: values.kind,
            destinationAccountId: values.destinationAccountId,
          }
        : { ...shared, kind: values.kind }
    void command.run({
      payload,
      write: (clientCommandId) =>
        mutation.mutateAsync({ ...payload, clientCommandId }),
    })
  }
  if (review) {
    const amount = minorOf(review.amount)
    const money = moneyText(amount, currency)
    const from = name(review.accountId)
    const sentence = {
      TRANSFER: (
        <>
          You're moving <b>{money}</b> from {from} to{" "}
          {name(review.destinationAccountId)}.
        </>
      ),
      OWNER_CONTRIBUTION: (
        <>
          The owner put <b>{money}</b> into {from}.
        </>
      ),
      OWNER_WITHDRAWAL: (
        <>
          The owner took <b>{money}</b> out of {from}.
        </>
      ),
      OPENING_BALANCE: (
        <>
          {from} held <b>{money}</b> on {plainDay(startDay)}, when you started
          using Finance.
        </>
      ),
    }[review.kind]
    const out = review.kind === "TRANSFER" || review.kind === "OWNER_WITHDRAWAL"
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => submit(review)}
        confirmLabel={
          {
            TRANSFER: "Move money",
            OWNER_CONTRIBUTION: "Record money put in",
            OWNER_WITHDRAWAL: "Record money taken out",
            OPENING_BALANCE: "Add starting balance",
          }[review.kind]
        }
        sentence={sentence}
        changes={changes([
          balanceChange(
            balances,
            review.accountId,
            out ? -amount : amount,
            currency,
          ),
          review.kind === "TRANSFER"
            ? balanceChange(
                balances,
                review.destinationAccountId,
                amount,
                currency,
              )
            : null,
          review.kind === "OWNER_CONTRIBUTION"
            ? { label: "Owner's money", after: `+${money}` }
            : review.kind === "OWNER_WITHDRAWAL"
              ? { label: "Owner's money", after: `−${money}` }
              : null,
        ])}
        warning={
          out
            ? overdrawWarning(balances, review.accountId, amount, currency)
            : undefined
        }
      >
        <FinanceDetails
          rows={[
            ["What", movementLabels[review.kind]],
            [
              "Date",
              review.kind === "OPENING_BALANCE"
                ? plainDay(startDay)
                : plainDay(review.date),
            ],
            ["Note", review.description],
          ]}
        />
      </FinanceReview>
    )
  }
  return (
    <form onSubmit={form.handleSubmit(setReview)}>
      <FieldGroup className="min-w-0 grid gap-5">
        <FinanceField label="What happened?">
          <FormRadioChoices
            control={form.control}
            name="kind"
            label="What happened?"
            options={[
              { value: "TRANSFER", label: movementLabels.TRANSFER },
              {
                value: "OWNER_CONTRIBUTION",
                label: movementLabels.OWNER_CONTRIBUTION,
              },
              {
                value: "OWNER_WITHDRAWAL",
                label: movementLabels.OWNER_WITHDRAWAL,
              },
              {
                value: "OPENING_BALANCE",
                label: movementLabels.OPENING_BALANCE,
                hint: `What an account held on ${plainDay(startDay)}, when you started using Finance.`,
              },
            ]}
          />
        </FinanceField>
        <FinanceField
          label={
            kind === "TRANSFER" || kind === "OWNER_WITHDRAWAL"
              ? "From"
              : kind === "OWNER_CONTRIBUTION"
                ? "Into"
                : "Account"
          }
          error={form.formState.errors.accountId?.message}
        >
          <FormSelectControl
            control={form.control}
            name="accountId"
            placeholder="Choose an account"
            options={paidFromOptions(accounts, balances, currency, false)}
          />
        </FinanceField>
        {kind === "TRANSFER" ? (
          <FinanceField
            label="To"
            error={form.formState.errors.destinationAccountId?.message}
          >
            <FormSelectControl
              control={form.control}
              name="destinationAccountId"
              placeholder="Choose an account"
              options={paidFromOptions(accounts, balances, currency, false)}
            />
          </FinanceField>
        ) : null}
        <FinanceField
          label="Amount"
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
          error={form.formState.errors.description?.message}
        >
          <Input
            {...form.register("description")}
            placeholder="Banked takings"
          />
        </FinanceField>
        {kind === "OPENING_BALANCE" ? (
          <p className="text-sm text-muted-foreground">
            Starting balances are dated {plainDay(startDay)}, the day you
            started using Finance. Add one per account. Money added later is a
            separate movement.
          </p>
        ) : (
          <FinanceField
            label="Date"
            error={form.formState.errors.date?.message}
          >
            <FormDatePicker
              control={form.control}
              name="date"
              min={startDay}
              max={todayIn(book.timezone)}
            />
          </FinanceField>
        )}
        <FinanceFormFooter onCancel={() => void close()} submitLabel="Review" />
      </FieldGroup>
    </form>
  )
}
