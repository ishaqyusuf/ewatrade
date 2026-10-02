import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import {
  prepareCashAdjustment,
  prepareCashAdjustmentReversal,
} from "@/lib/finance-cash-input"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useEffect, useRef, useState } from "react"
import type { MobileFinanceCommand } from "./finance-command-feedback"
import type { CashCountDetail } from "./finance-count-screen"
import { FinanceFormBody } from "./finance-form-body"
import type { FinanceWorkspace } from "./finance-workspace-gate"

type Review =
  | {
      kind: "ADJUST"
      source: CashCountDetail
      payload: ReturnType<typeof prepareCashAdjustment>
    }
  | {
      kind: "REVERSE"
      source: CashCountDetail
      payload: ReturnType<typeof prepareCashAdjustmentReversal>
    }
export function FinanceCashActionForm({
  book,
  count,
  kind,
  command,
  feedback,
  canSubmit,
  onDone,
}: {
  book: FinanceWorkspace["book"]
  count: CashCountDetail
  kind: "ADJUST" | "REVERSE"
  command: MobileFinanceCommand
  feedback: ReactNode
  canSubmit: boolean
  onDone: () => void
}) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const adjustment = useMutation(trpc.finance.adjustCashCount.mutationOptions())
  const reversal = useMutation(
    trpc.finance.reverseCashAdjustment.mutationOptions(),
  )
  const [reason, setReason] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [review, setReview] = useState<Review | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  async function prepare() {
    if (preparing) return
    setPreparing(true)
    try {
      const source = await client.fetchQuery(
        trpc.finance.cashCount.queryOptions(
          { bookId: book.id, countId: count.id },
          { staleTime: 0 },
        ),
      )
      if (!mounted.current) return
      if (kind === "REVERSE" && source.adjustment?.id !== count.adjustment?.id)
        throw new Error(
          "The original adjustment changed. Return to its history before correcting.",
        )
      const retained = command.retained?.command
      const operation =
        kind === "ADJUST" ? "adjustCashCount" : "cashAdjustmentReversal"
      const metadata =
        retained?.operation === operation
          ? retained.recoveryMetadata
          : undefined
      const next: Review =
        kind === "ADJUST"
          ? {
              kind,
              source,
              payload: prepareCashAdjustment({
                bookId: book.id,
                count: source,
                reason,
                metadata,
              }),
            }
          : {
              kind,
              source,
              payload: prepareCashAdjustmentReversal({
                bookId: book.id,
                count: source,
                reason,
                date,
                metadata,
              }),
            }
      setReview(next)
      setError(null)
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Refresh the count before reviewing this action.",
        )
    } finally {
      if (mounted.current) setPreparing(false)
    }
  }
  async function confirm() {
    if (!review) return
    const attempt = review
    const metadata = {
      countId: attempt.source.id,
      expectedSnapshotSequence: attempt.payload.expectedSnapshotSequence,
      ...(attempt.kind === "REVERSE"
        ? { entryId: attempt.payload.entryId }
        : {}),
    }
    const saved =
      attempt.kind === "ADJUST"
        ? await command.run(
            "adjustCashCount",
            attempt.payload,
            (id) =>
              adjustment.mutateAsync({
                ...attempt.payload,
                clientCommandId: id,
              }),
            "Investigated cash adjustment recorded. Original count retained.",
            metadata,
          )
        : await command.run(
            "cashAdjustmentReversal",
            attempt.payload,
            (id) =>
              reversal.mutateAsync({ ...attempt.payload, clientCommandId: id }),
            "Cash adjustment reversed. Original history retained.",
            metadata,
          )
    if (saved) onDone()
  }
  const source = review?.source ?? count
  const shortage = BigInt(source.differenceMinor) < 0n
  return (
    <FinanceFormBody>
      {feedback}
      <Text className="text-xl font-bold">
        {review
          ? "Review cash action"
          : kind === "ADJUST"
            ? "Investigated adjustment"
            : "Reverse adjustment"}
      </Text>
      <Text className="font-bold">
        {source.reference} · {source.accountName}
      </Text>
      <Text>
        Original difference at count:{" "}
        {formatFinanceMoney(source.differenceMinor, book.currencyCode)}
      </Text>
      <Text className="text-sm text-muted-foreground">
        {kind === "ADJUST"
          ? "Check missing spending, deposits and transfers first. This records the investigated difference; it does not move physical cash."
          : "This posts the exact opposite lines of the original adjustment. The original count and adjustment remain in history; it does not move physical cash."}
      </Text>
      {error ? <StatusBanner message={error} tone="destructive" /> : null}
      {review ? (
        <>
          <Text>{review.payload.reason}</Text>
          <Text>
            {review.kind === "ADJUST"
              ? `${shortage ? "Shortage expense increases; recorded cash decreases" : "Surplus income increases; recorded cash increases"}. Effective at the original count time: ${new Date(source.asOf).toISOString()} UTC.`
              : `Correction effective: ${review.payload.effectiveAt.toISOString()} UTC.`}
          </Text>
          <Text className="text-sm text-muted-foreground">
            If financial records changed after this review, the server will
            require a new review. An uncertain submission retains the exact
            original review for recovery.
          </Text>
          <ActionButton
            disabled={!canSubmit}
            isLoading={command.pending}
            onPress={() => void confirm()}
          >
            Confirm and record
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={command.pending}
            onPress={() => setReview(null)}
          >
            Back to details
          </ActionButton>
        </>
      ) : (
        <>
          <FormField
            label="Investigated reason"
            value={reason}
            onChangeText={setReason}
            maxLength={400}
            multiline
          />
          {kind === "REVERSE" ? (
            <FormField
              label="Correction date (YYYY-MM-DD, UTC)"
              value={date}
              onChangeText={setDate}
              maxLength={10}
            />
          ) : null}
          <ActionButton
            disabled={!canSubmit}
            isLoading={preparing}
            onPress={() => void prepare()}
          >
            Review action
          </ActionButton>
        </>
      )}
      <ActionButton
        variant="outline"
        disabled={command.pending || preparing}
        onPress={onDone}
      >
        Back to count
      </ActionButton>
    </FinanceFormBody>
  )
}
