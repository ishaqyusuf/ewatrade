import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton } from "@/components/ui/skeleton"
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
import { financeDisplayDate } from "./finance-display"
import { FinanceDetailScaffold, HistoryTimeline } from "./finance-ledger-layout"
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
    <FinanceWorkspaceGate requireOnline>
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
      { retry: false, enabled: !offline },
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
  if (offline || (detail.isFetching && detail.data))
    return (
      <View className="gap-4 px-[18px]">
        {feedback}
        <FinanceDetailScaffold
          title="Financial record"
          label="Current record"
          loading={!offline}
          sub="Reconnect and refresh to view this record."
        />
        <StatusBanner
          tone="warning"
          title={offline ? "Reconnect to review" : "Refreshing original record"}
          message="Balances, history and actions require a fresh online read."
        />
      </View>
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
      <View className="gap-4 px-[18px]">
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
          <Skeleton className="h-48 rounded-[22px]" />
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
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-[18px] pb-12"
    >
      {feedback}
      <FinanceDetailScaffold
        title={count.reference}
        label="Difference at count"
        amount={money(count.differenceMinor)}
        sub={`${count.accountName} · ${financeDisplayDate(count.asOf, true)} UTC`}
        stats={[
          { label: "Expected", value: money(count.expectedBalanceMinor) },
          { label: "Observed", value: money(count.observedBalanceMinor) },
        ]}
      />
      <HistoryTimeline
        items={[
          {
            id: "count",
            title: "Original count retained",
            detail: `Recorded ${financeDisplayDate(count.recordedAt, true)} UTC`,
          },
          ...(count.adjustment
            ? [
                {
                  id: "adjustment",
                  title: "Adjustment recorded",
                  detail: `${count.adjustment.description} · ${financeDisplayDate(count.adjustment.recordedAt, true)} UTC`,
                },
              ]
            : []),
          ...(count.adjustment?.reversal
            ? [
                {
                  id: "reversal",
                  title: "Adjustment reversed · original retained",
                  detail: `${financeDisplayDate(count.adjustment.reversal.recordedAt, true)} UTC`,
                },
              ]
            : []),
        ]}
      />
      {count.reviewRequired ? (
        <StatusBanner
          title="Earlier cash history changed"
          message="Review missing or corrected transactions. Make a fresh physical count before adjusting; the original observation is retained."
          tone="warning"
        />
      ) : null}
      {!count.adjustment && BigInt(count.differenceMinor) === 0n ? (
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
