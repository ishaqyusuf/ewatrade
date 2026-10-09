import { ActionButton } from "@/components/mobile/action-button"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { FlatList, View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import { ListCard, RecordRow } from "../green-till/kit"
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
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const trpc = useTRPC()
  const router = useRouter()
  const balances = useQuery(
    trpc.finance.balances.queryOptions(
      { bookId: book.id },
      { retry: false, enabled: !offline },
    ),
  )
  const command = useMobileFinanceCommand({
    bookId: book.id,
    actorUserId,
    tenantId,
  })
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
      className="flex-1"
      contentContainerClassName="gap-3 px-[18px] pb-12"
      data={balances.isError ? [] : accounts}
      keyExtractor={(item) => item.id}
      refreshing={balances.isRefetching}
      onRefresh={offline ? undefined : () => void balances.refetch()}
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
          {balances.isPending && !offline ? (
            <Skeleton className="h-48 rounded-[22px]" />
          ) : (
            <HeroCard
              label="Total recorded balance"
              amount={
                balances.data
                  ? formatFinanceMoney(
                      accounts
                        .reduce((sum, a) => sum + BigInt(a.balanceMinor), 0n)
                        .toString(),
                      book.currencyCode,
                    )
                  : "—"
              }
              sub={`${book.currencyCode} · ${accounts.length} loaded accounts · includes archived balances`}
            />
          )}
          {offline ? (
            <StatusBanner
              title="Reconnect to record"
              message={
                balances.data
                  ? `Saved balances · as of ${new Date(balances.dataUpdatedAt).toLocaleString()}`
                  : "Reconnect to load money accounts."
              }
              tone="warning"
            />
          ) : null}
          {balances.data && active.length === 0 ? (
            <StatusBanner
              title="No active money accounts"
              message="Create or reactivate a money account in Finance on the dashboard before recording a movement."
              tone="muted"
            />
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
          <ActionButton
            variant="outline"
            onPress={() => router.push("/finance-bank-modal" as Href)}
          >
            Bank statements and original evidence
          </ActionButton>
        </View>
      }
      ListEmptyComponent={
        balances.isPending ? (
          <ListSkeleton count={4} label="Loading accounts" variant="ledger" />
        ) : (
          <Text className="py-5 text-muted-foreground">
            {balances.isError
              ? "Refresh to load the current balances."
              : "Create a money account in Finance on the dashboard to get started."}
          </Text>
        )
      }
      ListFooterComponent={
        <Text className="py-6 text-sm text-muted-foreground">
          Open an account to see its statement. Recording does not send money.
        </Text>
      }
      renderItem={({ item }) => (
        <ListCard>
          <RecordRow
            stackDetails
            title={item.name}
            meta={`${item.purpose.toLowerCase()}${item.archivedAt ? " · Archived" : ""}`}
            amount={formatFinanceMoney(item.balanceMinor, book.currencyCode)}
            avatar={{
              icon: item.purpose === "CASH" ? "Wallet" : "Building2",
              tint: item.purpose === "CASH" ? "mint" : "sky",
            }}
            onPress={() =>
              router.push({
                pathname: "/finance-account/[accountId]",
                params: { accountId: item.id },
              } as Href)
            }
          />
        </ListCard>
      )}
    />
  )
}
