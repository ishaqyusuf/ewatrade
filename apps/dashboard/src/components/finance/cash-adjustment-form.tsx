"use client"
import { FieldGroup, Input } from "@ewatrade/ui"

import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import {
  FinanceBackTo,
  FinanceDetails,
  FinanceField,
  FinanceFormFooter,
  FinanceReview,
} from "./form-fields"
import { changes, moneyText, useMoneyBalances } from "./review-changes"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

/** Adjust the cash account to a count, inside the Cash count sheet. */
export function FinanceCashAdjustmentForm({
  bookId,
  count,
  onBack,
}: {
  bookId: string
  count: RouterOutputs["finance"]["cashCount"]
  onBack: () => void
}) {
  const trpc = useTRPC()
  const balances = useMoneyBalances(bookId)
  const currency = count.currencyCode
  const diff = BigInt(count.differenceMinor)
  const surplus = diff > BigInt(0)
  const size = moneyText(surplus ? diff : -diff, currency)
  const mutation = useMutation(trpc.finance.adjustCashCount.mutationOptions())
  const command = useFinanceCommand(
    useCompleteFinanceForm(
      `${count.accountName} adjusted to the count. The count stays in history.`,
    ),
    bookId,
    "adjustCashCount",
  )
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState(false)
  function submit() {
    const payload = {
      bookId,
      countId: count.id,
      reason: reason.trim(),
      expectedSnapshotSequence:
        command.recoveryMetadata?.countId === count.id &&
        command.recoveryMetadata.expectedSnapshotSequence
          ? command.recoveryMetadata.expectedSnapshotSequence
          : count.currentSnapshotSequence,
    }
    void command.run({
      payload,
      recoveryMetadata: {
        countId: count.id,
        expectedSnapshotSequence: payload.expectedSnapshotSequence,
      },
      write: (clientCommandId) =>
        mutation.mutateAsync({ ...payload, clientCommandId }),
    })
  }
  const account = [...balances.values()].find(
    (row) => row.name === count.accountName,
  )
  const back = (
    <FinanceBackTo
      label="Back to count"
      onBack={onBack}
      title="Adjust to count"
      description="Only for a difference you can't explain."
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
          confirmLabel="Adjust to count"
          sentence={
            <>
              This records{" "}
              <b>
                {size} cash {surplus ? "over" : "short"}
              </b>{" "}
              as {surplus ? "income" : "an expense"} at the count time, so{" "}
              {count.accountName} matches what you counted. No money moves. The
              count stays in history.
            </>
          }
          changes={changes([
            account
              ? {
                  label: count.accountName,
                  before: moneyText(account.balanceMinor, currency),
                  after: moneyText(account.balanceMinor + diff, currency),
                  tone: surplus ? "in" : "out",
                }
              : null,
          ])}
        >
          <FinanceDetails rows={[["What you found", reason]]} />
        </FinanceReview>
      </div>
    )
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!reason.trim()) {
          setError("Say what you checked, so others understand later.")
          return
        }
        setReview(true)
      }}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        {back}
        <div className="grid gap-0.5 border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">
            {count.accountName}: {size} {surplus ? "over" : "short"}
          </span>
          <span className="text-muted-foreground">
            Look for missing sales or expenses first. Adjust only a difference
            you can't explain.
          </span>
        </div>
        <FinanceField label="What did you find?" error={error ?? undefined}>
          <Input
            maxLength={400}
            value={reason}
            placeholder="Checked sales and expenses; nothing missing"
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
