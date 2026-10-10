import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { getSession } from "@/lib/session-store"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { FlatList, ScrollView, View } from "react-native"
import { ClassicCustomerBookFilter } from "../appearances/classic/customer-book-screen"
import { HeroCard } from "../green-till/hero-card"
import { RecordRow, RowDivider, SectionHeader } from "../green-till/kit"
import { validateNativeBankStatementPage } from "./finance-bank-read-state"
import { financeDisplayDate } from "./finance-display"
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
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 32 }}
      data={data?.items ?? []}
      keyExtractor={(item) => item.id}
      refreshing={query.isFetching}
      onRefresh={() => authority.runProtectedRead()}
      ListHeaderComponent={
        <View className="gap-4 pb-1">
          <HeroCard
            label="Imported from your bank"
            title={
              !data
                ? offline
                  ? "Reconnect to review"
                  : "Checking statements…"
                : data.items.length
                  ? `${data.items.length}${data.nextCursor ? "+" : ""} imported statement${data.items.length === 1 && !data.nextCursor ? "" : "s"}`
                  : "No statements yet"
            }
            sub="Imported balances are original evidence, not live bank balances."
            pill={offline ? { label: "Offline", tone: "offline" } : undefined}
          />
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
          <View className="flex-row gap-3">
            <View className="flex-1">
              <ActionButton
                icon="FileText"
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
                Import
              </ActionButton>
            </View>
            <View className="flex-1">
              <ActionButton
                icon="RefreshCw"
                variant="outline"
                disabled={offline || query.isFetching}
                onPress={() => authority.runProtectedRead()}
              >
                Refresh
              </ActionButton>
            </View>
          </View>
          {accounts.length > 1 ? (
            <ScrollView
              contentContainerStyle={{ gap: 8, paddingHorizontal: 18 }}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, marginHorizontal: -18 }}
            >
              {[
                { id: undefined, name: "All", archivedAt: null },
                ...accounts,
              ].map((account) => (
                <ClassicCustomerBookFilter
                  key={account.id ?? "all"}
                  active={account.id === accountId}
                  label={`${account.name}${account.archivedAt ? " · Archived" : ""}`}
                  onPress={() => chooseAccount(account.id)}
                />
              ))}
            </ScrollView>
          ) : null}
          {data?.items.length ? <SectionHeader title="Statements" /> : null}
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
        cursors.length > 1 || data?.nextCursor ? (
          <View className="mt-4 flex-row items-center gap-3">
            <View className="flex-1">
              <ActionButton
                icon="ChevronLeft"
                variant="outline"
                disabled={offline || query.isFetching || cursors.length < 2}
                onPress={() => {
                  authority.invalidate()
                  setCursors((v) => v.slice(0, -1))
                }}
              >
                Newer
              </ActionButton>
            </View>
            <Text className="text-xs font-bold text-muted-foreground">
              Page {cursors.length}
            </Text>
            <View className="flex-1">
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
                Older
              </ActionButton>
            </View>
          </View>
        ) : null
      }
      renderItem={({ item, index }) => {
        const last = index === (data?.items.length ?? 0) - 1
        const accountName =
          accounts.find((a) => a.id === item.accountId)?.name ??
          "Original bank account"
        return (
          <View
            className={cn(
              "overflow-hidden bg-card px-3.5",
              index === 0 && "rounded-t-[20px]",
              last && "rounded-b-[20px]",
            )}
          >
            <RecordRow
              stackDetails
              accessibilityLabel={`Review original statement ${item.reference}`}
              title={item.reference}
              meta={[
                accountName,
                `${financeDisplayDate(item.startsAt)} – ${financeDisplayDate(item.endsAt)} · ${item.rowCount} row${item.rowCount === 1 ? "" : "s"}`,
              ]}
              amount={formatFinanceMoney(
                item.closingBalanceMinor,
                book.currencyCode,
              )}
              avatar={{ icon: "FileText", tint: "sky" }}
              onPress={() =>
                router.push({
                  pathname: "/finance-bank/[statementId]",
                  params: { statementId: item.id, accountId: item.accountId },
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
