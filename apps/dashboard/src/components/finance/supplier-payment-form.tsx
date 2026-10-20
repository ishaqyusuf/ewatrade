"use client"
import { FieldGroup, Input, MoneyInput } from "@ewatrade/ui"

import {
  FormDatePicker,
  FormRadioChoices,
  FormSelectControl,
} from "@/components/forms/form-controls"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import { parseFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { z } from "zod"
import {
  FinanceDetails,
  FinanceField,
  FinanceFormFooter,
  FinanceReview,
} from "./form-fields"
import {
  amountInput,
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

const schema = z.object({
  billId: z.string().min(1, "Choose what you're paying."),
  amount: z.string().refine((value) => {
    try {
      parseFinanceMoney(value)
      return true
    } catch {
      return false
    }
  }, "Enter an amount above zero, like 50000."),
  accountId: z.string().min(1, "Choose where the money came from."),
  date: z.string().min(1, "Pick the date you paid."),
  reference: z.string().max(160, "Use 160 characters or fewer."),
})
type Values = z.infer<typeof schema>

/** The starting balance appears in the list beside the bills. */
const OPENING = "OPENING"
type Owed = {
  id: string
  description: string
  outstandingMinor: string
  incurredAt: Date | string
  dueAt: Date | string | null
}

/**
 * Pay a Supplier bill (a recorded purchase) from a money account. Same shape as
 * Pay expense: the bill, the amount still to pay, Paid from, then a check.
 */
export function FinanceSupplierPaymentForm({
  book,
  supplierId,
  billId,
}: {
  book: FinanceBook
  supplierId: string
  billId?: string | null
}) {
  const trpc = useTRPC()
  const currency = book.currencyCode
  const balances = useMoneyBalances(book.id)
  const bills = useQuery(
    trpc.finance.purchases.queryOptions({
      bookId: book.id,
      supplierId,
      limit: 50,
    }),
  )
  const opening = useQuery(
    trpc.finance.supplierOpeningBalance.queryOptions({
      bookId: book.id,
      supplierId,
    }),
  )
  const supplier = useQuery(
    trpc.finance.supplierStatement.queryOptions({
      bookId: book.id,
      supplierId,
      limit: 1,
    }),
  )
  const mutation = useMutation(trpc.finance.payPurchase.mutationOptions())
  const openingMutation = useMutation(
    trpc.finance.paySupplierOpening.mutationOptions(),
  )
  const [review, setReview] = useState<Values | null>(null)
  // What you owe: the starting balance (if any is left), then open bills.
  const open: Owed[] = [
    ...(opening.data && BigInt(opening.data.outstandingMinor) > 0n
      ? [
          {
            id: OPENING,
            description: "Starting balance",
            outstandingMinor: opening.data.outstandingMinor,
            incurredAt: opening.data.effectiveAt,
            dueAt: null,
          },
        ]
      : []),
    ...(bills.data?.items ?? [])
      .filter(
        (bill) => bill.status !== "VOID" && BigInt(bill.outstandingMinor) > 0n,
      )
      .map((bill) => ({
        id: bill.id,
        description: bill.description,
        outstandingMinor: bill.outstandingMinor,
        incurredAt: bill.incurredAt,
        dueAt: bill.dueAt,
      })),
  ]
  const supplierName = supplier.data?.supplier.name ?? "this Supplier"
  const chosen = review ? open.find((bill) => bill.id === review.billId) : null
  const paying = review ? minorOf(review.amount) : 0n
  const left = chosen ? BigInt(chosen.outstandingMinor) - paying : 0n
  const done = chosen
    ? `Payment recorded. ${chosen.id === OPENING ? `The starting balance ${left === 0n ? "is now paid." : `has ${moneyText(left, currency)} still to pay.`}` : `${chosen.description} ${left === 0n ? "is now paid." : `has ${moneyText(left, currency)} still to pay.`}`}`
    : undefined
  const billCommand = useFinanceCommand(
    useCompleteFinanceForm(done),
    book.id,
    "payPurchase",
  )
  const openingCommand = useFinanceCommand(
    useCompleteFinanceForm(done),
    book.id,
    "paySupplierOpening",
  )
  const command = chosen?.id === OPENING ? openingCommand : billCommand
  const { close } = useFinanceParams()
  const accounts = moneyAccounts(book.accounts)
  const form = useZodForm<Values>(schema, {
    defaultValues: {
      billId: billId ?? "",
      amount: "",
      accountId: "",
      date: todayIn(book.timezone),
      reference: "",
    },
  })
  const selectedId = form.watch("billId")
  const selected = open.find((bill) => bill.id === selectedId)
  // One open bill is chosen for you; the amount starts at what is still to pay.
  useEffect(() => {
    if (!form.getValues("billId") && open.length === 1 && open[0])
      form.setValue("billId", open[0].id)
  }, [open, form])
  useEffect(() => {
    if (selected)
      form.setValue("amount", amountInput(selected.outstandingMinor))
  }, [selected, form])

  if (bills.isPending || opening.isPending)
    return <output>Loading what you owe…</output>
  if (bills.isError || opening.isError)
    return (
      <FormFeedback appearance="dashboard">
        We couldn't load what you owe this Supplier.{" "}
        {(bills.error ?? opening.error)?.message}
      </FormFeedback>
    )
  if (!open.length)
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to pay: you don&apos;t owe this Supplier anything. To pay before
        a bill arrives, use Pay ahead.
      </p>
    )

  function submit(values: Values) {
    const bill = open.find((item) => item.id === values.billId)
    // A payment today is timed now; a past day is timed at its end.
    const effectiveAt =
      values.date === todayIn(book.timezone)
        ? new Date()
        : new Date(`${values.date}T23:59:59.999Z`)
    if (values.billId === OPENING) {
      const toOpening = {
        bookId: book.id,
        supplierId,
        moneyAccountId: values.accountId,
        amountMinor: parseFinanceMoney(values.amount),
        description: "Payment toward starting balance",
        effectiveAt,
      }
      void openingCommand.run({
        payload: toOpening,
        write: (clientCommandId) =>
          openingMutation.mutateAsync({ ...toOpening, clientCommandId }),
      })
      return
    }
    const payload = {
      bookId: book.id,
      billId: values.billId,
      moneyAccountId: values.accountId,
      amountMinor: parseFinanceMoney(values.amount),
      description: `Payment for ${bill?.description ?? "supplier bill"}`,
      effectiveAt,
      reference: values.reference || undefined,
    }
    void billCommand.run({
      payload,
      write: (clientCommandId) =>
        mutation.mutateAsync({ ...payload, clientCommandId }),
    })
  }
  const accountName = (id: string) =>
    accounts.find((account) => account.id === id)?.name ?? ""

  if (review && chosen) {
    const before = BigInt(chosen.outstandingMinor)
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(null)}
        onConfirm={() => submit(review)}
        confirmLabel="Record payment"
        sentence={
          <>
            You're paying <b>{supplierName}</b>{" "}
            <b>{moneyText(paying, currency)}</b>{" "}
            {chosen.id === OPENING
              ? "toward what you owed them before you started using Finance"
              : `for ${chosen.description}`}
            , from {accountName(review.accountId)}.
          </>
        }
        changes={changes([
          balanceChange(balances, review.accountId, -paying, currency),
          {
            label:
              chosen.id === OPENING
                ? `Starting balance owed to ${supplierName}`
                : `You owe ${supplierName} on this bill`,
            before: moneyText(before, currency),
            after: moneyText(left, currency),
            note:
              left === 0n
                ? chosen.id === OPENING
                  ? "The starting balance will be paid off."
                  : "This bill will show as Paid."
                : undefined,
          },
        ])}
        warning={overdrawWarning(balances, review.accountId, paying, currency)}
        note="This records money you already paid. It doesn't send money."
      >
        <FinanceDetails
          rows={[
            [chosen.id === OPENING ? "Paying" : "Bill", chosen.description],
            ["Paid from", accountName(review.accountId)],
            ["Date paid", plainDay(review.date)],
            review.reference ? ["Reference", review.reference] : null,
          ]}
        />
      </FinanceReview>
    )
  }

  const errors = form.formState.errors
  const billChoices = open.map((bill) => ({
    value: bill.id,
    label: `${bill.description} · ${moneyText(bill.outstandingMinor, currency)} still to pay`,
    hint:
      bill.id === OPENING
        ? `Owed before you started using Finance on ${plainDay(dayIn(bill.incurredAt, book.timezone))}`
        : bill.dueAt
          ? `Due ${plainDay(dayIn(bill.dueAt, book.timezone))}`
          : `Bought ${plainDay(dayIn(bill.incurredAt, book.timezone))}`,
  }))
  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        const bill = open.find((item) => item.id === values.billId)
        if (bill && minorOf(values.amount) > BigInt(bill.outstandingMinor)) {
          form.setError("amount", {
            message: `That's more than the ${moneyText(bill.outstandingMinor, currency)} you owe on ${bill.id === OPENING ? "the starting balance" : "this bill"}.`,
          })
          return
        }
        setReview(values)
      })}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        <p className="text-sm text-muted-foreground">
          Record money you paid {supplierName}.
        </p>
        <FinanceField
          label="What are you paying?"
          error={errors.billId?.message}
        >
          {billChoices.length <= 4 ? (
            <FormRadioChoices
              control={form.control}
              name="billId"
              label="What are you paying?"
              options={billChoices}
            />
          ) : (
            <FormSelectControl
              control={form.control}
              name="billId"
              placeholder="Choose what you're paying"
              options={billChoices.map((choice) => ({
                value: choice.value,
                label: choice.label,
              }))}
            />
          )}
        </FinanceField>
        <FinanceField
          label="Amount"
          description="The full amount still to pay. Change it to pay part."
          error={errors.amount?.message}
        >
          <MoneyInput
            currencyCode={currency}
            inputMode="decimal"
            placeholder="0.00"
            {...form.register("amount")}
          />
        </FinanceField>
        <FinanceField label="Paid from" error={errors.accountId?.message}>
          <FormSelectControl
            control={form.control}
            name="accountId"
            placeholder="Choose an account"
            options={paidFromOptions(accounts, balances, currency, false)}
          />
        </FinanceField>
        <div className="grid gap-3 sm:grid-cols-2">
          <FinanceField label="Date paid" error={errors.date?.message}>
            <FormDatePicker
              control={form.control}
              name="date"
              min={
                selected ? dayIn(selected.incurredAt, book.timezone) : undefined
              }
              max={todayIn(book.timezone)}
            />
          </FinanceField>
          {selectedId === OPENING ? null : (
            <FinanceField label="Reference (optional)">
              <Input {...form.register("reference")} />
            </FinanceField>
          )}
        </div>
        <FinanceFormFooter onCancel={() => void close()} submitLabel="Review" />
      </FieldGroup>
    </form>
  )
}
