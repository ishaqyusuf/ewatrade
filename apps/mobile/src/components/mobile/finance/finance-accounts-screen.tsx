import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { FlatList, View } from "react-native"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import { FinanceMoneyForm } from "./finance-money-form"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { useMobileFinanceCommand } from "./use-mobile-finance-command"

export type FinanceMoneyAccount =
  RouterOutputs["finance"]["balances"]["accounts"][number]
export function isMoneyAccount(account: FinanceMoneyAccount) {
  return (
    account.kind === "ASSET" &&
    ["CASH", "BANK", "CLEARING"].includes(account.purpose)
  )
}
export function FinanceAccountsScreen() {
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <MoneyWorkspace
          key={`${workspace.actorUserId}:${workspace.tenantId}:${workspace.book.id}`}
          {...workspace}
        />
      )}
    </FinanceWorkspaceGate>
  )
}
function MoneyWorkspace({ book, actorUserId, tenantId }: FinanceWorkspace) {
  const trpc = useTRPC()
  const router = useRouter()
  const balances = useQuery(
    trpc.finance.balances.queryOptions({ bookId: book.id }, { retry: false }),
  )
  const command = useMobileFinanceCommand({
    bookId: book.id,
    actorUserId,
    tenantId,
  })
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [creating, setCreating] = useState(false)
  const accounts = balances.data?.accounts.filter(isMoneyAccount) ?? []
  const active = accounts.filter((a) => !a.archivedAt)
  const feedback = (
    <FinanceCommandFeedback
      command={command}
      onRecorded={() => setCreating(false)}
      onRejected={() => setCreating(false)}
    />
  )
  if (creating)
    return (
      <FinanceMoneyForm
        book={book}
        accounts={active}
        feedback={feedback}
        command={command}
        canSubmit={command.ready && !command.pending && !offline}
        onDone={() => setCreating(false)}
        onBack={() => setCreating(false)}
      />
    )
  return (
    <FlatList
      className="flex-1 px-4"
      data={balances.isError ? [] : accounts}
      keyExtractor={(item) => item.id}
      refreshing={balances.isRefetching}
      onRefresh={() => void balances.refetch()}
      ListHeaderComponent={
        <View className="gap-5 pb-4">
          <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Business money
          </Text>
          <Text className="text-sm text-muted-foreground">
            Recorded balances across cash, bank and clearing. Unposted sales and
            payments are excluded.
          </Text>
          {feedback}
          {balances.isError ? (
            <StatusBanner
              title="Balances unavailable"
              message={balances.error.message}
              tone="destructive"
              actionLabel="Try again"
              onActionPress={() => void balances.refetch()}
            />
          ) : null}
          {balances.data && !balances.isError ? (
            <View className="gap-2 border-y border-border py-5">
              <Text className="text-sm text-muted-foreground">
                Total recorded balance
              </Text>
              <Text className="text-3xl font-bold">
                {formatFinanceMoney(
                  accounts
                    .reduce(
                      (sum, account) => sum + BigInt(account.balanceMinor),
                      0n,
                    )
                    .toString(),
                  book.currencyCode,
                )}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {book.currencyCode} · {accounts.length} accounts · Includes
                archived balances
              </Text>
            </View>
          ) : null}
          <ActionButton
            disabled={
              !command.ready ||
              command.pending ||
              offline ||
              balances.isPending ||
              balances.isError ||
              active.length === 0
            }
            onPress={() => setCreating(true)}
          >
            Record money movement
          </ActionButton>
          <ActionButton
            variant="outline"
            onPress={() => router.push("/finance-counts-modal" as Href)}
          >
            Cash counts and investigation
          </ActionButton>
          <Text className="text-base font-bold">Your accounts</Text>
        </View>
      }
      ListEmptyComponent={
        <Text className="py-5 text-muted-foreground">
          {balances.isPending
            ? "Loading accounts…"
            : balances.isError
              ? "Refresh to load the current balances."
              : "Create a money account in Finance on the dashboard to get started."}
        </Text>
      }
      ListFooterComponent={
        <Text className="py-6 text-sm text-muted-foreground">
          Open an account to see its statement. Recording does not send money.
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.name} statement`}
          haptic
          className="flex-row flex-wrap items-center justify-between gap-3 border-b border-border py-5"
          onPress={() =>
            router.push({
              pathname: "/finance-account/[accountId]",
              params: { accountId: item.id },
            } as Href)
          }
        >
          <View className="min-w-0 flex-1">
            <Text className="text-base font-bold">{item.name}</Text>
            <Text className="text-sm text-muted-foreground">
              {item.purpose.toLowerCase()}
              {item.archivedAt ? " · Archived" : ""}
            </Text>
          </View>
          <Text className="text-base font-semibold">
            {formatFinanceMoney(item.balanceMinor, book.currencyCode)} ›
          </Text>
        </Pressable>
      )}
    />
  )
}
