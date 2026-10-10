import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { FlatList, View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import {
  QuickActionRow,
  RecordRow,
  RowDivider,
  SectionHeader,
} from "../green-till/kit"
import { FinanceCommandFeedback } from "./finance-command-feedback"
import { FinanceMoneyForm } from "./finance-money-form"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { useMobileFinanceCommand } from "./use-mobile-finance-command"

const PURPOSE_LABELS = {
  BANK: "Bank",
  CASH: "Cash",
  CLEARING: "Clearing",
} as const

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
  const archivedCount = accounts.length - active.length
  const colors = useColors()
  const purposeTotals = (["CASH", "BANK", "CLEARING"] as const)
    .map((purpose) => {
      const list = accounts.filter((a) => a.purpose === purpose)
      return {
        label: PURPOSE_LABELS[purpose],
        count: list.length,
        value: formatFinanceMoney(
          list.reduce((sum, a) => sum + BigInt(a.balanceMinor), 0n).toString(),
          book.currencyCode,
        ),
      }
    })
    .filter((total) => total.count > 0)
  const canMove =
    command.ready &&
    !command.pending &&
    !offline &&
    !balances.isPending &&
    !balances.isError &&
    active.length > 0
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
      contentContainerClassName="px-[18px] pb-12"
      data={balances.isError ? [] : accounts}
      keyExtractor={(item) => item.id}
      refreshing={balances.isRefetching}
      onRefresh={offline ? undefined : () => void balances.refetch()}
      ListHeaderComponent={
        <View className="gap-4 pb-1">
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
              pill={
                offline
                  ? { label: "Offline", tone: "offline" }
                  : { label: book.currencyCode, tone: "synced" }
              }
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
              sub={
                offline && balances.data
                  ? `Saved balances · as of ${new Date(balances.dataUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                  : `${accounts.length} account${accounts.length === 1 ? "" : "s"}${archivedCount ? ` · includes ${archivedCount} archived` : ""}`
              }
              stats={
                balances.data && purposeTotals.length > 1
                  ? purposeTotals.map(({ label, value }) => ({ label, value }))
                  : undefined
              }
            />
          )}
          {balances.data && active.length === 0 ? (
            <StatusBanner
              title="No active money accounts"
              message="Create or reactivate a money account in Finance on the dashboard before recording a movement."
              tone="muted"
            />
          ) : null}
          <QuickActionRow
            actions={[
              {
                disabled: !canMove,
                gold: true,
                icon: "ArrowLeftRight",
                label: "Move money",
                onPress: () => setCreating(true),
              },
              {
                icon: "ClipboardList",
                label: "Cash count",
                onPress: () => router.push("/finance-counts-modal" as Href),
              },
              {
                icon: "FileText",
                label: "Bank import",
                onPress: () => router.push("/finance-bank-modal" as Href),
              },
              {
                icon: "BarChart3",
                label: "Reports",
                onPress: () => router.push("/finance-reports-modal" as Href),
              },
            ]}
          />
          {accounts.length ? <SectionHeader title="Your accounts" /> : null}
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
        <View className="mt-3 flex-row gap-2 px-0.5">
          <Icon
            className="mt-0.5 size-[14px]"
            color={colors.mutedForeground}
            name="Info"
          />
          <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
            Unposted sales and payments are excluded. Recording a movement does
            not send money.
          </Text>
        </View>
      }
      renderItem={({ item, index }) => {
        const last = index === accounts.length - 1
        return (
          <View
            className={cn(
              "overflow-hidden bg-card px-3.5",
              index === 0 && "rounded-t-[20px]",
              last && "rounded-b-[20px]",
              item.archivedAt && "opacity-60",
            )}
          >
            <RecordRow
              stackDetails
              title={item.name}
              meta={`${PURPOSE_LABELS[item.purpose as keyof typeof PURPOSE_LABELS] ?? "Account"}${item.archivedAt ? " · Archived" : ""}`}
              amount={formatFinanceMoney(item.balanceMinor, book.currencyCode)}
              avatar={{
                icon:
                  item.purpose === "CASH"
                    ? "Wallet"
                    : item.purpose === "CLEARING"
                      ? "CreditCard"
                      : "Building2",
                tint:
                  item.purpose === "CASH"
                    ? "mint"
                    : item.purpose === "CLEARING"
                      ? "amber"
                      : "sky",
              }}
              onPress={() =>
                router.push({
                  pathname: "/finance-account/[accountId]",
                  params: { accountId: item.id },
                } as Href)
              }
            />
            {last ? null : <RowDivider />}
          </View>
        )
      }}
    />
  )
}
