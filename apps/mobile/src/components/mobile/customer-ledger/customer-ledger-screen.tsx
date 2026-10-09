import { ActionButton } from "@/components/mobile/action-button"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { FlatList, View } from "react-native"
import { HeroCard } from "../green-till/hero-card"
import {
  ListCard,
  QuickActionRow,
  RecordRow,
  StatusPill,
} from "../green-till/kit"
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
      { retry: false, enabled: !offline },
    ),
  )
  const book = useQuery(
    trpc.finance.book.queryOptions(undefined, {
      retry: false,
      enabled: !offline,
    }),
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
  if (query.isPending && offline)
    return (
      <StatusBanner
        tone="warning"
        message="Reconnect to load this customer account."
      />
    )
  if (query.isPending)
    return (
      <View className="gap-4 px-[18px]">
        <HeroCard label="Customer statement" sub="Loading account" />
        <Skeleton className="h-32 w-full" />
      </View>
    )
  if (query.isError)
    return (
      <StatusBanner
        message={query.error.message}
        tone="destructive"
        actionLabel={offline ? undefined : "Try again"}
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
      { retry: false, enabled: !offline },
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
        enabled: !offline,
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnMount: "always",
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
      },
    ),
  )
  useEffect(() => {
    if (
      !offline &&
      snapshot === undefined &&
      query.data &&
      !query.isFetching &&
      !query.isError &&
      !refreshing
    )
      setSnapshot(query.data.snapshotSequence)
  }, [
    offline,
    snapshot,
    query.data,
    query.isFetching,
    query.isError,
    refreshing,
  ])
  async function refresh() {
    if (offline || refreshing || query.isFetching) return
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
  if (query.isPending && offline)
    return (
      <StatusBanner
        tone="warning"
        message="Reconnect to load this statement."
      />
    )
  if (query.isPending || (snapshot === undefined && query.isFetching))
    return (
      <View className="gap-4 px-[18px]">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-16 w-full" />
      </View>
    )
  if (query.isError)
    return (
      <StatusBanner
        message={query.error.message}
        tone="destructive"
        actionLabel={offline ? undefined : "Try again"}
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
          <HeroCard
            label="Recorded amount owed"
            amount={money(s.totals.outstandingDebtMinor)}
            sub="Debt and credit stay separate until you apply a payment."
            pill={{
              label: offline ? "Saved copy" : "Recorded",
              tone: offline ? "offline" : "synced",
            }}
            stats={[
              { label: "Owed", value: money(s.totals.outstandingDebtMinor) },
              { label: "Credit", value: money(s.totals.availableCreditMinor) },
              { label: "Net", value: money(s.totals.netBalanceMinor) },
            ]}
          >
            {detail.data?.book ? (
              <View className="mt-4">
                <ActionButton
                  icon="CreditCard"
                  tone="cream"
                  disabled={offline}
                  onPress={() => open("receipt")}
                >
                  Record payment
                </ActionButton>
              </View>
            ) : null}
          </HeroCard>
          {detail.data?.book ? (
            <QuickActionRow
              actions={[
                {
                  label: "Apply credit",
                  icon: "Link",
                  disabled:
                    offline ||
                    s.totals.availableCreditMinor === "0" ||
                    s.totals.outstandingDebtMinor === "0",
                  onPress: () => open("apply"),
                },
                {
                  label: "Return credit",
                  icon: "Undo2",
                  disabled: offline || s.totals.availableCreditMinor === "0",
                  onPress: () => open("refund"),
                },
                {
                  label: "Opening balance",
                  icon: "ChartNoAxesColumn",
                  disabled: offline,
                  onPress: () => open("opening"),
                },
              ]}
            />
          ) : null}
          {s.totals.availableCreditMinor !== "0" ? (
            <StatusBanner
              tone="warning"
              title={`${money(s.totals.availableCreditMinor)} not applied`}
              message="Apply existing credit to settle a recorded charge."
            />
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
            Saved statement · {new Date(query.dataUpdatedAt).toLocaleString()}.
            Refresh to include new records.
          </Text>
        </View>
      }
      renderItem={({ item: e, index }) => (
        <View className="pb-2">
          {index === 0 ||
          new Date(s.entries[index - 1].effectiveAt).toDateString() !==
            new Date(e.effectiveAt).toDateString() ? (
            <Text className="pb-2 pt-4 text-xs font-bold text-muted-foreground">
              {new Date(e.effectiveAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </Text>
          ) : null}
          <ListCard>
            <RecordRow
              stackDetails
              title={ledgerLabels[e.kind] ?? "Account entry"}
              meta={`${e.description} · Net ${money(e.runningBalanceMinor)}`}
              amount={money(e.amountMinor)}
              avatar={{
                icon: "ReceiptText",
                tint: e.side === "CREDIT" ? "mint" : "amber",
              }}
              status={
                <StatusPill
                  tone={e.side === "CREDIT" ? "ok" : "warn"}
                  label={
                    e.reversalOfId
                      ? "Correction"
                      : e.side === "CREDIT"
                        ? "Credit"
                        : "Charge"
                  }
                />
              }
              onPress={() => open("entry", e.id)}
            />
          </ListCard>
        </View>
      )}
      ListEmptyComponent={<Text>No recorded customer activity.</Text>}
      ListFooterComponent={
        <View className="gap-3 pt-4">
          <ActionButton
            variant="outline"
            disabled={offline || cursors.length === 1 || busy}
            onPress={() => setCursors((v) => v.slice(0, -1))}
          >
            Previous page
          </ActionButton>
          <ActionButton
            variant="outline"
            disabled={
              offline || !s.nextCursor || snapshot === undefined || busy
            }
            onPress={() => setCursors((v) => [...v, s.nextCursor ?? undefined])}
          >
            Next page
          </ActionButton>
        </View>
      }
    />
  )
}
