"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  FieldGroup,
  FormActions,
  Input,
  MoneyInput,
} from "@ewatrade/ui"
import {
  formatFinanceMoney,
  parseFinanceMoney,
} from "@ewatrade/utils/finance-money"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { z } from "zod"

import {
  FormDateControl,
  FormSelectControl,
} from "@/components/forms/form-controls"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import { FinanceField, FinanceReview } from "./form-fields"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

const utcDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
  }, "Choose a valid date.")

const schema = z.object({
  kind: z.enum(["PAYABLE", "ADVANCE"]),
  moneyAccountId: z.string(),
  amount: z.string().refine((value) => {
    try {
      parseFinanceMoney(value)
      return true
    } catch {
      return false
    }
  }, "Enter a positive amount with up to two decimal places."),
  description: z
    .string()
    .trim()
    .min(1, "Enter a description.")
    .max(400, "Use 400 characters or fewer."),
  date: utcDate,
})

type Values = z.infer<typeof schema>
type EntryMode = "opening" | "advance"
type Review = {
  amountMinor: string
  description: string
  effectiveAt: Date
  kind: "PAYABLE" | "ADVANCE"
  moneyAccountId: string | null
  moneyAccountName: string | null
  supplier: { code: string; name: string }
}

const moneyPurposes = ["CASH", "BANK", "CLEARING"]

