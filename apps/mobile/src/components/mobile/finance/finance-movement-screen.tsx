import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import {
  type FinanceMoneyKind,
  financeMoneyKinds,
  prepareMoneyCorrection,
} from "@/lib/finance-money-input"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { View } from "react-native"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import { FinanceFormBody } from "./finance-form-body"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { useMobileFinanceCommand } from "./use-mobile-finance-command"

type Movement = RouterOutputs["finance"]["moneyMovement"]
type Review = {
  payload: ReturnType<typeof prepareMoneyCorrection>
  original: Movement
}
export function FinanceMovementScreen({ entryId }: { entryId: string }) {
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <MovementWorkspace
          key={`${workspace.actorUserId}:${workspace.tenantId}:${workspace.book.id}:${entryId}`}
          {...workspace}
          entryId={entryId}
        />
      )}
    </FinanceWorkspaceGate>
  )
}
function MovementWorkspace({
  book,
  actorUserId,
  tenantId,
  entryId,
}: FinanceWorkspace & { entryId: string }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const movement = useQuery(
    trpc.finance.moneyMovement.queryOptions(
      { bookId: book.id, entryId },
      { retry: false },
    ),
  )
  const mutation = useMutation(trpc.finance.reverseMoney.mutationOptions())
  const command = useMobileFinanceCommand({
    bookId: book.id,
    actorUserId,
    tenantId,
  })
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [correcting, setCorrecting] = useState(false)
  const [review, setReview] = useState<Review | null>(null)
  const [reason, setReason] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const preparationRevision = useRef(0)
  const canSubmit = command.ready && !command.pending && !offline && !preparing
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  function done() {
    preparationRevision.current += 1
    setPreparing(false)
    setCorrecting(false)
    setReview(null)
    setReason("")
    setError(null)
  }
  async function prepare() {
    if (preparing) return
    const revision = ++preparationRevision.current
    setPreparing(true)
    try {
      const original = await client.fetchQuery(
        trpc.finance.moneyMovement.queryOptions(
          { bookId: book.id, entryId },
          { staleTime: 0 },
        ),
      )
      // Acknowledgement/cancel must not restore an old review when this read finishes.
      if (revision !== preparationRevision.current) return
      if (original.bookId !== book.id || original.id !== entryId)
        throw new Error("The original movement changed. Refresh its history.")
      setReview({
        original,
        payload: prepareMoneyCorrection({
          bookId: book.id,
          entryId: original.id,
          sourceKind: original.sourceKind,
          effectiveAt: original.effectiveAt,
          reversed: Boolean(original.reversal || original.reversalOfId),
          reason,
          date,
        }),
      })
      setError(null)
    } catch (failure) {
      if (revision !== preparationRevision.current) return
      setError(
        failure instanceof Error
          ? failure.message
          : "The original movement could not be checked.",
      )
    } finally {
      if (revision === preparationRevision.current) setPreparing(false)
    }
  }
  async function confirm() {
    if (!review) return
    const attempt = review.payload
    if (
      await command.run(
        "reverseMoney",
        attempt,
        (id) => mutation.mutateAsync({ ...attempt, clientCommandId: id }),
        "Money movement reversed. Original history retained.",
      )
    )
      done()
  }
  const original = review?.original ?? movement.data
  return (
    <FinanceFormBody>
      <FinanceCommandFeedback
        command={command}
        onRecorded={done}
        onRejected={done}
      />
      {movement.isPending ? <Text>Loading money movement…</Text> : null}
      {movement.isError && !review ? (
        <StatusBanner
          title="Movement unavailable"
          message={movement.error.message}
          tone="destructive"
          actionLabel="Try again"
          onActionPress={() => void movement.refetch()}
        />
      ) : null}
      {original && (!movement.isError || review) ? (
        <>
          <Text className="text-xl font-bold">
            {review
              ? "Review correction"
              : (financeMoneyKinds[original.sourceKind as FinanceMoneyKind] ??
                "Money movement")}
          </Text>
          <Text className="text-base font-semibold">
            {original.description}
          </Text>
          <Text className="text-sm text-muted-foreground">
            Original date:{" "}
            {new Date(original.effectiveAt).toISOString().slice(0, 10)} UTC ·
            Recorded {new Date(original.recordedAt).toISOString().slice(0, 10)}{" "}
            UTC
          </Text>
          <View className="gap-4 border-y border-border py-4">
            {original.lines.map((line, index) => (
              <View key={`${line.accountId}:${index}`} className="gap-1">
                <Text className="font-semibold">{line.accountName}</Text>
                <Text>
                  Original debit {money(line.debitMinor)} · Credit{" "}
                  {money(line.creditMinor)}
                </Text>
                {review ? (
                  <Text className="text-primary">
                    Correction debit {money(line.creditMinor)} · Credit{" "}
                    {money(line.debitMinor)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
          {original.reversal ? (
            <StatusBanner
              title="Reversed · Original retained"
              message={`${original.reversal.description} · ${new Date(original.reversal.effectiveAt).toISOString().slice(0, 10)} UTC`}
            />
          ) : null}
          {error ? <StatusBanner message={error} tone="destructive" /> : null}
          {review ? (
            <>
              <Text>{review.payload.reason}</Text>
              <Text>
                Correction date:{" "}
                {review.payload.effectiveAt.toISOString().slice(0, 10)} UTC
              </Text>
              <Text className="text-sm text-muted-foreground">
                The correction adds the exact opposite lines and retains the
                original. It does not move real money or undo a bank transfer.
              </Text>
              <ActionButton
                disabled={!canSubmit}
                isLoading={command.pending}
                onPress={() => void confirm()}
              >
                Confirm reversal
              </ActionButton>
              <ActionButton
                variant="outline"
                disabled={command.pending}
                onPress={() => setReview(null)}
              >
                Back to details
              </ActionButton>
            </>
          ) : correcting ? (
            <>
              <Text className="text-sm text-muted-foreground">
                Explain the error and use a UTC date on or after the original
                movement, up to today.
              </Text>
              <FormField
                label="Reason for correction"
                value={reason}
                onChangeText={setReason}
                maxLength={400}
                multiline
              />
              <FormField
                label="Correction date (YYYY-MM-DD, UTC)"
                value={date}
                onChangeText={setDate}
                maxLength={10}
              />
              <ActionButton
                disabled={!canSubmit}
                isLoading={preparing}
                onPress={() => void prepare()}
              >
                Review correction
              </ActionButton>
              <ActionButton
                variant="outline"
                disabled={command.pending || preparing}
                onPress={done}
              >
                Keep original
              </ActionButton>
            </>
          ) : !original.reversal ? (
            <ActionButton
              variant="outline"
              disabled={!canSubmit}
              onPress={() => setCorrecting(true)}
            >
              Correct this movement
            </ActionButton>
          ) : null}
        </>
      ) : null}
    </FinanceFormBody>
  )
}
