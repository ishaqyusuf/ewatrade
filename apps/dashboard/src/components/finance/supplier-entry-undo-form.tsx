"use client"
import { DatePicker, FieldGroup, Input } from "@ewatrade/ui"

import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useTRPC } from "@/trpc/client"

import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import {
  FinanceBackTo,
  type FinanceChange,
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
  plainDay,
  todayIn,
  useMoneyBalances,
} from "./review-changes"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

/** Supplier entries that can be undone on their own (bills and their payments use their own commands). */
export const UNDOABLE_SUPPLIER_ENTRIES = [
  "OPENING_PAYABLE",
  "OPENING_ADVANCE",
  "ADVANCE",
  "OPENING_PAYMENT",
] as const

export type SupplierEntryToUndo = {
  id: string
  kind: (typeof UNDOABLE_SUPPLIER_ENTRIES)[number]
  label: string
  description: string
  amountMinor: string
  effectiveAt: Date | string
  moneyAccountId: string | null
}

/** Undo a Supplier entry inside the Supplier sheet. No money moves; the original stays. */
export function FinanceSupplierEntryUndoForm({
  book,
  supplierName,
  entry,
  onBack,
}: {
  book: FinanceBook
  supplierName: string
  entry: SupplierEntryToUndo
  onBack: () => void
}) {
  const trpc = useTRPC()
  const currency = book.currencyCode
  const balances = useMoneyBalances(book.id)
  const amount = BigInt(entry.amountMinor)
  const mutation = useMutation(
    trpc.finance.reverseSupplierEntry.mutationOptions(),
  )
  const command = useFinanceCommand(
    useCompleteFinanceForm(
      `Undone: ${entry.label.toLowerCase()} for ${supplierName}. The original stays in history.`,
    ),
    book.id,
    "reverseSupplierEntry",
  )
  const originalDay = dayIn(entry.effectiveAt, book.timezone)
  const [day, setDay] = useState(todayIn(book.timezone))
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState(false)

  function submit() {
    // Today is timed now; a past day at its end, never before the original.
    const chosen =
      day === todayIn(book.timezone)
        ? new Date()
        : new Date(`${day}T23:59:59.999Z`)
    const original = new Date(entry.effectiveAt)
    const payload = {
      bookId: book.id,
      entryId: entry.id,
      reason: reason.trim(),
      effectiveAt: chosen < original ? original : chosen,
    }
    void command.run({
      payload,
      write: (clientCommandId) =>
        mutation.mutateAsync({ ...payload, clientCommandId }),
    })
  }

  const effects: Array<FinanceChange | null> =
    entry.kind === "OPENING_PAYABLE"
      ? [
          {
            label: `You owe ${supplierName}`,
            after: `−${moneyText(amount, currency)}`,
          },
        ]
      : entry.kind === "OPENING_PAYMENT"
        ? [
            balanceChange(
              balances,
              entry.moneyAccountId ?? undefined,
              amount,
              currency,
            ),
            {
              label: `You owe ${supplierName}`,
              after: `+${moneyText(amount, currency)}`,
            },
          ]
        : [
            entry.kind === "ADVANCE"
              ? balanceChange(
                  balances,
                  entry.moneyAccountId ?? undefined,
                  amount,
                  currency,
                )
              : null,
            {
              label: `Paid ahead to ${supplierName}`,
              after: `−${moneyText(amount, currency)}`,
            },
          ]
  const back = (
    <FinanceBackTo
      label="Back to Supplier"
      onBack={onBack}
      title="Undo"
      description="Takes it back in your records. No real money moves, and the original stays in history."
    />
  )
  if (review)
    return (
      <div className="grid gap-5">
        {back}
        <FinanceReview
          command={command}
          onBack={() => setReview(false)}
          onConfirm={submit}
          confirmLabel="Undo"
          sentence={
            <>
              This undoes <b>{moneyText(amount, currency)}</b>{" "}
              {entry.label.toLowerCase()} for {supplierName}. No money moves.
              The original stays in history, marked Undone.
            </>
          }
          changes={changes(effects)}
          note={
            entry.kind === "OPENING_PAYABLE"
              ? "Undo any payments toward this starting balance first."
              : entry.kind === "ADVANCE" || entry.kind === "OPENING_ADVANCE"
                ? "If any of this paid-ahead money was used on a bill, undo that use first."
                : undefined
          }
        >
          <FinanceDetails
            rows={[
              ["Entry", `${entry.label} · ${entry.description}`],
              ["Date", plainDay(day)],
              ["Why", reason.trim()],
            ]}
          />
        </FinanceReview>
      </div>
    )
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!reason.trim()) {
          setError("Say why, so others understand later.")
          return
        }
        setReview(true)
      }}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        {back}
        <div className="flex justify-between gap-3 border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="grid">
            <span className="font-medium">{entry.label}</span>
            <span className="text-muted-foreground">
              {entry.description} · {plainDay(originalDay)}
            </span>
          </span>
          <span className="tabular-nums">{moneyText(amount, currency)}</span>
        </div>
        <FinanceField label="Date">
          <DatePicker
            value={day}
            min={originalDay}
            max={todayIn(book.timezone)}
            onValueChange={setDay}
          />
        </FinanceField>
        <FinanceField
          label="Why are you undoing it?"
          error={error ?? undefined}
        >
          <Input
            maxLength={400}
            value={reason}
            placeholder="Entered the wrong amount"
            onChange={(event) => {
              setReason(event.target.value)
              setError(null)
            }}
          />
        </FinanceField>
        <FinanceFormFooter onCancel={onBack} submitLabel="Review" />
      </FieldGroup>
    </form>
  )
}
