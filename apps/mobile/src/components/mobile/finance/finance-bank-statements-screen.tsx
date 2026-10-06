import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { FlatList, View } from "react-native"
import { validateNativeBankStatementPage } from "./finance-bank-read-state"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { useSupplierReadAuthority } from "./supplier-finance-screen"

export function FinanceBankStatementsScreen({
  accountId,
  imported,
}: { accountId?: string; imported?: boolean }) {
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <BankStatementsWorkspace
          key={JSON.stringify([
            workspace.actorUserId,
            workspace.tenantId,
            workspace.book.id,
          ])}
          {...workspace}
          initialAccountId={accountId}
          imported={imported}
        />
      )}
    </FinanceWorkspaceGate>
  )
}
function BankStatementsWorkspace({
  book,
  actorUserId,
  tenantId,
  initialAccountId,
  imported,
}: FinanceWorkspace & { initialAccountId?: string; imported?: boolean }) {
  const accounts = book.accounts.filter(
    (a) => a.kind === "ASSET" && ["BANK", "CLEARING"].includes(a.purpose),
  )
  const [accountId, setAccountId] = useState(
    accounts.some((a) => a.id === initialAccountId)
      ? initialAccountId
      : undefined,
  )
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const profile = getSession()?.profile
  const authorized =
    profile?.id === actorUserId &&
    profile.businessId === tenantId &&
    ["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? "")
  const query = useQuery(
    trpc.finance.bankStatements.list.queryOptions(
      {
        bookId: book.id,
        accountId,
        cursor: cursors.at(-1),
        limit: 30,
      },
      { enabled: false, retry: false, refetchOnWindowFocus: false },
    ),
  )
  const authority = useSupplierReadAuthority({
    scope: JSON.stringify([
      actorUserId,
      tenantId,
      book.id,
      book.currencyCode,
      accountId,
      cursors.at(-1),
    ]),
    enabled: authorized,
    offline,
    paused: query.fetchStatus === "paused",
    error: query.isError,
    fetching: query.isFetching,
    refetch: () => query.refetch(),
  })
  let data: typeof query.data
  let validationError: string | undefined
  if (authority.verified && !query.isFetching && query.isSuccess) {
    try {
      data = validateNativeBankStatementPage({
        page: query.data,
        bookId: book.id,
        currencyCode: book.currencyCode,
        accountId,
        limit: 30,
      })
    } catch (failure) {
      validationError =
        failure instanceof Error
          ? failure.message
          : "Refresh the original bank records."
    }
  }
  function chooseAccount(id?: string) {
    authority.invalidate()
    setAccountId(id)
    setCursors([undefined])
  }
  return (
    <FlatList
      className="flex-1 px-4"
      data={data?.items ?? []}
      keyExtractor={(item) => item.id}
      refreshing={query.isFetching}
      onRefresh={() => authority.runProtectedRead()}
      ListHeaderComponent={
        <View className="gap-4 pb-5">
          <Text className="text-sm text-muted-foreground">
            Original CSV evidence alongside posted business money. Imported
            balances are not live bank balances.
          </Text>
          {imported ? (
            <StatusBanner
              title="Statement recorded"
              message="The original imported statement is retained below. Refresh to see its current review status."
            />
          ) : null}
          {offline ? (
            <StatusBanner
              tone="warning"
              title="Offline"
              message="Reconnect and refresh to review current bank evidence."
            />
          ) : null}
          {query.isError || validationError ? (
            <StatusBanner
              tone="destructive"
              title="Bank statements unavailable"
              message={
                validationError ??
                query.error?.message ??
                "Refresh bank statements."
              }
              actionLabel="Try again"
              onActionPress={() => authority.runProtectedRead()}
            />
          ) : null}
          <Text className="font-semibold">Account filter</Text>
          <ActionButton
            variant={accountId ? "outline" : "secondary"}
            onPress={() => chooseAccount()}
          >
            All bank accounts
          </ActionButton>
          {accounts.map((a) => (
            <ActionButton
              key={a.id}
              variant={a.id === accountId ? "secondary" : "outline"}
              onPress={() => chooseAccount(a.id)}
            >
              {a.name}
              {a.archivedAt ? " · Archived" : ""}
            </ActionButton>
          ))}
          <ActionButton
            disabled={
              offline || !authorized || !accounts.some((a) => !a.archivedAt)
            }
            onPress={() =>
              router.push({
                pathname: "/finance-bank-import-modal",
                params: accountId ? { accountId } : {},
              } as Href)
            }
          >
            Import statement
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={offline || query.isFetching}
            onPress={() => authority.runProtectedRead()}
          >
            Refresh original records
          </ActionButton>
        </View>
      }
      ListEmptyComponent={
        <Text className="py-5 text-muted-foreground">
          {offline
            ? "Current bank evidence is unavailable offline."
            : query.isError || validationError
              ? "Refresh to load the original statements."
              : !data
                ? "Checking bank statements…"
                : "No imported statements for this account."}
        </Text>
      }
      ListFooterComponent={
        <View className="gap-3 py-6">
          <Text className="text-sm text-muted-foreground">
            Page {cursors.length}. Each page reads current original imports;
            refresh can include newer statements.
          </Text>
          <ActionButton
            variant="outline"
            disabled={offline || query.isFetching || cursors.length < 2}
            onPress={() => {
              authority.invalidate()
              setCursors((v) => v.slice(0, -1))
            }}
          >
            Previous page
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={offline || query.isFetching || !data?.nextCursor}
            onPress={() => {
              if (data?.nextCursor) {
                authority.invalidate()
                setCursors((v) => [...v, data.nextCursor ?? undefined])
              }
            }}
          >
            Next page
          </ActionButton>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Review original statement ${item.reference}`}
          haptic
          className="gap-2 border-b border-border py-5"
          onPress={() =>
            router.push({
              pathname: "/finance-bank/[statementId]",
              params: { statementId: item.id, accountId: item.accountId },
            } as Href)
          }
        >
          <Text className="text-xs text-muted-foreground">
            {accounts.find((a) => a.id === item.accountId)?.name ??
              "Original bank account"}
          </Text>
          <Text className="text-base font-semibold">{item.reference}</Text>
          <Text className="text-xl font-bold">
            {formatFinanceMoney(item.closingBalanceMinor, book.currencyCode)}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {item.startsAt.toISOString().slice(0, 10)} –{" "}
            {item.endsAt.toISOString().slice(0, 10)} UTC · {item.rowCount}{" "}
            original transactions
          </Text>
          <Text className="font-semibold text-primary">
            Review original statement ›
          </Text>
        </Pressable>
      )}
    />
  )
}
