import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { supersededCashCommandRecord } from "@ewatrade/utils/finance-command-identity"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ScrollView, View } from "react-native"
import { FinanceCashActionForm } from "./finance-cash-action-form"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { useMobileFinanceCommand } from "./use-mobile-finance-command"

export type CashCountDetail = RouterOutputs["finance"]["cashCount"]
export function FinanceCountScreen({ countId }: { countId: string }) {
  if (!countId)
    return <StatusBanner message="Choose a cash count from its history." />
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <CountWorkspace
          key={`${workspace.actorUserId}:${workspace.tenantId}:${workspace.book.id}:${countId}`}
          {...workspace}
          countId={countId}
        />
      )}
    </FinanceWorkspaceGate>
  )
}
function CountWorkspace({
  book,
  actorUserId,
  tenantId,
  countId,
}: FinanceWorkspace & { countId: string }) {
  const trpc = useTRPC()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const command = useMobileFinanceCommand({
    bookId: book.id,
    actorUserId,
    tenantId,
  })
  const detail = useQuery(
    trpc.finance.cashCount.queryOptions(
      { bookId: book.id, countId },
      { retry: false },
    ),
  )
  const [action, setAction] = useState<"ADJUST" | "REVERSE" | null>(null)
  const done = () => setAction(null)
  const feedback = (
    <FinanceCommandFeedback
      command={command}
      onRecorded={done}
      onRejected={done}
      onReviewCashCount={(pendingCountId) => {
        if (pendingCountId === countId) done()
        else return false
        return true
      }}
    />
  )
  const canAct = command.ready && !command.pending && !offline
  if (action && detail.data)
    return (
      <FinanceCashActionForm
        key={action}
        book={book}
        count={detail.data}
        kind={action}
        command={command}
        feedback={feedback}
        canSubmit={canAct}
        onDone={done}
      />
    )
  if (detail.isPending || detail.isError)
    return (
      <View className="gap-4 px-4">
        {feedback}
        {detail.isError ? (
          <StatusBanner
            title="Count unavailable"
            message={detail.error.message}
            tone="destructive"
            actionLabel="Try again"
            onActionPress={() => void detail.refetch()}
          />
        ) : (
          <Text>Loading cash count…</Text>
        )}
      </View>
    )
  const count = detail.data
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  const pending = command.retained?.command
  const completedRecordId = pending
    ? supersededCashCommandRecord(pending, count)
    : null
  async function acknowledgeCompleted() {
    if (!completedRecordId) return
    const result = await command.acknowledge(completedRecordId)
    if (result === "RECORDED" || result === "SUPERSEDED") done()
  }
  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-12">
      {feedback}
      <Text className="text-xl font-bold">{count.reference}</Text>
      <Text className="text-sm text-muted-foreground">
        {count.accountName} · Count time {new Date(count.asOf).toISOString()}{" "}
        UTC
      </Text>
      <View className="gap-3 border-y border-border py-4">
        <Text>Expected at count: {money(count.expectedBalanceMinor)}</Text>
        <Text>Observed: {money(count.observedBalanceMinor)}</Text>
        <Text className="text-xl font-bold">
          Difference at count: {money(count.differenceMinor)}
        </Text>
      </View>
      <Text className="text-sm text-muted-foreground">
        These are the original count facts, retained after corrections. Recorded{" "}
        {new Date(count.recordedAt).toISOString()} UTC.
      </Text>
      {count.reviewRequired ? (
        <StatusBanner
          title="Earlier cash history changed"
          message="Review missing or corrected transactions. Make a fresh physical count before adjusting; the original observation is retained."
          tone="warning"
        />
      ) : null}
      {count.adjustment ? (
        <View className="gap-3 border-b border-border py-4">
          <Text className="font-bold">
            {count.adjustment.reversal
              ? "Adjustment reversed · Original retained"
              : "Adjustment recorded · Original count retained"}
          </Text>
          <Text>{count.adjustment.description}</Text>
          <Text className="text-sm text-muted-foreground">
            Adjustment recorded{" "}
            {new Date(count.adjustment.recordedAt).toISOString()} UTC
          </Text>
          {count.adjustment.reversal ? (
            <Text className="text-sm text-muted-foreground">
              Reversal recorded{" "}
              {new Date(count.adjustment.reversal.recordedAt).toISOString()} UTC
            </Text>
          ) : null}
        </View>
      ) : BigInt(count.differenceMinor) === 0n ? (
        <StatusBanner
          title="Count matched"
          message="The physical observation matched the recorded balance at count. No adjustment is needed."
        />
      ) : null}
      {completedRecordId ? (
        <View className="gap-3">
          <Text className="text-sm text-muted-foreground">
            The existing cash action above matches the saved count and original
            adjustment. Acknowledgement rechecks that exact record and creates
            no extra entry.
          </Text>
          <ActionButton
            variant="outline"
            disabled={!canAct}
            onPress={() => void acknowledgeCompleted()}
          >
            Acknowledge completed cash action
          </ActionButton>
        </View>
      ) : null}
      {!count.adjustment &&
      !count.reviewRequired &&
      BigInt(count.differenceMinor) !== 0n ? (
        <ActionButton disabled={!canAct} onPress={() => setAction("ADJUST")}>
          Review investigated adjustment
        </ActionButton>
      ) : null}
      {count.adjustment && !count.adjustment.reversal ? (
        <ActionButton
          variant="outline"
          disabled={!canAct}
          onPress={() => setAction("REVERSE")}
        >
          Reverse adjustment
        </ActionButton>
      ) : null}
      {count.adjustment?.reversal ? (
        <Text className="text-sm text-muted-foreground">
          This count retains its original adjustment and reversal. Make a fresh
          physical count if further investigation requires another adjustment.
        </Text>
      ) : null}
      <ActionButton
        variant="outline"
        disabled={command.pending || detail.isRefetching}
        onPress={() => void detail.refetch()}
      >
        Refresh count history
      </ActionButton>
    </ScrollView>
  )
}
