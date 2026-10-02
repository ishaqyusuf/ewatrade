"use client"
import { Button, FieldGroup, FormActions, Input } from "@ewatrade/ui"

import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { FinanceField, FinanceReview } from "./form-fields"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

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
  const mutation = useMutation(trpc.finance.adjustCashCount.mutationOptions())
  const command = useFinanceCommand(
    useCompleteFinanceForm(),
    bookId,
    "adjustCashCount",
  )
  const [reason, setReason] = useState("")
  const [review, setReview] = useState(false)
  const surplus = BigInt(count.differenceMinor) > BigInt(0)
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
  const explanation = (
    <>
      <p>
        {count.accountName} ·{" "}
        {formatFinanceMoney(count.differenceMinor, count.currencyCode)}
      </p>
      <p className="text-sm">
        This records a{" "}
        {surplus ? "cash surplus as income" : "cash shortage as an expense"} at
        the original count time, {new Date(count.asOf).toISOString()}. It
        changes the recorded cash balance without transferring money. The
        original count remains in history.
      </p>
    </>
  )
  if (review)
    return (
      <FinanceReview
        command={command}
        onBack={() => setReview(false)}
        onConfirm={submit}
      >
        {explanation}
        <p className="break-words text-sm">Reason: {reason}</p>
      </FinanceReview>
    )
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (reason.trim()) setReview(true)
      }}
    >
      <FieldGroup className="min-w-0 grid gap-5">
        <h3 className="font-medium">Adjust investigated cash difference</h3>
        {explanation}
        <p className="text-sm text-muted-foreground">
          Correct missing or incorrect transactions first. Use this adjustment
          only for a remaining difference you have investigated.
        </p>
        <FinanceField label="Investigation and adjustment reason">
          <Input
            required
            maxLength={400}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </FinanceField>
        <FormActions>
          <Button
            appearance="form"
            type="button"
            variant="outline"
            onClick={onBack}
          >
            Back to count
          </Button>
          <Button appearance="form" type="submit" disabled={!reason.trim()}>
            Review adjustment
          </Button>
        </FormActions>
      </FieldGroup>
    </form>
  )
}
