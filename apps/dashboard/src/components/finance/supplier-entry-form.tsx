"use client"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  FieldGroup,
  Input,
  MoneyInput,
} from "@ewatrade/ui"
import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { z } from "zod"

import {
  FormDatePicker,
  FormRadioChoices,
  FormSelectControl,
} from "@/components/forms/form-controls"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

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
  moneyText,
  paidFromOptions,
  plainDay,
  todayIn,
  useMoneyBalances,
} from "./review-changes"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

const utcDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
  }, "Pick a date.")

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
  }, "Enter an amount above zero, like 150000."),
  description: z
    .string()
    .trim()
    .min(1, "Add a short note.")
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
  const [review, setReview] = useState<Review | null>(null)
  const balances = useMoneyBalances(book.id)
  const currency = book.currencyCode
  const command = useFinanceCommand(
    useCompleteFinanceForm(
      review
        ? opening
          ? `Starting balance added for ${review.supplier.name}.`
          : `Recorded ${moneyText(review.amountMinor, currency)} paid ahead to ${review.supplier.name}.`
        : undefined,
    ),
    book.id,
    operation,
  )
  const { close } = useFinanceParams()
  const [preparing, setPreparing] = useState(false)
  const [prepareError, setPrepareError] = useState<string | null>(null)
  const today = todayIn(book.timezone)
  const bookStart = new Date(book.startsAt)
  const startsAt = dayIn(book.startsAt, book.timezone)
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
            message: "Choose where the money came from.",
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
          message: `Pick a date from ${plainDay(startsAt)} to today.`,
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
    const amount = moneyText(review.amountMinor, currency)
    const owed = opening && review.kind === "PAYABLE"
    const paidFrom = accounts.find(
      (account) => account.name === review.moneyAccountName,
    )?.id
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => submit(review)}
        confirmLabel={opening ? "Add starting balance" : "Record payment"}
        sentence={
          opening ? (
            owed ? (
              <>
                On {plainDay(startsAt)} you owed {review.supplier.name}{" "}
                <b>{amount}</b>.
              </>
            ) : (
              <>
                On {plainDay(startsAt)} you had paid {review.supplier.name}{" "}
                <b>{amount}</b> ahead.
              </>
            )
          ) : (
            <>
              You paid {review.supplier.name} <b>{amount}</b> ahead, from{" "}
              {review.moneyAccountName}.
            </>
          )
        }
        changes={changes([
          opening
            ? null
            : balanceChange(
                balances,
                paidFrom,
                -BigInt(review.amountMinor),
                currency,
              ),
          {
            label: owed
              ? `You owe ${review.supplier.name}`
              : `Paid ahead to ${review.supplier.name}`,
            after: `+${amount}`,
          },
        ])}
        note={
          opening
            ? "No money moves, and it doesn't count as spending this month."
            : "This records money you already paid. It doesn't send money or confirm that stock arrived."
        }
      >
        <FinanceDetails
          rows={[
            ["Date", plainDay(dayIn(review.effectiveAt, book.timezone))],
            ["Note", review.description],
          ]}
        />
      </FinanceReview>
    )
  }

  const disabled = preparing || !command.ready || command.pending
  const noMoneyAccounts = !opening && accounts.length === 0

  return (
    <form onSubmit={form.handleSubmit((values) => void prepare(values))}>
      <FieldGroup className="min-w-0 grid gap-5">
        <p className="text-sm text-muted-foreground">
          {supplierQuery.data.supplier.name} ·{" "}
          {supplierQuery.data.supplier.code}
        </p>
        {opening ? (
          <>
            <FinanceField
              label={`On ${plainDay(startsAt)}…`}
              description="Use what stood on the day you started using Finance. You can add one of each."
              error={form.formState.errors.kind?.message}
            >
              <FormRadioChoices
                control={form.control}
                name="kind"
                label="Starting balance"
                inline
                options={[
                  { value: "PAYABLE", label: "You owed them" },
                  { value: "ADVANCE", label: "You had paid them ahead" },
                ]}
              />
            </FinanceField>
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
          label="Amount"
          error={form.formState.errors.amount?.message}
        >
          <MoneyInput
            currencyCode={book.currencyCode}
            inputMode="decimal"
            placeholder="0.00"
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
              placeholder="Choose an account"
              options={paidFromOptions(accounts, balances, currency, false)}
            />
          </FinanceField>
        ) : null}
        <FinanceField
          label={opening ? "Note" : "What it's for"}
          error={form.formState.errors.description?.message}
        >
          <Input
            autoComplete="off"
            maxLength={400}
            placeholder={
              opening ? "Chicks delivered in December" : "Maize for November"
            }
            disabled={disabled || noMoneyAccounts}
            {...form.register("description")}
          />
        </FinanceField>
        {opening ? (
          <p className="text-sm text-muted-foreground">
            Dated {plainDay(startsAt)}, the day you started using Finance.
          </p>
        ) : (
          <FinanceField
            label="Date paid"
            error={form.formState.errors.date?.message}
          >
            <FormDatePicker
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
        <FinanceFormFooter
          onCancel={() => void close()}
          submitLabel="Review"
          isSubmitting={preparing}
          disabled={disabled || noMoneyAccounts}
        />
      </FieldGroup>
    </form>
  )
}
