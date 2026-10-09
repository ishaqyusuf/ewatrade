import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { getSession } from "@/lib/session-store"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { FlatList, View } from "react-native"
import {
  type NativeBankStatementDetail,
  validateNativeBankStatementDetail,
} from "./finance-bank-read-state"
import { FinanceDetailScaffold } from "./finance-ledger-layout"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"
import { useSupplierReadAuthority } from "./supplier-finance-screen"

type Item =
  | { kind: "BANK"; row: NativeBankStatementDetail["rows"][number] }
  | { kind: "POSTED"; row: NativeBankStatementDetail["candidates"][number] }
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
  const items: Item[] = data
    ? [
        ...data.rows.map((row) => ({ kind: "BANK" as const, row })),
        ...data.candidates.map((row) => ({ kind: "POSTED" as const, row })),
      ]
    : []
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  return (
    <FlatList
      className="flex-1 px-[18px]"
      data={items}
      keyExtractor={(item) => `${item.kind}:${item.row.id}`}
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
          <ActionButton
            variant="outline"
            disabled={!enabled || offline || query.isFetching}
            onPress={() => authority.runProtectedRead()}
          >
            Refresh original evidence
          </ActionButton>
          {data ? (
            <>
              <FinanceDetailScaffold
                title={data.statement.reference}
                label="Closing difference"
                amount={money(data.closingDifferenceMinor)}
                sub={`${book.accounts.find((a) => a.id === accountId)?.name ?? "Bank account"} · original evidence`}
                stats={[
                  {
                    label: "Bank closing",
                    value: money(data.statement.closingBalanceMinor),
                  },
                  {
                    label: "Posted closing",
                    value: money(data.postedClosingMinor),
                  },
                ]}
              />
              <View className="gap-3 border-y border-border py-4">
                {[
                  ["Bank opening", data.statement.openingBalanceMinor],
                  ["Posted opening", data.postedOpeningMinor],
                  ["Opening difference", data.openingDifferenceMinor],
                  ["Bank closing", data.statement.closingBalanceMinor],
                  ["Posted closing", data.postedClosingMinor],
                  ["Closing difference", data.closingDifferenceMinor],
                ].map(([label, amount]) => (
                  <View key={label} className="gap-1">
                    <Text className="text-sm text-muted-foreground">
                      {label}
                    </Text>
                    <Text className="text-lg font-semibold">
                      {money(amount ?? "0")}
                    </Text>
                  </View>
                ))}
              </View>
              <StatusBanner
                tone="warning"
                message="Equal balances do not certify every transaction. Imported statement and original posted evidence remain separate records."
              />
              <Text className="text-sm text-muted-foreground">
                {data.unmatchedBankRows} bank rows still unmatched ·{" "}
                {money(data.unmatchedBankMinor)} net. Evidence revision{" "}
                {data.bankRevision} · journal snapshot {data.snapshotSequence}.
              </Text>
              {!data.candidateCoverageComplete ? (
                <StatusBanner
                  tone="warning"
                  message={`Posted candidates are capped at ${data.candidateReviewLimit}. This review does not cover every posted entry.`}
                />
              ) : null}
              <Text className="font-semibold">
                Original bank rows ({data.rows.length}) and posted candidates (
                {data.candidates.length})
              </Text>
            </>
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
      renderItem={({ item }) => (
        <View className="gap-2 border-b border-border py-5">
          <Text className="text-xs font-semibold text-muted-foreground">
            {item.kind === "BANK" ? "Original bank row" : "Posted candidate"}
          </Text>
          <Text className="text-base font-semibold">
            {item.row.description || "No bank description provided"}
          </Text>
          <Text className="text-lg font-semibold">
            {money(item.row.amountMinor)}
          </Text>
          {item.kind === "BANK" ? (
            <>
              <Text className="text-sm text-muted-foreground">
                {item.row.occurredAt.toISOString().slice(0, 10)} UTC ·{" "}
                {item.row.externalId}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {item.row.activeMatchId
                  ? "Linked to retained match"
                  : "Unmatched original row"}
              </Text>
            </>
          ) : (
            <>
              <Text className="text-sm text-muted-foreground">
                {item.row.effectiveAt.toISOString().slice(0, 10)} UTC ·{" "}
                {item.row.sourceKind.toLowerCase().replaceAll("_", " ")}
              </Text>
              <ActionButton
                variant="outline"
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
              >
                Review original posted source
              </ActionButton>
            </>
          )}
        </View>
      )}
    />
  )
}
