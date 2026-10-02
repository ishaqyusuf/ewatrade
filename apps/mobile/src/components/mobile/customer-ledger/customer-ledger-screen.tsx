import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { FlatList, View } from "react-native"
import { CustomerLedgerGate } from "./customer-ledger-gate"
import { ledgerLabels } from "./types"
export function CustomerLedgerScreen({ customerId }: { customerId: string }) {
  return (
    <CustomerLedgerGate>
      {(s) => (
        <Accounts
          key={`${s.actorUserId}:${s.tenantId}:${customerId}`}
          customerId={customerId}
        />
      )}
    </CustomerLedgerGate>
  )
}
function Accounts({ customerId }: { customerId: string }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [accountId, setAccountId] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const query = useQuery(
    trpc.customerLedger.accounts.queryOptions(
      { customerId, limit: 50 },
      { retry: false },
    ),
  )
  const book = useQuery(
    trpc.finance.book.queryOptions(undefined, { retry: false }),
  )
  const ensure = useMutation(
    trpc.customerLedger.ensureAccount.mutationOptions(),
  )
  const selected =
    query.data?.accounts.find((a) => a.id === accountId) ??
    (accountId ? undefined : query.data?.accounts[0])
  async function create() {
    if (!book.data || offline || ensure.isPending) return
    try {
      const a = await ensure.mutateAsync({
        customerId,
        currencyCode: book.data.currencyCode,
      })
      await client.invalidateQueries({
        queryKey: trpc.customerLedger.accounts.pathKey(),
      })
      setAccountId(a.id)
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Account unavailable.",
      )
    }
  }
  if (query.isPending)
    return <Text className="px-4">Loading customer accounts…</Text>
  if (query.isError)
    return (
      <StatusBanner
        message={query.error.message}
        tone="destructive"
        actionLabel="Try again"
        onActionPress={() => void query.refetch()}
      />
    )
  return (
    <View className="flex-1 gap-3">
      <View className="gap-2 px-4">
        <Text className="text-xl font-bold">{query.data.customer.name}</Text>
        <View className="flex-row flex-wrap gap-2">
          {query.data.accounts.map((a) => (
            <Pressable
              key={a.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: a.id === selected?.id }}
              className={`rounded-xl border px-4 py-2 ${a.id === selected?.id ? "border-primary bg-accent" : "border-border"}`}
              onPress={() => setAccountId(a.id)}
            >
              <Text>{a.currencyCode}</Text>
            </Pressable>
          ))}
        </View>
        {book.data &&
        !query.data.accounts.some(
          (a) => a.currencyCode === book.data?.currencyCode,
        ) ? (
          <ActionButton
            variant="outline"
            disabled={offline || ensure.isPending}
            onPress={() => void create()}
          >
            Open {book.data.currencyCode} account
          </ActionButton>
        ) : null}
        {error ? <StatusBanner message={error} tone="destructive" /> : null}
      </View>
      {selected ? (
        <Statement key={selected.id} accountId={selected.id} />
      ) : (
        <Text className="px-4">
          No account yet. Start a financial book on the dashboard to open a
          matching customer account.
        </Text>
      )}
    </View>
  )
}
function Statement({ accountId }: { accountId: string }) {
  const trpc = useTRPC()
  const client = useQueryClient()
  const router = useRouter()
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
  const [snapshot, setSnapshot] = useState<string>()
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const detail = useQuery(
    trpc.customerLedger.accountDetail.queryOptions(
      { accountId },
      { retry: false },
    ),
  )
  const query = useQuery(
    trpc.customerLedger.statement.queryOptions(
      {
        accountId,
        snapshotSequence: snapshot,
        afterSequence: cursors.at(-1),
        limit: 30,
      },
      {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnMount: "always",
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
      },
    ),
  )
  useEffect(() => {
    if (
      snapshot === undefined &&
      query.data &&
      !query.isFetching &&
      !query.isError &&
      !refreshing
    )
      setSnapshot(query.data.snapshotSequence)
  }, [snapshot, query.data, query.isFetching, query.isError, refreshing])
  async function refresh() {
    if (refreshing || query.isFetching) return
    setRefreshing(true)
    setError(null)
    try {
      const latest = await client.fetchQuery(
        trpc.customerLedger.statement.queryOptions(
          { accountId, limit: 30 },
          { staleTime: 0, retry: false },
        ),
      )
      client.setQueryData(
        trpc.customerLedger.statement.queryKey({
          accountId,
          snapshotSequence: latest.snapshotSequence,
          limit: 30,
        }),
        latest,
      )
      setCursors([undefined])
      setSnapshot(latest.snapshotSequence)
      await detail.refetch()
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Refresh failed; previous snapshot retained.",
      )
    } finally {
      setRefreshing(false)
    }
  }
  const open = (mode: string, entryId?: string) =>
    router.push({
      pathname: "/customer-ledger-action/[accountId]",
      params: { accountId, mode, ...(entryId ? { entryId } : {}) },
    } as Href)
  if (query.isPending || (snapshot === undefined && query.isFetching))
    return <Text className="px-4">Loading pinned statement…</Text>
  if (query.isError)
    return (
      <StatusBanner
        message={query.error.message}
        tone="destructive"
        actionLabel="Try again"
        onActionPress={() => void query.refetch()}
      />
    )
  const s = query.data
  const money = (v: string) => formatFinanceMoney(v, s.currencyCode)
  const busy = query.isFetching || refreshing
  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      data={s.entries}
      keyExtractor={(entry) => entry.id}
      ListHeaderComponent={
        <View className="gap-4 pb-4">
          <StatusBanner message="Recorded ledger entries only; unintegrated Orders are excluded. Debt and credit remain separate until explicitly settled." />
          {offline ? (
            <StatusBanner
              title="Offline"
              message={`Cached statement last read ${new Date(query.dataUpdatedAt).toLocaleString()}. Financial writes require a connection.`}
              tone="warning"
            />
          ) : null}
          <View className="gap-4 border-b border-border py-4">
            <View>
              <Text className="text-sm text-muted-foreground">
                Recorded amount owed
              </Text>
              <Text className="text-2xl font-bold">
                {money(s.totals.outstandingDebtMinor)}
              </Text>
            </View>
            <View>
              <Text className="text-sm text-muted-foreground">
                Credit available
              </Text>
              <Text className="text-2xl font-bold">
                {money(s.totals.availableCreditMinor)}
              </Text>
            </View>
            <Text>Net balance: {money(s.totals.netBalanceMinor)}</Text>
          </View>
          {detail.data?.book ? (
            <>
              <ActionButton disabled={offline} onPress={() => open("receipt")}>
                Receive payment
              </ActionButton>
              <ActionButton
                variant="outline"
                disabled={offline}
                onPress={() => open("apply")}
              >
                Apply existing credit
              </ActionButton>
              <ActionButton
                variant="outline"
                disabled={offline}
                onPress={() => open("opening")}
              >
                Opening balance
              </ActionButton>
              <ActionButton
                variant="outline"
                disabled={offline}
                onPress={() => open("refund")}
              >
                Return unused credit
              </ActionButton>
            </>
          ) : null}
          <ActionButton
            variant="outline"
            disabled={busy || offline}
            onPress={() => void refresh()}
          >
            Refresh statement
          </ActionButton>
          {error ? <StatusBanner message={error} tone="destructive" /> : null}
          <Text className="text-sm text-muted-foreground">
            Snapshot #{s.snapshotSequence} · page {cursors.length}. Refresh to
            include new records.
          </Text>
        </View>
      }
      renderItem={({ item: e }) => (
        <Pressable
          key={e.id}
          accessibilityRole="button"
          accessibilityLabel={`View ${ledgerLabels[e.kind] ?? e.kind} entry ${e.sequence}`}
          className="gap-2 border-b border-border py-4"
          onPress={() => open("entry", e.id)}
        >
          <Text className="font-semibold">
            {ledgerLabels[e.kind] ?? e.kind} · #{e.sequence}
          </Text>
          <Text>{e.description}</Text>
          <Text>
            {money(e.amountMinor)} {e.side.toLowerCase()}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {new Date(e.effectiveAt).toISOString().slice(0, 10)} UTC · Net{" "}
            {money(e.runningBalanceMinor)}
          </Text>
          {e.reversalOfId ? (
            <Text className="text-sm">Correction; original entry retained</Text>
          ) : null}
        </Pressable>
      )}
      ListEmptyComponent={<Text>No recorded customer activity.</Text>}
      ListFooterComponent={
        <View className="gap-3 pt-4">
          <ActionButton
            variant="outline"
            disabled={cursors.length === 1 || busy}
            onPress={() => setCursors((v) => v.slice(0, -1))}
          >
            Previous page
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={!s.nextCursor || snapshot === undefined || busy}
            onPress={() => setCursors((v) => [...v, s.nextCursor ?? undefined])}
          >
            Next page
          </ActionButton>
        </View>
      }
    />
  )
}
