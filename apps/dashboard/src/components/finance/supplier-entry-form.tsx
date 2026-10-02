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
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid UTC date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
  }, "Choose a valid UTC date.")

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
      setPrepareError(
        "Checking saved submissions. Wait before reviewing again.",
      )
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
        throw new Error("This supplier does not belong to this finance book.")
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
          throw new Error("The active finance book could not be confirmed.")
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
            message: "Choose an active cash, bank, or clearing account.",
          })
          return
        }
        moneyAccountId = moneyAccount.id
        moneyAccountName = moneyAccount.name
      }

      if (opening && startsAt !== values.date) {
        throw new Error(
          "The opening entry must use the finance book start date.",
        )
      }
      if (!opening && (values.date < startsAt || values.date > today)) {
        form.setError("date", {
          message: `Choose a date from ${startsAt} through ${today} (UTC).`,
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
          : "Unable to review this supplier entry.",
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
    return <output aria-busy="true">Loading supplier details…</output>
  }
  if (supplierQuery.isError) {
    return (
      <Alert
        appearance="dashboard"
        variant="destructive"
        className="grid gap-3"
      >
        <AlertTitle>Supplier could not be loaded</AlertTitle>
        <AlertDescription>{supplierQuery.error.message}</AlertDescription>
        <Button
          appearance="form"
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
        <AlertTitle>Supplier unavailable</AlertTitle>
        <AlertDescription>
          This supplier does not belong to the current finance book.
        </AlertDescription>
      </Alert>
    )
  }
  if (!opening && accountsQuery.isPending) {
    return <output aria-busy="true">Loading active money accounts…</output>
  }
  if (!opening && accountsQuery.isError) {
    return (
      <Alert
        appearance="dashboard"
        variant="destructive"
        className="grid gap-3"
      >
        <AlertTitle>Money accounts could not be loaded</AlertTitle>
        <AlertDescription>{accountsQuery.error.message}</AlertDescription>
        <Button
          appearance="form"
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
        <AlertTitle>Finance book could not be confirmed</AlertTitle>
        <AlertDescription>
          Reload the active finance book before recording an advance.
        </AlertDescription>
        <Button
          appearance="form"
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
              ? "Opening payable"
              : "Opening held advance"
            : "Paid supplier advance"}
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
                ? "Payable"
                : "Held advance"
              : "Paid advance"}
          </dd>
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="font-medium tabular-nums">
            {formatFinanceMoney(review.amountMinor, book.currencyCode)}
          </dd>
          <dt className="text-muted-foreground">Date (UTC)</dt>
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
                ? "This records a payable at the bookkeeping cutoff. It is not current spending or a cash movement."
                : "This records a held supplier advance separately from payables. It does not net the two balances."
              : "This records a merchant-reported cash or bank movement. It does not initiate a transfer or confirm an inventory receipt."}
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
              label="Opening balance type"
              error={form.formState.errors.kind?.message}
            >
              <FormSelectControl
                control={form.control}
                name="kind"
                disabled={disabled}
                options={[
                  { value: "PAYABLE", label: "Opening payable" },
                  { value: "ADVANCE", label: "Opening held advance" },
                ]}
              />
            </FinanceField>
            <Alert appearance="dashboard">
              <AlertDescription>
                Opening entries use the exact bookkeeping start date, {startsAt}
                . Payables and held advances remain separate. An opening entry
                does not represent current spending or a cash movement. Each
                supplier can have one opening source of each type; the finance
                book enforces this even if an earlier opening was reversed.
              </AlertDescription>
            </Alert>
          </>
        ) : noMoneyAccounts ? (
          <Alert appearance="dashboard">
            <AlertTitle>No active money accounts</AlertTitle>
            <AlertDescription>
              Create an active cash, bank, or clearing account before recording
              a paid supplier advance.
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
            placeholder="Describe the supplier balance or payment"
            disabled={disabled || noMoneyAccounts}
            {...form.register("description")}
          />
        </FinanceField>
        {opening ? (
          <p className="text-sm text-muted-foreground">
            Effective date: {startsAt} (the finance book start date).
          </p>
        ) : (
          <FinanceField
            label="Payment date (UTC)"
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
              appearance="form"
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
          <Button
            appearance="form"
            type="submit"
            disabled={disabled || noMoneyAccounts}
          >
            {preparing
              ? "Checking supplier…"
              : opening
                ? "Review opening entry"
                : "Review advance"}
          </Button>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
