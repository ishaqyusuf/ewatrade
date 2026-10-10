import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { getSession } from "@/lib/session-store"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { FlatList, View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import {
  RecordRow,
  RowDivider,
  SectionHeader,
  StatusPill,
} from "../green-till/kit"
import {
  type NativeBankStatementDetail,
  validateNativeBankStatementDetail,
} from "./finance-bank-read-state"
import { financeDisplayDate } from "./finance-display"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { useSupplierReadAuthority } from "./supplier-finance-screen"

type Place = { first: boolean; last: boolean }
type Row =
  | { kind: "BANK"; row: NativeBankStatementDetail["rows"][number] }
  | { kind: "POSTED"; row: NativeBankStatementDetail["candidates"][number] }
type Item =
  | { kind: "HEADER"; id: string; title: string; count: number }
  | (Row & Place)

/** Header plus rows placed in one rounded card. */
function section(id: string, title: string, rows: Row[]): Item[] {
  if (!rows.length) return []
  return [
    { kind: "HEADER", id, title, count: rows.length },
    ...rows.map((row, index) => ({
      ...row,
      first: index === 0,
      last: index === rows.length - 1,
    })),
  ]
}

function sourceLabel(kind: string) {
  const words = kind.replaceAll("_", " ").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
export function FinanceBankStatementScreen({
  statementId,
  accountId,
}: { statementId: string; accountId: string }) {
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <StatementWorkspace
          key={JSON.stringify([
            workspace.actorUserId,
            workspace.tenantId,
            workspace.book.id,
            statementId,
            accountId,
          ])}
          {...workspace}
          statementId={statementId}
          accountId={accountId}
        />
      )}
    </FinanceWorkspaceGate>
  )
}
function StatementWorkspace({
  book,
  actorUserId,
  tenantId,
  statementId,
  accountId,
}: FinanceWorkspace & { statementId: string; accountId: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const profile = getSession()?.profile
  const enabled = Boolean(
    statementId &&
      accountId &&
      book.accounts.some(
        (a) =>
          a.id === accountId &&
          a.kind === "ASSET" &&
          ["BANK", "CLEARING"].includes(a.purpose),
      ) &&
      profile?.id === actorUserId &&
      profile.businessId === tenantId &&
      ["OWNER", "ADMIN"].includes(profile.role?.trim().toUpperCase() ?? ""),
  )
  const query = useQuery(
    trpc.finance.bankStatements.get.queryOptions(
      { bookId: book.id, statementId },
      { enabled: false, retry: false, refetchOnWindowFocus: false },
    ),
  )
  const authority = useSupplierReadAuthority({
    scope: JSON.stringify([
      actorUserId,
      tenantId,
      book.id,
      book.currencyCode,
      statementId,
      accountId,
    ]),
    enabled,
    offline,
    paused: query.fetchStatus === "paused",
    error: query.isError,
    fetching: query.isFetching,
    refetch: () => query.refetch(),
  })
  let data: NativeBankStatementDetail | undefined
  let error: string | undefined
  if (authority.verified && !query.isFetching && query.isSuccess) {
    try {
      data = validateNativeBankStatementDetail({
        detail: query.data,
        bookId: book.id,
        currencyCode: book.currencyCode,
        accountId,
        statementId,
        bookStartsAt: book.startsAt,
      })
    } catch (failure) {
      error =
        failure instanceof Error
          ? failure.message
          : "Refresh the original statement."
    }
  }
  const unmatched = data?.rows.filter((row) => !row.activeMatchId) ?? []
  const matched = data?.rows.filter((row) => row.activeMatchId) ?? []
  const items: Item[] = data
    ? [
        ...section(
          "unmatched",
          "Needs a match",
          unmatched.map((row) => ({ kind: "BANK" as const, row })),
        ),
        ...section(
          "matched",
          "Matched",
          matched.map((row) => ({ kind: "BANK" as const, row })),
        ),
        ...section(
          "posted",
          "Posted entries to compare",
          data.candidates.map((row) => ({ kind: "POSTED" as const, row })),
        ),
      ]
    : []
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  const colors = useColors()
  const accountName =
    book.accounts.find((a) => a.id === accountId)?.name ?? "Bank account"
  const balanced = data ? BigInt(data.closingDifferenceMinor) === 0n : false
  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 48 }}
      data={items}
      keyExtractor={(item) =>
        item.kind === "HEADER" ? item.id : `${item.kind}:${item.row.id}`
      }
      refreshing={query.isFetching}
      onRefresh={() => authority.runProtectedRead()}
      ListHeaderComponent={
        <View className="gap-4 pb-5">
          {!enabled ? (
            <StatusBanner
              tone="warning"
              message="Choose an original statement and bank account in this finance book."
            />
          ) : null}
          {offline ? (
            <StatusBanner
              tone="warning"
              message="Reconnect and refresh to review this bank statement."
            />
          ) : null}
          {query.isError || error ? (
            <StatusBanner
              tone="destructive"
              title="Statement unavailable"
              message={
                error ?? query.error?.message ?? "Refresh bank evidence."
              }
              actionLabel="Try again"
              onActionPress={() => authority.runProtectedRead()}
            />
          ) : null}
          {data ? (
            <>
              <HeroCard
                label="Closing difference"
                pill={
                  unmatched.length
                    ? {
                        label: `${unmatched.length} unmatched row${unmatched.length === 1 ? "" : "s"}`,
                        tone: "draft",
                      }
                    : balanced
                      ? { label: "Balanced", tone: "synced" }
                      : undefined
                }
                amount={money(data.closingDifferenceMinor)}
                sub={`Bank ${money(data.statement.closingBalanceMinor)} · Posted ${money(data.postedClosingMinor)}`}
                stats={[
                  {
                    label: "Opening diff",
                    value: money(data.openingDifferenceMinor),
                  },
                  {
                    label: "Matched",
                    value: `${matched.length} of ${data.rows.length}`,
                  },
                  { label: "Unmatched", value: String(unmatched.length) },
                ]}
              />
              <View className="flex-row gap-2 px-0.5">
                <Icon
                  className="mt-0.5 size-[14px]"
                  color={colors.mutedForeground}
                  name="Info"
                />
                <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {data.statement.reference} · {accountName} ·{" "}
                  {financeDisplayDate(data.statement.startsAt)} –{" "}
                  {financeDisplayDate(data.statement.endsAt)} · imported{" "}
                  {financeDisplayDate(data.statement.importedAt)}
                </Text>
              </View>
            </>
          ) : null}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <ActionButton
                icon="FileText"
                disabled={!enabled || offline}
                onPress={() =>
                  router.push({
                    pathname: "/finance-bank-import-modal",
                    params: { accountId },
                  } as Href)
                }
              >
                Import next
              </ActionButton>
            </View>
            <View className="flex-1">
              <ActionButton
                icon="RefreshCw"
                variant="outline"
                disabled={!enabled || offline || query.isFetching}
                onPress={() => authority.runProtectedRead()}
              >
                Refresh
              </ActionButton>
            </View>
          </View>
          {data && !data.candidateCoverageComplete ? (
            <StatusBanner
              tone="warning"
              message={`Only the first ${data.candidateReviewLimit} posted entries are shown, so this review doesn’t cover every posted entry.`}
            />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Text className="py-5 text-muted-foreground">
          {!enabled || offline
            ? "Current evidence is unavailable."
            : query.isError || error
              ? "Refresh before reviewing original rows."
              : !data
                ? "Checking original statement…"
                : "No rows or posted candidates in this statement."}
        </Text>
      }
      ListFooterComponent={
        data ? (
          <View className="mt-4 gap-1 px-0.5">
            <Text className="text-xs text-muted-foreground">
              Equal balances do not prove every transaction. The imported
              statement and posted records stay separate.
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              Evidence revision {data.bankRevision} · journal snapshot{" "}
              {data.snapshotSequence}
            </Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => {
        if (item.kind === "HEADER")
          return (
            <SectionHeader
              title={item.title}
              trailing={
                <Text className="text-xs font-bold text-muted-foreground">
                  {item.count}
                </Text>
              }
            />
          )
        const shell = cn(
          "overflow-hidden bg-card px-3.5",
          item.first && "rounded-t-[20px]",
          item.last && "rounded-b-[20px]",
        )
        if (item.kind === "BANK") {
          const isMatched = Boolean(item.row.activeMatchId)
          return (
            <View className={shell}>
              <RecordRow
                stackDetails
                title={item.row.description || "No bank description"}
                meta={`${financeDisplayDate(item.row.occurredAt)} · Original bank row`}
                amount={money(item.row.amountMinor)}
                avatar={{
                  icon: isMatched ? "Link" : "TriangleAlert",
                  tint: isMatched ? "mint" : "amber",
                }}
                status={
                  <StatusPill
                    label={isMatched ? "Matched" : "Unmatched"}
                    tone={isMatched ? "ok" : "warn"}
                  />
                }
              />
              {item.last ? null : <RowDivider />}
            </View>
          )
        }
        return (
          <View className={shell}>
            <RecordRow
              stackDetails
              accessibilityLabel={`Review posted source, ${item.row.description || sourceLabel(item.row.sourceKind)}`}
              title={item.row.description || sourceLabel(item.row.sourceKind)}
              meta={`${financeDisplayDate(item.row.effectiveAt)} · ${sourceLabel(item.row.sourceKind)}`}
              amount={money(item.row.amountMinor)}
              avatar={{ icon: "ReceiptText", tint: "sky" }}
              onPress={() =>
                router.push({
                  pathname: "/finance-bank-source/[entryId]",
                  params: {
                    entryId: item.row.entryId,
                    accountId,
                    statementId,
                  },
                } as Href)
              }
            />
            {item.last ? null : <RowDivider />}
          </View>
        )
      }}
    />
  )
}
