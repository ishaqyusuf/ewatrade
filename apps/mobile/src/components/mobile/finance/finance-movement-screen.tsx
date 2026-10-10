import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton } from "@/components/ui/skeleton"
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
import { HeroCard } from "../green-till/hero-card"
import { ListCard, SectionHeader } from "../green-till/kit"
import { FinanceBankDateField } from "./finance-bank-date-field"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import { financeDisplayDate } from "./finance-display"
import { FinanceFormBody } from "./finance-form-body"
import { HistoryTimeline } from "./finance-ledger-layout"
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
    <FinanceWorkspaceGate requireOnline>
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
  const total = (original?.lines ?? [])
    .reduce((sum, line) => sum + BigInt(line.debitMinor), 0n)
    .toString()
  const into = original?.lines.find((line) => BigInt(line.debitMinor) > 0n)
  const from = original?.lines.find((line) => BigInt(line.creditMinor) > 0n)
  return (
    <FinanceFormBody>
      <FinanceCommandFeedback
        command={command}
        onRecorded={done}
        onRejected={done}
      />
      {movement.isPending ? <Skeleton className="h-48 rounded-[22px]" /> : null}
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
          <HeroCard
            label={
              review
                ? "Review reversal"
                : (financeMoneyKinds[original.sourceKind as FinanceMoneyKind] ??
                  "Money movement")
            }
            pill={
              review
                ? { label: "Not saved yet", tone: "draft" }
                : original.reversal
                  ? { label: "Reversed", tone: "offline" }
                  : { label: "Recorded", tone: "synced" }
            }
            amount={money(total)}
            sub={original.description}
            stats={[
              ...(into ? [{ label: "Into", value: into.accountName }] : []),
              ...(from ? [{ label: "From", value: from.accountName }] : []),
              {
                label: "Date",
                value: financeDisplayDate(original.effectiveAt),
              },
            ]}
          />
          <Text className="-mt-1 px-0.5 text-xs font-semibold text-muted-foreground">
            Recorded {financeDisplayDate(original.recordedAt, true)} UTC
          </Text>
          {!review && !correcting && !original.reversal ? (
            <View className="gap-2">
              <ActionButton
                icon="Undo2"
                disabled={!canSubmit}
                onPress={() => setCorrecting(true)}
              >
                Reverse movement
              </ActionButton>
              <Text className="px-0.5 text-xs text-muted-foreground">
                Reversing adds the opposite entry. It never edits or deletes
                this one.
              </Text>
            </View>
          ) : null}
          <View>
            <SectionHeader
              title={review ? "Accounts after reversal" : "Accounts changed"}
            />
            <ListCard>
              {original.lines.map((line, index) => {
                const net = BigInt(line.debitMinor) - BigInt(line.creditMinor)
                const shown = review ? -net : net
                return (
                  <View
                    key={`${line.accountId}:${index}`}
                    className="min-h-12 flex-row items-center justify-between gap-3 py-3"
                  >
                    <Text className="min-w-0 flex-1 text-sm text-foreground">
                      {line.accountName}
                    </Text>
                    <Text className="text-sm font-bold tabular-nums text-foreground">
                      {shown > 0n ? "+" : shown < 0n ? "−" : ""}
                      {money((shown < 0n ? -shown : shown).toString())}
                    </Text>
                  </View>
                )
              })}
            </ListCard>
          </View>
          <HistoryTimeline
            items={[
              ...(original.reversal
                ? [
                    {
                      id: "reversal",
                      title: "Reversed · original kept",
                      detail: `${financeDisplayDate(original.reversal.effectiveAt)} · ${original.reversal.description}`,
                    },
                  ]
                : []),
              {
                id: "original",
                title: "Movement recorded",
                detail: `Effective ${financeDisplayDate(original.effectiveAt)} · ${money(total)}`,
              },
            ]}
          />
          {error ? <StatusBanner message={error} tone="destructive" /> : null}
          {review ? (
            <>
              <View className="gap-1 rounded-[20px] bg-card px-4 py-3 shadow-sm">
                <Text className="text-xs font-bold text-muted-foreground">
                  Reason · {financeDisplayDate(review.payload.effectiveAt)}
                </Text>
                <Text className="text-sm text-foreground">
                  {review.payload.reason}
                </Text>
              </View>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <ActionButton
                    variant="outline"
                    disabled={command.pending}
                    onPress={() => setReview(null)}
                  >
                    Back
                  </ActionButton>
                </View>
                <View className="flex-1">
                  <ActionButton
                    disabled={!canSubmit}
                    isLoading={command.pending}
                    onPress={() => void confirm()}
                  >
                    Confirm reversal
                  </ActionButton>
                </View>
              </View>
              <Text className="px-0.5 text-xs text-muted-foreground">
                This adds the exact opposite lines and keeps the original. It
                does not move real money or undo a bank transfer.
              </Text>
            </>
          ) : correcting ? (
            <>
              <SectionHeader title="Reverse this movement" />
              <Text className="-mt-2 px-0.5 text-xs text-muted-foreground">
                Explain the error and pick a date on or after the original, up
                to today.
              </Text>
              <FormField
                label="Reason for correction"
                value={reason}
                onChangeText={setReason}
                maxLength={400}
                multiline
              />
              <FinanceBankDateField
                label="Correction date"
                value={date}
                onChange={setDate}
                minimum={new Date(original.effectiveAt)
                  .toISOString()
                  .slice(0, 10)}
                maximum={new Date().toISOString().slice(0, 10)}
                disabled={!canSubmit}
              />
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <ActionButton
                    variant="outline"
                    disabled={command.pending || preparing}
                    onPress={done}
                  >
                    Keep original
                  </ActionButton>
                </View>
                <View className="flex-1">
                  <ActionButton
                    disabled={!canSubmit}
                    isLoading={preparing}
                    onPress={() => void prepare()}
                  >
                    Review
                  </ActionButton>
                </View>
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </FinanceFormBody>
  )
}
