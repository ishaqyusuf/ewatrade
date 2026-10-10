import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { RefreshControl, ScrollView, View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import { ListCard, SectionHeader } from "../green-till/kit"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import { financeDisplayDate } from "./finance-display"
import {
  FinanceExpenseCorrectionForm,
  FinanceExpensePaymentForm,
} from "./finance-expense-forms"
import { FinanceDetailScaffold } from "./finance-ledger-layout"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { useMobileFinanceCommand } from "./use-mobile-finance-command"

export type ExpenseDetail = RouterOutputs["finance"]["bill"]
export type ExpensePayment = ExpenseDetail["payments"][number]
type Action = { kind: "PAY" } | { kind: "CORRECT"; paymentId?: string }

export function FinanceExpenseScreen({ billId }: { billId: string }) {
  if (!billId)
    return <StatusBanner message="Choose an expense from spending records." />
  return (
    <FinanceWorkspaceGate requireOnline>
      {(workspace) => (
        <ExpenseWorkspace
          key={`${workspace.actorUserId}:${workspace.tenantId}:${workspace.book.id}:${billId}`}
          {...workspace}
          billId={billId}
        />
      )}
    </FinanceWorkspaceGate>
  )
}

function ExpenseWorkspace({
  book,
  actorUserId,
  tenantId,
  billId,
}: FinanceWorkspace & { billId: string }) {
  const trpc = useTRPC()
  const colors = useColors()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const command = useMobileFinanceCommand({
    actorUserId,
    tenantId,
    bookId: book.id,
  })
  const detail = useQuery(
    trpc.finance.bill.queryOptions(
      { bookId: book.id, billId },
      { retry: false, enabled: !offline },
    ),
  )
  const [action, setAction] = useState<Action | null>(null)
  const feedback = (
    <FinanceCommandFeedback
      command={command}
      onRecorded={() => setAction(null)}
      onRejected={() => setAction(null)}
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
  if (detail.isPending)
    return (
      <View className="gap-4 px-[18px]">
        {feedback}
        <Skeleton className="h-48 rounded-[22px]" />
      </View>
    )
  if (detail.isError)
    return (
      <View className="gap-4 px-[18px]">
        {feedback}
        <StatusBanner
          title="Expense unavailable"
          message={detail.error.message}
          actionLabel="Try again"
          onActionPress={() => void detail.refetch()}
          tone="destructive"
        />
      </View>
    )
  const bill = detail.data
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  const canAct = command.ready && !command.pending && !offline
  const done = () => setAction(null)
  if (action?.kind === "PAY")
    return (
      <FinanceExpensePaymentForm
        book={book}
        bill={bill}
        command={command}
        feedback={feedback}
        canSubmit={canAct}
        onDone={done}
        onBack={done}
      />
    )
  if (action?.kind === "CORRECT") {
    const payment = action.paymentId
      ? bill.payments.find((item) => item.id === action.paymentId)
      : undefined
    if (action.paymentId && !payment)
      return (
        <View className="gap-4 px-[18px]">
          {feedback}
          <StatusBanner
            message="The selected payment is unavailable. Refresh its expense history before continuing."
            tone="warning"
          />
          <ActionButton variant="outline" onPress={done}>
            Back to expense
          </ActionButton>
        </View>
      )
    return (
      <FinanceExpenseCorrectionForm
        book={book}
        bill={bill}
        payment={payment}
        command={command}
        feedback={feedback}
        canSubmit={canAct}
        onDone={done}
        onBack={done}
      />
    )
  }
  const activePayments = bill.payments.filter((payment) => !payment.reversedAt)
  const latestActive = activePayments.at(-1)
  const outstanding = BigInt(bill.outstandingMinor) > 0n
  const status = bill.voidedAt
    ? { label: "Cancelled", tone: "offline" as const }
    : !outstanding
      ? { label: "Paid", tone: "synced" as const }
      : BigInt(bill.paidMinor) > 0n
        ? { label: "Part paid", tone: "draft" as const }
        : { label: "Unpaid", tone: "draft" as const }
  const payFrom = (payment: ExpensePayment) =>
    payment.funding === "OWNER_CAPITAL"
      ? "owner’s own money"
      : payment.account.name
  // Newest first, ending with the original expense.
  const history = [
    ...bill.payments
      .slice()
      .reverse()
      .map((payment) => ({
        id: payment.id,
        title: `${money(payment.amountMinor)} from ${payFrom(payment)}`,
        detail: payment.reversedAt
          ? `Reversed${payment.reversalReason ? ` · ${payment.reversalReason}` : ""} · original retained`
          : `${financeDisplayDate(payment.effectiveAt)} · Recorded${payment.reference ? ` · ${payment.reference}` : ""}`,
        amount: money(payment.amountMinor),
        reversed: Boolean(payment.reversedAt),
      })),
    {
      id: bill.id,
      title: "Expense recorded",
      detail: `${financeDisplayDate(bill.incurredAt)} · ${money(bill.totalMinor)} owed`,
      amount: money(bill.totalMinor),
      reversed: false,
    },
  ]
  return (
    <ScrollView
      contentContainerClassName="gap-4 px-[18px] pb-12"
      refreshControl={
        <RefreshControl
          refreshing={detail.isRefetching}
          onRefresh={() => void detail.refetch()}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {feedback}
      <View className="gap-2">
        <HeroCard
          label="Still owed"
          pill={status}
          amount={money(bill.outstandingMinor)}
          sub={`${bill.description} · of ${money(bill.totalMinor)}`}
          stats={[
            { label: "Original", value: money(bill.totalMinor) },
            { label: "Paid", value: money(bill.paidMinor) },
            { label: "Payments", value: String(activePayments.length) },
          ]}
        />
        <Text className="mt-1 px-0.5 text-xs font-semibold text-muted-foreground">
          {bill.payeeName} · {financeDisplayDate(bill.incurredAt)} UTC
        </Text>
      </View>
      {bill.voidedAt ? (
        <StatusBanner
          title="Cancelled expense"
          message={`Original record retained. ${bill.voidReason ?? ""}${bill.voidEffectiveAt ? ` · Effective ${financeDisplayDate(bill.voidEffectiveAt)} UTC` : ""}`}
        />
      ) : (
        <View className="gap-2">
          <View className="flex-row gap-3">
            <View className="flex-1">
              {latestActive ? (
                <ActionButton
                  icon="Undo2"
                  variant="outline"
                  disabled={!canAct}
                  onPress={() =>
                    setAction({ kind: "CORRECT", paymentId: latestActive.id })
                  }
                >
                  Reverse payment
                </ActionButton>
              ) : (
                <ActionButton
                  icon="Ban"
                  variant="outline"
                  disabled={!canAct || BigInt(bill.paidMinor) !== 0n}
                  onPress={() => setAction({ kind: "CORRECT" })}
                >
                  Cancel expense
                </ActionButton>
              )}
            </View>
            {outstanding ? (
              <View className="flex-1">
                <ActionButton
                  icon="Wallet"
                  disabled={!canAct}
                  onPress={() => setAction({ kind: "PAY" })}
                >
                  Record payment
                </ActionButton>
              </View>
            ) : null}
          </View>
          {latestActive ? (
            <Text className="px-0.5 text-xs text-muted-foreground">
              To cancel this expense, reverse its payments first.
            </Text>
          ) : null}
        </View>
      )}
      <View>
        <SectionHeader title="Expense lines" />
        <ListCard>
          {bill.lines.map((line) => (
            <View
              key={line.id}
              className="min-h-12 flex-row items-center justify-between gap-3 py-3"
            >
              <Text
                className="min-w-0 flex-1 text-sm text-muted-foreground"
                numberOfLines={2}
              >
                {line.account.name}
                {line.description ? ` · ${line.description}` : ""}
              </Text>
              <Text className="text-sm font-bold tabular-nums text-foreground">
                {money(line.amountMinor)}
              </Text>
            </View>
          ))}
        </ListCard>
      </View>
      <View>
        <SectionHeader title="Payment history" />
        <ListCard>
          {history.map((entry, index) => (
            <View key={entry.id} className="flex-row gap-3 py-3">
              <View className="items-center pt-1.5">
                <View
                  className={
                    entry.id === bill.id
                      ? "size-2.5 rounded-full border-2 border-gold"
                      : entry.reversed
                        ? "size-2.5 rounded-full border-2 border-muted-foreground"
                        : "size-2.5 rounded-full border-2 border-primary"
                  }
                />
                {index < history.length - 1 ? (
                  <View className="mt-1 w-px flex-1 bg-border" />
                ) : null}
              </View>
              <View className="min-w-0 flex-1">
                <Text
                  className={
                    entry.reversed
                      ? "text-sm font-bold text-muted-foreground line-through"
                      : "text-sm font-bold text-foreground"
                  }
                >
                  {entry.title}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {entry.detail}
                </Text>
              </View>
              <Text className="text-sm font-bold tabular-nums text-foreground">
                {entry.amount}
              </Text>
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
          Recording a payment does not send money. It records money you already
          paid.
        </Text>
      </View>
    </ScrollView>
  )
}
