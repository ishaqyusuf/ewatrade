import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { supersededCashCommandRecord } from "@ewatrade/utils/finance-command-identity"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ScrollView, View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import { ListCard, SectionHeader } from "../green-till/kit"
import { FinanceCashActionForm } from "./finance-cash-action-form"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import { financeDisplayDate } from "./finance-display"
import { FinanceDetailScaffold } from "./finance-ledger-layout"
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
  const colors = useColors()
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
  const diff = BigInt(count.differenceMinor)
  const signedDiff = `${diff > 0n ? "+" : diff < 0n ? "−" : ""}${money((diff < 0n ? -diff : diff).toString())}`
  const canAdjust = !count.adjustment && !count.reviewRequired && diff !== 0n
  const canReverse = Boolean(count.adjustment && !count.adjustment.reversal)
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
      <HeroCard
        label="Difference at count"
        pill={
          count.adjustment?.reversal
            ? { label: "Adjustment reversed", tone: "offline" }
            : count.adjustment
              ? { label: "Adjusted", tone: "synced" }
              : diff === 0n
                ? { label: "Matched", tone: "synced" }
                : { label: "Needs review", tone: "draft" }
        }
        amount={signedDiff}
        sub={
          count.adjustment && !count.adjustment.reversal
            ? `Adjusted ${financeDisplayDate(count.adjustment.recordedAt)} · original count kept`
            : diff === 0n
              ? "Cash matched the recorded balance."
              : diff < 0n
                ? "Cash was short. Check records before adjusting."
                : "Cash was over. Check records before adjusting."
        }
        stats={[
          { label: "Expected", value: money(count.expectedBalanceMinor) },
          { label: "Counted", value: money(count.observedBalanceMinor) },
          { label: "Date", value: financeDisplayDate(count.asOf) },
        ]}
      />
      <Text className="-mt-1 px-0.5 text-xs font-semibold text-muted-foreground">
        {count.reference} · {count.accountName} ·{" "}
        {financeDisplayDate(count.asOf, true)} UTC
      </Text>
      {count.reviewRequired ? (
        <StatusBanner
          title="Earlier cash history changed"
          message="Count again before adjusting. The original count is kept."
          tone="warning"
        />
      ) : null}
      {completedRecordId ? (
        <View className="gap-2">
          <ActionButton
            variant="outline"
            disabled={!canAct}
            onPress={() => void acknowledgeCompleted()}
          >
            Acknowledge completed cash action
          </ActionButton>
          <Text className="px-0.5 text-xs text-muted-foreground">
            The saved count and adjustment already match. This rechecks them and
            adds no entry.
          </Text>
        </View>
      ) : null}
      {canAdjust || canReverse ? (
        <View className="gap-2">
          <View className="flex-row gap-3">
            <View className="flex-1">
              <ActionButton
                icon="RefreshCw"
                variant="outline"
                disabled={command.pending || detail.isRefetching}
                onPress={() => void detail.refetch()}
              >
                Refresh
              </ActionButton>
            </View>
            <View className="flex-1">
              {canAdjust ? (
                <ActionButton
                  icon="SlidersHorizontal"
                  disabled={!canAct}
                  onPress={() => setAction("ADJUST")}
                >
                  Adjust balance
                </ActionButton>
              ) : (
                <ActionButton
                  icon="Undo2"
                  disabled={!canAct}
                  onPress={() => setAction("REVERSE")}
                >
                  Reverse adjustment
                </ActionButton>
              )}
            </View>
          </View>
          {canAdjust ? (
            <Text className="px-0.5 text-xs text-muted-foreground">
              Check missing or corrected records first. Count again if records
              changed since this count.
            </Text>
          ) : null}
        </View>
      ) : null}
      <View>
        <SectionHeader title="History" />
        <ListCard>
          {[
            ...(count.adjustment?.reversal
              ? [
                  {
                    id: "reversal",
                    title: "Adjustment reversed · original kept",
                    detail: financeDisplayDate(
                      count.adjustment.reversal.recordedAt,
                      true,
                    ),
                    amount: undefined,
                    tone: "muted" as const,
                  },
                ]
              : []),
            ...(count.adjustment
              ? [
                  {
                    id: "adjustment",
                    title: "Adjustment recorded",
                    detail: `${financeDisplayDate(count.adjustment.recordedAt, true)} · ${count.adjustment.description}`,
                    amount: signedDiff,
                    tone: "ok" as const,
                  },
                ]
              : []),
            ...(diff !== 0n
              ? [
                  {
                    id: "difference",
                    title: "Difference found",
                    detail: `Expected ${money(count.expectedBalanceMinor)} from posted entries`,
                    amount: signedDiff,
                    tone: "warn" as const,
                  },
                ]
              : []),
            {
              id: "count",
              title: "Cash counted",
              detail: `${financeDisplayDate(count.recordedAt, true)} UTC`,
              amount: money(count.observedBalanceMinor),
              tone: "ok" as const,
            },
          ].map((entry, index, list) => (
            <View key={entry.id} className="flex-row gap-3 py-3">
              <View className="items-center pt-1.5">
                <View
                  className={cn(
                    "size-2.5 rounded-full border-2",
                    entry.tone === "warn"
                      ? "border-gold"
                      : entry.tone === "muted"
                        ? "border-muted-foreground"
                        : "border-primary",
                  )}
                />
                {index < list.length - 1 ? (
                  <View className="mt-1 w-px flex-1 bg-border" />
                ) : null}
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-foreground">
                  {entry.title}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {entry.detail}
                </Text>
              </View>
              {entry.amount ? (
                <Text className="text-sm font-bold tabular-nums text-foreground">
                  {entry.amount}
                </Text>
              ) : null}
            </View>
          ))}
        </ListCard>
      </View>
      <View className="flex-row gap-2 px-0.5">
        <Icon
          className="mt-0.5 size-[14px]"
          color={colors.mutedForeground}
          name="Info"
        />
        <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
          The original count is always kept. An adjustment adds a new entry; it
          never edits the count.
        </Text>
      </View>
    </ScrollView>
  )
}