export function FinanceSupplierEntryForm({
  book,
  supplierId,
  mode,
}: {
  book: FinanceBook
  supplierId: string
  mode: EntryMode
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const supplierQuery = useQuery(
    trpc.finance.supplierStatement.queryOptions(
      { bookId: book.id, supplierId, limit: 1 },
      { staleTime: 0, retry: false },
    ),
  )
  const accountsQuery = useQuery(
    trpc.finance.book.queryOptions(undefined, {
      enabled: mode === "advance",
      staleTime: 0,
      retry: false,
    }),
  )
  const accounts =
    mode === "advance"
      ? (accountsQuery.data?.accounts.filter(
          (account) =>
            account.kind === "ASSET" &&
            moneyPurposes.includes(account.purpose) &&
            !account.archivedAt,
        ) ?? [])
      : []
  const opening = mode === "opening"
  const operation = opening ? "recordSupplierOpening" : "recordSupplierAdvance"
  const openingMutation = useMutation(
    trpc.finance.recordSupplierOpening.mutationOptions(),
  )
  const advanceMutation = useMutation(
    trpc.finance.recordSupplierAdvance.mutationOptions(),
  )
  const command = useFinanceCommand(
    useCompleteFinanceForm(),
    book.id,
    operation,
  )
  const [review, setReview] = useState<Review | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [prepareError, setPrepareError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const bookStart = new Date(book.startsAt)
  const startsAt = bookStart.toISOString().slice(0, 10)
  const form = useZodForm<Values>(schema, {
    defaultValues: {
      kind: "PAYABLE",
      moneyAccountId: "",
      amount: "",
      description: "",
      date: opening ? startsAt : today,
    },
  })

  useEffect(() => {
    if (!opening && accountsQuery.data?.id === book.id) {
      const selected = form.getValues("moneyAccountId")
      if (!selected) {
        form.setValue("moneyAccountId", accounts[0]?.id ?? "", {
          shouldValidate: false,
        })
      }
    }
  }, [accounts, accountsQuery.data?.id, book.id, form, opening])

  async function prepare(values: Values) {
    if (preparing) return
    if (!command.ready) {
      setPrepareError("Checking what you saved. Wait a moment, then try again.")
      return
    }
    setPreparing(true)
    setPrepareError(null)
    try {
      const supplierStatement = await client.fetchQuery(
        trpc.finance.supplierStatement.queryOptions(
          { bookId: book.id, supplierId, limit: 1 },
          { staleTime: 0, retry: false },
        ),
      )
      if (
        supplierStatement.supplier.id !== supplierId ||
        supplierStatement.supplier.bookId !== book.id
      ) {
        throw new Error("This Supplier is not in your Finance.")
      }

      let moneyAccountName: string | null = null
      let moneyAccountId: string | null = null
      if (!opening) {
        const currentBook = await client.fetchQuery(
          trpc.finance.book.queryOptions(undefined, {
            staleTime: 0,
            retry: false,
          }),
        )
        if (currentBook?.id !== book.id) {
          throw new Error("We couldn't confirm your Finance. Try again.")
        }
        const activeAccounts = currentBook.accounts.filter(
          (account) =>
            account.kind === "ASSET" &&
            moneyPurposes.includes(account.purpose) &&
            !account.archivedAt,
        )
        const moneyAccount = activeAccounts.find(
          (account) => account.id === values.moneyAccountId,
        )
        if (!moneyAccount) {
          form.setError("moneyAccountId", {
            message: "Choose a money account.",
          })
          return
        }
        moneyAccountId = moneyAccount.id
        moneyAccountName = moneyAccount.name
      }

      if (opening && startsAt !== values.date) {
        throw new Error("A starting balance must use your Finance start date.")
      }
      if (!opening && (values.date < startsAt || values.date > today)) {
        form.setError("date", {
          message: `Choose a date from ${startsAt} to ${today}.`,
        })
        return
      }

      setReview({
        amountMinor: parseFinanceMoney(values.amount),
        description: values.description.trim(),
        effectiveAt: opening
          ? bookStart
          : new Date(
              Math.max(
                new Date(`${values.date}T00:00:00.000Z`).getTime(),
                bookStart.getTime(),
              ),
            ),
        kind: values.kind,
        moneyAccountId,
        moneyAccountName,
        supplier: {
          code: supplierStatement.supplier.code,
          name: supplierStatement.supplier.name,
        },
      })
    } catch (failure) {
      setPrepareError(
        failure instanceof Error
          ? failure.message
          : "Couldn't check this entry.",
      )
    } finally {
      setPreparing(false)
    }
  }

  function submit(value: Review) {
    const shared = {
      bookId: book.id,
      supplierId,
      amountMinor: value.amountMinor,
      description: value.description,
      effectiveAt: value.effectiveAt,
    }
    if (opening) {
      const payload = { ...shared, kind: value.kind }
      void command.run({
        payload,
        write: (clientCommandId) =>
          openingMutation.mutateAsync({ ...payload, clientCommandId }),
      })
      return
    }
    if (!value.moneyAccountId) return
    const payload = { ...shared, moneyAccountId: value.moneyAccountId }
    void command.run({
      payload,
      write: (clientCommandId) =>
        advanceMutation.mutateAsync({ ...payload, clientCommandId }),
    })
  }

  if (supplierQuery.isPending) {
    return <output aria-busy="true">Loading Supplier…</output>
  }
  if (supplierQuery.isError) {
    return (
      <Alert
        appearance="dashboard"
        variant="destructive"
        className="grid gap-3"
      >
        <AlertTitle>Couldn't load this Supplier</AlertTitle>
        <AlertDescription>{supplierQuery.error.message}</AlertDescription>
        <Button
          className="w-fit"
          variant="outline"
          onClick={() => void supplierQuery.refetch()}
        >
          Try again
        </Button>
      </Alert>
    )
  }
  if (
    supplierQuery.data.supplier.id !== supplierId ||
    supplierQuery.data.supplier.bookId !== book.id
  ) {
    return (
      <Alert appearance="dashboard" variant="destructive">
        <AlertTitle>Supplier not available</AlertTitle>
        <AlertDescription>
          This Supplier is not in your Finance.
        </AlertDescription>
      </Alert>
    )
  }
  if (!opening && accountsQuery.isPending) {
    return <output aria-busy="true">Loading money accounts…</output>
  }
  if (!opening && accountsQuery.isError) {
    return (
      <Alert
        appearance="dashboard"
        variant="destructive"
        className="grid gap-3"
      >
        <AlertTitle>Couldn't load money accounts</AlertTitle>
        <AlertDescription>{accountsQuery.error.message}</AlertDescription>
        <Button
          className="w-fit"
          variant="outline"
          onClick={() => void accountsQuery.refetch()}
        >
          Try again
        </Button>
      </Alert>
    )
  }
  if (!opening && accountsQuery.data?.id !== book.id) {
    return (
      <Alert
        appearance="dashboard"
        variant="destructive"
        className="grid gap-3"
      >
        <AlertTitle>Couldn't confirm your Finance</AlertTitle>
        <AlertDescription>Reload before paying ahead.</AlertDescription>
        <Button
          className="w-fit"
          variant="outline"
          onClick={() => void accountsQuery.refetch()}
        >
          Try again
        </Button>
      </Alert>
    )
  }

  if (review) {
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => submit(review)}
      >
        <h4 className="font-medium">
          {opening
            ? review.kind === "PAYABLE"
              ? "Owed before you started"
              : "Paid ahead before you started"
            : "Pay ahead"}
        </h4>
        <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <dt className="text-muted-foreground">Supplier</dt>
          <dd className="font-medium">
            {review.supplier.code} · {review.supplier.name}
          </dd>
          <dt className="text-muted-foreground">Entry</dt>
          <dd>
            {opening
              ? review.kind === "PAYABLE"
                ? "You owe"
                : "Paid ahead"
              : "Paid ahead"}
          </dd>
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="font-medium tabular-nums">
            {formatFinanceMoney(review.amountMinor, book.currencyCode)}
          </dd>
          <dt className="text-muted-foreground">Date</dt>
          <dd>{review.effectiveAt.toISOString()}</dd>
          {review.moneyAccountName ? (
            <>
              <dt className="text-muted-foreground">Paid from</dt>
              <dd>{review.moneyAccountName}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Description</dt>
          <dd className="break-words">{review.description}</dd>
        </dl>
        <Alert appearance="dashboard">
          <AlertDescription>
            {opening
              ? review.kind === "PAYABLE"
                ? "This records what you owed on your start date. It is not new spending and no money moves."
                : "This records money you had paid ahead on your start date. It is kept apart from what you owe."
              : "This records money you paid. It does not send money or confirm that stock arrived."}
          </AlertDescription>
        </Alert>
      </FinanceReview>
    )
  }

  const disabled = preparing || !command.ready || command.pending
  const noMoneyAccounts = !opening && accounts.length === 0

  return (
    <form onSubmit={form.handleSubmit((values) => void prepare(values))}>
      <FieldGroup className="min-w-0 grid gap-5">
        <p className="text-sm">
          {supplierQuery.data.supplier.code} ·{" "}
          {supplierQuery.data.supplier.name}
        </p>
        {opening ? (
          <>
            <FinanceField
              label="Starting balance type"
              error={form.formState.errors.kind?.message}
            >
              <FormSelectControl
                control={form.control}
                name="kind"
                disabled={disabled}
                options={[
                  { value: "PAYABLE", label: "Owed before you started" },
                  { value: "ADVANCE", label: "Paid ahead before you started" },
                ]}
              />
            </FinanceField>
            <Alert appearance="dashboard">
              <AlertDescription>
                Starting balances use your Finance start date, {startsAt}. What
                you owe and what you paid ahead are kept apart. A starting
                balance is not new spending and no money moves. Each Supplier
                can have one of each type, even if an earlier one was undone.
              </AlertDescription>
            </Alert>
          </>
        ) : noMoneyAccounts ? (
          <Alert appearance="dashboard">
            <AlertTitle>No money accounts</AlertTitle>
            <AlertDescription>
              Add a money account before paying a Supplier ahead.
            </AlertDescription>
          </Alert>
        ) : null}
        <FinanceField
          label={`Amount (${book.currencyCode})`}
          error={form.formState.errors.amount?.message}
        >
          <MoneyInput
            currencyCode={book.currencyCode}
            inputMode="decimal"
            disabled={disabled || noMoneyAccounts}
            {...form.register("amount")}
          />
        </FinanceField>
        {!opening && !noMoneyAccounts ? (
          <FinanceField
            label="Paid from"
            error={form.formState.errors.moneyAccountId?.message}
          >
            <FormSelectControl
              control={form.control}
              name="moneyAccountId"
              disabled={disabled}
              options={accounts.map((account) => ({
                value: account.id,
                label: account.name,
              }))}
            />
          </FinanceField>
        ) : null}
        <FinanceField
          label="Description"
          error={form.formState.errors.description?.message}
        >
          <Input
            autoComplete="off"
            maxLength={400}
            placeholder="What is this balance or payment for?"
            disabled={disabled || noMoneyAccounts}
            {...form.register("description")}
          />
        </FinanceField>
        {opening ? (
          <p className="text-sm text-muted-foreground">
            Date: {startsAt} (your Finance start date).
          </p>
        ) : (
          <FinanceField
            label="Payment date"
            error={form.formState.errors.date?.message}
          >
            <FormDateControl
              type="date"
              min={startsAt}
              max={today}
              disabled={disabled || noMoneyAccounts}
              control={form.control}
              name="date"
            />
          </FinanceField>
        )}
        {prepareError ? (
          <Alert
            appearance="dashboard"
            variant="destructive"
            className="grid gap-3"
          >
            <AlertDescription>{prepareError}</AlertDescription>
            <Button
              className="w-fit"
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                void form.handleSubmit((values) => prepare(values))()
              }
            >
              Try again
            </Button>
          </Alert>
        ) : null}
        <FormActions>
          <Button type="submit" disabled={disabled || noMoneyAccounts}>
            {preparing
              ? "Checking Supplier…"
              : opening
                ? "Review starting balance"
                : "Review payment"}
          </Button>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
