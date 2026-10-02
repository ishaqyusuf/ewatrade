import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FlatList, View } from "react-native"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import {
  FinanceExpenseCorrectionForm,
  FinanceExpensePaymentForm,
} from "./finance-expense-forms"
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
    <FinanceWorkspaceGate>
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
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const command = useMobileFinanceCommand({
    actorUserId,
    tenantId,
    bookId: book.id,
  })
  const detail = useQuery(
    trpc.finance.bill.queryOptions(
      { bookId: book.id, billId },
      { retry: false },
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
  if (detail.isPending)
    return (
      <View className="gap-4 px-4">
        {feedback}
        <Text>Loading expense…</Text>
      </View>
    )
  if (detail.isError)
    return (
      <View className="gap-4 px-4">
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
        <View className="gap-4 px-4">
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
  const activePayments = bill.payments.some((payment) => !payment.reversedAt)
  return (
    <FlatList
      contentContainerClassName="px-4 pb-12"
      data={bill.payments}
      keyExtractor={(payment) => payment.id}
      refreshing={detail.isRefetching}
      onRefresh={() => void detail.refetch()}
      ListHeaderComponent={
        <View className="gap-4 pb-4">
          {feedback}
          <Text className="text-xl font-bold">{bill.description}</Text>
          <Text className="text-sm text-muted-foreground">
            {bill.payeeName} ·{" "}
            {new Date(bill.incurredAt).toISOString().slice(0, 10)} UTC
          </Text>
          <View className="gap-2 border-y border-border py-4">
            <Text>Original expense: {money(bill.totalMinor)}</Text>
            <Text>Paid: {money(bill.paidMinor)}</Text>
            <Text className="text-xl font-bold">
              Still owed: {money(bill.outstandingMinor)}
            </Text>
          </View>
          {bill.voidedAt ? (
            <StatusBanner
              title="Cancelled expense"
              message={`Original record retained. ${bill.voidReason ?? ""}${bill.voidEffectiveAt ? ` · Effective ${new Date(bill.voidEffectiveAt).toISOString().slice(0, 10)} UTC` : ""}`}
            />
          ) : null}
          {bill.lines.map((line) => (
            <View key={line.id} className="gap-1 border-b border-border py-2">
              <Text>
                {line.account.name} · {money(line.amountMinor)}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {line.description}
              </Text>
            </View>
          ))}
          {!bill.voidedAt && BigInt(bill.outstandingMinor) > 0 ? (
            <ActionButton
              disabled={!canAct}
              onPress={() => setAction({ kind: "PAY" })}
            >
              Record payment
            </ActionButton>
          ) : null}
          {!bill.voidedAt ? (
            activePayments || BigInt(bill.paidMinor) !== 0n ? (
              <Text className="text-sm text-muted-foreground">
                Reverse active payments before cancelling this expense.
              </Text>
            ) : (
              <ActionButton
                variant="outline"
                disabled={!canAct}
                onPress={() => setAction({ kind: "CORRECT" })}
              >
                Cancel expense
              </ActionButton>
            )
          ) : null}
          <Text className="text-lg font-bold">Payment history</Text>
        </View>
      }
      ListEmptyComponent={
        <Text className="py-4 text-muted-foreground">
          No payments recorded.
        </Text>
      }
      renderItem={({ item }) => (
        <View className="gap-2 border-b border-border py-4">
          <Text className="font-bold">
            {money(item.amountMinor)} ·{" "}
            {item.reversedAt ? "Reversed" : "Recorded"}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {item.funding === "OWNER_CAPITAL"
              ? "Owner personal funds (capital contribution)"
              : item.account.name}{" "}
            · {new Date(item.effectiveAt).toISOString().slice(0, 10)} UTC
          </Text>
          {item.reference ? (
            <Text className="text-sm">Reference: {item.reference}</Text>
          ) : null}
          {item.reversedAt ? (
            <Text className="text-sm text-muted-foreground">
              {item.reversalReason}
              {item.reversalEffectiveAt
                ? ` · Effective ${new Date(item.reversalEffectiveAt).toISOString().slice(0, 10)} UTC`
                : ""}
            </Text>
          ) : !bill.voidedAt ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Reverse payment of ${money(item.amountMinor)}`}
              className="min-h-11 justify-center"
              disabled={!canAct}
              onPress={() => setAction({ kind: "CORRECT", paymentId: item.id })}
            >
              <Text className="font-semibold text-primary">
                Reverse recorded payment
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    />
  )
}
