"use client"
import {
  Button,
  FieldGroup,
  FormActions,
  Input,
  MoneyInput,
} from "@ewatrade/ui"
import { financePostingDayStart } from "@ewatrade/utils/finance-posting-date"

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

const schema = z
  .object({
    kind: z.enum([
      "TRANSFER",
      "OWNER_CONTRIBUTION",
      "OWNER_WITHDRAWAL",
      "OPENING_BALANCE",
    ]),
    accountId: z.string().min(1),
    destinationAccountId: z.string(),
    amount: z.string().refine((value) => {
      try {
        parseFinanceMoney(value)
        return true
      } catch {
        return false
      }
    }, "Enter a positive amount with up to two decimal places."),
    description: z.string().trim().min(1).max(500),
    date: z.string().min(1),
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
  TRANSFER: "Move between accounts",
  OWNER_CONTRIBUTION: "Owner put money in",
  OWNER_WITHDRAWAL: "Owner took money out",
  OPENING_BALANCE: "Starting balance",
}
export function FinanceMoneyForm({ book }: { book: FinanceBook }) {
  const trpc = useTRPC()
  const command = useFinanceCommand(
    useCompleteFinanceForm(),
    book.id,
    "recordMoney",
  )
  const mutation = useMutation(trpc.finance.recordMoney.mutationOptions())
  const accounts = book.accounts.filter(
    (account) =>
      ["CASH", "BANK", "CLEARING"].includes(account.purpose) &&
      !account.archivedAt,
  )
  const [review, setReview] = useState<Values | null>(null)
  const startDay = new Date(book.startsAt).toISOString().slice(0, 10)
  const datedSchema = schema.superRefine((value, ctx) => {
    if (value.kind !== "OPENING_BALANCE" && value.date < startDay)
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: `Finance starts on ${new Date(book.startsAt).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}.`,
      })
  })
  const form = useZodForm<Values>(datedSchema, {
    defaultValues: {
      kind: "TRANSFER",
      accountId: accounts[0]?.id ?? "",
      destinationAccountId: accounts[1]?.id ?? "",
      amount: "",
      description: "",
      date: new Date().toISOString().slice(0, 10),
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
  if (review)
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => submit(review)}
      >
        <p className="text-lg font-semibold">
          {formatFinanceMoney(
            parseFinanceMoney(review.amount),
            book.currencyCode,
          )}
        </p>
        <p>{review.description}</p>
        <p className="text-sm text-muted-foreground">
          {movementLabels[review.kind]} ·{" "}
          {accounts.find((account) => account.id === review.accountId)?.name}
          {review.kind === "TRANSFER"
            ? ` → ${accounts.find((account) => account.id === review.destinationAccountId)?.name}`
            : ""}
        </p>
      </FinanceReview>
    )
  return (
    <form onSubmit={form.handleSubmit(setReview)}>
      <FieldGroup className="min-w-0 grid gap-5">
        <FinanceField label="What happened">
          <FormSelectControl
            control={form.control}
            name={"kind"}
            options={[
              { value: "TRANSFER", label: <>{movementLabels.TRANSFER}</> },
              {
                value: "OWNER_CONTRIBUTION",
                label: <>{movementLabels.OWNER_CONTRIBUTION}</>,
              },
              {
                value: "OWNER_WITHDRAWAL",
                label: <>{movementLabels.OWNER_WITHDRAWAL}</>,
              },
              {
                value: "OPENING_BALANCE",
                label: <>{movementLabels.OPENING_BALANCE}</>,
              },
            ]}
          />
        </FinanceField>
        <FinanceField
          label={
            kind === "TRANSFER" || kind === "OWNER_WITHDRAWAL"
              ? "From"
              : "Account"
          }
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
        {kind === "TRANSFER" ? (
          <FinanceField
            label="To"
            error={form.formState.errors.destinationAccountId?.message}
          >
            <FormSelectControl
              control={form.control}
              name={"destinationAccountId"}
              options={[
                ...(accounts.map((account) => ({
                  value: account.id,
                  label: account.name,
                })) ?? []),
              ]}
            />
          </FinanceField>
        ) : null}
        <FinanceField
          label={`Amount (${book.currencyCode})`}
          error={form.formState.errors.amount?.message}
        >
          <MoneyInput
            currencyCode={book.currencyCode}
            inputMode="decimal"
            {...form.register("amount")}
          />
        </FinanceField>
        <FinanceField
          label="Description"
          error={form.formState.errors.description?.message}
        >
          <Input {...form.register("description")} />
        </FinanceField>
        {kind === "OPENING_BALANCE" ? (
          <p className="text-sm text-muted-foreground">
            Starting balance on{" "}
            {new Date(book.startsAt).toISOString().slice(0, 10)}. Enter it once
            per account. Money that comes later is a separate move.
          </p>
        ) : (
          <FinanceField
            label="Date"
            error={form.formState.errors.date?.message}
          >
            <FormDateControl
              type="date"
              min={startDay}
              control={form.control}
              name={"date"}
            />
          </FinanceField>
        )}
        <FormActions>
          <Button appearance="form" type="submit">
            Review
          </Button>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
