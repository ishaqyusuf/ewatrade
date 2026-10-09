import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { FlatList, View } from "react-native"
import { FinanceCashCountForm } from "./finance-cash-count-form"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import { financeDisplayDate } from "./finance-display"
import { FinanceDetailScaffold } from "./finance-ledger-layout"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { useMobileFinanceCommand } from "./use-mobile-finance-command"

export function FinanceCountsScreen() {
  return (
    <FinanceWorkspaceGate requireOnline>
      {(workspace) => (
        <CountsWorkspace
          key={`${workspace.actorUserId}:${workspace.tenantId}:${workspace.book.id}`}
          {...workspace}
        />
      )}
    </FinanceWorkspaceGate>
  )
}
function CountsWorkspace({ book, actorUserId, tenantId }: FinanceWorkspace) {
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const command = useMobileFinanceCommand({
    bookId: book.id,
    actorUserId,
    tenantId,
  })
  const balances = useQuery(
    trpc.finance.balances.queryOptions({ bookId: book.id }, { retry: false }),
  )
  const counts = useInfiniteQuery(
    trpc.finance.cashCounts.infiniteQueryOptions(
      { bookId: book.id, limit: 30 },
      {
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        retry: false,
      },
    ),
  )
  const [creating, setCreating] = useState(false)
  const accounts =
    balances.data?.accounts.filter(
      (a) => a.kind === "ASSET" && a.purpose === "CASH",
    ) ?? []
  const active = accounts.filter((a) => !a.archivedAt)
  const feedback = (
    <FinanceCommandFeedback
      command={command}
      onRecorded={() => setCreating(false)}
      onRejected={() => setCreating(false)}
    />
  )
  const canSubmit =
    command.ready &&
    !command.pending &&
    !offline &&
    !balances.isPending &&
    !balances.isError
  if (creating)
    return (
      <FinanceCashCountForm
        book={book}
        accounts={active}
        command={command}
        feedback={feedback}
        canSubmit={canSubmit}
        onDone={() => setCreating(false)}
        onBack={() => setCreating(false)}
      />
    )
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  return (
    <FlatList
      className="flex-1 px-[18px]"
      data={
        counts.isError
          ? []
          : (counts.data?.pages.flatMap((page) => page.items) ?? [])
      }
      keyExtractor={(item) => item.id}
      refreshing={counts.isRefetching || balances.isRefetching}
      onRefresh={() => {
        void counts.refetch()
        void balances.refetch()
      }}
      ListHeaderComponent={
        <View className="gap-4 pb-5">
          <Text className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Business money
          </Text>
          <Text className="text-sm text-muted-foreground">
            Count first. Investigate missing records before adjusting
            differences. Recorded balances include posted activity only.
          </Text>
          {feedback}
          {balances.isError ? (
            <StatusBanner
              title="Cash balances unavailable"
              message={balances.error.message}
              tone="destructive"
              actionLabel="Try again"
              onActionPress={() => void balances.refetch()}
            />
          ) : balances.data ? (
            <View className="gap-4">
              <FinanceDetailScaffold
                title="Cash counts"
                label="Recorded cash balance"
                amount={money(
                  accounts
                    .reduce((sum, a) => sum + BigInt(a.balanceMinor), 0n)
                    .toString(),
                )}
                sub="Posted activity only · includes archived accounts"
              />
              {accounts.map((account) => (
                <Text key={account.id}>
                  {account.name}
                  {account.archivedAt ? " · Archived" : ""}:{" "}
                  {money(account.balanceMinor)}
                </Text>
              ))}
            </View>
          ) : (
            <Skeleton className="h-48 rounded-[22px]" />
          )}
          <ActionButton
            disabled={!canSubmit || active.length === 0}
            onPress={() => setCreating(true)}
          >
            Record cash count
          </ActionButton>
          <Text className="text-lg font-bold">Cash count history</Text>
          {counts.isError ? (
            <StatusBanner
              message={counts.error.message}
              tone="destructive"
              actionLabel="Try again"
              onActionPress={() => void counts.refetch()}
            />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Text className="py-5 text-muted-foreground">
          {counts.isPending
            ? "Loading cash counts…"
            : counts.isError
              ? "Refresh to load the count history."
              : "No physical counts yet. Record the cash you can see, including zero."}
        </Text>
      }
      ListFooterComponent={
        <View className="gap-3 py-6">
          {counts.hasNextPage && !counts.isError ? (
            <ActionButton
              variant="outline"
              isLoading={counts.isFetchingNextPage}
              onPress={() => void counts.fetchNextPage()}
            >
              Load earlier counts
            </ActionButton>
          ) : null}
          <Text className="text-sm text-muted-foreground">
            Each difference is the original difference at count, retained after
            adjustments and reversals.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open count ${item.reference}`}
          haptic
          className="gap-2 border-b border-border py-4"
          onPress={() =>
            router.push({
              pathname: "/finance-count/[countId]",
              params: { countId: item.id },
            } as Href)
          }
        >
          <Text className="font-bold">{item.reference}</Text>
          <Text className="text-sm text-muted-foreground">
            {item.accountName} · {financeDisplayDate(item.asOf, true)} UTC
          </Text>
          <Text>Observed: {money(item.observedBalanceMinor)}</Text>
          <Text>
            Difference at count: {money(item.differenceAtCountMinor)} ›
          </Text>
        </Pressable>
      )}
    />
  )
}
