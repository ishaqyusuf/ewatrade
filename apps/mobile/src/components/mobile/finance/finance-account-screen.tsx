import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { prepareFinanceStatementRange } from "@/lib/finance-money-input"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { FlatList, View } from "react-native"
import { FinanceFormBody } from "./finance-form-body"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "./finance-workspace-gate"

type Window = { from: Date; through: Date; revision: number }
export function FinanceAccountScreen({ accountId }: { accountId: string }) {
  return (
    <FinanceWorkspaceGate>
      {(workspace) => (
        <AccountWorkspace
          key={`${workspace.actorUserId}:${workspace.tenantId}:${workspace.book.id}:${accountId}`}
          {...workspace}
          accountId={accountId}
        />
      )}
    </FinanceWorkspaceGate>
  )
}
function AccountWorkspace({
  book,
  accountId,
}: FinanceWorkspace & { accountId: string }) {
  const [window, setWindow] = useState<Window>(() => ({
    ...prepareFinanceStatementRange(
      new Date(book.startsAt).toISOString().slice(0, 10),
      new Date().toISOString().slice(0, 10),
      book.startsAt,
    ),
    revision: 0,
  }))
  return (
    <StatementWindow
      key={`${window.from.toISOString()}:${window.through.toISOString()}:${window.revision}`}
      book={book}
      accountId={accountId}
      window={window}
      onWindow={setWindow}
    />
  )
}
function StatementWindow({
  book,
  accountId,
  window,
  onWindow,
}: {
  book: FinanceWorkspace["book"]
  accountId: string
  window: Window
  onWindow: (window: Window) => void
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<string>()
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [editing, setEditing] = useState(false)
  const [from, setFrom] = useState(window.from.toISOString().slice(0, 10))
  const [through, setThrough] = useState(
    window.through.toISOString().slice(0, 10),
  )
  const [error, setError] = useState<string | null>(null)
  const query = useQuery(
    trpc.finance.accountActivity.queryOptions(
      {
        bookId: book.id,
        accountId,
        from: window.from,
        through: window.through,
        snapshotSequence: snapshot,
        cursor: cursors.at(-1),
        limit: 30,
      },
      {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnMount: "always",
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    ),
  )
  // Never pin a cached unbounded response while its fresh mount request is running.
  useEffect(() => {
    if (
      snapshot === undefined &&
      query.data &&
      !query.isFetching &&
      !query.isError
    )
      setSnapshot(query.data.snapshotSequence)
  }, [snapshot, query.data, query.isFetching, query.isError])
  const initializing = snapshot === undefined && query.isFetching
  const data = initializing || query.isError ? undefined : query.data
  const money = (value: string) => formatFinanceMoney(value, book.currencyCode)
  function apply() {
    try {
      onWindow({
        ...prepareFinanceStatementRange(from, through, book.startsAt),
        revision: window.revision + 1,
      })
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Check statement dates.",
      )
    }
  }
  if (editing)
    return (
      <FinanceFormBody>
        <Text className="text-xl font-bold">Statement dates</Text>
        <Text className="text-sm text-muted-foreground">
          Use UTC dates on or after bookkeeping began. Changing dates starts a
          new statement snapshot.
        </Text>
        <FormField
          label="From (YYYY-MM-DD, UTC)"
          value={from}
          onChangeText={setFrom}
          maxLength={10}
        />
        <FormField
          label="Through (YYYY-MM-DD, UTC)"
          value={through}
          onChangeText={setThrough}
          maxLength={10}
        />
        {error ? <StatusBanner message={error} tone="destructive" /> : null}
        <ActionButton onPress={apply}>Apply dates</ActionButton>
        <ActionButton variant="outline" onPress={() => setEditing(false)}>
          Back to statement
        </ActionButton>
      </FinanceFormBody>
    )
  return (
    <FlatList
      className="flex-1 px-4"
      data={data?.items ?? []}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View className="gap-4 pb-5">
          <Text className="text-xl font-bold">
            {data?.account.name ?? "Account statement"}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {window.from.toISOString().slice(0, 10)} –{" "}
            {window.through.toISOString().slice(0, 10)} UTC
          </Text>
          <Text className="text-sm text-muted-foreground">
            Recorded finance entries only. Unposted sales and payments are
            excluded.
          </Text>
          <ActionButton variant="outline" onPress={() => setEditing(true)}>
            Change dates
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={query.isFetching}
            onPress={() =>
              onWindow({ ...window, revision: window.revision + 1 })
            }
          >
            Refresh to include new entries
          </ActionButton>
          {query.isError ? (
            <StatusBanner
              title="Statement unavailable"
              message={query.error.message}
              tone="destructive"
              actionLabel="Try again"
              onActionPress={() => void query.refetch()}
            />
          ) : null}
          {data ? (
            <>
              <View className="flex-row flex-wrap gap-5 border-y border-border py-4">
                {[
                  ["Opening", data.openingBalanceMinor],
                  ["Money in", data.debitMinor],
                  ["Money out", data.creditMinor],
                  ["Closing", data.closingBalanceMinor],
                ].map(([label, amount]) => (
                  <View key={label} className="min-w-[40%] flex-1 gap-1">
                    <Text className="text-xs text-muted-foreground">
                      {label}
                    </Text>
                    <Text className="text-base font-bold">
                      {money(amount ?? "0")}
                    </Text>
                  </View>
                ))}
              </View>
              <Text className="text-xs text-muted-foreground">
                Snapshot {data.snapshotSequence} · Page opens at{" "}
                {money(data.pageOpeningBalanceMinor)}
              </Text>
            </>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        query.isPending || initializing ? (
          <ListSkeleton count={6} label="Loading statement" variant="ledger" />
        ) : (
          <Text className="py-5 text-muted-foreground">
            {query.isError
              ? "Refresh to load this account statement."
              : "No entries in this date range."}
          </Text>
        )
      }
      ListFooterComponent={
        <View className="gap-3 py-6">
          <Text className="text-sm text-muted-foreground">
            Page {cursors.length}. Paging keeps the same snapshot; refresh
            includes newer entries.
          </Text>
          <ActionButton
            variant="outline"
            disabled={cursors.length < 2 || query.isFetching}
            onPress={() => setCursors((value) => value.slice(0, -1))}
          >
            Previous page
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={
              !data?.nextCursor || snapshot === undefined || query.isFetching
            }
            onPress={() => {
              if (data?.nextCursor && snapshot !== undefined)
                setCursors((value) => [...value, data.nextCursor ?? undefined])
            }}
          >
            Next page
          </ActionButton>
        </View>
      }
      renderItem={({ item }) => (
        <View className="gap-2 border-b border-border py-5">
          <Text className="text-base font-semibold">{item.description}</Text>
          <Text className="text-xs text-muted-foreground">
            {new Date(item.effectiveAt).toISOString().slice(0, 10)} UTC ·{" "}
            {item.sourceKind.toLowerCase().replaceAll("_", " ")}
          </Text>
          <Text>
            In {money(item.debitMinor)} · Out {money(item.creditMinor)}
          </Text>
          <Text className="font-semibold">
            Balance {money(item.balanceMinor)}
          </Text>
          {item.reversalOfId ? (
            <Text className="text-sm text-muted-foreground">
              Reversal of an earlier record
            </Text>
          ) : item.reversedById ? (
            <Text className="text-sm text-muted-foreground">
              Original retained · Reversed
            </Text>
          ) : null}
          {!item.reversalOfId &&
          ["TRANSFER", "OWNER_CONTRIBUTION", "OWNER_WITHDRAWAL"].includes(
            item.sourceKind,
          ) ? (
            <Pressable
              haptic
              accessibilityRole="button"
              className="py-3"
              onPress={() =>
                router.push({
                  pathname: "/finance-movement/[entryId]",
                  params: { entryId: item.id },
                } as Href)
              }
            >
              <Text className="font-semibold text-primary">
                View movement
                {item.reversedById ? " and correction" : " or correct it"} ›
              </Text>
            </Pressable>
          ) : null}
          {item.sourceKind === "EXPENSE_BILL" ? (
            <Pressable
              haptic
              accessibilityRole="button"
              className="py-3"
              onPress={() =>
                router.push({
                  pathname: "/finance-expense/[billId]",
                  params: { billId: item.sourceId },
                } as Href)
              }
            >
              <Text className="font-semibold text-primary">View expense ›</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    />
  )
}
