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
        message: "Choose a different destination account.",
      })
  })
type Values = z.infer<typeof schema>
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
  const form = useZodForm<Values>(schema, {
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
          : new Date(`${values.date}T00:00:00.000Z`),
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
          {review.kind.replaceAll("_", " ").toLowerCase()} ·{" "}
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
        <FinanceField label="Movement">
          <FormSelectControl
            control={form.control}
            name={"kind"}
            options={[
              { value: "TRANSFER", label: <>Transfer between accounts</> },
              { value: "OWNER_CONTRIBUTION", label: <>Owner puts money in</> },
              { value: "OWNER_WITHDRAWAL", label: <>Owner takes money out</> },
              { value: "OPENING_BALANCE", label: <>Opening account balance</> },
            ]}
          />
        </FinanceField>
        <FinanceField
          label={
            kind === "TRANSFER" || kind === "OWNER_WITHDRAWAL"
              ? "From account"
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
            label="To account"
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
            Opening balance as of{" "}
            {new Date(book.startsAt).toISOString().slice(0, 10)}. Enter it once
            per account; later funds are a separate movement.
          </p>
        ) : (
          <FinanceField label="Date">
            <FormDateControl type="date" control={form.control} name={"date"} />
          </FinanceField>
        )}
        <FormActions>
          <Button appearance="form" type="submit">
            Review movement
          </Button>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
